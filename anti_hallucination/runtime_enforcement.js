/**
 * Runtime Enforcement Engine for Anti-Hallucination Iron Laws
 *
 * Programmatically enforces physical filesystem grounding, verification invariants,
 * scope ceilings, and output completeness rather than relying solely on prompt instructions.
 */

const fs = require('fs');
const path = require('path');

const FORBIDDEN_SPECULATIVE_TERMS = [
  /\bshould work\b/i,
  /\bprobably passes\b/i,
  /\bseems fixed\b/i,
  /\blooks good\b/i,
  /\btheoretically works\b/i,
  /\bassumed to pass\b/i,
  /\bexpected to work without testing\b/i
];

const FORBIDDEN_PLACEHOLDER_PATTERNS = [
  /\/\/\s*\.\.\.\s*(?:existing|rest of|remaining)\s*code/i,
  /\/\*\s*\.\.\.\s*(?:existing|rest of|remaining)\s*code\s*\*\//i,
  /#\s*\.\.\.\s*(?:existing|rest of|remaining)\s*code/i,
  /\/\/\s*TODO:\s*(?:implement|fill in|add logic)/i,
  /#\s*TODO:\s*(?:implement|fill in|add logic)/i,
  /\/\*\s*TODO:\s*(?:implement|fill in|add logic)\s*\*\//i,
  /pass\s*#\s*\.\.\.\s*implement/i,
  /throw new Error\(\s*["']Not implemented["']\s*\)/i
];

class AntiHallucinationEnforcer {
  /**
   * Law 1: Enforces physical filesystem grounding AND project root containment.
   */
  static verifyFilesystemGrounding(projectDir, referencedPaths = []) {
    const missing = [];
    const escaped = [];
    const resolvedRoot = path.resolve(projectDir);

    for (const relPath of referencedPaths) {
      const fullPath = path.resolve(resolvedRoot, relPath);

      // Root containment check
      const relToRoot = path.relative(resolvedRoot, fullPath);
      if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
        escaped.push(relPath);
        continue;
      }

      if (!fs.existsSync(fullPath)) {
        missing.push(relPath);
      } else {
        // Symlink escape check
        try {
          const real = fs.realpathSync(fullPath);
          const realRel = path.relative(resolvedRoot, real);
          if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
            escaped.push(relPath);
          }
        } catch {
          missing.push(relPath);
        }
      }
    }

    if (escaped.length > 0) {
      return {
        valid: false,
        escapedPaths: escaped,
        missingPaths: missing,
        reason: `Path containment violation: ${escaped.join(', ')} escapes project root.`,
        law: 'Law 1: Physical Filesystem Grounding & Containment'
      };
    }

    return {
      valid: missing.length === 0,
      missingPaths: missing,
      reason: missing.length > 0 ? `Missing grounded files on disk: ${missing.join(', ')}` : null,
      law: 'Law 1: Physical Filesystem Grounding & Containment'
    };
  }

  /**
   * Law 2: Audits that completion claims are backed by physical test execution (exit code 0).
   * Authenticates execution records against the Evidence Registry, rejects mock mode,
   * and blocks speculative language.
   */
  static auditVerificationInvariant(claimText, executionResult, evidenceRecord = null) {
    // 1. Check for speculative phrases
    for (const pattern of FORBIDDEN_SPECULATIVE_TERMS) {
      if (pattern.test(claimText)) {
        return {
          valid: false,
          reason: `Speculative language detected matching ${pattern}. Must execute verification command directly.`,
          law: 'Law 2: Verification Command Invariant'
        };
      }
    }

    // 2. Validate evidence authenticity if record is provided
    if (evidenceRecord) {
      if (evidenceRecord.isMock === true) {
        return {
          valid: false,
          reason: 'Evidence provenance violation: Execution was generated under simulated/mock mode and cannot satisfy production verification.',
          law: 'Law 2: Verification Command Invariant'
        };
      }
      if (evidenceRecord.stale === true) {
        return {
          valid: false,
          reason: 'Stale evidence violation: Source code files were modified after test execution.',
          law: 'Law 2: Verification Command Invariant'
        };
      }
    }

    // 3. Must have execution result
    if (!executionResult) {
      return {
        valid: false,
        reason: 'No execution result provided for verification claim.',
        law: 'Law 2: Verification Command Invariant'
      };
    }

    if (executionResult.exitCode !== 0) {
      return {
        valid: false,
        reason: `Verification command failed with exit code ${executionResult.exitCode}.`,
        law: 'Law 2: Verification Command Invariant'
      };
    }

    return {
      valid: true,
      law: 'Law 2: Verification Command Invariant'
    };
  }

  /**
   * Law 4: Enforces scope ceiling and surgical file modification boundaries.
   */
  static verifyScopeCeiling(modifiedFiles, allowedFiles, lineDiffCount = 0, maxLines = 100) {
    const unapprovedFiles = [];
    const allowedSet = new Set(allowedFiles.map(f => path.normalize(f)));

    for (const mod of modifiedFiles) {
      if (!allowedSet.has(path.normalize(mod))) {
        unapprovedFiles.push(mod);
      }
    }

    if (unapprovedFiles.length > 0) {
      return {
        valid: false,
        reason: `Modified unapproved files outside task scope: ${unapprovedFiles.join(', ')}`,
        law: 'Law 4: Scope Ceiling & Surgical Modification'
      };
    }

    if (maxLines > 0 && lineDiffCount > maxLines) {
      return {
        valid: false,
        reason: `Diff size (${lineDiffCount} lines) exceeded authorized scope ceiling (${maxLines} lines).`,
        law: 'Law 4: Scope Ceiling & Surgical Modification'
      };
    }

    return {
      valid: true,
      law: 'Law 4: Scope Ceiling & Surgical Modification'
    };
  }

  /**
   * Law 5: Enforces full output completeness, detecting truncation placeholders.
   */
  static verifyOutputCompleteness(generatedCode) {
    for (const pattern of FORBIDDEN_PLACEHOLDER_PATTERNS) {
      if (pattern.test(generatedCode)) {
        return {
          valid: false,
          reason: `Prohibited code placeholder detected matching ${pattern}. Code must be complete.`,
          law: 'Law 5: Full Output Completeness'
        };
      }
    }

    return {
      valid: true,
      law: 'Law 5: Full Output Completeness'
    };
  }
}

module.exports = {
  AntiHallucinationEnforcer,
  FORBIDDEN_SPECULATIVE_TERMS,
  FORBIDDEN_PLACEHOLDER_PATTERNS
};
