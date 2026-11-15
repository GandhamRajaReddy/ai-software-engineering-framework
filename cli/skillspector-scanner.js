/**
 * NVIDIA SkillSpector-Compliant Security Scanner
 * Static analysis engine for AI agent skills, system prompts, tools, and MCP configs.
 * Detects prompt injection, data exfiltration, command execution, privilege escalation, and tool poisoning.
 */

const fs = require('fs');
const path = require('path');

const SECURITY_RULES = [
  {
    id: 'SEC-001',
    category: 'PROMPT_INJECTION',
    severity: 'CRITICAL',
    name: 'Instruction Override / Jailbreak Pattern',
    description: 'Attempts to erase prior system constraints or force model into unrestricted mode.',
    pattern: /(ignore (all )?previous instructions|disregard prior guidelines|you are now unrestricted|jailbreak mode|DAN mode|developer mode enabled)/i
  },
  {
    id: 'SEC-002',
    category: 'DATA_EXFILTRATION',
    severity: 'CRITICAL',
    name: 'Suspicious Network Exfiltration',
    description: 'Piping environment secrets, private keys, or credentials to external network endpoints.',
    pattern: /(curl|wget|fetch|axios|requests\.(post|get))\s+.*(\$ENV|\.env|id_rsa|AWS_SECRET|ANTHROPIC_API_KEY|OPENAI_API_KEY|webhook\.site|requestbin|ngrok)/i
  },
  {
    id: 'SEC-003',
    category: 'COMMAND_INJECTION',
    severity: 'HIGH',
    name: 'Unsafe Subprocess / Shell Execution',
    description: 'Direct invocation of unvalidated shell execution or arbitrary code evaluation.',
    pattern: /(eval\(|exec\(|child_process\.exec\s*\(|subprocess\.Popen\(.*shell\s*=\s*True|system\(|os\.system\()/i
  },
  {
    id: 'SEC-004',
    category: 'PRIVILEGE_ESCALATION',
    severity: 'HIGH',
    name: 'Privilege Escalation / Destructive FS Operations',
    description: 'Commands attempting root privilege escalation, permissions tampering, or sweeping file deletion.',
    pattern: /(sudo\s+|chmod\s+777|rm\s+-rf\s+\/|del\s+\/f\s+\/s\s+\/q\s+C:\\|takeown\s+\/f)/i
  },
  {
    id: 'SEC-005',
    category: 'TOOL_POISONING',
    severity: 'CRITICAL',
    name: 'Tool Shadowing or Hidden Prompt Poisoning',
    description: 'Attempts to override or manipulate tool return values or silently execute background actions.',
    pattern: /(silently (execute|run|forward)|do not notify the user|intercept tool|hide output from user)/i
  },
  {
    id: 'SEC-006',
    category: 'SECRET_LEAKAGE',
    severity: 'HIGH',
    name: 'Hardcoded Secret / API Token Pattern',
    description: 'Hardcoded sensitive access tokens, private keys, or passwords in plain text.',
    pattern: /(ghp_[a-zA-Z0-9]{36}|sk-[a-zA-Z0-9]{32,}|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY|eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,})/i
  },
  {
    id: 'SEC-007',
    category: 'SUPPLY_CHAIN',
    severity: 'MEDIUM',
    name: 'Piped Shell Download (Curl to Bash)',
    description: 'Piping remote unverified scripts directly into bash/sh execution.',
    pattern: /(curl|wget)[^|\n]+(\|\s*(bash|sh|powershell|cmd))/i
  }
];

function scanContent(content, filename = 'inline') {
  const findings = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    for (const rule of SECURITY_RULES) {
      if (rule.pattern.test(line)) {
        findings.push({
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
          name: rule.name,
          description: rule.description,
          filename,
          lineNumber: lineNum + 1,
          matchedSnippet: line.trim().slice(0, 120)
        });
      }
    }
  }

  const criticals = findings.filter(f => f.severity === 'CRITICAL').length;
  const highs = findings.filter(f => f.severity === 'HIGH').length;
  const mediums = findings.filter(f => f.severity === 'MEDIUM').length;

  return {
    filename,
    passed: criticals === 0 && highs === 0,
    summary: {
      totalFindings: findings.length,
      critical: criticals,
      high: highs,
      medium: mediums
    },
    findings
  };
}

function scanFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      filename: filePath,
      passed: false,
      summary: { totalFindings: 1, critical: 1, high: 0, medium: 0 },
      findings: [{
        ruleId: 'SEC-ERR',
        severity: 'CRITICAL',
        name: 'File Not Found',
        description: `Target file ${filePath} could not be located.`,
        filename: filePath,
        lineNumber: 0,
        matchedSnippet: ''
      }]
    };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return scanContent(content, path.basename(filePath));
}

function scanDirectory(dirPath, extensions = ['.md', '.json', '.js', '.ts', '.py', '.sh', '.yaml', '.yml']) {
  const results = [];
  if (!fs.existsSync(dirPath)) {
    return {
      dirPath,
      passed: false,
      results: [],
      error: `Directory not found: ${dirPath}`
    };
  }

  function walk(current) {
    const items = fs.readdirSync(current, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(current, item.name);
      if (item.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'coverage', '.venv', 'tests'].includes(item.name)) {
          walk(fullPath);
        }
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (extensions.includes(ext)) {
          results.push(scanFile(fullPath));
        }
      }
    }
  }

  walk(dirPath);

  const totalCritical = results.reduce((sum, r) => sum + r.summary.critical, 0);
  const totalHigh = results.reduce((sum, r) => sum + r.summary.high, 0);
  const totalMedium = results.reduce((sum, r) => sum + r.summary.medium, 0);

  return {
    dirPath,
    scannedFiles: results.length,
    passed: totalCritical === 0 && totalHigh === 0,
    summary: {
      critical: totalCritical,
      high: totalHigh,
      medium: totalMedium,
      totalFindings: totalCritical + totalHigh + totalMedium
    },
    fileReports: results
  };
}

