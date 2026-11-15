---
name: skillspector-security-audit
description: Scans AI skills, custom instructions, tools, and MCP configurations using NVIDIA SkillSpector rules to prevent prompt injection and data exfiltration.
---

# SkillSpector Security Audit

## Overview
Before installing or executing any third-party skill, MCP server, or custom instruction set, run a static security scan using the SkillSpector analysis protocol.

## Execution Steps
1. Target the skill or directory to inspect:
   ```bash
   node bin/asef.js scan-skill <path/to/skill-or-dir>
   ```
2. Check the vulnerability report:
   - **0 Critical & 0 High Vulnerabilities:** Safe to install/execute.
   - **>= 1 Critical or High:** Blocked. Discard or sanitize immediately.
3. Common vectors checked:
   - Prompt injection / jailbreaks (`SEC-001`)
   - Data exfiltration via curl/wget/fetch (`SEC-002`)
   - Unsafe subprocess code evaluation (`SEC-003`)
   - Privilege escalation (`SEC-004`)
   - Tool poisoning (`SEC-005`)
   - Hardcoded plaintext secrets (`SEC-006`)
