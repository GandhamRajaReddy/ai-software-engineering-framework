# Anti-Hallucination Iron Laws

> **Load Priority:** MANDATORY — Evaluated on every agent turn without exception.  
> **Penalty on Violation:** Immediate execution HALT and reversion to prior verified state.

---

## Law 1 — Physical Filesystem Grounding
- **Never guess a file path.** You must inspect directory contents or read the file before asserting its existence.
- **Never guess an import.** You must verify that the module or package is physically present in `node_modules`, `site-packages`, standard libraries, or local source files.
- **Never guess a function signature.** You must view the function export or type definition in the codebase before calling it.
- **Action on Uncertainty:** HALT, execute a file-reading or directory-listing command, verify reality, and only then proceed.

---

## Law 2 — The Verification Command Invariant
- **"Unverified is NEVER complete."**
- You cannot state that a test passes, a bug is fixed, or a feature works unless you executed the verification command in the current turn and inspected its full stdout, stderr, and exit code.
- Words such as "should work", "probably passes", "seems fixed", and "looks good" are forbidden in completion claims.

---

## Law 3 — Explicit Assumptions
- If an architectural or implementation choice requires an assumption (e.g. database schema structure, authentication mechanism, third-party API availability), that assumption must be logged in the `Explicit Assumptions Ledger`.
- Never make silent architectural assumptions.

---

## Law 4 — Scope Ceiling & Surgical Modification
- A bug fix diff must not exceed 25 lines unless pre-authorized.
- A feature patch must touch only the files explicitly enumerated in the task contract.
- Never refactor, reformat, or rename unrelated files in a feature or fix branch.

---

## Law 5 — Full Output Completeness
- Never emit truncated code placeholders (`// ... existing code ...`, `/* remaining logic unchanged */`).
- Every patch must be complete, syntactically valid, and drop-in executable.
