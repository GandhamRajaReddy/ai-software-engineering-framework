const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { OrchestrationEngine, STAGES } = require('../cli/orchestration-engine');

test('OrchestrationEngine initializes fresh state properly', () => {
  const tmpDir = path.resolve(__dirname, '../.asef-test-tmp');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const engine = new OrchestrationEngine(tmpDir);
  const state = engine.getState();

  assert.equal(state.status, 'INITIALIZED');
  assert.equal(state.currentStageIndex, 0);
  assert.equal(state.stages.length, 8);
  assert.equal(state.stages[0].status, 'IN_PROGRESS');
  assert.equal(state.stages[1].status, 'PENDING');

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('OrchestrationEngine startPipeline creates problem statement artifact and handoff', () => {
  const tmpDir = path.resolve(__dirname, '../.asef-test-tmp-start');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const engine = new OrchestrationEngine(tmpDir);
  const result = engine.startPipeline('Build an autonomous AI agent for database monitoring', { proposedStack: 'fastapi-postgres' });

  assert.equal(result.state.status, 'IN_PROGRESS');
  assert.equal(result.state.currentStageIndex, 0);
  assert.ok(result.handoff.includes('Orchestrator & Requirements Analyst'));
  assert.ok(fs.existsSync(path.join(tmpDir, '00_problem_statement.md')));

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('OrchestrationEngine blocks stage progression when gate criteria fail', () => {
  const tmpDir = path.resolve(__dirname, '../.asef-test-tmp-gate');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const engine = new OrchestrationEngine(tmpDir);
  engine.getState();

  // Try to advance without creating 00_problem_statement.md
  const advanceResult = engine.advanceStage();

  assert.equal(advanceResult.success, false);
  assert.equal(advanceResult.stage.index, 0);
  assert.ok(advanceResult.remediation.some(r => r.includes('Missing 00_problem_statement.md')));

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('OrchestrationEngine rollback safely reverts to target stage', () => {
  const tmpDir = path.resolve(__dirname, '../.asef-test-tmp-rollback');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const engine = new OrchestrationEngine(tmpDir);
  engine.startPipeline('Test problem');

  // Create prerequisite for stage 0
  fs.writeFileSync(path.join(tmpDir, '00_problem_statement.md'), '# Problem Statement\n');

  // Advance to Stage 1
  const adv1 = engine.advanceStage();
  assert.equal(adv1.success, true);
  assert.equal(engine.getState().currentStageIndex, 1);

  // Rollback to Stage 0
  const roll = engine.rollbackToStage(0);
  assert.equal(roll.success, true);
  assert.equal(engine.getState().currentStageIndex, 0);
  assert.equal(engine.getState().stages[0].status, 'IN_PROGRESS');
  assert.equal(engine.getState().stages[1].status, 'PENDING');

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
