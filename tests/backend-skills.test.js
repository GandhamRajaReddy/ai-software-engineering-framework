const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { PRESET_STACKS, evaluateStack } = require('../cli/stack-evaluator');
const { AgentExecutionAdapter } = require('../cli/agent-execution-adapter');
const { scanFile } = require('../cli/skillspector-scanner');

const BACKEND_SKILL_DIRS = [
  'api-contract-testing',
  'api-design-principles',
  'async-background-processing',
  'backend-architecture',
  'backend-compliance-privacy',
  'backend-data-integrity',
  'backend-observability',
  'backend-performance-engineering',
  'backend-reliability-engineering',
  'backend-security',
  'backend-testing',
  'caching-performance',
  'cloud-infrastructure-engineering',
  'database-engineering',
  'database-migrations',
  'distributed-systems-reliability',
  'django-drf-engineering',
  'event-driven-architecture',
  'fastapi-engineering',
  'golang-backend-engineering',
  'identity-access-engineering',
  'microservices-engineering',
  'multi-tenant-saas-engineering',
  'nodejs-backend-engineering',
  'production-incident-response',
  'springboot-engineering'
];

test('Backend Skills: All 26 backend & reliability skills exist with valid frontmatter matching directory name', () => {
  const skillsBaseDir = path.join(__dirname, '..', 'skills');

  for (const skillName of BACKEND_SKILL_DIRS) {
    const skillPath = path.join(skillsBaseDir, skillName, 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), `Missing skill file: ${skillName}/SKILL.md`);

    const content = fs.readFileSync(skillPath, 'utf8');
    assert.match(content, /^---\r?\n/, `${skillName} must start with YAML frontmatter delimiter`);
    
    // Name in frontmatter must match directory name
    const nameMatch = content.match(/name:\s*([a-zA-Z0-9_-]+)/);
    assert.ok(nameMatch, `${skillName} must have a name field in frontmatter`);
    assert.strictEqual(nameMatch[1], skillName, `Frontmatter name (${nameMatch[1]}) must match directory (${skillName})`);

    // Description must be present
    assert.match(content, /description:\s*.+/, `${skillName} must contain description`);
  }
});

test('Backend Skills: Every preset stack has recommendedSkills that exist on disk', () => {
  const skillsBaseDir = path.join(__dirname, '..', 'skills');

  for (const [stackKey, stack] of Object.entries(PRESET_STACKS)) {
    assert.ok(Array.isArray(stack.recommendedSkills), `Stack ${stackKey} must define recommendedSkills array`);
    assert.ok(stack.recommendedSkills.length > 0, `Stack ${stackKey} recommendedSkills cannot be empty`);

    for (const skill of stack.recommendedSkills) {
      const skillPath = path.join(skillsBaseDir, skill, 'SKILL.md');
      assert.ok(fs.existsSync(skillPath), `Skill ${skill} referenced by stack ${stackKey} must exist at ${skillPath}`);
    }
  }
});

test('Backend Skills: AgentExecutionAdapter binds stack-specific backend skills into prompt', () => {
  const adapter = new AgentExecutionAdapter(path.join(__dirname, '..'));
  const stage = {
    id: '04_IMPLEMENTATION',
    name: 'Implementation & Surgical TDD',
    agent: 'Senior Builder',
    skill: 'surgical-implementation-tdd',
    targetArtifact: '04_patch_contract.md',
    description: 'Implement core domain logic with TDD.'
  };

  // Test FastAPI stack prompt
  const fastapiPrompt = adapter.buildSpecialistPrompt(stage, {
    selectedStack: 'fastapi-postgres'
  });
  assert.ok(fastapiPrompt.includes('fastapi-engineering'), 'FastAPI prompt must bind fastapi-engineering skill');
  assert.ok(fastapiPrompt.includes('database-engineering'), 'FastAPI prompt must bind database-engineering skill');
  assert.ok(fastapiPrompt.includes('caching-performance'), 'FastAPI prompt must bind caching-performance skill');

  // Test Go stack prompt
  const goPrompt = adapter.buildSpecialistPrompt(stage, {
    selectedStack: 'go-microservice'
  });
  assert.ok(goPrompt.includes('golang-backend-engineering'), 'Go prompt must bind golang-backend-engineering skill');
  assert.ok(goPrompt.includes('microservices-engineering'), 'Go prompt must bind microservices-engineering skill');

  // Test Django stack prompt
  const djangoPrompt = adapter.buildSpecialistPrompt(stage, {
    selectedStack: 'django-drf'
  });
  assert.ok(djangoPrompt.includes('django-drf-engineering'), 'Django prompt must bind django-drf-engineering skill');
});

test('Backend Skills: All backend skills pass NVIDIA SkillSpector security scan with 0 Critical/High', () => {
  const skillsBaseDir = path.join(__dirname, '..', 'skills');

  for (const skillName of BACKEND_SKILL_DIRS) {
    const skillPath = path.join(skillsBaseDir, skillName, 'SKILL.md');
    const result = scanFile(skillPath);

    const criticals = result.findings.filter(f => f.severity === 'CRITICAL');
    const highs = result.findings.filter(f => f.severity === 'HIGH');

    assert.strictEqual(criticals.length, 0, `Skill ${skillName} has critical findings: ${JSON.stringify(criticals)}`);
    assert.strictEqual(highs.length, 0, `Skill ${skillName} has high findings: ${JSON.stringify(highs)}`);
    assert.strictEqual(result.passed, true, `Skill ${skillName} failed SkillSpector scan`);
  }
});
