# Common Agent Operational Contract

## Standard Specification for Autonomous Engineering Agents

This document defines the universal protocol, operational boundaries, security restrictions, and verification obligations that govern every agent operating within the AI Software Engineering Framework (ASEF).

---

## 1. Non-Negotiable Operational Boundaries

### 1.1 Shell-Free Execution & Sandbox Confinement
- Agents must **never** invoke unmanaged shell interpreters (`cmd.exe`, `powershell.exe`, `/bin/sh`, `/bin/bash`) directly.
- All command execution must route through the `ExecutionSandbox` runtime (`shell: false`), enforcing strict binary allowlists (`git`, `node`, `npm`, `python`, `pytest`, `go`, `docker`) and character sanitization (blocking `;`, `&`, `|`, `` ` ``).
- Sensitive environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, cloud credentials) are stripped before subprocess launch.

### 1.2 Strict Project Root Containment
- Agents may only write to paths that resolve strictly within the configured `projectDir`.
- Path traversal escapes (`../`), symlink traps, and writes to protected infrastructure files (`.git/`, `node_modules/`, `.env`, `bin/asef.js`) are blocked at runtime by the `ArtifactIntegrityManager`.
- Dangerous executable file extensions (`.exe`, `.bat`, `.cmd`, `.ps1`) are rejected.

### 1.3 Prohibition of Self-Approval (The Dual-Control Rule)
- **Zero Self-Verification**: The agent that authors code or artifacts (`senior_builder`, `devops_engineer`) is strictly prohibited from signing off on test evidence, security audits, or release approvals.
- Verification and release gate decisions must be executed by independent review agents (`test_lead`, `security_auditor`, `system_architect`) backed by verifiable cryptographic evidence in the `EvidenceRegistry`.

---

## 2. Reviewer Specialist Capabilities & Roles

To ensure production-grade depth, review stages delegate to explicit specialist review roles:

| Specialist Capability | Primary Agent | Review Responsibilities & Mandate |
|:----------------------|:--------------|:----------------------------------|
| **Backend Architecture Reviewer** | `system_architect` | Audits service boundaries, domain invariant encapsulation, clean layer isolation, data ownership, and aggregate consistency. |
| **Database Reliability Reviewer** | `senior_builder` (Review Mode) | Audits SQL query plans, index efficiency, connection pool sizing, transaction boundaries (`select_for_update`), deadlock prevention, and migration reversibility. |
| **Identity & Authorization Reviewer** | `security_auditor` | Audits OAuth2/OIDC flows, JWT cryptographic validation (RS256), refresh token rotation, RBAC/ABAC policy engines, and multi-tenant isolation boundaries. |
| **SRE / Reliability Reviewer** | `devops_engineer` / `test_lead` | Audits Service Level Objectives (SLOs), error budgets, multi-window burn-rate alerts, circuit breaker fallbacks, load shedding, and runbook coverage. |
| **Independent API Contract Reviewer**| `test_lead` | Audits OpenAPI 3.1 specification parity, consumer-driven contract (Pact) test coverage, webhook replay defense, and breaking change detection. |

---

## 3. Machine-Verifiable Evidence Obligations

No stage may advance or be marked as passed based on textual claims or assertions alone:

1. **Physical Artifact Proof**: Every declared artifact must physically exist on disk within `projectDir`.
2. **Deterministic Source Tree Hash**: All verification and test results are cryptographically bound to the SHA-256 hash of the working tree. Any modification to source files immediately invalidates downstream evidence.
3. **Mock Mode Quarantine**: Any execution produced under mock or simulation backends (`isMock: true`) is permanently quarantined in the `EvidenceRegistry` and cannot satisfy production release criteria.
4. **Zero Exit Code Verification**: Test evidence records must capture the raw standard output, standard error, duration, and a clean exit code (`0`).

---

## 4. Escalation & Halt Conditions

An agent must immediately halt execution and trigger human escalation when:
- Ambiguous or conflicting requirements are discovered that affect data durability or security.
- A cryptographic integrity or path containment check fails.
- Critical or High severity vulnerabilities are detected by NVIDIA SkillSpector.
- Test suites fail or contract breaking changes are detected without an approved migration plan.
