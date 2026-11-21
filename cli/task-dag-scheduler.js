/**
 * Task DAG Scheduler (Dependency Resolution, State Machine & File Ownership Core)
 * Models tasks as a Directed Acyclic Graph (DAG) with topological sorting,
 * cycle detection, file ownership locks (preventing race conditions on shared files),
 * bounded worker pool execution, exponential backoff retries, checkpointing, and
 * full execution provenance.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TASK_STATES = {
  PENDING: 'PENDING',
  READY: 'READY',
  RUNNING: 'RUNNING',
  OUTPUT_GENERATED: 'OUTPUT_GENERATED',
  VERIFYING: 'VERIFYING',
  REJECTED: 'REJECTED',
  VERIFIED: 'VERIFIED',
  RETRY_WAIT: 'RETRY_WAIT',
  FAILED: 'FAILED',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  COMPLETED: 'COMPLETED'
};

const VALID_TRANSITIONS = {
  [TASK_STATES.PENDING]: [TASK_STATES.READY, TASK_STATES.FAILED],
  [TASK_STATES.READY]: [TASK_STATES.RUNNING, TASK_STATES.AWAITING_APPROVAL, TASK_STATES.FAILED],
  [TASK_STATES.RUNNING]: [TASK_STATES.OUTPUT_GENERATED, TASK_STATES.FAILED, TASK_STATES.RETRY_WAIT],
  [TASK_STATES.OUTPUT_GENERATED]: [TASK_STATES.VERIFYING, TASK_STATES.COMPLETED, TASK_STATES.FAILED],
  [TASK_STATES.VERIFYING]: [TASK_STATES.VERIFIED, TASK_STATES.REJECTED, TASK_STATES.FAILED],
  [TASK_STATES.REJECTED]: [TASK_STATES.RETRY_WAIT, TASK_STATES.FAILED],
  [TASK_STATES.RETRY_WAIT]: [TASK_STATES.RUNNING, TASK_STATES.FAILED],
  [TASK_STATES.VERIFIED]: [TASK_STATES.AWAITING_APPROVAL, TASK_STATES.COMPLETED, TASK_STATES.FAILED],
  [TASK_STATES.AWAITING_APPROVAL]: [TASK_STATES.RUNNING, TASK_STATES.COMPLETED, TASK_STATES.REJECTED, TASK_STATES.FAILED],
  [TASK_STATES.FAILED]: [TASK_STATES.RETRY_WAIT, TASK_STATES.PENDING],
  [TASK_STATES.COMPLETED]: []
};

class TaskDagScheduler {
  constructor(options = {}) {
    this.tasks = new Map();
    this.concurrencyLimit = options.concurrencyLimit || 2;
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
    this.baseBackoffMs = options.baseBackoffMs || 50;
    this.requireIndependentVerification = Boolean(options.requireIndependentVerification || options.requireVerification);
    this.stateHistory = [];
  }

  /**
   * Registers a task in the DAG
   */
  addTask(task) {
    if (!task.id) throw new Error('Task must have a unique id');

    const taskObj = {
      id: task.id,
      name: task.name || task.title || task.id,
      stageIndex: task.stageIndex !== undefined ? task.stageIndex : 4,
      agent: task.agent || task.assignedAgent || 'Senior Builder',
      assignedAgent: task.assignedAgent || task.agent || 'Senior Builder',
      skills: Array.isArray(task.skills) ? task.skills : [],
      dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn : (Array.isArray(task.dependencies) ? task.dependencies : []),
      targetFiles: Array.isArray(task.targetFiles) ? task.targetFiles : (Array.isArray(task.target_files) ? task.target_files : []),
      execute: task.execute,
      verify: task.verify,
      status: task.status || TASK_STATES.PENDING,
      requiresApproval: Boolean(task.requiresApproval),
      approved: Boolean(task.approved),
      retryCount: 0,
      evidenceId: null,
      error: null,
      provenance: null,
      stateTransitions: [
        { state: task.status || TASK_STATES.PENDING, timestamp: new Date().toISOString() }
      ]
    };

    this.tasks.set(task.id, taskObj);
    return taskObj;
  }

  /**
   * Transitions a task to a new state with strict state machine validation
   */
  transitionTaskState(taskId, newState, meta = {}) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Cannot transition unknown task "${taskId}"`);

    const currentState = task.status;
    const allowed = VALID_TRANSITIONS[currentState] || [];

    if (currentState !== newState && !allowed.includes(newState)) {
      throw new Error(`Invalid task state transition: Cannot move task "${taskId}" from ${currentState} to ${newState}`);
    }

    task.status = newState;
    const record = {
      state: newState,
      timestamp: new Date().toISOString(),
      ...meta
    };
    task.stateTransitions.push(record);
    this.stateHistory.push({ taskId, from: currentState, to: newState, timestamp: record.timestamp });

    return task;
  }

  /**
   * Validates that all dependencies exist and that there are no circular dependencies
   */
  validateDag() {
    // 1. Verify all dependencies exist
    for (const [id, task] of this.tasks.entries()) {
      for (const depId of task.dependsOn) {
        if (!this.tasks.has(depId)) {
          throw new Error(`DAG Dependency Error: Task "${id}" depends on unknown task "${depId}"`);
        }
      }
    }

    // 2. Cycle Detection using DFS graph coloring (0: unvisited, 1: visiting, 2: visited)
    const visited = new Map();
    const self = this;

    function hasCycle(nodeId) {
      visited.set(nodeId, 1); // visiting
      const task = self.tasks.get(nodeId);

      for (const depId of task.dependsOn) {
        const state = visited.get(depId) || 0;
        if (state === 1) {
          throw new Error(`Circular Dependency Detected in Task DAG: "${nodeId}" <--> "${depId}"`);
        }
        if (state === 0 && hasCycle(depId)) {
          return true;
        }
      }

      visited.set(nodeId, 2); // visited
      return false;
    }

    for (const id of this.tasks.keys()) {
      if ((visited.get(id) || 0) === 0) {
        hasCycle(id);
      }
    }

    return true;
  }

  /**
   * Partitions the DAG into sequential batches of parallelizable tasks (Kahn's Algorithm)
   * Also enforces file ownership so no two concurrent tasks write to the same file.
   */
  getExecutionBatches() {
    this.validateDag();

    const inDegree = new Map();
    const dependents = new Map();

    for (const id of this.tasks.keys()) {
      inDegree.set(id, 0);
      dependents.set(id, []);
    }

    for (const [id, task] of this.tasks.entries()) {
      for (const depId of task.dependsOn) {
        inDegree.set(id, inDegree.get(id) + 1);
        dependents.get(depId).push(id);
      }
    }

    const batches = [];
    let readyQueue = [];

    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) readyQueue.push(this.tasks.get(id));
    }

    while (readyQueue.length > 0) {
      // In current batch, filter out file ownership collisions to ensure safety
      const currentBatch = [];
      const claimedFiles = new Set();
      const deferredQueue = [];

      for (const task of readyQueue) {
        let hasCollision = false;
        for (const file of task.targetFiles) {
          if (claimedFiles.has(file)) {
            hasCollision = true;
            break;
          }
        }

        if (!hasCollision) {
          currentBatch.push(task);
          task.targetFiles.forEach(f => claimedFiles.add(f));
        } else {
          deferredQueue.push(task);
        }
      }

      batches.push(currentBatch);

      // Decrement in-degree for dependents of executed batch
      const nextReady = [...deferredQueue];
      for (const task of currentBatch) {
        for (const depId of dependents.get(task.id)) {
          inDegree.set(depId, inDegree.get(depId) - 1);
          if (inDegree.get(depId) === 0) {
            nextReady.push(this.tasks.get(depId));
          }
        }
      }

      readyQueue = nextReady;
    }

    return batches;
  }

  /**
   * Executes tasks in a batch through a bounded worker pool with independent verification
   */
  async runBatchWithWorkerPool(batchTasks, workerFn, options = {}) {
    const opts = typeof options === 'number' ? { concurrencyLimit: options } : (options || {});
    const limit = opts.concurrencyLimit;
    const verifierFn = typeof opts === 'object' && opts ? opts.verifierFn : null;
    const poolLimit = Math.max(1, limit || this.concurrencyLimit);
    const requireVerification = opts.requireIndependentVerification !== undefined
      ? Boolean(opts.requireIndependentVerification)
      : (opts.requireVerification !== undefined ? Boolean(opts.requireVerification) : this.requireIndependentVerification);
    const results = [];
    let index = 0;

    const runWorker = async () => {
      while (index < batchTasks.length) {
        const currentIndex = index++;
        const task = batchTasks[currentIndex];

        // Transition to READY
        this.transitionTaskState(task.id, TASK_STATES.READY);

        // Check human approval gate if required
        if (task.requiresApproval && !task.approved) {
          this.transitionTaskState(task.id, TASK_STATES.AWAITING_APPROVAL);
          results[currentIndex] = {
            taskId: task.id,
            success: false,
            awaitingApproval: true,
            status: TASK_STATES.AWAITING_APPROVAL,
            error: `Task "${task.id}" requires explicit human approval before execution.`
          };
          continue;
        }

        let taskSuccess = false;
        let lastError = null;
        let taskResult = null;

        while (!taskSuccess && task.retryCount <= this.maxRetries) {
          const startTime = Date.now();
          this.transitionTaskState(task.id, TASK_STATES.RUNNING, { attempt: task.retryCount + 1 });

          try {
            const output = await workerFn(task);
            const generationOk = output !== false && (!output || output.success !== false);
            if (!generationOk) {
              throw new Error(output && output.error ? output.error : 'Task worker returned non-success result');
            }
            taskResult = output;

            // 1. Output has been generated by worker
            this.transitionTaskState(task.id, TASK_STATES.OUTPUT_GENERATED);

            // 2. Invoke independent verification procedure (strictly fail-closed in verification mode)
            this.transitionTaskState(task.id, TASK_STATES.VERIFYING);

            let verificationPassed = false;
            let verificationReport = null;

            if (typeof task.verify === 'function') {
              const verifyRes = await task.verify(taskResult, task);
              verificationPassed = verifyRes !== false && (!verifyRes || (verifyRes.passed !== false && verifyRes.success !== false));
              verificationReport = verifyRes;
            } else if (typeof verifierFn === 'function') {
              const verifyRes = await verifierFn(taskResult, task);
              verificationPassed = verifyRes !== false && (!verifyRes || (verifyRes.passed !== false && verifyRes.success !== false));
              verificationReport = verifyRes;
            } else if (taskResult && taskResult.verificationResult) {
              verificationPassed = Boolean(taskResult.verificationResult.passed);
              verificationReport = taskResult.verificationResult;
            } else if (requireVerification) {
              // Fail-closed: strict mode requires explicit independent verifier or proof of test execution
              verificationPassed = false;
              verificationReport = {
                passed: false,
                reason: `Task "${task.id}" lacks an independent verification procedure or verification evidence. Fail-closed policy rejected task.`
              };
            } else {
              // Standard mode: worker reported successful execution
              verificationPassed = true;
              verificationReport = { passed: true, implicit: true };
            }

            if (!verificationPassed) {
              const failureDetail = (verificationReport && (verificationReport.error || verificationReport.reason)) ||
                `Independent verification rejected output for task ${task.id}`;
              this.transitionTaskState(task.id, TASK_STATES.REJECTED, { error: failureDetail });
              throw new Error(failureDetail);
            }

            // 3. Truly verified by independent procedure
            this.transitionTaskState(task.id, TASK_STATES.VERIFIED, { verificationReport });

            // 4. Finalize completion
            this.transitionTaskState(task.id, TASK_STATES.COMPLETED);
            taskSuccess = true;

            // Capture execution provenance
            const inputHash = crypto.createHash('sha256').update(JSON.stringify(task.dependsOn)).digest('hex');
            const outputHash = crypto.createHash('sha256').update(JSON.stringify(taskResult || {})).digest('hex');
            task.provenance = {
              agent: task.assignedAgent,
              inputHash,
              outputHash,
              durationMs: Date.now() - startTime,
              attempts: task.retryCount + 1,
              completedAt: new Date().toISOString()
            };
            break;
          } catch (err) {
            lastError = err.message;
            if (task.retryCount < this.maxRetries) {
              task.retryCount++;
              this.transitionTaskState(task.id, TASK_STATES.RETRY_WAIT, { retryCount: task.retryCount, error: lastError });
              // Exponential backoff with jitter
              const backoff = this.baseBackoffMs * Math.pow(2, task.retryCount) + Math.floor(Math.random() * 20);
              await new Promise(r => setTimeout(r, backoff));
            } else {
              this.transitionTaskState(task.id, TASK_STATES.FAILED, { error: lastError });
              break;
            }
          }
        }

        results[currentIndex] = {
          taskId: task.id,
          assignedAgent: task.assignedAgent,
          status: task.status,
          success: taskSuccess,
          error: lastError,
          result: taskResult,
          provenance: task.provenance
        };
      }
    };

    const workers = [];
    for (let w = 0; w < Math.min(poolLimit, batchTasks.length); w++) {
      workers.push(runWorker());
    }
    await Promise.all(workers);

    return results;
  }

  /**
   * Saves execution checkpoint atomically to disk for durable restart recovery
   */
  saveCheckpoint(checkpointPath) {
    const dir = path.dirname(checkpointPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const serializedTasks = Array.from(this.tasks.values()).map(t => ({
      ...t,
      execute: undefined, // strip function pointer for serialization
      verify: undefined
    }));

    const checkpoint = {
      timestamp: new Date().toISOString(),
      tasks: serializedTasks,
      stateHistory: this.stateHistory
    };

    // Atomic write pattern: write to temporary file then atomically rename (Finding C)
    const tempPath = `${checkpointPath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(checkpoint, null, 2), 'utf8');
    fs.renameSync(tempPath, checkpointPath);

    return checkpoint;
  }

  /**
   * Rebinds executable functions (execute, verify) and definitions to tasks after checkpoint restoration
   */
  rebindTaskDefinitions(taskDefinitions = []) {
    const defMap = new Map();
    if (Array.isArray(taskDefinitions)) {
      for (const def of taskDefinitions) {
        if (def && def.id) defMap.set(def.id, def);
      }
    } else if (taskDefinitions && typeof taskDefinitions === 'object') {
      for (const [id, def] of Object.entries(taskDefinitions)) {
        defMap.set(id, def);
      }
    }

    for (const [id, task] of this.tasks.entries()) {
      const def = defMap.get(id);
      if (def) {
        if (typeof def.execute === 'function') task.execute = def.execute;
        if (typeof def.verify === 'function') task.verify = def.verify;
        if (def.assignedAgent) task.assignedAgent = def.assignedAgent;
        if (def.skills) task.skills = def.skills;
        if (def.targetFiles) task.targetFiles = def.targetFiles;
        if (def.name || def.title) task.name = def.name || def.title;
      }
    }
  }

  /**
   * Resumes and recovers execution state from a checkpoint, resetting interrupted work
   */
  resumeFromCheckpoint(checkpointPath, taskDefinitions = []) {
    if (!fs.existsSync(checkpointPath)) {
      throw new Error(`Checkpoint file not found: ${checkpointPath}`);
    }

    const raw = fs.readFileSync(checkpointPath, 'utf8');
    const checkpoint = JSON.parse(raw);

    for (const t of checkpoint.tasks) {
      let restoredStatus = t.status;
      let recovered = false;

      // Handle interrupted tasks that crashed mid-flight (Finding C)
      if (
        t.status === TASK_STATES.RUNNING ||
        t.status === TASK_STATES.OUTPUT_GENERATED ||
        t.status === TASK_STATES.VERIFYING
      ) {
        restoredStatus = t.retryCount < this.maxRetries ? TASK_STATES.READY : TASK_STATES.FAILED;
        recovered = true;
      }

      if (this.tasks.has(t.id)) {
        const existing = this.tasks.get(t.id);
        existing.status = restoredStatus;
        existing.retryCount = t.retryCount;
        existing.provenance = t.provenance;
        existing.stateTransitions = t.stateTransitions || [];
        if (recovered) {
          existing.stateTransitions.push({
            state: restoredStatus,
            interruptedFrom: t.status,
            recoveredFromInterruption: true,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        const added = this.addTask({
          ...t,
          status: restoredStatus
        });
        if (recovered) {
          added.stateTransitions.push({
            state: restoredStatus,
            interruptedFrom: t.status,
            recoveredFromInterruption: true,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    if (checkpoint.stateHistory) {
      this.stateHistory = checkpoint.stateHistory;
    }

    if (taskDefinitions && (Array.isArray(taskDefinitions) ? taskDefinitions.length > 0 : Object.keys(taskDefinitions).length > 0)) {
      this.rebindTaskDefinitions(taskDefinitions);
    }

    return checkpoint;
  }

  /**
   * Renders the Task DAG as a Mermaid flowchart diagram
   */
  renderMermaidDag() {
    let md = '```mermaid\nflowchart TD\n';
    for (const [id, task] of this.tasks.entries()) {
      const label = `${id} [${task.status}]: ${task.name.replace(/"/g, "'")}`;
      md += `    ${id}["${label}"]\n`;
    }

    for (const [id, task] of this.tasks.entries()) {
      for (const depId of task.dependsOn) {
        md += `    ${depId} --> ${id}\n`;
      }
    }
    md += '```\n';
    return md;
  }
}

module.exports = {
  TASK_STATES,
  TaskDagScheduler
};
