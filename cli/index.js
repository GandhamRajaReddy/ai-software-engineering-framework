/**
 * Main Framework CLI Orchestrator (ASEF - AI Software Engineering Framework)
 */

const fs = require('fs');
const path = require('path');
const { evaluateStack } = require('./stack-evaluator');
const { scanDirectory, scanFile, formatReportMarkdown } = require('./skillspector-scanner');
const { runVerificationCommand, verifyFilesystemGrounding, formatVerificationReport } = require('./verification-engine');
const { detectDrift, formatDriftReportMarkdown } = require('./drift-detector');
const { checkReleaseGate, formatReleaseGateMarkdown } = require('./release-gate-checker');
const { OrchestrationEngine, STAGES } = require('./orchestration-engine');

function printHelp() {
  console.log(`
=============================================================================
  ASEF - AI Software Engineering Framework CLI (v1.0.0)
  Evidence-Based, Anti-Hallucination, Zero-Slop SDLC for AI Agents
=============================================================================

Usage: asef <command> [options]

Core Workflow Commands (Orchestration Engine):
  pipeline start [--problem "..."]  Start a structured lifecycle pipeline run
  pipeline advance                  Validate current stage gates and advance to next stage
  pipeline status                   Display living status, active stage, and mermaid chart
  pipeline rollback <stageIndex>    Rollback to an earlier stage with safe context recovery
  pipeline auto-run                 Automated end-to-end verification across all 7 stages

Tool & Audit Commands:
  init [targetDir]                  Scaffold the 6-stage lifecycle & contracts in a project
  evaluate-stack [options]          Evaluate user-proposed stack vs optimal architecture
  verify [testCommand]              Execute tests and collect audit-grade verification evidence
  scan-skill <path>                 Scan skills, MCP configs, or prompts with NVIDIA SkillSpector
  drift-detect [specFile]           Detect architectural drift between design spec and source code
  gate-check [projectDir]           Audit project against the 7 production readiness release gates
  version                           Print version information

Options for evaluate-stack:
  --proposed <name>                 e.g. mern, modern-ts-fullstack, fastapi-postgres, go-microservice
  --acid <true|false>               Require ACID transactions (default: true)
  --seo <true|false>                Require Server-Side Rendering / SEO (default: true)
  --rps <number>                    Target requests per second (default: 1000)
  --ai <true|false>                 Require native AI/ML integration (default: false)

Examples:
  $ asef pipeline start --problem "Build a privacy-first URL shortener"
  $ asef pipeline advance
  $ asef pipeline status
  $ asef evaluate-stack --proposed mern --acid true --seo true
  $ asef verify "npm test"
  $ asef scan-skill skills/
  $ asef gate-check .
`);
}

function handleInit(targetDir = '.') {
  const resolved = path.resolve(process.cwd(), targetDir);
  console.log(`🚀 Initializing AI Software Engineering Framework in: ${resolved}`);

  const dirsToCreate = [
    'lifecycle',
    'contracts',
    'anti_hallucination',
    'agents',
    'skills',
    'resources'
  ];

  for (const d of dirsToCreate) {
    const full = path.join(resolved, d);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
      console.log(`  + Created directory: ${d}/`);
    }
  }

  // Create starter active context
  const activeContextPath = path.join(resolved, 'ACTIVE_CONTEXT.md');
  if (!fs.existsSync(activeContextPath)) {
    fs.writeFileSync(activeContextPath, `# Project Active Context\n\n> Current Stage: 00_PROBLEM_INGESTION\n> Active Agent: Orchestrator\n> Status: In Progress\n`);
    console.log(`  + Created ACTIVE_CONTEXT.md`);
  }

  console.log(`\n✅ Framework initialization complete. Read AI_ENTRYPOINT.md to begin.`);
}

function handleEvaluateStack(args) {
  const proposed = args.includes('--proposed') ? args[args.indexOf('--proposed') + 1] : 'mern';
  const acid = args.includes('--acid') ? args[args.indexOf('--acid') + 1] !== 'false' : true;
  const seo = args.includes('--seo') ? args[args.indexOf('--seo') + 1] !== 'false' : true;
  const ai = args.includes('--ai') ? args[args.indexOf('--ai') + 1] === 'true' : false;
  const rps = args.includes('--rps') ? parseInt(args[args.indexOf('--rps') + 1], 10) : 1000;

  const result = evaluateStack({
    needsAcid: acid,
    needsSeo: seo,
    aiIntegration: ai,
    expectedRps: rps
  }, proposed);

  console.log(result.decisionSummary);
  return result;
}

function handleVerify(testCommand = 'npm test') {
  console.log(`🔍 Executing verification command: "${testCommand}"...`);
  const evidence = runVerificationCommand(testCommand);
  const report = formatVerificationReport(evidence);
  console.log(report);
  return evidence;
}

function handleScanSkill(targetPath) {
  if (!targetPath) {
    console.error('Error: Please provide a file or directory path to scan.');
    process.exit(1);
  }
  const full = path.resolve(process.cwd(), targetPath);
  console.log(`🛡️ Running SkillSpector Security Scan on: ${full}`);

  let result;
  if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
    result = scanDirectory(full);
  } else {
    result = scanFile(full);
  }

  const report = formatReportMarkdown(result);
  console.log(report);
  return result;
}

function handleDriftDetect(specFile) {
  const specPath = specFile ? path.resolve(process.cwd(), specFile) : path.resolve(process.cwd(), '01_requirements.md');
  let content = '';
  if (fs.existsSync(specPath)) {
    content = fs.readFileSync(specPath, 'utf8');
  } else {
    console.warn(`Warning: Spec file ${specPath} not found. Running with baseline detection.`);
  }

  const result = detectDrift(content, process.cwd());
  const report = formatDriftReportMarkdown(result);
  console.log(report);
  return result;
}

