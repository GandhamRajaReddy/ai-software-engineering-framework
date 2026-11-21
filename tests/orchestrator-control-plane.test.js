const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { TaskDagScheduler, TASK_STATES } = require('../cli/task-dag-scheduler');
const { AgentExecutionAdapter } = require('../cli/agent-execution-adapter');
const { ProviderExecutionManager } = require('../cli/provider-execution-manager');

test('Control Plane: Task DAG State Machine enforces valid transitions and rejects illegal moves', () => {
  const dag = new TaskDagScheduler();
  dag.addTask({ id: 'TASK-1', title: 'Compile Code' });

  // PENDING -> READY
  dag.transitionTaskState('TASK-1', TASK_STATES.READY);
  assert.strictEqual(dag.tasks.get('TASK-1').status, TASK_STATES.READY);

  // READY -> RUNNING
  dag.transitionTaskState('TASK-1', TASK_STATES.RUNNING);
  assert.strictEqual(dag.tasks.get('TASK-1').status, TASK_STATES.RUNNING);

  // RUNNING -> OUTPUT_GENERATED
  dag.transitionTaskState('TASK-1', TASK_STATES.OUTPUT_GENERATED);
  assert.strictEqual(dag.tasks.get('TASK-1').status, TASK_STATES.OUTPUT_GENERATED);

  // OUTPUT_GENERATED -> VERIFYING
  dag.transitionTaskState('TASK-1', TASK_STATES.VERIFYING);
  assert.strictEqual(dag.tasks.get('TASK-1').status, TASK_STATES.VERIFYING);

  // VERIFYING -> VERIFIED
  dag.transitionTaskState('TASK-1', TASK_STATES.VERIFIED);
  assert.strictEqual(dag.tasks.get('TASK-1').status, TASK_STATES.VERIFIED);

  // VERIFIED -> COMPLETED
  dag.transitionTaskState('TASK-1', TASK_STATES.COMPLETED);
  assert.strictEqual(dag.tasks.get('TASK-1').status, TASK_STATES.COMPLETED);

  // Illegal transition: COMPLETED -> RUNNING must throw
  assert.throws(() => {
    dag.transitionTaskState('TASK-1', TASK_STATES.RUNNING);
  }, /Invalid task state transition/);
});

test('Control Plane: Bounded Worker Pool enforces concurrency limit and executes tasks', async () => {
  const dag = new TaskDagScheduler({ concurrencyLimit: 2 });
  const tasks = [
    { id: 'T1', targetFiles: [] },
    { id: 'T2', targetFiles: [] },
    { id: 'T3', targetFiles: [] },
    { id: 'T4', targetFiles: [] }
  ];
  tasks.forEach(t => dag.addTask(t));

  let activeWorkers = 0;
  let maxObservedConcurrency = 0;

  const results = await dag.runBatchWithWorkerPool(Array.from(dag.tasks.values()), async (task) => {
    activeWorkers++;
    maxObservedConcurrency = Math.max(maxObservedConcurrency, activeWorkers);
    await new Promise(r => setTimeout(r, 20));
    activeWorkers--;
    return { success: true, processed: task.id };
  }, 2);

  assert.strictEqual(results.length, 4);
  assert.ok(maxObservedConcurrency <= 2, `Observed concurrency ${maxObservedConcurrency} exceeded limit 2`);
  assert.ok(results.every(r => r.success && r.status === TASK_STATES.COMPLETED));
});

test('Control Plane: Exponential backoff retries on transient task failures', async () => {
  const dag = new TaskDagScheduler({ maxRetries: 2, baseBackoffMs: 10 });
  dag.addTask({ id: 'RETRY-TASK', targetFiles: [] });

  let attempts = 0;
  const results = await dag.runBatchWithWorkerPool([dag.tasks.get('RETRY-TASK')], async () => {
    attempts++;
    if (attempts < 3) {
      throw new Error(`Transient network glitch (attempt ${attempts})`);
    }
    return { success: true };
  });

  assert.strictEqual(attempts, 3);
  assert.strictEqual(results[0].success, true);
  assert.strictEqual(results[0].status, TASK_STATES.COMPLETED);
  assert.ok(results[0].provenance);
  assert.strictEqual(results[0].provenance.attempts, 3);
});

test('Control Plane: Human approval gate halts unapproved sensitive tasks', async () => {
  const dag = new TaskDagScheduler();
  dag.addTask({
    id: 'DEPLOY-PROD',
    title: 'Deploy to Production Cluster',
    requiresApproval: true,
    approved: false
  });

  const results = await dag.runBatchWithWorkerPool([dag.tasks.get('DEPLOY-PROD')], async () => {
    return { success: true, deployed: true };
  });

  assert.strictEqual(results[0].success, false);
  assert.strictEqual(results[0].awaitingApproval, true);
  assert.strictEqual(results[0].status, TASK_STATES.AWAITING_APPROVAL);
  assert.match(results[0].error, /requires explicit human approval/);
});

