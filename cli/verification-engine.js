/**
 * Verification & Anti-Hallucination Engine
 * Enforces the Iron Law: "Evidence before claims, always."
 * Verifies executable tests, inspects exit codes, and confirms filesystem grounding.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Runs an executable verification command and captures structured evidence
 */
function runVerificationCommand(command, cwd = process.cwd()) {
  const startTime = Date.now();
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  let passed = false;

  try {
    stdout = execSync(command, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000 // 2 minutes
    });
    passed = true;
    exitCode = 0;
  } catch (err) {
    exitCode = err.status !== undefined ? err.status : 1;
    stdout = err.stdout ? err.stdout.toString() : '';
    stderr = err.stderr ? err.stderr.toString() : err.message;
    passed = false;
  }

  const durationMs = Date.now() - startTime;

  return {
    command,
    cwd,
    exitCode,
    passed,
    durationMs,
    timestamp: new Date().toISOString(),
    stdout: stdout.trim(),
    stderr: stderr.trim()
  };
}

/**
 * Verifies that referenced files and modules exist on disk (Anti-Hallucination Grounding)
 */
function verifyFilesystemGrounding(baseDir, fileList = []) {
  const verified = [];
  const missing = [];

  for (const relPath of fileList) {
    const fullPath = path.resolve(baseDir, relPath);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      verified.push({
        path: relPath,
        sizeBytes: stat.size,
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory()
      });
    } else {
      missing.push({
        path: relPath,
        error: 'FILE_NOT_FOUND_ON_DISK'
      });
    }
  }

  return {
    baseDir,
    allFilesExist: missing.length === 0,
    totalChecked: fileList.length,
    verifiedCount: verified.length,
    missingCount: missing.length,
    verified,
    missing
  };
}

/**
 * Validates a patch contract to ensure no unverified completion claims are permitted
 */
function auditContractVerification(contractMarkdown) {
  const redFlags = [
    { pattern: /should work now/i, warning: 'Unverified speculation: "should work now"' },
    { pattern: /probably fixed/i, warning: 'Unverified confidence: "probably fixed"' },
    { pattern: /seems to be passing/i, warning: 'Subjective claim: "seems to be passing"' },
    { pattern: /tested:\s*true/i, requireEvidence: true }
  ];

  const violations = [];
  for (const flag of redFlags) {
    if (flag.pattern.test(contractMarkdown)) {
      if (flag.warning) {
        violations.push(flag.warning);
      }
    }
  }

  // Check if test output block exists
  const hasTestOutput = /```(bash|sh|text|json)?\s*[\s\S]*?(pass|ok|exit code 0|tests passed)[\s\S]*?```/i.test(contractMarkdown);

  return {
    compliant: violations.length === 0 && hasTestOutput,
    violations,
    hasTestOutputEvidence: hasTestOutput
  };
}

/**
 * Formats evidence into an audit-grade Markdown report
 */
function formatVerificationReport(evidence, grounding = null) {
  let md = `# Verification Evidence Report\n\n`;
  md += `> **Timestamp:** ${evidence.timestamp}\n`;
  md += `> **Execution Time:** ${(evidence.durationMs / 1000).toFixed(2)}s\n`;
  md += `> **Verification Status:** ${evidence.passed ? '✅ PASSED (Verified by Test Output)' : '❌ FAILED (Exit Code ' + evidence.exitCode + ')'}\n\n`;

  md += `## 1. Executed Verification Command\n\n`;
  md += `\`\`\`bash\n$ ${evidence.command}\n\`\`\`\n\n`;
  md += `- **Exit Code:** \`${evidence.exitCode}\`\n`;
  md += `- **Working Directory:** \`${evidence.cwd}\`\n\n`;

  md += `## 2. Command Output (Evidence Log)\n\n`;
  md += `\`\`\`\n`;
  md += (evidence.stdout || evidence.stderr || '(No output produced)').slice(0, 4000);
  md += `\n\`\`\`\n\n`;

  if (grounding) {
    md += `## 3. Filesystem Grounding Verification\n\n`;
    md += `| File Path | Status | Verification Detail |\n`;
    md += `|:----------|:------:|:--------------------|\n`;
    for (const v of grounding.verified) {
      md += `| \`${v.path}\` | ✅ Verified | Exists on disk (${v.sizeBytes} bytes) |\n`;
    }
    for (const m of grounding.missing) {
      md += `| \`${m.path}\` | ❌ Hallucination | Does not exist on filesystem |\n`;
    }
    md += `\n`;
  }

  md += `## 4. Release Gate Conclusion\n\n`;
  if (evidence.passed && (!grounding || grounding.allFilesExist)) {
    md += `✅ **The verification claim is substantiated by executable evidence.** This stage may advance to deployment.\n`;
  } else {
    md += `⛔ **Release Gate Blocked:** Feature cannot be marked complete without green test results and verified filesystem grounding.\n`;
  }

  return md;
}

module.exports = {
  runVerificationCommand,
  verifyFilesystemGrounding,
  auditContractVerification,
  formatVerificationReport
};
