const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { AgentExecutionAdapter } = require('../cli/agent-execution-adapter');

test('AgentExecutionAdapter builds specialist prompt with selective context', () => {
  const adapter = new AgentExecutionAdapter(__dirname, { backend: 'mock' });
  const stage = {
    index: 4,
    id: '04_IMPLEMENTATION',
    name: 'Surgical Implementation',
    agent: 'Senior Builder',
    skill: 'surgical-implementation-tdd',
    targetArtifact: '04_patch_contract.md',
    description: 'Implement atomic tasks surgically.'
  };

  const prompt = adapter.buildSpecialistPrompt(stage, {
    problemStatement: 'Build a link shortener',
    priorArtifactContent: 'REQ-001: Short link generation'
  });

  assert.ok(prompt.includes('Senior Builder'));
  assert.ok(prompt.includes('surgical-implementation-tdd'));
  assert.ok(prompt.includes('Build a link shortener'));
  assert.ok(prompt.includes('04_patch_contract.md'));
});

test('AgentExecutionAdapter collects artifacts from code blocks', () => {
  const tmpDir = path.resolve(__dirname, '../.asef-test-collect');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const adapter = new AgentExecutionAdapter(tmpDir, { backend: 'mock' });
  const modelOutput = `
Here is the implementation:

\`\`\`filepath:src/utils/slug.ts
export function makeSlug(): string { return 'abc1234'; }
\`\`\`

\`\`\`filepath:04_patch_contract.md
# Patch Contract
Surgical patch implemented.
\`\`\`
`;

  const stage = { targetArtifact: '04_patch_contract.md' };
  const collected = adapter.collectArtifacts(modelOutput, stage);

  assert.equal(collected.length, 2);
  assert.ok(fs.existsSync(path.join(tmpDir, 'src/utils/slug.ts')));
  assert.ok(fs.existsSync(path.join(tmpDir, '04_patch_contract.md')));

  const slugContent = fs.readFileSync(path.join(tmpDir, 'src/utils/slug.ts'), 'utf8');
  assert.ok(slugContent.includes('makeSlug'));

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('AgentExecutionAdapter executes stage end-to-end and logs history', async () => {
  const tmpDir = path.resolve(__dirname, '../.asef-test-stage-exec');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const adapter = new AgentExecutionAdapter(tmpDir, { backend: 'mock' });
  const result = await adapter.executeStage(1, {
    problemStatement: 'Autonomous testing agent'
  });

  assert.equal(result.success, true);
  assert.equal(result.stage.index, 1);
  assert.ok(fs.existsSync(path.join(tmpDir, '01_requirements_spec.md')));
  assert.ok(fs.existsSync(path.join(tmpDir, '.asef', 'execution-history.jsonl')));

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
