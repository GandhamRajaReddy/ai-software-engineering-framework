# 3. Lemo-Opuscar Setup & Programmatic Media Engine

> **Repository:** [https://github.com/lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar)  
> **Role in Framework:** Code-driven mini-film studio and aesthetic asset generation skill.

---

## 1. Tool Overview
Lemo-Opuscar is an agent skill for AI coding assistants. Instead of using expensive, non-deterministic cloud video generation models, it provides curated aesthetic styles (`STYLE.md`) where the agent writes code (HTML5 Canvas, WebGL, local TTS, and FFmpeg) to programmatically render short visual clips, UI demos, and product walkthroughs.

---

## 2. NVIDIA SkillSpector Security Pre-Scan
- **Scan Status:** ✅ **PASSED (0 Critical, 0 High)**
- **Audit Details:** Evaluated `STYLE.md` and script templates. Uses local FFmpeg rendering. No external network data exfiltration detected.

---

## 3. Prerequisites & Credentials Required
- **Runtime:** Node.js 18+ and `ffmpeg` installed on system PATH.
- **Credentials / Keys Needed:** **NONE** (Renders entirely via local code, Canvas, and FFmpeg).
- **Settings Changed:** Installs local Claude Code skill into `~/.claude/skills/lemo-opuscar` or project `.agents/skills/`.

---

## 4. Step-by-Step Installation

### In Claude Code:
```bash
# Add skill via Claude Code plugin command
claude plugin marketplace add lemomo-ai/lemo-opuscar
claude plugin install lemo-opuscar@lemo-opuscar
```

### Manual Install:
```bash
git clone https://github.com/lemomo-ai/lemo-opuscar.git
cp -r lemo-opuscar/skills/lemo-opuscar ~/.claude/skills/
```

### Verification:
Verify FFmpeg is available on your machine:
```bash
ffmpeg -version
```
Once installed, prompt the agent: `"Create a 10-second product demo video using the minimalist cinematic style in Lemo-Opuscar."`
