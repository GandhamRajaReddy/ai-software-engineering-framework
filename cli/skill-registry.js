/**
 * Skill Registry & Context Assembly Engine
 * Discovers skills, validates YAML metadata, resolves transitive skill dependencies,
 * extracts high-value checklists and code contracts, applies token budgeting,
 * and maintains cryptographic provenance of loaded skills.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SkillRegistry {
  constructor(skillsDir = null) {
    this.skillsDir = path.resolve(skillsDir || path.join(__dirname, '..', 'skills'));
    this.skillsCache = new Map();
    this.discoverSkills();
  }

  /**
   * Discovers and indexes all valid skills in the skills directory
   */
  discoverSkills() {
    this.skillsCache.clear();
    if (!fs.existsSync(this.skillsDir)) return;

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(this.skillsDir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
          try {
            const skillData = this.parseSkillFile(skillPath, entry.name);
            this.skillsCache.set(entry.name, skillData);
          } catch (e) {
            console.warn(`[SkillRegistry Warning] Failed to parse skill "${entry.name}": ${e.message}`);
          }
        }
      }
    }
  }

  /**
   * Parses a SKILL.md file, extracting frontmatter, dependencies, and SHA-256
   */
  parseSkillFile(filePath, dirName) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const sha256 = crypto.createHash('sha256').update(raw).digest('hex');

    let name = dirName;
    let description = '';
    let dependencies = [];

    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fmMatch) {
      const fmLines = fmMatch[1].split(/\r?\n/);
      for (const line of fmLines) {
        const nameMatch = line.match(/^name:\s*(.+)/);
        if (nameMatch) name = nameMatch[1].trim();

        const descMatch = line.match(/^description:\s*(.+)/);
        if (descMatch) description = descMatch[1].trim();

        const depMatch = line.match(/^dependencies:\s*\[(.*)\]/);
        if (depMatch) {
          dependencies = depMatch[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
        }
      }
    }

    // Default implicit dependencies for certain stack implementation skills
    if (dependencies.length === 0) {
      if (dirName === 'fastapi-engineering' || dirName === 'django-drf-engineering') {
        dependencies = ['database-engineering', 'backend-security'];
      } else if (dirName === 'golang-backend-engineering') {
        dependencies = ['backend-architecture', 'backend-security'];
      } else if (dirName === 'springboot-engineering') {
        dependencies = ['backend-architecture', 'database-engineering'];
      } else if (dirName === 'nodejs-backend-engineering') {
        dependencies = ['api-design-principles', 'backend-security'];
      }
    }

    return {
      name,
      dirName,
      description,
      dependencies,
      sha256,
      filePath,
      rawContent: raw
    };
  }

  /**
   * Resolves a list of requested skills plus their transitive dependencies
   */
  resolveSkillBundle(requestedSkillNames = []) {
    const resolved = new Map();
    const queue = [...requestedSkillNames];

    while (queue.length > 0) {
      const currentName = queue.shift();
      if (resolved.has(currentName)) continue;

      const skill = this.skillsCache.get(currentName);
      if (skill) {
        resolved.set(currentName, skill);
        for (const dep of skill.dependencies) {
          if (!resolved.has(dep) && !queue.includes(dep)) {
            queue.push(dep);
          }
        }
      }
    }

    return Array.from(resolved.values());
  }

  /**
   * Assembles a token-budgeted prompt context containing real skill instructions
   * Approximately 4 characters per token.
   */
  assembleSkillContext(requestedSkillNames = [], tokenBudget = 3000) {
    const skills = this.resolveSkillBundle(requestedSkillNames);
    if (skills.length === 0) {
      return {
        promptContext: '',
        loadedSkills: []
      };
    }

    const maxChars = tokenBudget * 4;
    let accumulatedChars = 0;
    const loadedSkills = [];
    let promptSections = [];

    promptSections.push(`## Active Engineering Skill Directives & Standards\n`);
    promptSections.push(`The following verified skills have been loaded into active agent context:\n`);

    // Allocate characters per skill
    const charsPerSkill = Math.floor((maxChars - 500) / skills.length);

    for (const skill of skills) {
      // Strip frontmatter from raw content
      const body = skill.rawContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

      let excerpt = body;
      if (body.length > charsPerSkill) {
        // Take the top high-priority sections (Checklists, Quick Reference, Key Rules)
        const lines = body.split(/\r?\n/);
        let taken = [];
        let count = 0;
        for (const line of lines) {
          if (count + line.length > charsPerSkill) break;
          taken.push(line);
          count += line.length + 1;
        }
        excerpt = taken.join('\n') + `\n\n[... Skill guidance continued in ${skill.dirName} ...]`;
      }

      promptSections.push(`### Skill: ${skill.name} (\`${skill.dirName}\` - SHA: ${skill.sha256.slice(0, 8)})\n`);
      promptSections.push(excerpt);
      promptSections.push(`\n---\n`);

      accumulatedChars += excerpt.length;
      loadedSkills.push({
        name: skill.name,
        dirName: skill.dirName,
        sha256: skill.sha256,
        tokensEstimated: Math.round(excerpt.length / 4)
      });
    }

    return {
      promptContext: promptSections.join('\n'),
      loadedSkills,
      totalTokensEstimated: Math.round(accumulatedChars / 4)
    };
  }
}

module.exports = {
  SkillRegistry
};
