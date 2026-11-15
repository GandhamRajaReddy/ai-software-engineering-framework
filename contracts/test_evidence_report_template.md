# Test Evidence Report Template

> **Report ID:** VER-[DATE]-[RUN]  
> **Evaluator:** `Test Lead` & `Verification Engine`  
> **Result:** [✅ PASSED | ❌ FAILED]

---

## 1. Executive Summary
- **Overall Status:** [PASSED / FAILED]
- **Total Test Suites:** [Number]
- **Total Tests Executed:** [Number]
- **Passing Tests:** [Number]
- **Failing Tests:** [0 required to pass]
- **Execution Duration:** [X.XXs]

---

## 2. Command Execution Record
```bash
$ [Verification Command: e.g. npm test]
```

- **Exit Code:** `[0]`
- **Timestamp:** `[ISO timestamp]`
- **Working Directory:** `[Directory path]`

---

## 3. Raw Execution Log Output
```
[Paste complete terminal output here]
```

---

## 4. Filesystem & Symbol Grounding Check
| File Referenced in Spec | Physical Path Verified | File Size | Status |
|:------------------------|:-----------------------|:---------:|:------:|
| `src/lib/core.ts` | `/src/lib/core.ts` | [bytes] | ✅ Grounded |
| `src/routes/api.ts` | `/src/routes/api.ts` | [bytes] | ✅ Grounded |

---

## 5. Auditor Sign-off
- **Auditor Persona:** `Test Lead`
- **Claim Verified:** "All tests passing and evidence documented. No unverified claims."