test('Control Plane: Checkpoint saving and recovery preserves execution state and resets interrupted RUNNING tasks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asef-checkpoint-test-'));
  const checkpointFile = path.join(tmpDir, 'checkpoint.json');

  const dag = new TaskDagScheduler();
  dag.addTask({ id: 'TASK-A', status: TASK_STATES.PENDING });
  dag.addTask({ id: 'TASK-B', status: TASK_STATES.PENDING });
  dag.addTask({ id: 'TASK-INFLIGHT', status: TASK_STATES.PENDING });

  dag.transitionTaskState('TASK-A', TASK_STATES.READY);
  dag.transitionTaskState('TASK-A', TASK_STATES.RUNNING);
  dag.transitionTaskState('TASK-A', TASK_STATES.OUTPUT_GENERATED);
  dag.transitionTaskState('TASK-A', TASK_STATES.VERIFYING);
  dag.transitionTaskState('TASK-A', TASK_STATES.VERIFIED);
  dag.transitionTaskState('TASK-A', TASK_STATES.COMPLETED);

  // Simulate an interrupted task that was mid-execution when process crashed
  dag.transitionTaskState('TASK-INFLIGHT', TASK_STATES.READY);
  dag.transitionTaskState('TASK-INFLIGHT', TASK_STATES.RUNNING);

  dag.saveCheckpoint(checkpointFile);
  assert.ok(fs.existsSync(checkpointFile));

  // Recover in a fresh scheduler instance
  const recoveredDag = new TaskDagScheduler();
  recoveredDag.resumeFromCheckpoint(checkpointFile);

  assert.strictEqual(recoveredDag.tasks.get('TASK-A').status, TASK_STATES.COMPLETED);
  assert.strictEqual(recoveredDag.tasks.get('TASK-B').status, TASK_STATES.PENDING);
  // Interrupted task must be reset to READY so workers resume it rather than being stuck
  assert.strictEqual(recoveredDag.tasks.get('TASK-INFLIGHT').status, TASK_STATES.READY);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Control Plane: Independent verification procedure rejects faulty outputs and moves to REJECTED', async () => {
  const dag = new TaskDagScheduler({ maxRetries: 1, baseBackoffMs: 10 });
  dag.addTask({
    id: 'TASK-VERIFY-CHECK',
    targetFiles: [],
    verify: async (output) => {
      if (output.code === 'broken') {
        return { passed: false, error: 'Static analysis check failed: missing input validation' };
      }
      return { passed: true };
    }
  });

  let attempts = 0;
  const results = await dag.runBatchWithWorkerPool([dag.tasks.get('TASK-VERIFY-CHECK')], async () => {
    attempts++;
    // First attempt generates faulty code, second attempt fixes it
    return { code: attempts === 1 ? 'broken' : 'fixed' };
  });

  assert.strictEqual(attempts, 2);
  assert.strictEqual(results[0].success, true);
  assert.strictEqual(results[0].status, TASK_STATES.COMPLETED);

  // Check state transitions recorded REJECTED before retry
  const transitions = dag.tasks.get('TASK-VERIFY-CHECK').stateTransitions.map(t => t.state);
  assert.ok(transitions.includes(TASK_STATES.OUTPUT_GENERATED));
  assert.ok(transitions.includes(TASK_STATES.VERIFYING));
  assert.ok(transitions.includes(TASK_STATES.REJECTED));
  assert.ok(transitions.includes(TASK_STATES.VERIFIED));
  assert.ok(transitions.includes(TASK_STATES.COMPLETED));
});

test('Control Plane: Stack-aware test command detection', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asef-stack-test-'));

  try {
    const adapter = new AgentExecutionAdapter(tmpDir);

    // 1. Explicit context command takes precedence
    assert.strictEqual(adapter.detectTestCommand({ testCommand: 'custom-runner run' }), 'custom-runner run');

    // 2. Python / FastAPI stack
    assert.strictEqual(adapter.detectTestCommand({ selectedStack: 'fastapi-postgres' }), 'pytest');

    // 3. Go stack
    assert.strictEqual(adapter.detectTestCommand({ selectedStack: 'go-microservice' }), 'go test ./...');

    // 4. Java stack
    assert.strictEqual(adapter.detectTestCommand({ selectedStack: 'java-spring-boot' }), 'mvn test');

    // 5. Node stack with package.json
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ scripts: { test: 'jest' } }), 'utf8');
    assert.strictEqual(adapter.detectTestCommand({}), 'npm test');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
