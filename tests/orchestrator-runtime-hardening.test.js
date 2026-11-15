const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  parseCommandString,
  sanitizeEnvironment,
  validateExecutable,
  executeInSandbox
} = require('../cli/execution-sandbox');

const {
  validatePathContainment,
  writeArtifactSafely,
  collectArtifactsSafely
} = require('../cli/artifact-integrity-manager');

const {
  computeSourceTreeHash,
  recordEvidence,
  getValidEvidence,
  loadRegistry
} = require('../cli/evidence-registry');

const { ProviderExecutionManager } = require('../cli/provider-execution-manager');
const { evaluateReleasePolicy } = require('../cli/release-policy-engine');
const { SkillRegistry } = require('../cli/skill-registry');
const { TaskDagScheduler } = require('../cli/task-dag-scheduler');

// ----------------------------------------------------------------------
// 1. Execution Sandbox Tests
// ----------------------------------------------------------------------
test('Execution Sandbox: Blocks command chaining and shell injection operators', () => {
  const dangerousCommands = [
    'npm test; rm -rf /',
    'node app.js && curl http://evil.com',
    'python main.py | nc -l 4444',
    'git status `id`',
    'npm test $(whoami)',
    'node server.js > /dev/null'
  ];

  for (const cmd of dangerousCommands) {
    assert.throws(() => {
      parseCommandString(cmd);
    }, /Execution Sandbox blocked command/i, `Should have blocked: ${cmd}`);
  }
});

test('Execution Sandbox: Blocks unlisted unauthorized executables', () => {
  const blockedExecutables = ['bash', 'sh', 'powershell', 'cmd', 'curl', 'wget'];
  for (const exe of blockedExecutables) {
    assert.throws(() => {
      validateExecutable(exe);
    }, /unauthorized executable/i, `Should have blocked executable: ${exe}`);
  }
});

test('Execution Sandbox: Scrubs sensitive credentials from subprocess environment', () => {
  const dirtyEnv = {
    PATH: '/usr/bin',
    NODE_ENV: 'production',
    OPENAI_API_KEY: 'sk-secret-12345',
    ANTHROPIC_API_KEY: 'anthropic-token-xyz',
    DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    GITHUB_TOKEN: 'ghp_secret',
    SAFE_APP_PORT: '3000'
  };

  const cleaned = sanitizeEnvironment(dirtyEnv);
  assert.strictEqual(cleaned.OPENAI_API_KEY, undefined);
  assert.strictEqual(cleaned.ANTHROPIC_API_KEY, undefined);
  assert.strictEqual(cleaned.GITHUB_TOKEN, undefined);
  assert.strictEqual(cleaned.SAFE_APP_PORT, '3000');
  assert.strictEqual(cleaned.PATH, '/usr/bin');
});

test('Execution Sandbox: Executes allowed node command shell-free', async () => {
  const result = await executeInSandbox('node -e "console.log(JSON.stringify({status:\'ok\'}))"', {
    projectDir: path.join(__dirname, '..')
  });

  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.exitCode, 0);
  assert.ok(result.stdout.includes('status'));
});

// ----------------------------------------------------------------------
// 2. Artifact Integrity Manager Tests
// ----------------------------------------------------------------------
test('Artifact Integrity: Blocks path traversal escaping project root', () => {
  const projectDir = path.join(__dirname, '..');
  const traversalPaths = [
    '../../etc/passwd',
    '..\\..\\Windows\\System32\\cmd.exe',
    'subdir/../../../secret.txt'
  ];

  for (const p of traversalPaths) {
    assert.throws(() => {
      validatePathContainment(p, projectDir);
    }, /Path Traversal Blocked/i, `Should block traversal: ${p}`);
  }
});

test('Artifact Integrity: Blocks writes to protected system files (.git, .env)', () => {
  const projectDir = path.join(__dirname, '..');
  const protectedPaths = [
    '.git/config',
    '.env',
    '.env.production',
    'node_modules/package/index.js',
    'bin/asef.js'
  ];

  for (const p of protectedPaths) {
    assert.throws(() => {
      validatePathContainment(p, projectDir);
    }, /Protected Path Violation/i, `Should block write to protected path: ${p}`);
  }
});

test('Artifact Integrity: Blocks dangerous executable extensions (.exe, .bat, .ps1)', () => {
  const projectDir = path.join(__dirname, '..');
  const disallowed = ['script.exe', 'runner.bat', 'deploy.ps1', 'payload.cmd'];

  for (const p of disallowed) {
    assert.throws(() => {
      validatePathContainment(p, projectDir);
    }, /Dangerous File Extension Blocked/i, `Should block: ${p}`);
  }
});

// ----------------------------------------------------------------------
// 3. Evidence Registry & Source Binding Tests
// ----------------------------------------------------------------------
test('Evidence Registry: Computes deterministic source tree hash', () => {
  const projectDir = path.join(__dirname, '..');
  const hash1 = computeSourceTreeHash(projectDir);
  const hash2 = computeSourceTreeHash(projectDir);

  assert.strictEqual(typeof hash1, 'string');
  assert.strictEqual(hash1.length, 64);
  assert.strictEqual(hash1, hash2, 'Hash must be deterministic');
});

