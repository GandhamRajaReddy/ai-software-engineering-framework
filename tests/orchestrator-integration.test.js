const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { AntiHallucinationEnforcer } = require('../anti_hallucination/runtime_enforcement');
const { ProviderManager } = require('../resources/provider_management');
const { EvidenceRegistry } = require('../cli/evidence-registry');
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

  // Legitimate verifiable claim with exit code 0 must pass
  const verifiedRun = AntiHallucinationEnforcer.auditVerificationInvariant(
    'Executed pytest suite on user endpoints: 42 passed in 1.2s',
    { exitCode: 0, stdout: '42 passed in 1.2s' }
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

test('Provider Management: Manages rate limit cooldowns and health evaluation', async () => {
  const pm = new ProviderManager({ cooldownMs: 100 });

  assert.strictEqual(pm.isProviderAvailable('groq'), true);

  // Record rate limit -> provider enters cooldown
  pm.recordRateLimit('groq');
  assert.strictEqual(pm.isProviderAvailable('groq'), false);

  const fallback = pm.selectHealthyProvider(['groq', 'google-gemini']);
  assert.strictEqual(fallback, 'google-gemini');

  // After cooldown expires
  await new Promise(r => setTimeout(r, 120));
  assert.strictEqual(pm.isProviderAvailable('groq'), true);
});

test('Contracts: All JSON Schemas are valid and parseable', () => {
  const contractsDir = path.join(__dirname, '..', 'contracts');
  const schemaFiles = [
    'agent_contract_schema.json',
    'task_definition_schema.json',
    'agent_handoff_schema.json',
    'evidence_record_schema.json',
    'release_decision_schema.json'
  ];

  for (const file of schemaFiles) {
    const filePath = path.join(contractsDir, file);
    assert.ok(fs.existsSync(filePath), `Missing contract schema: ${file}`);
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.type, 'object', `${file} must be an object schema`);
    assert.ok(Array.isArray(parsed.required), `${file} must specify required fields`);
  }
});
