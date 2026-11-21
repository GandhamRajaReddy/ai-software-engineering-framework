/**
 * Agent Execution Adapter (ASEF Runtime Core - Hardened)
 * Connects the Orchestration Engine to ProviderExecutionManager, enforces project root
 * containment via ArtifactIntegrityManager, executes tests inside ExecutionSandbox,
 * resolves skills via SkillRegistry, and logs immutable evidence to EvidenceRegistry.
 */

const fs = require('fs');
const path = require('path');
const { executeInSandbox } = require('./execution-sandbox');
const { collectArtifactsSafely } = require('./artifact-integrity-manager');
const { ProviderExecutionManager } = require('./provider-execution-manager');
const { recordEvidence } = require('./evidence-registry');
const { SkillRegistry } = require('./skill-registry');
const { STAGES } = require('./stages-config');
const { AntiHallucinationEnforcer } = require('../anti_hallucination/runtime_enforcement');

class AgentExecutionAdapter {
  constructor(projectDir = process.cwd(), options = {}) {
    this.projectDir = path.resolve(projectDir);
    this.options = options;
    this.backend = options.backend || process.env.ASEF_AGENT_BACKEND || 'direct-llm';
    this.historyFile = path.join(this.projectDir, '.asef', 'execution-history.jsonl');
    this.maxRetries = options.maxRetries || 3;
    this.providerManager = new ProviderExecutionManager({
      backend: this.backend,
      projectDir: this.projectDir,
      allowMockFallback: options.allowMockFallback !== undefined
        ? options.allowMockFallback
        : (process.env.NODE_ENV === 'test' || options.isTest || process.env.ASEF_ALLOW_MOCK === 'true')
    });
    this.skillRegistry = new SkillRegistry(path.join(__dirname, '..', 'skills'));
  }

  /**
   * Dispatches a lifecycle stage task to the configured agent specialist
   */
  async executeStage(stageIndex, context = {}) {
    const stage = STAGES[stageIndex];
    if (!stage) {
      throw new Error(`Invalid stage index: ${stageIndex}`);
    }

    const startTime = Date.now();
    const taskId = `STAGE-${stage.index}-${Date.now()}`;
    const branchName = `feat/${stage.id.toLowerCase().replace(/_/g, '-')}`;

    // 1. Prepare Git feature branch if Git is initialized
    const gitAvailable = await this.ensureGitBranch(branchName);

    // 2. Build the specialist prompt with rich skill context & provenance
    const specialistPrompt = this.buildSpecialistPrompt(stage, context);
    const loadedSkills = this.lastLoadedSkills || [];

    // 3. Dispatch to agent backend via ProviderExecutionManager
    let agentResponse;
    try {
      agentResponse = await this.providerManager.execute(specialistPrompt, stage, {
        backend: this.backend
      });
    } catch (err) {
      this.logExecution({
        taskId,
        stageIndex,
        stageId: stage.id,
        agent: stage.agent,
        backend: this.backend,
        success: false,
        durationMs: Date.now() - startTime,
        error: err.message
      });
      throw err;
    }

    // Anti-Hallucination Law 5: Full output completeness check (strictly blocking)
    const completenessCheck = AntiHallucinationEnforcer.verifyOutputCompleteness(agentResponse.content);
    if (!completenessCheck.valid) {
      throw new Error(`[AntiHallucination BLOCKED] Output completeness check failed: ${completenessCheck.reason}`);
    }

    // 4. Safely collect generated artifacts with root containment & SHA-256 hashing
    const collectedRecords = collectArtifactsSafely(
      agentResponse.content,
      stage.targetArtifact,
      this.projectDir,
      { stageIndex: stage.index, author: stage.agent }
    );
    const collectedFiles = collectedRecords.map(r => r.relativePath);

    // Anti-Hallucination Law 1: Physical filesystem grounding & containment check
    const groundingCheck = AntiHallucinationEnforcer.verifyFilesystemGrounding(this.projectDir, collectedFiles);
    if (!groundingCheck.valid) {
      throw new Error(`[AntiHallucination] ${groundingCheck.reason}`);
    }

    // 5. Verification & Feedback Loop (Self-Healing TDD)
    let verificationResult = { passed: true, command: 'none', attempts: 1 };
    if (stage.index >= 4) { // Stage 04 (Implementation) and Stage 05 (Verification)
      const testCommand = this.detectTestCommand(context);
      verificationResult = await this.runFeedbackLoop(testCommand, stage, collectedFiles, agentResponse);

      // Anti-Hallucination Law 2: Verification invariant audit (strictly blocking)
      const invariantAudit = AntiHallucinationEnforcer.auditVerificationInvariant(
        agentResponse.content,
        { exitCode: verificationResult.exitCode !== undefined ? verificationResult.exitCode : (verificationResult.passed ? 0 : 1) }
      );
      if (!invariantAudit.valid) {
        throw new Error(`[AntiHallucination BLOCKED] Verification invariant audit failed: ${invariantAudit.reason}`);
      }
    }

    // 6. Commit to Git if verification passed
    let commitHash = null;
    if (gitAvailable && verificationResult.passed && collectedFiles.length > 0) {
      commitHash = await this.commitStageChanges(stage, collectedFiles);
    }

    // 7. Log execution history
    const executionRecord = {
      taskId,
      stageIndex,
      stageId: stage.id,
      agent: stage.agent,
      requestedBackend: agentResponse.requestedBackend,
      actualBackend: agentResponse.actualBackend,
      isMock: agentResponse.isMock,
      fallbackChain: agentResponse.fallbackChain,
      branchName,
      commitHash,
      collectedFiles,
      collectedArtifacts: collectedRecords,
      loadedSkills,
      verificationResult,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      success: verificationResult.passed
    };
    this.logExecution(executionRecord);

    return {
      success: verificationResult.passed,
      stage,
      executionRecord,
      collectedFiles,
      agentResponse
    };
  }