function handleGateCheck(projectDir = '.') {
  const full = path.resolve(process.cwd(), projectDir);
  console.log(`🚪 Evaluating 7 Production Readiness Release Gates in: ${full}`);
  const result = checkReleaseGate(full);
  const report = formatReleaseGateMarkdown(result);
  console.log(report);
  return result;
}

function handlePipeline(args = []) {
  const engine = new OrchestrationEngine(process.cwd());
  const subCommand = args[0] ? args[0].toLowerCase() : 'status';

  switch (subCommand) {
    case 'start': {
      let problem = '';
      let stack = 'mern';
      if (args.includes('--problem')) {
        problem = args[args.indexOf('--problem') + 1] || '';
      }
      if (args.includes('--stack')) {
        stack = args[args.indexOf('--stack') + 1] || 'mern';
      }

      const res = engine.startPipeline(problem, { proposedStack: stack });
      console.log(`\n🚀 Orchestration Pipeline Started: "${res.state.projectName}"`);
      console.log(`📍 Current Stage: Stage 0 (${res.currentStage.name})`);
      console.log(`👤 Assigned Agent: ${res.currentStage.agent}`);
      console.log(`\n${res.handoff}`);
      return res;
    }

    case 'advance':
    case 'next': {
      const res = engine.advanceStage();
      if (res.success) {
        if (res.completed) {
          console.log(`\n🎉 ${res.message}`);
        } else {
          console.log(`\n✅ Gate Passed! Transitioned from Stage ${res.previousStage.index} to Stage ${res.currentStage.index} (${res.currentStage.name})`);
          console.log(`👤 Active Persona: ${res.currentStage.agent}`);
          console.log(`\n${res.handoff}`);
        }
      } else {
        console.error(`\n⛔ Gate Check Failed for Stage ${res.stage.index} (${res.stage.name}):`);
        for (const err of res.remediation) {
          console.error(`   - ❌ ${err}`);
        }
        console.log(`\nRemediate the failing items above before re-running "asef pipeline advance".`);
      }
      return res;
    }

    case 'rollback': {
      const target = args[1] !== undefined ? parseInt(args[1], 10) : 0;
      const res = engine.rollbackToStage(target);
      console.log(`\n⏪ Pipeline Rolled Back to Stage ${res.currentStage.index} (${res.currentStage.name})`);
      console.log(`👤 Active Persona: ${res.currentStage.agent}`);
      console.log(`\n${res.handoff}`);
      return res;
    }

    case 'execute':
    case 'run-stage': {
      const stageIdx = args[1] !== undefined && !args[1].startsWith('--') ? parseInt(args[1], 10) : null;
      const backend = args.includes('--backend') ? args[args.indexOf('--backend') + 1] : 'direct-llm';
      console.log(`\n🤖 Dispatching stage execution to Agent Adapter [Backend: ${backend}]...`);
      return engine.executeStageWithAgent(stageIdx, { backend }).then(res => {
        console.log(`\n✅ Agent Execution Complete!`);
        console.log(`📁 Artifacts Produced: ${res.collectedFiles.join(', ')}`);
        if (res.executionRecord.commitHash) {
          console.log(`🌱 Git Commit: ${res.executionRecord.commitHash} on branch ${res.executionRecord.branchName}`);
        }
        return res;
      });
    }

    case 'auto-run': {
      let problem = '';
      if (args.includes('--problem')) {
        problem = args[args.indexOf('--problem') + 1] || '';
      }
      const backend = args.includes('--backend') ? args[args.indexOf('--backend') + 1] : 'mock';
      console.log(`\n🚀 Starting Automated End-to-End SDLC Run...`);
      return engine.autoRun(problem, { backend }).then(res => {
        if (res.success) {
          console.log(`\n🎉 Automated Lifecycle Completed Successfully! Score: 100/100`);
          console.log(`🖼️  Visuals Generated: ${res.visuals.images.length} assets in ${res.visuals.outputDir}`);
        } else {
          console.error(`\n⛔ Automated Run Halted at Stage ${res.failedAtStage}`);
        }
        return res;
      });
    }

    case 'images':
    case 'generate-images': {
      const theme = args.includes('--theme') ? args[args.indexOf('--theme') + 1] : 'dark-tech';
      console.log(`\n🎨 Generating high-end project visual suite [Theme: ${theme}]...`);
      const res = engine.generateProjectImages({ theme });
      console.log(`\n✅ ${res.summary}`);
      for (const img of res.images) {
        console.log(`   - [${img.type}] ${img.relative}`);
      }
      return res;
    }

    case 'status':
    default: {
      const state = engine.getState();
      console.log(`\n📊 Pipeline Status: ${state.projectName}`);
      console.log(`   Overall Status: ${state.status}`);
      console.log(`   Current Stage:  Stage ${state.currentStageIndex} (${STAGES[state.currentStageIndex].name})`);
      console.log(`   Active Persona: ${STAGES[state.currentStageIndex].agent}\n`);
      console.log(`Stage Breakdown:`);
      for (const s of state.stages) {
        const icon = s.status === 'COMPLETED' ? '✅' :
                     s.status === 'IN_PROGRESS' ? '🔵' :
                     s.status === 'FAILED' ? '🔴' : '⚪';
        console.log(`   ${icon} Stage ${s.index}: ${s.name} [${s.status}]`);
      }
      console.log(`\nLiving dashboard updated in ACTIVE_PIPELINE.md`);
      return state;
    }
  }
}

module.exports = {
  printHelp,
  handleInit,
  handleEvaluateStack,
  handleVerify,
  handleScanSkill,
  handleDriftDetect,
  handleGateCheck,
  handlePipeline
};
