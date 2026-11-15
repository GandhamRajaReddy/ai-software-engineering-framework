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

function printHelp() {
  console.log(`
=============================================================================
  ASEF - AI Software Engineering Framework CLI (v1.0.0)
  Evidence-Based, Anti-Hallucination, Zero-Slop SDLC for AI Agents
=============================================================================

Usage: asef <command> [options]

Commands:
  init [targetDir]               Scaffold the 6-stage lifecycle & contracts in a project
  evaluate-stack [options]       Evaluate user-proposed stack vs optimal architecture
  verify [testCommand]           Execute tests and collect audit-grade verification evidence
  scan-skill <path>              Scan skills, MCP configs, or prompts with NVIDIA SkillSpector
  drift-detect [specFile]        Detect architectural drift between design spec and source code
  gate-check [projectDir]        Audit project against the 7 production readiness release gates
  version                        Print version information

Options for evaluate-stack:
  --proposed <name>              e.g. mern, modern-ts-fullstack, fastapi-postgres, go-microservice
  --acid <true|false>            Require ACID transactions (default: true)
  --seo <true|false>             Require Server-Side Rendering / SEO (default: true)
  --rps <number>                 Target requests per second (default: 1000)
  --ai <true|false>              Require native AI/ML integration (default: false)

Examples:
  $ asef init my-new-project
  $ asef evaluate-stack --proposed mern --acid true --seo true
  $ asef verify "npm test"
  $ asef scan-skill skills/
  $ asef drift-detect 01_requirements.md
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

module.exports = {
  printHelp,
  handleInit,
  handleEvaluateStack,
  handleVerify,
  handleScanSkill,
  handleDriftDetect,
  handleGateCheck
};
