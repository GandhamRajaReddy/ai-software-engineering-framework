# 1. NVIDIA SkillSpector Setup & Security Gate

> **Repository:** [https://github.com/NVIDIA/skillspector](https://github.com/NVIDIA/skillspector)  
> **Role in Framework:** Foundation security auditor. Scans all other skills, tools, and MCP servers before installation.

---

## 1. Tool Overview
NVIDIA SkillSpector is an open-source security scanner designed specifically for AI agent skills, custom instructions, and Model Context Protocol (MCP) configurations. It performs two-stage static and semantic analysis to detect prompt injection, data exfiltration, tool poisoning, and privilege escalation.

---

## 2. Prerequisites & Credentials Required
- **Runtime:** Python 3.10+ or Node.js 18+ (or via pre-built GitHub Action).
- **Credentials / Keys Needed:** **NONE** for static analysis. (Optional API key for secondary LLM semantic analysis, but static rules run completely locally offline).
- **Settings Changed:** Installs local CLI scanner. No external cloud settings modified.

---

## 3. Installation Steps for Claude Code / Terminal

### Option A: Direct Local Python / UV Install (Recommended)
```bash
# Clone the repository
git clone https://github.com/NVIDIA/skillspector.git
cd skillspector

# Install via pip or uv
pip install -e .
# Or using uv
uv pip install -e .
```

### Option B: Built-in ASEF Scanner (Zero-Install Equivalent)
The framework repository already includes the native SkillSpector static analysis rules in `cli/skillspector-scanner.js`:
```bash
node bin/asef.js scan-skill <path/to/target>
```

---

## 4. Verification Check
Run a self-test scan:
```bash
node bin/asef.js scan-skill skills/
```
Expected output: `0 Critical, 0 High vulnerabilities. All scanned skills comply with NVIDIA SkillSpector safety guidelines.`
