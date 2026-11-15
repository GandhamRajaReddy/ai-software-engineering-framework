const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { AntiHallucinationEnforcer } = require('../anti_hallucination/runtime_enforcement');
const { ProviderManager, TokenBucket } = require('../resources/provider_management');
const { ManifestSigner } = require('../cli/manifest-signer');
const { SchemaValidator } = require('../cli/schema-validator');
const { OrchestrationEngine } = require('../cli/orchestration-engine');
const { evaluateReleasePolicy } = require('../cli/release-policy-engine');

test('Anti-Hallucination: Enforces physical filesystem grounding (Law 1)', () => {
  const root = path.join(__dirname, '..');
  
  // Real files must pass
  const validCheck = AntiHallucinationEnforcer.verifyFilesystemGrounding(root, [
    'package.json',
    'bin/asef.js',
    'cli/orchestration-engine.js'
  ]);
  assert.strictEqual(validCheck.valid, true);
  assert.strictEqual(validCheck.missingPaths.length, 0);

  // Missing files must be detected and blocked
  const invalidCheck = AntiHallucinationEnforcer.verifyFilesystemGrounding(root, [
    'package.json',
    'non_existent_folder/imaginary_file.js'
  ]);
  assert.strictEqual(invalidCheck.valid, false);
  assert.deepStrictEqual(invalidCheck.missingPaths, ['non_existent_folder/imaginary_file.js']);

  // Path traversal escape must be detected and blocked
  const escapeCheck = AntiHallucinationEnforcer.verifyFilesystemGrounding(root, [
    '../../etc/passwd',
    '../unrelated_file.txt'
  ]);
  assert.strictEqual(escapeCheck.valid, false);
  assert.match(escapeCheck.reason, /containment violation/i);
});

test('Anti-Hallucination: Blocks speculative language and enforces exit code 0 (Law 2)', () => {
  // Speculative claim must fail even if exit code is 0
  const specResult = AntiHallucinationEnforcer.auditVerificationInvariant(
    'All tests should work as expected and probably passes',
    { exitCode: 0, stdout: 'ok' }
  );
  assert.strictEqual(specResult.valid, false);
  assert.match(specResult.reason, /Speculative language detected/);

  // Failed exit code must fail
  const failedRun = AntiHallucinationEnforcer.auditVerificationInvariant(
    'Executed pytest suite on user endpoints',
    { exitCode: 1, stdout: 'FAILED (failures=1)' }
  );
  assert.strictEqual(failedRun.valid, false);
  assert.match(failedRun.reason, /failed with exit code 1/);

  // Simulated mock evidence must be quarantined
  const mockRun = AntiHallucinationEnforcer.auditVerificationInvariant(
    'Verification tests executed',
    { exitCode: 0, stdout: 'ok' },
    { isMock: true, stale: false }
  );
  assert.strictEqual(mockRun.valid, false);
  assert.match(mockRun.reason, /simulated\/mock mode/i);

  // Legitimate verifiable claim with exit code 0 must pass
  const verifiedRun = AntiHallucinationEnforcer.auditVerificationInvariant(
    'Executed pytest suite on user endpoints: 42 passed in 1.2s',
    { exitCode: 0, stdout: '42 passed in 1.2s' },
    { isMock: false, stale: false }
  );
  assert.strictEqual(verifiedRun.valid, true);
});

