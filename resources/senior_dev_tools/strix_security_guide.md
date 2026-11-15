# Strix Automated Security Testing Guide

> **Provider:** Strix Security  
> **Purpose:** Autonomous vulnerability assessment and dependency threat detection.

---

## 1. What Problem It Solves
Strix automates dynamic and static penetration testing on agent-generated code. It checks for SQL injection, cross-site scripting (XSS), insecure deserialization, broken access control, and vulnerable transitive dependencies.

---

## 2. Configuration & Usage
Run Strix in CI/CD or locally via CLI before release gate evaluation:

```bash
# Scan active project repository
npx strix scan . --fail-on high
```

- **Output:** SARIF report compatible with GitHub Code Scanning.
- **Gate Integration:** Strix results pipe directly into `05_verification/security_audit.md` and are verified by `node bin/asef.js gate-check .`.
