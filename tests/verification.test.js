const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyFilesystemGrounding, auditContractVerification } = require('../cli/verification-engine');
const path = require('path');

test('verifyFilesystemGrounding detects missing hallucinated files', () => {
  const baseDir = path.resolve(__dirname, '..');
  const result = verifyFilesystemGrounding(baseDir, [
    'package.json',
    'nonexistent_hallucinated_file.ts'
  ]);

  assert.equal(result.allFilesExist, false);
  assert.equal(result.verifiedCount, 1);
  assert.equal(result.missingCount, 1);
  assert.equal(result.missing[0].path, 'nonexistent_hallucinated_file.ts');
});

test('verifyFilesystemGrounding passes when all files exist', () => {
  const baseDir = path.resolve(__dirname, '..');
  const result = verifyFilesystemGrounding(baseDir, [
    'package.json',
    'LICENSE',
    'cli/index.js'
  ]);

  assert.equal(result.allFilesExist, true);
  assert.equal(result.missingCount, 0);
});

test('auditContractVerification blocks speculative claims without test output', () => {
  const speculativeContract = `
# Patch Complete
The bug should work now. It is probably fixed.
Tested: true
`;
  const audit = auditContractVerification(speculativeContract);

  assert.equal(audit.compliant, false);
  assert.ok(audit.violations.some(v => v.includes('should work now')));
});
