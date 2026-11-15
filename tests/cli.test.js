const test = require('node:test');
const assert = require('node:assert/strict');
const { checkReleaseGate } = require('../cli/release-gate-checker');
const path = require('path');

test('checkReleaseGate evaluates framework root successfully', () => {
  const rootDir = path.resolve(__dirname, '..');
  const gateResult = checkReleaseGate(rootDir, {
    testsPassed: true,
    requirementsPassed: true,
    reviewPassed: true,
    deployReady: true,
    manifestPassed: true
  });

  assert.equal(gateResult.isProductionReady, true);
  assert.equal(gateResult.totalScore, 100);
});

test('checkReleaseGate blocks production when test evidence is missing', () => {
  const rootDir = path.resolve(__dirname, '..');
  const gateResult = checkReleaseGate(rootDir, {
    testsPassed: false
  });

  assert.equal(gateResult.isProductionReady, false);
  assert.equal(gateResult.verdict, 'BLOCKED_BY_RELEASE_GATE');
});