test('Anti-Hallucination: Enforces scope ceilings and prevents placeholder truncation (Laws 4 & 5)', () => {
  // Scope ceiling: Unapproved file modification
  const scopeCheck = AntiHallucinationEnforcer.verifyScopeCeiling(
    ['src/auth.js', 'config/database.js'],
    ['src/auth.js'],
    20,
    50
  );
  assert.strictEqual(scopeCheck.valid, false);
  assert.match(scopeCheck.reason, /Modified unapproved files/);

  // Scope ceiling: Diff size breach
  const diffCheck = AntiHallucinationEnforcer.verifyScopeCeiling(
    ['src/auth.js'],
    ['src/auth.js'],
    150,
    50
  );
  assert.strictEqual(diffCheck.valid, false);
  assert.match(diffCheck.reason, /exceeded authorized scope ceiling/);

  // Full output completeness: Blocks ellipsis placeholders
  const placeholderCheck = AntiHallucinationEnforcer.verifyOutputCompleteness(
    'function authenticate() {\n  // ... existing code ...\n  return true;\n}'
  );
  assert.strictEqual(placeholderCheck.valid, false);
  assert.match(placeholderCheck.reason, /Prohibited code placeholder detected/);

  // Full clean code passes
  const completeCheck = AntiHallucinationEnforcer.verifyOutputCompleteness(
    'function authenticate() {\n  const token = getToken();\n  return verify(token);\n}'
  );
  assert.strictEqual(completeCheck.valid, true);
});

test('Cryptographic Manifest Signer: Signs, verifies, and detects tampering with Ed25519', () => {
  const keyPair = ManifestSigner.generateKeyPair();
  const sourceTreeHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  const payload = {
    evidenceRecordIds: ['EVI-123', 'EVI-456'],
    gitCommit: 'abc1234',
    releaseVersion: '1.2.0',
    sourceTreeHash
  };

  // Sign payload
  const signed = ManifestSigner.signPayload(payload, keyPair.privateKey);
  assert.strictEqual(signed.algorithm, 'Ed25519');
  assert.ok(signed.signature.length > 30);

  const markdownBlock = ManifestSigner.formatSignatureBlock(signed, keyPair.publicKey);
  const fullManifest = `# Release Manifest\n\nStatus: APPROVED\n` + markdownBlock;

  // 1. Valid signature verifies successfully
  const verifyResult = ManifestSigner.verifyManifest(fullManifest, sourceTreeHash);
  assert.strictEqual(verifyResult.valid, true);
  assert.strictEqual(verifyResult.sourceTreeHash, sourceTreeHash);

  // 2. Mismatched sourceTreeHash is rejected
  const mismatchResult = ManifestSigner.verifyManifest(fullManifest, 'different_hash_123456');
  assert.strictEqual(mismatchResult.valid, false);
  assert.match(mismatchResult.reason, /binding mismatch/i);

  // 3. Tampered signature bytes are rejected
  const tamperedManifest = fullManifest.replace(/Signature: [A-Za-z0-9+/=]+/, 'Signature: AAAAInvalidSignatureBBBB');
  const tamperedResult = ManifestSigner.verifyManifest(tamperedManifest, sourceTreeHash);
  assert.strictEqual(tamperedResult.valid, false);
  assert.match(tamperedResult.reason, /mathematically invalid|tampering/i);

  // 4. Manifest without signature block is rejected
  const rawManifest = `# Release Manifest\n\nTextual claim only: Signed by Orchestrator`;
  const noSigResult = ManifestSigner.verifyManifest(rawManifest, sourceTreeHash);
  assert.strictEqual(noSigResult.valid, false);
  assert.match(noSigResult.reason, /Missing cryptographic signature block/);
});

test('Provider Management: Token bucket rate limiting, jittered backoff, and capability validation', async () => {
  const pm = new ProviderManager({ baseCooldownMs: 20, maxCooldownMs: 200 });

  // 1. TokenBucket consumption
  const bucket = new TokenBucket(5, 10);
  assert.strictEqual(bucket.tryConsume(3), true);
  assert.strictEqual(bucket.tryConsume(2), true);
  assert.strictEqual(bucket.tryConsume(1), false); // Saturated

  // 2. Strict capability validation
  const providerWithCaps = { id: 'p1', capabilities: ['json_mode', 'tools'] };
  assert.strictEqual(pm.validateCapabilities(providerWithCaps, ['json_mode']), true);
  assert.strictEqual(pm.validateCapabilities(providerWithCaps, ['vision']), false);

  // Missing capabilities metadata strictly returns false
  const providerNoCaps = { id: 'p2' };
  assert.strictEqual(pm.validateCapabilities(providerNoCaps, ['json_mode']), false);

  // 3. Jittered rate limit backoff
  const delay = pm.recordRateLimit('p1');
  assert.ok(delay >= 20 && delay <= 200);
  assert.strictEqual(pm.isProviderAvailable('p1'), false);

  // Success resets failures
  pm.recordSuccess('p1');
  assert.strictEqual(pm.isProviderAvailable('p1'), true);
});

