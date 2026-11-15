/**
 * Artifact Integrity Manager (Security & Provenance Core)
 * Enforces project root containment, prevents path traversal, blocks writes to protected
 * files (.git, .env, node_modules), validates file extensions, computes SHA-256 hashes,
 * and maintains immutable write provenance.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROTECTED_PATHS = [
  /^\.git(\/|\\|$)/,
  /^node_modules(\/|\\|$)/,
  /^\.env(\.|$)/,
  /^bin[/\\]asef\.js$/,
  /^\.asef[/\\]evidence-registry\.json$/ // Evidence registry is append-only via evidence manager
];

const DISALLOWED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.vbs',
  '.ps1',
  '.dll',
  '.so',
  '.dylib'
]);

/**
 * Computes SHA-256 digest of a string or buffer
 */
function computeSha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Validates that a target relative path is safely contained within project root
 */
function validatePathContainment(relPath, projectDir) {
  if (typeof relPath !== 'string' || !relPath.trim()) {
    throw new Error('Relative path must be a non-empty string');
  }

  // Normalize path separators
  const normalizedRel = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const resolvedProject = path.resolve(projectDir);
  const resolvedTarget = path.resolve(resolvedProject, normalizedRel);

  // 1. Root containment check
  const projectWithSep = resolvedProject.endsWith(path.sep) ? resolvedProject : resolvedProject + path.sep;
  if (!resolvedTarget.startsWith(projectWithSep) && resolvedTarget !== resolvedProject) {
    throw new Error(`Path Traversal Blocked: Target path "${relPath}" escapes project root "${resolvedProject}"`);
  }

  // 2. Protected path check
  for (const pattern of PROTECTED_PATHS) {
    if (pattern.test(normalizedRel)) {
      throw new Error(`Protected Path Violation: Writing to protected system path "${normalizedRel}" is forbidden`);
    }
  }

  // 3. Extension allowlist/blocklist check
  const ext = path.extname(normalizedRel).toLowerCase();
  if (DISALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Dangerous File Extension Blocked: Extension "${ext}" is forbidden by security policy`);
  }

  // 4. Symlink escape check
  let checkDir = path.dirname(resolvedTarget);
  while (checkDir.length >= resolvedProject.length) {
    if (fs.existsSync(checkDir)) {
      try {
        const real = fs.realpathSync(checkDir);
        if (!real.startsWith(resolvedProject)) {
          throw new Error(`Symlink Traversal Blocked: Directory "${checkDir}" points to external target "${real}"`);
        }
      } catch (e) {
        // Directory may not exist yet, continue
      }
    }
    const parent = path.dirname(checkDir);
    if (parent === checkDir) break;
    checkDir = parent;
  }

  return {
    relativePath: normalizedRel,
    absolutePath: resolvedTarget
  };
}

/**
 * Safely writes a file to disk ensuring root containment and recording integrity metadata
 */
function writeArtifactSafely(relPath, content, projectDir = process.cwd(), metadata = {}) {
  const { relativePath, absolutePath } = validatePathContainment(relPath, projectDir);

  const fileBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  const sha256 = computeSha256(fileBuffer);
  const bytes = fileBuffer.length;

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, fileBuffer);

  return {
    relativePath,
    absolutePath,
    sha256,
    bytes,
    timestamp: new Date().toISOString(),
    stageIndex: metadata.stageIndex !== undefined ? metadata.stageIndex : null,
    author: metadata.author || 'asef-agent'
  };
}

/**
 * Parses model output text, validates path containment for each file block,
 * and writes all valid artifacts to disk while returning provenance records.
 */
function collectArtifactsSafely(content, defaultTargetArtifact, projectDir = process.cwd(), metadata = {}) {
  const collected = [];
  const fileBlockRegex = /```(?:filepath:)?([a-zA-Z0-9_\-\.\/]+)\n([\s\S]*?)```/g;
  let match;

  while ((match = fileBlockRegex.exec(content)) !== null) {
    let relPath = match[1].trim();
    // Strip language prefixes like "typescript:" or "python:"
    relPath = relPath.replace(/^(bash|sh|javascript|typescript|json|python|markdown|md|sql|html|css):/, '');
    const fileContent = match[2];

    if (relPath && !relPath.startsWith('http') && relPath.includes('.')) {
      try {
        const record = writeArtifactSafely(relPath, fileContent, projectDir, metadata);
        collected.push(record);
      } catch (err) {
        console.warn(`[Artifact Integrity Warning] Skipped unsafe artifact "${relPath}": ${err.message}`);
      }
    }
  }

  // If no file blocks were detected, write content to default target artifact if valid
  if (collected.length === 0 && defaultTargetArtifact) {
    try {
      const record = writeArtifactSafely(defaultTargetArtifact, content, projectDir, metadata);
      collected.push(record);
    } catch (err) {
      console.warn(`[Artifact Integrity Warning] Failed to write default artifact "${defaultTargetArtifact}": ${err.message}`);
    }
  }

  return collected;
}

module.exports = {
  computeSha256,
  validatePathContainment,
  writeArtifactSafely,
  collectArtifactsSafely
};