function formatReportMarkdown(scanResult) {
  let md = `# SkillSpector Security Audit Report\n\n`;
  md += `> **Audit Engine:** NVIDIA SkillSpector Static Analysis Protocol v1.0\n`;
  md += `> **Status:** ${scanResult.passed ? '✅ PASSED (Safe to load)' : '❌ BLOCKED (Security Vulnerabilities Detected)'}\n`;
  md += `> **Files Scanned:** ${scanResult.scannedFiles || 1}\n\n`;

  md += `## Vulnerability Summary\n\n`;
  md += `| Severity | Count | Gate Policy |\n`;
  md += `|:---------|:-----:|:------------|\n`;
  md += `| 🔴 **CRITICAL** | ${scanResult.summary.critical} | Hard Block (0 Allowed) |\n`;
  md += `| 🟠 **HIGH** | ${scanResult.summary.high} | Hard Block (0 Allowed) |\n`;
  md += `| 🟡 **MEDIUM** | ${scanResult.summary.medium} | Warning (Review Required) |\n\n`;

  if (scanResult.summary.totalFindings === 0) {
    md += `✅ **No malicious patterns, prompt injections, or unverified exfiltration vectors found.** All scanned skills and tool contracts comply with NVIDIA SkillSpector safety guidelines.\n`;
  } else {
    md += `## Detailed Findings\n\n`;
    const filesWithIssues = (scanResult.fileReports || [scanResult]).filter(r => r.findings.length > 0);
    for (const report of filesWithIssues) {
      md += `### File: \`${report.filename}\`\n\n`;
      for (const finding of report.findings) {
        md += `- **[${finding.severity}] ${finding.name}** (\`${finding.ruleId}\` - line ${finding.lineNumber})\n`;
        md += `  *Description:* ${finding.description}\n`;
        md += `  *Evidence:* \`${finding.matchedSnippet}\`\n\n`;
      }
    }
  }

  return md;
}

module.exports = {
  SECURITY_RULES,
  scanContent,
  scanFile,
  scanDirectory,
  formatReportMarkdown
};
