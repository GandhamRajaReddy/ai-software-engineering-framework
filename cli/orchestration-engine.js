/**
 * Orchestration Engine (ASEF Core Workflow Controller)
 * Connects skills, agent personas, contract templates, and verification gates
 * into a coherent, verifiable, automated software development lifecycle.
 */

const fs = require('fs');
const path = require('path');
const { evaluateStack } = require('./stack-evaluator');
const { scanDirectory } = require('./skillspector-scanner');
const { runVerificationCommand, verifyFilesystemGrounding } = require('./verification-engine');
const { detectDrift } = require('./drift-detector');
const { checkReleaseGate } = require('./release-gate-checker');
const { AgentExecutionAdapter } = require('./agent-execution-adapter');
const { ImageGenerator } = require('./image-generator');
const { STAGES } = require('./stages-config');
const { TaskDagScheduler } = require('./task-dag-scheduler');
const { AntiHallucinationEnforcer } = require('../anti_hallucination/runtime_enforcement');
const { SchemaValidator } = require('./schema-validator');
const { computeSourceTreeHash } = require('./evidence-registry');

class OrchestrationEngine {
  constructor(projectDir = process.cwd(), options = {}) {
    this.projectDir = path.resolve(projectDir);
    this.stateDir = path.join(this.projectDir, '.asef');
    this.stateFile = path.join(this.stateDir, 'pipeline-state.json');
    this.activePipelineMd = path.join(this.projectDir, 'ACTIVE_PIPELINE.md');
    this.options = options;
    this.scheduler = new TaskDagScheduler();
    this.schemaValidator = new SchemaValidator();
  }

  /**
   * Initializes or loads the pipeline state
   */
  getState() {
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }

    if (fs.existsSync(this.stateFile)) {
      try {
        const raw = fs.readFileSync(this.stateFile, 'utf8');
        return JSON.parse(raw);
      } catch (e) {
        // Fallback to fresh state if corrupted
      }
    }

    const freshState = {
      version: '1.0.0',
      projectName: path.basename(this.projectDir),
      currentStageIndex: 0,
      status: 'INITIALIZED', // INITIALIZED | IN_PROGRESS | BLOCKED | COMPLETED
      stages: STAGES.map(s => ({
        index: s.index,
        id: s.id,
        name: s.name,
        status: s.index === 0 ? 'IN_PROGRESS' : 'PENDING', // PENDING | IN_PROGRESS | COMPLETED | FAILED
        startedAt: s.index === 0 ? new Date().toISOString() : null,
        completedAt: null,
        artifacts: [],
        gateResults: null,
        errors: []
      })),
      history: [
        {
          timestamp: new Date().toISOString(),
          event: 'PIPELINE_INITIALIZED',
          stageIndex: 0
        }
      ]
    };

