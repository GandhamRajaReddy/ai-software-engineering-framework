# Architectural Drift Prevention (Google Elephant-Goldfish Model)

> **Objective:** Ensure the implemented codebase never diverges from the architectural design records and requirements specifications.

---

## 1. The Architectural Drift Problem
In multi-agent and long-running software engineering tasks, implementations often silently drift:
- Spec calls for `PostgreSQL` with strict foreign keys → Builder silently writes in-memory array or SQLite.
- Spec calls for `GET /api/v1/links/:id/analytics` → Builder implements `GET /api/stats` with a different payload.
- Spec calls for `Argon2id` password hashing → Builder uses un-salted `md5` or basic `bcrypt(10)`.

---

## 2. The Elephant-Goldfish Drift Audit Protocol

Before any milestone is closed or PR is merged, the **Drift Detection Engine** compares the specification contract with physical source files:

```bash
node bin/asef.js drift-detect 01_requirements_spec.md
```

### Audit Checkpoints:
1. **Model & Schema Parity:** Every entity declared in `02_architecture_spec.md` must have a corresponding database migration or schema file with identical field names and types.
2. **Endpoint & Route Parity:** Every API endpoint in the spec must map to a concrete route handler on the filesystem.
3. **Placeholder & Shortcut Purge:** Flags any `// TODO`, `// FIXME`, or hardcoded mock responses that bypass business logic.

---

## 3. Resolving Detected Drift

When drift is detected, the agent has only two valid courses of action:
- **Action A (Code Remediation):** Update the code to fulfill the agreed architectural contract.
- **Action B (ADR Amendment):** If the drift was due to an unforeseen technical constraint, submit an updated Architectural Decision Record (ADR) justifying the change, get approval, and then update the specification.
- *Unrecorded drift is strictly prohibited.*
