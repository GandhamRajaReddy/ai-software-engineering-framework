/**
 * Execution Sandbox Engine (Runtime Security Core)
 * Provides safe subprocess execution, shell-free invocation, executable allowlists,
 * argument sanitization, secret scrubbing, timeout enforcement, and output buffering.
 */

const { spawn } = require('child_process');
const path = require('path');

const ALLOWED_EXECUTABLES = new Set([
  'npm',
  'npm.cmd',
  'npx',
  'npx.cmd',
  'node',
  'node.exe',
  'git',
  'git.exe',
  'python',
  'python.exe',
  'python3',
  'pytest',
  'go',
  'go.exe',
  'cargo',
  'cargo.exe',
  'docker',
  'docker.exe',
  'docker-compose',
  'mvn',
  'mvn.cmd',
  'gradle',
  'gradle.bat'
]);

const SENSITIVE_ENV_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i
];

/**
 * Parses a command string into executable and argument tokens without invoking a shell
 */
function parseCommandString(cmdStr) {
  if (typeof cmdStr !== 'string' || !cmdStr.trim()) {
    throw new Error('Command must be a non-empty string');
  }

  // Detect unsafe shell chaining and injection metacharacters
  const dangerousPatterns = [
    { pattern: /[;&|]/, desc: 'Command chaining operators (; & |)' },
    { pattern: /`|\$\(/, desc: 'Command substitution (` or $())' },
    { pattern: /[><]/, desc: 'I/O redirection (> or <)' }
  ];

  for (const { pattern, desc } of dangerousPatterns) {
    if (pattern.test(cmdStr)) {
      throw new Error(`Execution Sandbox blocked command: Contains unsafe metacharacters (${desc}): "${cmdStr}"`);
    }
  }

  // Tokenize safely respecting quotes
  const tokens = [];
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match;
  while ((match = regex.exec(cmdStr)) !== null) {
    if (match[1] !== undefined) {
      tokens.push(match[1]); // double-quoted content
    } else if (match[2] !== undefined) {
      tokens.push(match[2]); // single-quoted content
    } else {
      tokens.push(match[0]); // unquoted token
    }
  }

  if (tokens.length === 0) {
    throw new Error('No executable found in command string');
  }

  const executable = tokens[0];
  const args = tokens.slice(1);
  return { executable, args };
}

/**
 * Scrubs sensitive credentials and API tokens from environment variables
 */
function sanitizeEnvironment(baseEnv = process.env, allowedEnvKeys = []) {
  const sanitized = {};
  const allowedSet = new Set(allowedEnvKeys);

  for (const [key, value] of Object.entries(baseEnv)) {
    if (allowedSet.has(key)) {
      sanitized[key] = value;
      continue;
    }

    // Check if key matches sensitive patterns
    const isSensitive = SENSITIVE_ENV_PATTERNS.some(regex => regex.test(key));
    if (!isSensitive) {
      sanitized[key] = value;
    }
  }

  // Ensure baseline path and temp variables exist
  sanitized.PATH = baseEnv.PATH || process.env.PATH || '';
  sanitized.NODE_ENV = baseEnv.NODE_ENV || 'test';
  return sanitized;
}

/**
 * Validates executable against allowlist
 */
function validateExecutable(executable) {
  const baseName = path.basename(executable).toLowerCase();
  if (!ALLOWED_EXECUTABLES.has(baseName)) {
    throw new Error(`Execution Sandbox blocked unauthorized executable: "${executable}". Allowed: ${Array.from(ALLOWED_EXECUTABLES).join(', ')}`);
  }
}

/**
 * Executes a command safely inside the sandbox without a shell
 */
function executeInSandbox(command, options = {}) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const projectDir = path.resolve(options.projectDir || process.cwd());
    const cwd = path.resolve(options.cwd || projectDir);

    // Verify cwd is within projectDir
    const relCwd = path.relative(projectDir, cwd);
    if (relCwd.startsWith('..') && !path.isAbsolute(relCwd)) {
      resolve({
        command,
        executable: 'none',
        args: [],
        cwd,
        exitCode: 1,
        passed: false,
        durationMs: 0,
        error: `Sandbox CWD Escape Violation: "${cwd}" is outside project root "${projectDir}"`,
        stdout: '',
        stderr: 'Sandbox CWD Escape Violation'
      });
      return;
    }

    let parsed;
    try {
      parsed = parseCommandString(command);
      validateExecutable(parsed.executable);
    } catch (parseErr) {
      resolve({
        command,
        executable: 'none',
        args: [],
        cwd,
        exitCode: 1,
        passed: false,
        durationMs: 0,
        error: parseErr.message,
        stdout: '',
        stderr: parseErr.message
      });
      return;
    }

    const timeoutMs = options.timeoutMs || 60000; // 60s default
    const maxOutputBytes = options.maxOutputBytes || 1024 * 1024; // 1MB buffer limit
    const cleanEnv = sanitizeEnvironment(options.env || process.env, options.allowedEnvKeys || []);

    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;
    let outputExceeded = false;

    // Launch subprocess shell-free
    const child = spawn(parsed.executable, parsed.args, {
      cwd,
      env: cleanEnv,
      shell: false, // SHELL-FREE INVOCATION
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    // Timeout guard
    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (e) { /* ignore */ }
      }, 2000).unref();
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      if (stdout.length < maxOutputBytes) {
        stdout += chunk.toString();
      } else if (!outputExceeded) {
        outputExceeded = true;
        stdout += '\n[WARNING: Execution Sandbox output truncated: Max buffer exceeded]\n';
      }
    });

    child.stderr.on('data', (chunk) => {
      if (stderr.length < maxOutputBytes) {
        stderr += chunk.toString();
      } else if (!outputExceeded) {
        outputExceeded = true;
        stderr += '\n[WARNING: Execution Sandbox stderr truncated: Max buffer exceeded]\n';
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        command,
        executable: parsed.executable,
        args: parsed.args,
        cwd,
        exitCode: 1,
        passed: false,
        durationMs: Date.now() - startTime,
        error: `Subprocess error: ${err.message}`,
        stdout: stdout.trim(),
        stderr: (stderr + ' ' + err.message).trim()
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const exitCode = killedByTimeout ? 124 : (code !== null ? code : 1);
      const passed = exitCode === 0 && !killedByTimeout;

      let errorMsg = null;
      if (killedByTimeout) {
        errorMsg = `Command timed out after ${timeoutMs}ms`;
      } else if (exitCode !== 0) {
        errorMsg = `Command exited with non-zero code: ${exitCode}`;
      }

      resolve({
        command,
        executable: parsed.executable,
        args: parsed.args,
        cwd,
        exitCode,
        passed,
        durationMs: Date.now() - startTime,
        error: errorMsg,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

module.exports = {
  ALLOWED_EXECUTABLES,
  parseCommandString,
  sanitizeEnvironment,
  validateExecutable,
  executeInSandbox
};