test('Schema Validator: Validates runtime records against formal JSON schemas', () => {
  const validator = new SchemaValidator();

  // 1. Task Definition Schema
  const validTask = {
    task_id: 'TASK-001',
    stage: '04',
    title: 'Implement Auth Handler',
    assigned_agent: 'senior_builder',
    dependencies: [],
    target_files: ['src/auth.js'],
    required_inputs: ['03_implementation_plan.md'],
    expected_artifacts: ['04_patch_contract.md']
  };
  const taskRes = validator.validate(validTask, 'task_definition_schema.json');
  assert.strictEqual(taskRes.valid, true);

  // Invalid task (missing target_files)
  const invalidTask = { task_id: 'TASK-002', stage: '04', title: 'Broken' };
  const badTaskRes = validator.validate(invalidTask, 'task_definition_schema.json');
  assert.strictEqual(badTaskRes.valid, false);

  // 2. Agent Handoff Schema
  const validHandoff = {
    handoff_id: 'HO-100',
    timestamp: '2026-11-15T12:00:00Z',
    from_stage: '03',
    to_stage: '04',
    from_agent: 'task_planner',
    to_agent: 'senior_builder',
    artifacts_produced: ['03_implementation_plan.md'],
    source_tree_hash: 'a'.repeat(64),
    gate_status: 'PASSED'
  };
  const handoffRes = validator.validate(validHandoff, 'agent_handoff_schema.json');
  assert.strictEqual(handoffRes.valid, true);

  // 3. Evidence Record Schema
  const validEvidence = {
    id: 'EVI-001',
    type: 'TEST_EXECUTION',
    timestamp: '2026-11-15T12:00:00Z',
    sourceTreeHash: 'b'.repeat(64),
    isMock: false,
    provenance: {
      agent: 'test_lead',
      backend: 'native'
    },
    data: {
      exitCode: 0,
      command: 'pytest'
    }
  };
  const evidenceRes = validator.validate(validEvidence, 'evidence_record_schema.json');
  assert.strictEqual(evidenceRes.valid, true);
});

test('Orchestration Engine: Task DAG Execution with file locks and dual control enforcement', async () => {
  const root = path.join(__dirname, '..');
  const engine = new OrchestrationEngine(root);

  // Task DAG execution with independent tasks
  const tasks = [
    {
      task_id: 'TASK-A',
      title: 'Database Schema Migration',
      dependencies: [],
      target_files: ['src/models.js'],
      assignedAgent: 'System Architect',
      execute: async () => ({ status: 'success', file: 'models.js' })
    },
    {
      task_id: 'TASK-B',
      title: 'API Endpoint Router',
      dependencies: ['TASK-A'],
      target_files: ['src/routes.js'],
      assignedAgent: 'System Architect',
      execute: async () => ({ status: 'success', file: 'routes.js' })
    }
  ];

  const dagResult = await engine.executeStageWithDag(2, tasks);
  assert.strictEqual(dagResult.totalTasks, 2);
  assert.strictEqual(dagResult.executedBatches, 2);
  assert.strictEqual(dagResult.results.length, 2);

  // Dual Control Rule: Builder attempting to act as verifier in Stage 05 must throw
  const verificationTask = [
    {
      task_id: 'TASK-VERIFY-SELF',
      title: 'Self Verification Attempt',
      dependencies: [],
      target_files: [],
      assignedAgent: 'Senior Builder'
    }
  ];

  await assert.rejects(
    async () => {
      await engine.executeStageWithDag(5, verificationTask, { authorAgent: 'Senior Builder' });
    },
    /Dual control violation/
  );
});
