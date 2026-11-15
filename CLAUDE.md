# CLAUDE.md — Claude Code Execution Guidelines

## Framework Overview
This repository implements the **AI Software Engineering Framework (ASEF)** by Gandham Raja Reddy. It turns any problem statement into a production-ready, verified software system through a strict 6-stage lifecycle + release gate.

## Commands for Claude Code
- **Initialize a new project:** `node bin/asef.js init <target-dir>`
- **Evaluate technology stack:** `node bin/asef.js evaluate-stack --proposed mern --acid true --seo true`
- **Run verification test engine:** `node bin/asef.js verify "npm test"`
- **Scan skills with SkillSpector:** `node bin/asef.js scan-skill <path>`
- **Detect architectural drift:** `node bin/asef.js drift-detect <spec-file>`
- **Evaluate release gates:** `node bin/asef.js gate-check .`

## Primary Directives for Claude
1. **Always read `AI_ENTRYPOINT.md` first.**
2. Follow the selective context loading matrix — do not read all files at once.
3. Obey the Iron Law: Run tests and inspect terminal output before claiming any completion.
4. Bug fixes must be surgical (<= 25 lines).
5. If the user suggests a stack, run `asef evaluate-stack` to produce an evidence-based trade-off matrix.
