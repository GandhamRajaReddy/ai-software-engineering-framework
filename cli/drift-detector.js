/**
 * Architectural Drift Detector (Google Elephant-Goldfish Model Inspired)
 * Audits design documents, requirements, and contracts against real code to detect
 * missing features, incomplete models, logic shortcuts, and architectural divergence.
 */

const fs = require('fs');
const path = require('path');

function detectDrift(specMarkdown, projectDir) {
  const issues = [];
  const checkedEntities = [];

  // 1. Extract declared endpoints (e.g. POST /api/v1/auth/login)
  const endpointRegex = /(GET|POST|PUT|DELETE|PATCH)\s+(\/[a-zA-Z0-9_\-\/:]+)/gi;
  let match;
  const declaredEndpoints = [];
  while ((match = endpointRegex.exec(specMarkdown)) !== null) {
    declaredEndpoints.push({ method: match[1].toUpperCase(), path: match[2] });
  }

  // 2. Extract declared database models / entities (e.g. model User, entity Url, table urls)
  const modelRegex = /(?:model|table|entity|interface)\s+([A-Z][a-zA-Z0-9_]+)/g;
  const declaredModels = [];
  while ((match = modelRegex.exec(specMarkdown)) !== null) {
    if (!declaredModels.includes(match[1])) {
      declaredModels.push(match[1]);
    }
  }

  // 3. Scan codebase files for occurrences
  const codeFiles = [];
  function gatherCodeFiles(dir) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'coverage', '.venv'].includes(item.name)) {
          gatherCodeFiles(full);
        }
      } else if (item.isFile()) {
        const ext = path.extname(item.name);
        if (['.js', '.ts', '.py', '.go', '.rs', '.java', '.sql', '.prisma'].includes(ext)) {
          codeFiles.push({
            path: full,
            content: fs.readFileSync(full, 'utf8')
          });
        }
      }
    }
  }

  gatherCodeFiles(projectDir);

  // Check models
  for (const model of declaredModels) {
    const found = codeFiles.some(f => f.content.includes(model));
    checkedEntities.push({ type: 'MODEL', name: model, found });
    if (!found && codeFiles.length > 0) {
      issues.push({
        severity: 'HIGH',
        category: 'MISSING_MODEL',
        message: `Design specifies model/entity '${model}', but it was not found in any schema or source file.`
      });
    }
  }

  // Check endpoints
  for (const ep of declaredEndpoints) {
    const found = codeFiles.some(f => f.content.includes(ep.path) || f.content.includes(ep.path.split('/')[1]));
    checkedEntities.push({ type: 'ENDPOINT', name: `${ep.method} ${ep.path}`, found });
    if (!found && codeFiles.length > 0) {
      issues.push({
        severity: 'MEDIUM',
        category: 'MISSING_ENDPOINT',
        message: `Design specifies route '${ep.method} ${ep.path}', but matching route handler was not found in code.`
      });
    }
  }

  // Check for logic shortcuts / TODO placeholders
  for (const file of codeFiles) {
    const todoMatches = file.content.match(/\/\/\s*(TODO|FIXME|PLACEHOLDER):?/gi);
    if (todoMatches) {
      issues.push({
        severity: 'LOW',
        category: 'LOGIC_SHORTCUT',
        message: `File ${path.relative(projectDir, file.path)} contains ${todoMatches.length} unaddressed TODO/FIXME comments.`
      });
    }
  }

  return {
    timestamp: new Date().toISOString(),
    checkedEntitiesCount: checkedEntities.length,
    scannedFilesCount: codeFiles.length,
    driftDetected: issues.length > 0,
    issues,
    checkedEntities
  };
}

function formatDriftReportMarkdown(driftResult) {
  let md = `# Architectural Drift Detection Report\n\n`;
  md += `> **Audit Protocol:** Google Elephant-Goldfish Model (EGM) Drift Detection\n`;
  md += `> **Status:** ${driftResult.driftDetected ? '⚠️ DRIFT DETECTED' : '✅ CLEAN (Zero Drift Detected)'}\n`;
  md += `> **Scanned Source Files:** ${driftResult.scannedFilesCount}\n\n`;

  if (!driftResult.driftDetected) {
    md += `✅ **Implementation matches architecture specifications.** No architectural drift, missing models, or unfinished shortcuts were detected.\n`;
  } else {
    md += `## Discrepancies and Architectural Drift Found\n\n`;
    md += `| Severity | Category | Discrepancy Detail |\n`;
    md += `|:---------|:---------|:-------------------|\n`;
    for (const issue of driftResult.issues) {
      md += `| **${issue.severity}** | \`${issue.category}\` | ${issue.message} |\n`;
    }
    md += `\n### Remediation Action Required:\n`;
    md += `Before advancing to release gate, either update the implementation to satisfy all architectural requirements or update the architecture decision record to reflect deliberate scope changes.\n`;
  }

  return md;
}

module.exports = {
  detectDrift,
  formatDriftReportMarkdown
};