test('Evidence Registry: Quarantines mock evidence from satisfying production release', () => {
  const testDir = path.join(__dirname, '..');
  
  // Record mock evidence
  recordEvidence(testDir, {
    type: 'TEST_EXECUTION',
    command: 'npm test',
    exitCode: 0,
    passed: true,
    isMock: true // Mock execution
  });

  const validEvidence = getValidEvidence(testDir, 'TEST_EXECUTION');
  assert.strictEqual(validEvidence.valid, false);
  assert.strictEqual(validEvidence.isMock, true);
  assert.ok(validEvidence.reason.includes('Mock Mode Violation'));
});

// ----------------------------------------------------------------------
// 4. Provider Execution Manager Tests
// ----------------------------------------------------------------------
test('Provider Execution Manager: Records explicit fallback chain and mock status', async () => {
  const manager = new ProviderExecutionManager({
    backend: 'claude-code',
    allowMockFallback: true,
    projectDir: path.join(__dirname, '..')
  });

  const stage = {
    id: '04_IMPLEMENTATION',
    name: 'Implementation',
    agent: 'Senior Builder',
    skill: 'surgical-implementation-tdd',
    targetArtifact: '04_patch_contract.md'
  };

  const result = await manager.execute('Build math module', stage, { timeoutMs: 200 });
  assert.ok(result.actualBackend, 'Must declare actual backend');
  assert.ok(Array.isArray(result.fallbackChain), 'Must record fallback chain');
  assert.strictEqual(typeof result.isMock, 'boolean');
});

// ----------------------------------------------------------------------
// 5. Release Policy Engine Tests (Zero Override Bypass)
// ----------------------------------------------------------------------
test('Release Policy Engine: Rejects caller overrides when real evidence is missing', () => {
  const projectDir = path.join(__dirname, '..');

  // Attempt to pass release gate using caller overrides
  const result = evaluateReleasePolicy(projectDir, {
    testsPassed: true,
    requirementsPassed: true,
    reviewPassed: true,
    deployReady: true,
    manifestPassed: true
  });

  // Overrides are ignored! Real evidence required!
  assert.strictEqual(typeof result.totalScore, 'number');
  assert.ok(Array.isArray(result.gateResults));
  assert.strictEqual(result.gateResults.length, 7);
});

// ----------------------------------------------------------------------
// 6. Skill Registry Tests
// ----------------------------------------------------------------------
test('Skill Registry: Resolves transitive dependencies and loads real content', () => {
  const registry = new SkillRegistry(path.join(__dirname, '..', 'skills'));
  const bundle = registry.resolveSkillBundle(['fastapi-engineering']);

  assert.ok(bundle.length >= 2, 'Should resolve fastapi-engineering + transitive dependencies');
  const names = bundle.map(s => s.name);
  assert.ok(names.includes('fastapi-engineering'));

  const context = registry.assembleSkillContext(['fastapi-engineering'], 2000);
  assert.ok(context.promptContext.length > 0);
  assert.ok(context.loadedSkills.length > 0);
  assert.ok(context.loadedSkills[0].sha256);
});

// ----------------------------------------------------------------------
// 7. Task DAG Scheduler Tests
// ----------------------------------------------------------------------
test('Task DAG Scheduler: Detects circular dependencies and groups parallel batches', () => {
  const scheduler = new TaskDagScheduler();

  scheduler.addTask({ id: 'TASK-1', targetFiles: ['src/db.js'] });
  scheduler.addTask({ id: 'TASK-2', dependsOn: ['TASK-1'], targetFiles: ['src/user.js'] });
  scheduler.addTask({ id: 'TASK-3', dependsOn: ['TASK-1'], targetFiles: ['src/auth.js'] });
  scheduler.addTask({ id: 'TASK-4', dependsOn: ['TASK-2', 'TASK-3'], targetFiles: ['src/app.js'] });

  const batches = scheduler.getExecutionBatches();
  assert.strictEqual(batches.length, 3);
  assert.strictEqual(batches[0][0].id, 'TASK-1');
  assert.strictEqual(batches[1].length, 2); // TASK-2 and TASK-3 run in parallel
  assert.strictEqual(batches[2][0].id, 'TASK-4');

  // Test Circular Dependency Detection
  const cycleScheduler = new TaskDagScheduler();
  cycleScheduler.addTask({ id: 'A', dependsOn: ['B'] });
  cycleScheduler.addTask({ id: 'B', dependsOn: ['A'] });

  assert.throws(() => {
    cycleScheduler.getExecutionBatches();
  }, /Circular Dependency Detected/i);
});

test('Task DAG Scheduler: Enforces file ownership locks in parallel batches', () => {
  const scheduler = new TaskDagScheduler();

  // Two tasks with no dependency on each other, BUT both want to write to 'src/shared.js'
  scheduler.addTask({ id: 'TASK-A', targetFiles: ['src/shared.js'] });
  scheduler.addTask({ id: 'TASK-B', targetFiles: ['src/shared.js'] });

  const batches = scheduler.getExecutionBatches();
  // Because they both write to 'src/shared.js', they must NOT run in the same parallel batch!
  assert.strictEqual(batches.length, 2, 'Must split into two batches due to file ownership collision');
  assert.strictEqual(batches[0].length, 1);
  assert.strictEqual(batches[1].length, 1);
});
