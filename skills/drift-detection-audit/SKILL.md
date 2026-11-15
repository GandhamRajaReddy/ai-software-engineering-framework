---
name: drift-detection-audit
description: Audits code against design specifications using the Google Elephant-Goldfish Model protocol to catch architectural divergence and missing entities.
---

# Drift Detection Audit

## Overview
Detects whether an evolving codebase has diverged from its agreed architectural specifications, models, routes, or requirements.

## Execution Steps
1. Run the drift detector CLI against the specification contract:
   ```bash
   node bin/asef.js drift-detect 01_requirements_spec.md
   ```
2. Review detected issues:
   - Missing models or database tables
   - Missing API endpoints
   - Logic shortcuts (e.g. leftover TODO or mock handlers)
3. Remediate code or update the Architectural Decision Record (ADR) before advancing to release gates.