  /**
   * Detects stack-appropriate verification command based on context and repository markers
   */
  detectTestCommand(context = {}) {
    if (context.testCommand && context.testCommand !== 'none') {
      return context.testCommand;
    }

    const selectedStack = (context.selectedStack || '').toLowerCase();
    
    // 1. Python detection
    if (
      selectedStack.includes('python') ||
      selectedStack.includes('fastapi') ||
      selectedStack.includes('django') ||
      fs.existsSync(path.join(this.projectDir, 'pytest.ini')) ||
      fs.existsSync(path.join(this.projectDir, 'pyproject.toml')) ||
      fs.existsSync(path.join(this.projectDir, 'requirements.txt')) ||
      fs.existsSync(path.join(this.projectDir, 'Pipfile'))
    ) {
      if (
        selectedStack.includes('fastapi') ||
        selectedStack.includes('django') ||
        fs.existsSync(path.join(this.projectDir, 'pytest.ini')) ||
        fs.existsSync(path.join(this.projectDir, 'tests'))
      ) {
        return 'pytest';
      }
      return 'python -m unittest';
    }

    // 2. Go detection
    if (
      selectedStack.includes('go') ||
      selectedStack.includes('golang') ||
      fs.existsSync(path.join(this.projectDir, 'go.mod'))
    ) {
      return 'go test ./...';
    }

    // 3. Java detection
    if (
      selectedStack.includes('java') ||
      selectedStack.includes('spring') ||
      fs.existsSync(path.join(this.projectDir, 'pom.xml'))
    ) {
      return 'mvn test';
    }
    if (fs.existsSync(path.join(this.projectDir, 'build.gradle')) || fs.existsSync(path.join(this.projectDir, 'build.gradle.kts'))) {
      return process.platform === 'win32' ? 'gradlew.bat test' : './gradlew test';
    }

    // 4. Node / TypeScript detection
    if (fs.existsSync(path.join(this.projectDir, 'package.json'))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(this.projectDir, 'package.json'), 'utf8'));
        if (pkg.scripts && pkg.scripts.test) {
          return 'npm test';
        }
      } catch (e) { /* ignore parse error */ }
      return 'npm test';
    }

    // Default fallback
    return 'npm test';
  }

  /**
   * Builds the token-budgeted prompt for the specialist agent persona
   */
  buildSpecialistPrompt(stage, context = {}) {
    const assignedAgent = context.assignedAgent || context.agentOverride || stage.agent;
    let prompt = `You are operating as the specialist persona: "${assignedAgent}".\n`;
    prompt += `Framework Lifecycle Stage: ${stage.name} (${stage.id})\n`;
    prompt += `Primary Required Skill: ${stage.skill}\n\n`;

    prompt += `## Task Description\n${stage.description}\n\n`;

    if (context.problemStatement) {
      prompt += `## Project Problem Statement\n${context.problemStatement}\n\n`;
    }

    if (context.priorArtifactContent) {
      prompt += `## Input Specification from Prior Stage\n${context.priorArtifactContent}\n\n`;
    }

    // Determine skills to load
    let skillsToLoad = [stage.skill];
    const stackKey = context.selectedStack || (context.evaluatedStack && context.evaluatedStack.recommendedStack ? context.evaluatedStack.recommendedStack.stack : null);

    if (context.backendSkills && context.backendSkills.length > 0) {
      skillsToLoad.push(...context.backendSkills);
    } else if (stackKey) {
      const { PRESET_STACKS } = require('./stack-evaluator');
      const stackPreset = typeof stackKey === 'string' ? PRESET_STACKS[stackKey] : stackKey;
      if (stackPreset && stackPreset.recommendedSkills) {
        skillsToLoad.push(...stackPreset.recommendedSkills);
      }
    }

    // Assemble actual skill content through SkillRegistry
    const skillAssembly = this.skillRegistry.assembleSkillContext(skillsToLoad, 3000);
    this.lastLoadedSkills = skillAssembly.loadedSkills;
    if (skillAssembly.promptContext) {
      prompt += skillAssembly.promptContext + '\n\n';
    }

    prompt += `## Strict Output Requirements\n`;
    prompt += `1. Follow the Ponytail & Karpathy principles: surgical, minimal, zero unnecessary code.\n`;
    prompt += `2. If writing code, provide full complete implementations without placeholders like "// ... rest of code".\n`;
    prompt += `3. Output the exact target artifact: \`${stage.targetArtifact}\`.\n`;
    prompt += `4. Format files with explicit markdown file headers:\n`;
    prompt += `   \`\`\`filepath:relative/path/to/file.ext\n   [file content]\n   \`\`\`\n`;

    return prompt;
  }

  /**
   * Executes the test command safely inside ExecutionSandbox and records evidence
   */
  async runFeedbackLoop(testCommand, stage, collectedFiles, agentResponse) {
    let attempt = 1;

    while (attempt <= this.maxRetries) {
      const evidence = await executeInSandbox(testCommand, {
        projectDir: this.projectDir,
        cwd: this.projectDir,
        timeoutMs: 60000
      });

      // Record in immutable evidence registry
      recordEvidence(this.projectDir, {
        type: 'TEST_EXECUTION',
        command: testCommand,
        exitCode: evidence.exitCode,
        passed: evidence.passed,
        durationMs: evidence.durationMs,
        isMock: agentResponse.isMock,
        summary: evidence.passed ? 'All tests passed cleanly' : (evidence.error || 'Test failure'),
        details: {
          stdoutSnippet: evidence.stdout.slice(0, 1000),
          stderrSnippet: evidence.stderr.slice(0, 1000)
        }
      });

      if (evidence.passed) {
        return {
          passed: true,
          attempts: attempt,
          command: testCommand,
          evidence
        };
      }

      // If test failed and we haven't reached max retries, formulate surgical repair prompt
      if (attempt < this.maxRetries) {
        const repairPrompt = `The verification test command failed.\n` +
          `Command: \`${testCommand}\`\n` +
          `Exit Code: ${evidence.exitCode}\n` +
          `Failure Output:\n\`\`\`\n${(evidence.stderr || evidence.stdout).slice(0, 2000)}\n\`\`\`\n\n` +
          `Fix the implementation surgically. Obey Ponytail principles: do not rewrite working modules, fix only the root cause. Return updated files with \`\`\`filepath:...\`\`\`.`;

        try {
          const repairResponse = await this.providerManager.execute(repairPrompt, stage, {
            backend: this.backend
          });
          collectArtifactsSafely(repairResponse.content, stage.targetArtifact, this.projectDir);
        } catch (e) {
          break;
        }
      }

      attempt++;
    }

    return {
      passed: false,
      attempts: attempt,
      command: testCommand,
      error: 'Max repair attempts exhausted without passing test.'
    };
  }

  /**
   * Prepares and checks out a Git feature branch shell-free
   */
  async ensureGitBranch(branchName) {
    if (!fs.existsSync(path.join(this.projectDir, '.git'))) return false;

    try {
      await executeInSandbox(`git checkout -B ${branchName}`, {
        projectDir: this.projectDir,
        cwd: this.projectDir
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Commits stage changes safely to Git shell-free
   */
  async commitStageChanges(stage, files = []) {
    if (!fs.existsSync(path.join(this.projectDir, '.git'))) return null;

    try {
      await executeInSandbox('git add -A', {
        projectDir: this.projectDir,
        cwd: this.projectDir
      });

      const commitMsg = `feat(stage-${stage.index}): complete ${stage.name}`;
      await executeInSandbox(`git commit -m "${commitMsg}"`, {
        projectDir: this.projectDir,
        cwd: this.projectDir
      });

      const hashRes = await executeInSandbox('git rev-parse HEAD', {
        projectDir: this.projectDir,
        cwd: this.projectDir
      });

      return hashRes.stdout.trim() || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Appends execution record to history JSONL
   */
  logExecution(record) {
    try {
      fs.mkdirSync(path.dirname(this.historyFile), { recursive: true });
      fs.appendFileSync(this.historyFile, JSON.stringify(record) + '\n', 'utf8');
    } catch (e) {
      // Ignore logging errors
    }
  }

  /**
   * Collects artifacts safely (compatibility method)
   */
  collectArtifacts(content, stage) {
    const records = collectArtifactsSafely(content, stage ? stage.targetArtifact : null, this.projectDir);
    return records.map(r => r.relativePath);
  }

  /**
   * Invokes backend (compatibility method delegating to providerManager)
   */
  async invokeBackend(prompt, stage) {
    return this.providerManager.execute(prompt, stage, { backend: this.backend });
  }
}

module.exports = {
  AgentExecutionAdapter
};
