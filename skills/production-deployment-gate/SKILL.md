---
name: production-deployment-gate
description: Evaluates the 7 Iron-Clad Production Release Gates before code can be tagged, shipped, or deployed to staging and production.
---

# Production Deployment Gate

## Overview
Guarantees that no unverified, insecure, or non-deployable software is shipped.

## Execution Steps
1. Run the gate checker:
   ```bash
   node bin/asef.js gate-check .
   ```
2. Verify all 7 gates:
   - Gate 1: Requirements & Assumptions Traceability (15%)
   - Gate 2: Executable Test Evidence (25%)
   - Gate 3: SkillSpector Security Clearance (20%)
   - Gate 4: Filesystem Grounding (15%)
   - Gate 5: Independent Review (10%)
   - Gate 6: Deployment Ready Dockerfile & Health Check (10%)
   - Gate 7: Release Manifest & Rollback Plan (5%)
3. Release is approved only when Total Score = 100/100.
