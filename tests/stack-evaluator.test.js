const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateStack, PRESET_STACKS } = require('../cli/stack-evaluator');

test('evaluateStack correctly penalizes MERN when ACID and SEO are required', () => {
  const result = evaluateStack({
    needsAcid: true,
    needsSeo: true,
    expectedRps: 1000
  }, 'mern');

  assert.equal(result.isUserStackOptimal, false);
  assert.equal(result.recommendedStack.stack.name.includes('Modern TypeScript'), true);
  assert.ok(result.recommendedStack.score > result.userProposedStack.score);
  assert.ok(result.userProposedStack.notes.some(n => n.includes('ACID')));
});

test('evaluateStack approves user stack when constraints align', () => {
  const result = evaluateStack({
    needsAcid: true,
    needsSeo: true,
    needsStrictTypes: true,
    expectedRps: 1000
  }, 'modern-ts-fullstack');

  assert.equal(result.isUserStackOptimal, true);
  assert.ok(result.decisionSummary.includes('APPROVED'));
});

test('evaluateStack favors FastAPI when AI/ML integration is required', () => {
  const result = evaluateStack({
    needsAcid: true,
    needsSeo: false,
    aiIntegration: true,
    expectedRps: 2000
  }, 'fastapi-postgres');

  assert.equal(result.isUserStackOptimal, true);
  assert.ok(result.recommendedStack.notes.some(n => n.includes('AI ecosystem')));
});
