/**
 * Immutable Evidence Registry (Anti-Hallucination Core)
 * Binds all test execution, security scan, and code review evidence to a cryptographic
 * source-code tree hash and Git commit. Automatically invalidates test claims when source
 * files mutate, and prevents mock output from satisfying production gates.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const EVIDENCE_FILE = path.join('.asef', 'evidence-registry.json');

const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.java', '.json',
  '.sql', '.html', '.css', '.rs', '.cs', '.cpp', '.c', '.h'
]);

const IGNORED_DIRS = new Set([
  '.git',
  '.asef',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.cache'
]);

/**
 * Computes deterministic SHA-256 tree hash of all project source code files
 */
function computeSourceTreeHash(projectDir = process.cwd()) {
  const fileHashes = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // Sort entries deterministically
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (CODE_EXTENSIONS.has(ext)) {
          const content = fs.readFileSync(fullPath);
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          const relPath = path.relative(projectDir, fullPath).replace(/\\/g, '/');
          fileHashes.push(`${relPath}:${hash}`);
        }
      }
    }
  }

  walk(path.resolve(projectDir));

  // Compute aggregate tree hash
  const combined = fileHashes.join('\n');
  return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * Retrieves the current Git HEAD commit hash if repository is present
 */
function getGitCommitHash(projectDir = process.cwd()) {
  try {
    const gitDir = path.join(projectDir, '.git');
    if (!fs.existsSync(gitDir)) return null;

    const commit = execSync('git rev-parse HEAD', {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    }).trim();
    return commit || null;
  } catch (e) {
    return null;
  }
}

/**
 * Captures the current execution environment fingerprint
 */
function getEnvironmentFingerprint() {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid
  };
}

/**
 * Loads the evidence registry for the project
 */
function loadRegistry(projectDir = process.cwd()) {
  const filePath = path.join(projectDir, EVIDENCE_FILE);
  if (!fs.existsSync(filePath)) {
    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      records: []
    };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      records: []
    };
  }
}

/**
 * Saves evidence registry safely to disk
 */
function saveRegistry(registry, projectDir = process.cwd()) {
  const filePath = path.join(projectDir, EVIDENCE_FILE);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  registry.lastUpdated = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(registry, null, 2), 'utf8');
}

/**
 * Records a verified evidence record into the registry
 */
function recordEvidence(projectDir, evidenceInput) {
  const registry = loadRegistry(projectDir);
  const currentSourceHash = computeSourceTreeHash(projectDir);
  const currentCommit = getGitCommitHash(projectDir);

  const evidenceRecord = {
    id: `EVI-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: evidenceInput.type || 'TEST_EXECUTION', // TEST_EXECUTION | SECURITY_SCAN | CODE_REVIEW | DEPLOYMENT_CHECK
    timestamp: new Date().toISOString(),
    sourceCommit: currentCommit,
    sourceHash: currentSourceHash,
    isMock: Boolean(evidenceInput.isMock),
    command: evidenceInput.command || 'none',
    exitCode: evidenceInput.exitCode !== undefined ? evidenceInput.exitCode : 0,
    passed: Boolean(evidenceInput.passed),
    durationMs: evidenceInput.durationMs || 0,
    environmentFingerprint: getEnvironmentFingerprint(),
    details: evidenceInput.details || {},
    reviewer: evidenceInput.reviewer || null,
    summary: evidenceInput.summary || ''
  };

  registry.records.push(evidenceRecord);
  saveRegistry(registry, projectDir);
  return evidenceRecord;
}

/**
 * Retrieves valid and fresh evidence for a specified type
 * Automatically invalidates evidence if source code tree hash has changed.
 */
function getValidEvidence(projectDir, evidenceType) {
  const registry = loadRegistry(projectDir);
  const currentSourceHash = computeSourceTreeHash(projectDir);

  const matching = registry.records
    .filter(r => r.type === evidenceType)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (matching.length === 0) {
    return {
      hasEvidence: false,
      valid: false,
      reason: `No evidence found in registry for type: "${evidenceType}"`
    };
  }

  const latest = matching[0];

  // 1. Source Hash Freshness Invariant (Zero Stale Claims)
  if (latest.sourceHash !== currentSourceHash) {
    return {
      hasEvidence: true,
      valid: false,
      stale: true,
      record: latest,
      reason: `Evidence Stale Violation: Source code was modified since test execution (Recorded: ${latest.sourceHash.slice(0, 8)}, Current: ${currentSourceHash.slice(0, 8)})`
    };
  }

  // 2. Mock Mode Quarantine Invariant
  if (latest.isMock) {
    return {
      hasEvidence: true,
      valid: false,
      isMock: true,
      record: latest,
      reason: 'Mock Mode Violation: Mock-generated test output cannot satisfy production release verification'
    };
  }

  // 3. Exit Code Invariant
  if (!latest.passed || latest.exitCode !== 0) {
    return {
      hasEvidence: true,
      valid: false,
      failed: true,
      record: latest,
      reason: `Execution Failed: Command exited with non-zero code ${latest.exitCode}`
    };
  }

  return {
    hasEvidence: true,
    valid: true,
    record: latest
  };
}

module.exports = {
  EVIDENCE_FILE,
  computeSourceTreeHash,
  getGitCommitHash,
  getEnvironmentFingerprint,
  loadRegistry,
  saveRegistry,
  recordEvidence,
  getValidEvidence
};
