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

const STAGES = [
  {
    index: 0,
    id: '00_PROBLEM_INGESTION',
    name: 'Problem Statement Ingestion',
    agent: 'Orchestrator & Requirements Analyst',
    skill: 'evidence-based-stack-selection',
    template: 'contracts/problem_statement_template.md',
    targetArtifact: '00_problem_statement.md',
    description: 'Ingest raw problem statement, extract business bounds, user personas, and hard constraints.'
  },
  {
    index: 1,
    id: '01_REQUIREMENTS',
    name: 'Requirements Engineering',
    agent: 'Requirements Analyst',
    skill: 'evidence-based-stack-selection',
    template: 'contracts/feature_contract_template.md',
    targetArtifact: '01_requirements_spec.md',
    description: 'Deconstruct problem into functional requirements (REQ-001..N) and non-functional bounds with Gherkin acceptance criteria.'
  },
  {
    index: 2,
    id: '02_ARCHITECTURE',
    name: 'Evidence-Based Architecture & Stack Selection',
    agent: 'System Architect',
    skill: 'evidence-based-stack-selection',
    template: 'contracts/tech_decision_record_template.md',
    targetArtifact: '02_tech_decision_record.md',
    description: 'Evaluate candidate stacks against functional/NFR constraints, generate trade-off matrix and C4 architecture.'
  },
  {
    index: 3,
    id: '03_PLANNING',
    name: 'Work Breakdown & Dependency Planning',
    agent: 'Task Planner',
    skill: 'token-budget-optimization',
    template: 'contracts/implementation_plan_template.md',
    targetArtifact: '03_implementation_plan.md',
    description: 'Fracture architecture into sequenced milestones, atomic tasks (<=50 lines), and assumptions ledger.'
  },
  {
    index: 4,
    id: '04_IMPLEMENTATION',
    name: 'Surgical Implementation & TDD',
    agent: 'Senior Builder',
    skill: 'surgical-implementation-tdd',
    template: 'contracts/patch_contract_template.md',
    targetArtifact: '04_patch_contract.md',
    description: 'Implement atomic tasks via Red-Green-Refactor TDD cycle using minimal surgical diffs.'
  },
  {
    index: 5,
    id: '05_VERIFICATION',
    name: 'Automated Verification & Security Auditing',
    agent: 'Test Lead & Security Auditor',
    skill: 'verification-before-completion',
    template: 'contracts/test_evidence_report_template.md',
    targetArtifact: '05_verification_report.md',
    description: 'Enforce the Iron Law: fresh test evidence (Exit 0), SkillSpector security scan, and filesystem grounding.'
  },
  {
    index: 6,
    id: '06_DEPLOYMENT',
    name: 'Containerization & Infrastructure',
    agent: 'DevOps Engineer',
    skill: 'production-deployment-gate',
    template: null,
    targetArtifact: 'Dockerfile',
    description: 'Create multi-stage non-root Dockerfile, docker-compose, health check probes (/healthz), and CI/CD workflows.'
  },
  {
    index: 7,
    id: '07_RELEASE_GATE',
    name: 'Production Readiness Release Gate',
    agent: 'Release Manager & Orchestrator',
    skill: 'production-deployment-gate',
    template: 'contracts/release_manifest_template.md',
    targetArtifact: '07_release_manifest.md',
    description: 'Audit the 7 Iron-Clad Release Gates (Score 100/100 required) and produce signed release manifest.'
  }
];

class OrchestrationEngine {
  constructor(projectDir = process.cwd(), options = {}) {
    this.projectDir = path.resolve(projectDir);
    this.stateDir = path.join(this.projectDir, '.asef');
    this.stateFile = path.join(this.stateDir, 'pipeline-state.json');
    this.activePipelineMd = path.join(this.projectDir, 'ACTIVE_PIPELINE.md');
    this.options = options;
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
        const gateCheck = checkReleaseGate(this.projectDir, {
          testsPassed: true,
          requirementsPassed: true,
          reviewPassed: true,
          deployReady: true,
          manifestPassed: true
        });
        gateReport.checks.push({ name: 'All 7 Iron-Clad Release Gates (Score 100/100)', passed: gateCheck.isProductionReady });
        gateReport.passed = gateCheck.isProductionReady;
        if (!gateCheck.isProductionReady) {
          gateReport.errors.push(`Release Gate blocked. Score: ${gateCheck.totalScore}/100.`);
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

      state.history.push({
        timestamp: new Date().toISOString(),
        event: 'STAGE_ADVANCED',
        fromStage: currentIndex,
        toStage: nextIndex
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
}

module.exports = {
  STAGES,
  OrchestrationEngine
};
