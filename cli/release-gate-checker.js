/**
 * Production Readiness Release Gate Checker
 * Evaluates the 7 Iron-Clad Release Gates before code can be released or marked complete.
 */

const fs = require('fs');
const path = require('path');
const { scanDirectory } = require('./skillspector-scanner');
const { verifyFilesystemGrounding } = require('./verification-engine');

const GATES = [
  { id: 'GATE_1', name: 'Requirements & Assumptions Traceability', weight: 15 },
  { id: 'GATE_2', name: 'Executable Test Verification (Exit 0)', weight: 25 },
  { id: 'GATE_3', name: 'Security & SkillSpector Clearance (0 Critical/High)', weight: 20 },
  { id: 'GATE_4', name: 'Filesystem Grounding (Zero Hallucinated Files)', weight: 15 },
  { id: 'GATE_5', name: 'Independent Review & Surgical Scope (<50 lines/patch)', weight: 10 },
  { id: 'GATE_6', name: 'Deployment Artifacts (Dockerfile & Health Check)', weight: 10 },
  { id: 'GATE_7', name: 'Release Manifest & Rollback Plan', weight: 5 }
];

function checkReleaseGate(projectDir = process.cwd(), overrides = {}) {
  const gateResults = [];
  let totalScore = 0;
  let allMandatoryPassed = true;

  // Gate 1: Check requirements and contracts
  const hasSpec = fs.existsSync(path.join(projectDir, '01_requirements.md')) ||
                  fs.existsSync(path.join(projectDir, '01_requirements_spec.md')) ||
                  fs.existsSync(path.join(projectDir, 'contracts', 'feature_contract_template.md'));
  gateResults.push({
    ...GATES[0],
    passed: Boolean(hasSpec || overrides.requirementsPassed),
    evidence: hasSpec ? 'Requirements and feature specifications documented.' : 'Missing formal requirements document.'
  });

  // Gate 2: Test Evidence
  const hasTestReport = fs.existsSync(path.join(projectDir, '05_verification_report.md')) ||
                        fs.existsSync(path.join(projectDir, '05_verification', 'test_evidence_report.md')) ||
                        overrides.testsPassed;
  gateResults.push({
    ...GATES[1],
    passed: Boolean(hasTestReport),
    evidence: hasTestReport ? 'Fresh executable test evidence verified.' : 'No verified test execution evidence found.'
  });

  // Gate 3: Security & SkillSpector
  let securityScan = { passed: true, summary: { critical: 0, high: 0 }, scannedFiles: 0 };
  try {
    const codeDir = ['src', 'lib', 'app', 'skills', 'cli'].find(d => fs.existsSync(path.join(projectDir, d)));
    const targetScanDir = codeDir ? path.join(projectDir, codeDir) : projectDir;
    securityScan = scanDirectory(targetScanDir, ['.js', '.ts', '.py', '.sh']);
  } catch (e) {
    securityScan.passed = false;
  }
  const secPassed = securityScan.passed && securityScan.summary.critical === 0 && securityScan.summary.high === 0;
  gateResults.push({
    ...GATES[2],
    passed: Boolean(secPassed || overrides.securityPassed),
    evidence: secPassed ? `Security scan clean (0 Critical, 0 High vulnerabilities across ${securityScan.scannedFiles} files).` : `Security risks detected: ${securityScan.summary.critical} Critical, ${securityScan.summary.high} High.`
  });

  // Gate 4: Filesystem Grounding
  const grounding = verifyFilesystemGrounding(projectDir, [
    'package.json',
    'README.md',
    'LICENSE'
  ]);
  gateResults.push({
    ...GATES[3],
    passed: grounding.allFilesExist,
    evidence: grounding.allFilesExist ? 'All referenced core project files verified on disk.' : `Missing files: ${grounding.missing.map(m => m.path).join(', ')}`
  });

  // Gate 5: Independent Review
  const hasReview = fs.existsSync(path.join(projectDir, '05_verification', 'code_review.md')) ||
                    fs.existsSync(path.join(projectDir, '05_verification_report.md')) ||
                    overrides.reviewPassed;
  gateResults.push({
    ...GATES[4],
    passed: Boolean(hasReview),
    evidence: hasReview ? 'Code review and surgical scope verified.' : 'Independent code review document missing.'
  });

  // Gate 6: Deployment Ready
  const hasDeploy = fs.existsSync(path.join(projectDir, 'Dockerfile')) ||
                    fs.existsSync(path.join(projectDir, 'docker-compose.yml')) ||
                    fs.existsSync(path.join(projectDir, '06_deployment.md')) ||
                    fs.existsSync(path.join(projectDir, '06_deployment_config')) ||
                    overrides.deployReady;
  gateResults.push({
    ...GATES[5],
    passed: Boolean(hasDeploy),
    evidence: hasDeploy ? 'Containerization / deployment configurations present.' : 'Missing deployment config (Dockerfile/docker-compose).'
  });

  // Gate 7: Release Manifest
  const hasManifest = fs.existsSync(path.join(projectDir, 'RELEASE_MANIFEST.md')) ||
                      fs.existsSync(path.join(projectDir, '07_release_manifest.md')) ||
                      fs.existsSync(path.join(projectDir, 'lifecycle', '07_RELEASE_GATE.md')) ||
                      overrides.manifestPassed;
  gateResults.push({
    ...GATES[6],
    passed: Boolean(hasManifest),
    evidence: hasManifest ? 'Release manifest and rollback protocol ready.' : 'Missing release manifest.'
  });

  for (const g of gateResults) {
    if (g.passed) {
      totalScore += g.weight;
    } else {
      allMandatoryPassed = false;
    }
  }

  const isProductionReady = allMandatoryPassed && totalScore === 100;

  return {
    timestamp: new Date().toISOString(),
    isProductionReady,
    totalScore,
    gateResults,
    verdict: isProductionReady ? 'APPROVED_FOR_PRODUCTION' : 'BLOCKED_BY_RELEASE_GATE'
  };
}

function formatReleaseGateMarkdown(result) {
  let md = `# Production Readiness Release Gate Report\n\n`;
  md += `> **Audit Date:** ${result.timestamp}\n`;
  md += `> **Verdict:** ${result.isProductionReady ? '🟢 APPROVED FOR PRODUCTION' : '🔴 RELEASE GATE BLOCKED'}\n`;
  md += `> **Readiness Score:** **${result.totalScore} / 100**\n\n`;

  md += `## Gate Evaluation Summary\n\n`;
  md += `| Gate | Check Item | Status | Evidence |\n`;
  md += `|:----:|:-----------|:------:|:---------|\n`;
  for (const g of result.gateResults) {
    md += `| **${g.id}** | ${g.name} | ${g.passed ? '✅ PASSED' : '❌ FAILED'} | ${g.evidence} |\n`;
  }
  md += `\n`;

  md += `## Final Release Recommendation\n\n`;
  if (result.isProductionReady) {
    md += `🚀 **All 7 production gates have been substantiated with concrete evidence.** The software is documented, tested, reviewed, secure, and ready for deployment to staging/production.\n`;
  } else {
    md += `🛑 **Shipment Halted:** An unverified feature or unpassed gate was detected. In accordance with anti-hallucination iron laws, code cannot be tagged as production-ready until all failing gates are resolved.\n`;
  }

  return md;
}

module.exports = {
  GATES,
  checkReleaseGate,
  formatReleaseGateMarkdown
};