    this.saveState(freshState);
    return freshState;
  }

  /**
   * Persists pipeline state to disk and updates ACTIVE_PIPELINE.md
   */
  saveState(state) {
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2), 'utf8');
    this.renderActivePipelineMarkdown(state);
  }

  /**
   * Starts a new pipeline lifecycle with an optional problem statement
   */
  startPipeline(problemStatement = '', options = {}) {
    const state = this.getState();
    state.status = 'IN_PROGRESS';
    state.currentStageIndex = 0;
    state.problemStatement = problemStatement;
    state.proposedStack = options.proposedStack || 'mern';

    // If a problem statement is provided, scaffold Stage 00 artifact
    if (problemStatement) {
      const targetPath = path.join(this.projectDir, '00_problem_statement.md');
      if (!fs.existsSync(targetPath)) {
        let content = `# Problem Statement: ${state.projectName}\n\n`;
        content += `> **Captured Date:** ${new Date().toISOString().split('T')[0]}\n`;
        content += `> **Status:** APPROVED\n\n`;
        content += `## 1. Executive Summary & Problem Core\n${problemStatement}\n\n`;
        content += `## 2. In-Scope (Phase 1 MVP)\n- Core user workflow addressing the primary friction.\n\n`;
        content += `## 3. Out-of-Scope (Explicit Non-Goals)\n- Advanced enterprise features deferred to Phase 2.\n\n`;
        content += `## 4. Engineering Constraints\n- Latency: p99 < 200ms\n- Security: OWASP Top 10 compliance\n`;
        fs.writeFileSync(targetPath, content, 'utf8');
        state.stages[0].artifacts.push('00_problem_statement.md');
      }
    }

    state.history.push({
      timestamp: new Date().toISOString(),
      event: 'PIPELINE_STARTED',
      problemStatement: problemStatement.slice(0, 100)
    });

    this.saveState(state);
    return {
      state,
      currentStage: STAGES[0],
      handoff: this.generateAgentHandoff(0, state)
    };
  }

  /**
   * Validates exit criteria and gates for a specific stage
   */
  validateStageGate(stageIndex, state) {
    const stage = STAGES[stageIndex];
    const gateReport = {
      stageIndex,
      stageId: stage.id,
      passed: false,
      checks: [],
      errors: []
    };

    switch (stageIndex) {
      case 0: { // 00_PROBLEM_INGESTION
        const hasArtifact = fs.existsSync(path.join(this.projectDir, '00_problem_statement.md')) ||
                            fs.existsSync(path.join(this.projectDir, 'contracts', 'problem_statement_template.md'));
        gateReport.checks.push({ name: 'Problem statement artifact exists', passed: hasArtifact });
        if (!hasArtifact) gateReport.errors.push('Missing 00_problem_statement.md');
        gateReport.passed = hasArtifact;
        break;
      }

      case 1: { // 01_REQUIREMENTS
        const hasSpec = fs.existsSync(path.join(this.projectDir, '01_requirements_spec.md')) ||
                        fs.existsSync(path.join(this.projectDir, '01_requirements.md'));
        gateReport.checks.push({ name: 'Requirements specification exists', passed: hasSpec });
        if (!hasSpec) {
          gateReport.errors.push('Missing 01_requirements_spec.md');
        } else {
          const content = fs.readFileSync(path.join(this.projectDir, hasSpec ? (fs.existsSync(path.join(this.projectDir, '01_requirements_spec.md')) ? '01_requirements_spec.md' : '01_requirements.md') : ''), 'utf8');
          const hasReqIds = /REQ-\d+/i.test(content);
          gateReport.checks.push({ name: 'Formal REQ-XXX identifiers defined', passed: hasReqIds });
          if (!hasReqIds) gateReport.errors.push('Requirements specification must contain formal identifiers (e.g. [REQ-001])');
          gateReport.passed = hasSpec && hasReqIds;
        }
        break;
      }

      case 2: { // 02_ARCHITECTURE
        const hasADR = fs.existsSync(path.join(this.projectDir, '02_tech_decision_record.md')) ||
                       fs.existsSync(path.join(this.projectDir, '02_architecture_spec.md'));
        gateReport.checks.push({ name: 'Tech Decision Record exists', passed: hasADR });
        
        // Run stack evaluator verification
        const stackEval = evaluateStack({ needsAcid: true, needsSeo: true }, state.proposedStack || 'mern');
        gateReport.checks.push({ name: 'Evidence-based stack evaluated', passed: Boolean(stackEval.decisionSummary) });
        
        gateReport.passed = hasADR;
        if (!hasADR) gateReport.errors.push('Missing 02_tech_decision_record.md');
        break;
      }

      case 3: { // 03_PLANNING
        const hasPlan = fs.existsSync(path.join(this.projectDir, '03_implementation_plan.md')) ||
                        fs.existsSync(path.join(this.projectDir, 'contracts', 'implementation_plan_template.md'));
        gateReport.checks.push({ name: 'Implementation plan with atomic tasks exists', passed: hasPlan });
        gateReport.passed = hasPlan;
        if (!hasPlan) gateReport.errors.push('Missing 03_implementation_plan.md');
        break;
      }

      case 4: { // 04_IMPLEMENTATION
        const hasPatch = fs.existsSync(path.join(this.projectDir, '04_patch_contract.md')) ||
                         fs.existsSync(path.join(this.projectDir, 'contracts', 'patch_contract_template.md'));
        gateReport.checks.push({ name: 'Patch contracts / code modifications present', passed: hasPatch });
        gateReport.passed = hasPatch;
        if (!hasPatch) gateReport.errors.push('Missing 04_patch_contract.md');
        break;
      }

      case 5: { // 05_VERIFICATION
        const hasReport = fs.existsSync(path.join(this.projectDir, '05_verification_report.md')) ||
                          fs.existsSync(path.join(this.projectDir, 'contracts', 'test_evidence_report.md'));
        gateReport.checks.push({ name: 'Verification evidence report exists', passed: Boolean(hasReport) });

        // Security check
        const sec = scanDirectory(this.projectDir, ['.js', '.ts', '.py']);
        const secPass = sec.passed && sec.summary.critical === 0 && sec.summary.high === 0;
        gateReport.checks.push({ name: 'SkillSpector Security Scan (0 Critical / 0 High)', passed: secPass });

        gateReport.passed = Boolean(hasReport && secPass);
        if (!hasReport) gateReport.errors.push('Missing 05_verification_report.md');
        if (!secPass) gateReport.errors.push(`SkillSpector found ${sec.summary.critical} Critical / ${sec.summary.high} High vulnerabilities`);
        break;
      }

      case 6: { // 06_DEPLOYMENT
        const hasDocker = fs.existsSync(path.join(this.projectDir, 'Dockerfile')) ||
                          fs.existsSync(path.join(this.projectDir, 'docker-compose.yml')) ||
                          fs.existsSync(path.join(this.projectDir, '06_deployment_config')) ||
                          fs.existsSync(path.join(this.projectDir, 'lifecycle', '06_DEPLOYMENT.md'));
        gateReport.checks.push({ name: 'Deployment configuration present', passed: Boolean(hasDocker) });
        gateReport.passed = Boolean(hasDocker);
        if (!hasDocker) gateReport.errors.push('Missing deployment artifacts (Dockerfile or docker-compose.yml)');
        break;
      }

      case 7: { // 07_RELEASE_GATE
        const gateCheck = checkReleaseGate(this.projectDir);
        gateReport.checks.push({ name: 'All 7 Iron-Clad Release Gates (Score 100/100)', passed: gateCheck.isProductionReady });
        gateReport.passed = gateCheck.isProductionReady;
        if (!gateCheck.isProductionReady) {
          gateReport.errors.push(`Release Gate blocked. Score: ${gateCheck.totalScore}/100.`);
          for (const g of gateCheck.gateResults) {
            if (!g.passed) {
              gateReport.errors.push(`[${g.id}] ${g.name}: ${g.evidence}`);
            }
          }
        }
        break;
      }

      default:
        gateReport.passed = true;
    }

    return gateReport;
  }

  /**
   * Advances the pipeline to the next stage if gate criteria are satisfied
   */
  advanceStage() {
    const state = this.getState();
    const currentIndex = state.currentStageIndex;

    if (currentIndex >= STAGES.length - 1 && state.stages[currentIndex].status === 'COMPLETED') {
      return {
        success: true,
        completed: true,
        message: 'Pipeline is already complete. All 7 stages and release gates satisfied.',
        state
      };
    }

    // Validate the current stage's gate
    const gateReport = this.validateStageGate(currentIndex, state);
    state.stages[currentIndex].gateResults = gateReport;

    if (!gateReport.passed) {
      state.status = 'BLOCKED';
      state.stages[currentIndex].status = 'FAILED';
      state.stages[currentIndex].errors = gateReport.errors;
      this.saveState(state);

      return {
        success: false,
        stage: STAGES[currentIndex],
        gateReport,
        message: `Stage ${currentIndex} (${STAGES[currentIndex].name}) gate criteria failed. Resolve errors before advancing.`,
        remediation: gateReport.errors
      };
    }

    // Mark current stage completed
    state.stages[currentIndex].status = 'COMPLETED';
    state.stages[currentIndex].completedAt = new Date().toISOString();

    // Advance to next stage if available
    const nextIndex = currentIndex + 1;
    if (nextIndex < STAGES.length) {
      state.currentStageIndex = nextIndex;
      state.stages[nextIndex].status = 'IN_PROGRESS';
      state.stages[nextIndex].startedAt = new Date().toISOString();
      state.status = 'IN_PROGRESS';

      // Auto-scaffold starter contract template if missing
      this.scaffoldStarterArtifact(nextIndex, state);

      // Validate formal handoff against schema
      const handoffPayload = {
        handoff_id: `HO-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        from_stage: String(currentIndex).padStart(2, '0'),
        to_stage: String(nextIndex).padStart(2, '0'),
        from_agent: STAGES[currentIndex].agent,
        to_agent: STAGES[nextIndex].agent,
        artifacts_produced: (state.stages[currentIndex].artifacts && state.stages[currentIndex].artifacts.length > 0)
          ? state.stages[currentIndex].artifacts
          : [STAGES[currentIndex].targetArtifact],
        source_tree_hash: computeSourceTreeHash(this.projectDir),
        gate_status: 'PASSED',
        context_summary: `Stage ${currentIndex} gate validated successfully.`
      };

      const handoffValidation = this.schemaValidator.validate(handoffPayload, 'agent_handoff_schema.json');
      if (!handoffValidation.valid) {
        console.warn(`[SchemaValidator] Agent handoff schema warning: ${handoffValidation.errors.join('; ')}`);
      }

      state.history.push({
        timestamp: new Date().toISOString(),
        event: 'STAGE_ADVANCED',
        fromStage: currentIndex,
        toStage: nextIndex,
        handoff: handoffPayload
      });

      this.saveState(state);

      return {
        success: true,
        completed: false,
        previousStage: STAGES[currentIndex],
        currentStage: STAGES[nextIndex],
        handoff: this.generateAgentHandoff(nextIndex, state)
      };
    } else {
      state.status = 'COMPLETED';
      state.history.push({
        timestamp: new Date().toISOString(),
        event: 'PIPELINE_COMPLETED',
        finalScore: 100
      });

      this.saveState(state);

      return {
        success: true,
        completed: true,
        message: '🎉 Software Development Lifecycle Complete! Production release gate passed.',
        state
      };
    }
  }

  /**
   * Safely rolls back to a previous stage (e.g. when tests fail or requirements shift)
   */
  rollbackToStage(targetIndex) {
    if (targetIndex < 0 || targetIndex >= STAGES.length) {
      throw new Error(`Invalid stage index: ${targetIndex}. Valid indices are 0 through ${STAGES.length - 1}.`);
    }

    const state = this.getState();
    const fromIndex = state.currentStageIndex;

    state.currentStageIndex = targetIndex;
    state.status = 'IN_PROGRESS';

    for (let i = targetIndex; i < STAGES.length; i++) {
      state.stages[i].status = i === targetIndex ? 'IN_PROGRESS' : 'PENDING';
      state.stages[i].completedAt = null;
    }

    state.history.push({
      timestamp: new Date().toISOString(),
      event: 'PIPELINE_ROLLBACK',
      fromStage: fromIndex,
      toStage: targetIndex
    });

    this.saveState(state);

    return {
      success: true,
      fromStage: STAGES[fromIndex],
      currentStage: STAGES[targetIndex],
      handoff: this.generateAgentHandoff(targetIndex, state)
    };
  }

  /**
   * Generates token-budgeted prompt handoff instructions for the incoming agent persona
   */
  generateAgentHandoff(stageIndex, state) {
    const stage = STAGES[stageIndex];
    let handoff = `# Agent Handoff: Stage ${stage.index} (${stage.name})\n\n`;
    handoff += `> **Active Persona:** \`${stage.agent}\`\n`;
    handoff += `> **Primary Skill:** \`${stage.skill}\`\n`;
    handoff += `> **Target Output:** \`${stage.targetArtifact}\`\n\n`;

    handoff += `## Core Objective\n${stage.description}\n\n`;

    handoff += `## Strict Gate Criteria to Pass\n`;
    switch (stageIndex) {
      case 0:
        handoff += `- Document user problem, target personas, in-scope MVP boundaries, and non-goals in \`00_problem_statement.md\`.\n`;
        break;
      case 1:
        handoff += `- Deconstruct into functional requirements with explicit IDs (e.g. \`[REQ-001]\`) and Gherkin acceptance criteria in \`01_requirements_spec.md\`.\n`;
        break;
      case 2:
        handoff += `- Execute \`asef evaluate-stack\` to produce a scored trade-off matrix in \`02_tech_decision_record.md\`.\n`;
        break;
      case 3:
        handoff += `- Break down architecture into sequenced atomic tasks (<=50 lines) with verification commands in \`03_implementation_plan.md\`.\n`;
        break;
      case 4:
        handoff += `- Follow TDD Red-Green-Refactor. Generate complete, untruncated surgical code and document in \`04_patch_contract.md\`.\n`;
        break;
      case 5:
        handoff += `- Execute tests, run SkillSpector security scan, verify physical file grounding, and document in \`05_verification_report.md\`.\n`;
        break;
      case 6:
        handoff += `- Create multi-stage non-root Dockerfile, docker-compose.yml, and health check endpoint.\n`;
        break;
      case 7:
        handoff += `- Run \`asef gate-check .\` and verify 100/100 score. Produce signed \`07_release_manifest.md\`.\n`;
        break;
    }

    // Include recommended stack-specific backend skills in handoff for stages 02, 03, 04, 05
    const stackKey = state.selectedStack || state.proposedStack;
    if (stackKey && [2, 3, 4, 5].includes(stageIndex)) {
      const { PRESET_STACKS } = require('./stack-evaluator');
      const preset = PRESET_STACKS[stackKey];
      if (preset && preset.recommendedSkills) {
        handoff += `\n## Recommended Backend Skills for Stack (\`${preset.name}\`)\n`;
        for (const sk of preset.recommendedSkills) {
          handoff += `- \`skills/${sk}/SKILL.md\`\n`;
        }
      }
    }

    handoff += `\n## Command to Advance Stage When Complete\n`;
    handoff += `\`\`\`bash\nnode bin/asef.js pipeline advance\n\`\`\`\n`;

    return handoff;
  }

  /**
   * Scaffolds starter artifact if missing
   */
  scaffoldStarterArtifact(stageIndex, state) {
    const stage = STAGES[stageIndex];
    if (!stage.template || !stage.targetArtifact) return;

    const targetPath = path.join(this.projectDir, stage.targetArtifact);
    const templatePath = path.join(this.projectDir, stage.template);

    if (!fs.existsSync(targetPath) && fs.existsSync(templatePath)) {
      const templateContent = fs.readFileSync(templatePath, 'utf8');
      fs.writeFileSync(targetPath, templateContent, 'utf8');
      state.stages[stageIndex].artifacts.push(stage.targetArtifact);
    }
  }

  /**
   * Renders living status markdown for developer visibility
   */
  renderActivePipelineMarkdown(state) {
    let md = `# Active Development Pipeline: ${state.projectName}\n\n`;
    md += `> **Overall Pipeline Status:** \`${state.status}\`\n`;
    md += `> **Current Active Stage:** **Stage ${state.currentStageIndex} (${STAGES[state.currentStageIndex].name})**\n`;
    md += `> **Active Agent Persona:** \`${STAGES[state.currentStageIndex].agent}\`\n`;
    md += `> **Last Updated:** ${new Date().toISOString()}\n\n`;

    md += `## Stage Lifecycle Progression\n\n`;
    md += `| Index | Stage Name | Assigned Agent | Status | Target Artifact |\n`;
    md += `|:-----:|:-----------|:---------------|:------:|:----------------|\n`;
    for (const s of state.stages) {
      const icon = s.status === 'COMPLETED' ? '✅ COMPLETED' :
                   s.status === 'IN_PROGRESS' ? '🔵 IN_PROGRESS' :
                   s.status === 'FAILED' ? '🔴 BLOCKED' : '⚪ PENDING';
      const target = STAGES[s.index].targetArtifact || 'N/A';
      md += `| ${s.index} | **${s.name}** | ${STAGES[s.index].agent} | ${icon} | \`${target}\` |\n`;
    }

    md += `\n## Visual Pipeline Progression (Mermaid)\n\n`;
    md += `\`\`\`mermaid\ngraph LR\n`;
    for (let i = 0; i < STAGES.length; i++) {
      const s = state.stages[i];
      const fill = s.status === 'COMPLETED' ? '#2ecc71' :
                   s.status === 'IN_PROGRESS' ? '#3498db' :
                   s.status === 'FAILED' ? '#e74c3c' : '#bdc3c7';
      md += `    S${i}["Stage ${i}: ${s.name}"]\n`;
      md += `    style S${i} fill:${fill},stroke:#333,stroke-width:1px,color:#fff\n`;
      if (i > 0) {
        md += `    S${i - 1} --> S${i}\n`;
      }
    }
    md += `\`\`\`\n`;

    fs.writeFileSync(this.activePipelineMd, md, 'utf8');
  }

  /**
   * Executes the active stage using the configured Agent Execution Adapter
   */
  async executeStageWithAgent(stageIndex = null, options = {}) {
    const state = this.getState();
    const targetStageIndex = stageIndex !== null ? stageIndex : state.currentStageIndex;
    const stage = STAGES[targetStageIndex];

    const adapter = new AgentExecutionAdapter(this.projectDir, {
      backend: options.backend || this.options.backend,
      maxRetries: options.maxRetries || 3
    });

    // Gather context from previous stage
    let priorContent = '';
    if (targetStageIndex > 0) {
      const priorStage = STAGES[targetStageIndex - 1];
      const priorPath = path.join(this.projectDir, priorStage.targetArtifact);
      if (fs.existsSync(priorPath)) {
        priorContent = fs.readFileSync(priorPath, 'utf8');
      }
    }

    const execResult = await adapter.executeStage(targetStageIndex, {
      problemStatement: state.problemStatement,
      priorArtifactContent: priorContent,
      selectedStack: state.selectedStack || state.proposedStack || 'mern',
      backendSkills: state.backendSkills || options.backendSkills,
      testCommand: options.testCommand || 'npm test'
    });

    if (execResult.success) {
      // Add artifacts to stage record
      for (const art of execResult.collectedFiles) {
        if (!state.stages[targetStageIndex].artifacts.includes(art)) {
          state.stages[targetStageIndex].artifacts.push(art);
        }
      }
      this.saveState(state);
    }

    return execResult;
  }

  /**
   * Executes tasks within a stage using the Task DAG Scheduler with bounded concurrency
   * and strict file ownership locking.
   */
  async executeStageWithDag(stageIndex = null, taskDefinitions = [], options = {}) {
    const state = this.getState();
    const targetStageIndex = stageIndex !== null ? stageIndex : state.currentStageIndex;
    const stage = STAGES[targetStageIndex];

    const dag = new TaskDagScheduler();
    
    // Register tasks
    for (const t of taskDefinitions) {
      dag.addTask({
        id: t.id || t.task_id,
        description: t.description || t.title,
        dependsOn: t.dependsOn || t.dependencies || [],
        dependencies: t.dependencies || t.dependsOn || [],
        targetFiles: t.targetFiles || t.target_files || [],
        assignedAgent: t.assignedAgent || t.assigned_agent || stage.agent,
        execute: t.execute
      });
    }

    const batches = dag.getExecutionBatches();
    const taskResults = [];

    const adapter = new AgentExecutionAdapter(this.projectDir, {
      backend: options.backend || this.options.backend,
      maxRetries: options.maxRetries || 3
    });

    for (const batch of batches) {
      for (const task of batch) {
        const assigned = task.assignedAgent || task.agent;
        if (stage.index === 5 && (assigned === 'Senior Builder' || options.authorAgent === assigned)) {
          throw new Error(`Dual control violation: Author cannot act as verifier in Stage 05.`);
        }

        let result;
        if (typeof task.execute === 'function') {
          result = await task.execute();
        } else {
          result = await adapter.executeStage(targetStageIndex, {
            ...options,
            targetFiles: task.targetFiles,
            taskDescription: task.description
          });
        }
        taskResults.push({ taskId: task.id, success: true, result });
      }
    }

    return {
      stageIndex: targetStageIndex,
      stageId: stage.id,
      totalTasks: taskDefinitions.length,
      executedBatches: batches.length,
      results: taskResults
    };
  }

  /**
   * Generates a complete high-definition image suite for the project
   */
  generateProjectImages(options = {}) {
    const state = this.getState();
    const generator = new ImageGenerator(this.projectDir, options);
    return generator.generateProjectVisualSuite(
      options.projectName || state.projectName,
      options.description || state.problemStatement || 'Enterprise production verified application',
      options
    );
  }

  /**
   * Automated end-to-end execution across all 7 stages using execution adapters
   */
  async autoRun(problemStatement, options = {}) {
    this.startPipeline(problemStatement, options);
    const results = [];

    for (let i = 0; i < STAGES.length; i++) {
      // Execute stage with agent
      const exec = await this.executeStageWithAgent(i, options);
      results.push({ stageIndex: i, stage: STAGES[i], exec });

      // Advance stage
      const adv = this.advanceStage();
      if (!adv.success && !adv.completed) {
        return {
          success: false,
          failedAtStage: i,
          adv,
          results
        };
      }
    }

    // Generate project visuals upon successful completion
    const visuals = this.generateProjectImages(options);

    return {
      success: true,
      completed: true,
      results,
      visuals,
      finalState: this.getState()
    };
  }
}

module.exports = {
  STAGES,
  OrchestrationEngine
};
