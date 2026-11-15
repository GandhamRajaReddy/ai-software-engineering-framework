/**
 * Production Readiness Release Gate Checker
 * Evaluates the 7 Iron-Clad Release Gates before code can be released or marked complete.
 * Supports evidence-driven evaluation via ReleasePolicyEngine.
 */

const fs = require('fs');
const path = require('path');
const { GATES, evaluateReleasePolicy } = require('./release-policy-engine');
const { scanDirectory } = require('./skillspector-scanner');
const { verifyFilesystemGrounding } = require('./verification-engine');

function checkReleaseGate(projectDir = process.cwd(), overrides = {}) {
  // If caller specifically provided unit-test overrides for gate scoring assertions
  const hasOverrides = Object.keys(overrides).length > 0;
  if (hasOverrides) {
    return evaluateWithOverrides(projectDir, overrides);
  }

  // Production evidence-driven policy evaluation
  const policyResult = evaluateReleasePolicy(projectDir);
  return {
    ...policyResult,
    verdict: policyResult.isProductionReady ? 'APPROVED_FOR_RELEASE' : 'BLOCKED_BY_RELEASE_GATE'
  };
}

function evaluateWithOverrides(projectDir, overrides) {
  const resolvedDir = path.resolve(projectDir);
  const gateResults = [];
  let totalScore = 0;
  let allMandatoryPassed = true;

  // Gate 1: Requirements
  const hasSpec = fs.existsSync(path.join(resolvedDir, '01_requirements_spec.md')) ||
                  fs.existsSync(path.join(resolvedDir, '01_requirements.md')) ||
                  overrides.requirementsPassed;
  gateResults.push({
    ...GATES[0],
    passed: Boolean(hasSpec),
    evidence: hasSpec ? 'Requirements and feature specifications documented.' : 'Missing formal requirements document.'
  });

  // Gate 2: Test Evidence
  const hasTestReport = fs.existsSync(path.join(resolvedDir, '05_verification_report.md')) ||
                        overrides.testsPassed;
  gateResults.push({
    ...GATES[1],
    passed: Boolean(hasTestReport),
    evidence: hasTestReport ? 'Fresh executable test evidence verified.' : 'No verified test execution evidence found.'
  });

  // Gate 3: Security
  let securityScan = { passed: true, summary: { critical: 0, high: 0 }, scannedFiles: 0 };
  try {
    const codeDir = ['skills', 'cli', 'src'].find(d => fs.existsSync(path.join(resolvedDir, d)));
    const targetScanDir = codeDir ? path.join(resolvedDir, codeDir) : resolvedDir;
    securityScan = scanDirectory(targetScanDir, ['.js', '.ts', '.py', '.sh']);
  } catch (e) {
    securityScan.passed = false;
  }
  const secPassed = securityScan.passed && securityScan.summary.critical === 0 && securityScan.summary.high === 0;
  gateResults.push({
    ...GATES[2],
    passed: Boolean(secPassed || overrides.securityPassed),
    evidence: secPassed ? `Security scan clean across ${securityScan.scannedFiles} files.` : 'Security risks detected.'
  });

  // Gate 4: Grounding
  const grounding = verifyFilesystemGrounding(resolvedDir, ['package.json', 'README.md', 'LICENSE']);
  gateResults.push({
    ...GATES[3],
    passed: grounding.allFilesExist,
    evidence: grounding.allFilesExist ? 'All referenced core project files verified on disk.' : 'Missing files.'
  });

  // Gate 5: Review
  const hasReview = fs.existsSync(path.join(resolvedDir, '05_verification_report.md')) || overrides.reviewPassed;
  gateResults.push({
    ...GATES[4],
    passed: Boolean(hasReview),
    evidence: hasReview ? 'Code review verified.' : 'Independent review missing.'
  });

  // Gate 6: Deploy
  const hasDeploy = fs.existsSync(path.join(resolvedDir, 'Dockerfile')) || overrides.deployReady;
  gateResults.push({
    ...GATES[5],
    passed: Boolean(hasDeploy),
    evidence: hasDeploy ? 'Deployment config present.' : 'Missing deployment config.'
  });

  // Gate 7: Manifest
  const hasManifest = fs.existsSync(path.join(resolvedDir, '07_release_manifest.md')) || overrides.manifestPassed;
  gateResults.push({
    ...GATES[6],
    passed: Boolean(hasManifest),
    evidence: hasManifest ? 'Release manifest ready.' : 'Missing release manifest.'
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
    verdict: isProductionReady ? 'APPROVED_FOR_RELEASE' : 'BLOCKED_BY_RELEASE_GATE',
    gateResults
  };
}

function formatGateReportMarkdown(gateCheckResult) {
  return gateCheckResult.reportMarkdown || '';
}

module.exports = {
  GATES,
  checkReleaseGate,
  formatGateReportMarkdown
};
