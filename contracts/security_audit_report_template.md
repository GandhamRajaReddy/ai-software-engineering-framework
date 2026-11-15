# Security Audit Report Template

> **Report ID:** SEC-[DATE]-[PROJECT]  
> **Engine:** NVIDIA SkillSpector Static Analysis Protocol v1.0  
> **Status:** [✅ PASSED | ❌ BLOCKED]

---

## 1. Vulnerability Summary Table
| Severity Level | Detected Count | Allowed Limit | Gate Verdict |
|:---------------|:--------------:|:-------------:|:------------:|
| 🔴 **CRITICAL** | [0] | 0 | [PASS / FAIL] |
| 🟠 **HIGH** | [0] | 0 | [PASS / FAIL] |
| 🟡 **MEDIUM** | [Count] | <= 3 | [PASS / REVIEW] |
| 🟢 **LOW / INFO** | [Count] | Unlimited | [INFO] |

---

## 2. Rule Checklist Scanned
- [x] **SEC-001:** Prompt Injection & System Instruction Jailbreak
- [x] **SEC-002:** Data Exfiltration via Shell or Webhooks
- [x] **SEC-003:** Unsafe Subprocess & Shell Command Concatenation
- [x] **SEC-004:** Privilege Escalation & Host File Modification
- [x] **SEC-005:** Tool Shadowing & Background Hidden Actions
- [x] **SEC-006:** Plaintext Secret & Private Key Leakage
- [x] **SEC-007:** Unpinned Shell Download Pipelines (curl to bash)

---

## 3. Detailed Findings & Remediation (if any)
*(If zero findings, explicitly state "Clean scan - zero security defects detected")*

---

## 4. Security Sign-off
- **Security Auditor:** `Security Auditor Persona`
- **Release Clearance:** [GRANTED | DENIED]
