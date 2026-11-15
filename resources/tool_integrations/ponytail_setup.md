# 4. Ponytail Setup (Lazy Senior Developer Ethos)

> **Repository:** [https://github.com/DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)  
> **Role in Framework:** Enforces strict code minimization, YAGNI, standard library reuse, and surgical diffs.

---

## 1. Tool Overview
Ponytail is an agent skill that trains your AI to act like a pragmatic, lazy senior engineer:
- Write as little new code as possible.
- Prefer existing codebase helpers and native standard libraries before adding external dependencies.
- Make the smallest surgical change that completely satisfies the requirements.

---

## 2. NVIDIA SkillSpector Security Pre-Scan
- **Scan Status:** ✅ **PASSED (0 Critical, 0 High)**
- **Audit Details:** Pure prompt-based instruction skill (`SKILL.md`). Zero network calls, zero executable binary scripts. Completely safe.

---

## 3. Prerequisites & Credentials Required
- **Runtime:** Any AI Coding Agent (Claude Code, Cursor, Antigravity, Windsurf).
- **Credentials / Keys Needed:** **NONE**.
- **Settings Changed:** Installs prompt guidelines into agent skill registry.

---

## 4. Step-by-Step Installation

### In Claude Code:
```bash
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

### In Antigravity / Cursor / Windsurf:
Copy the skill definition directly into your workspace skills directory:
```bash
# In your project root
mkdir -p .agents/skills/ponytail
curl -fsSL https://raw.githubusercontent.com/DietrichGebert/ponytail/main/SKILL.md -o .agents/skills/ponytail/SKILL.md
```
*(The core heuristics of Ponytail are also permanently baked into `agents/senior_builder.md` and `skills/surgical-implementation-tdd/SKILL.md` in this framework).*
