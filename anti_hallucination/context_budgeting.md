# Token Budget Optimization & Selective Context Loading

> **Objective:** Prevent context saturation, minimize token costs, and maintain razor-sharp agent reasoning over long sessions.

---

## 1. The Context Saturation Problem
As context windows fill up:
1. **Attention Dilution:** LLM attention degrades; rules placed in the middle of long contexts are ignored (the "lost in the middle" effect).
2. **Hallucination Spike:** Models struggle to distinguish current instructions from previous obsolete brainstorming turns.
3. **Token Cost Explosion:** Repeating multi-megabyte codebase dumps on every turn drains token quotas rapidly.

---

## 2. Selective Context Loading Matrix
The framework uses a smart routing mechanism (`AI_ENTRYPOINT.md`). Rather than loading the entire repository, an agent loads **only** the files relevant to the active lifecycle stage:

| Active Task Type | Files Loaded into Context | Approximate Token Cost |
|:-----------------|:--------------------------|:----------------------:|
| **Problem Intake** | `lifecycle/00_PROBLEM_INGESTION.md`, `contracts/problem_statement_template.md` | ~800 tokens |
| **Requirements Spec** | `lifecycle/01_REQUIREMENTS.md`, active problem statement | ~1,200 tokens |
| **Stack Evaluation** | `lifecycle/02_ARCHITECTURE.md`, `cli/stack-evaluator.js` | ~1,800 tokens |
| **Atomic Coding** | Active task contract, target file, associated test file, `anti_hallucination/iron_laws.md` | ~2,500 tokens |
| **Test Verification** | `lifecycle/05_VERIFICATION.md`, test command output | ~1,000 tokens |
| **Security Audit** | `lifecycle/05_VERIFICATION.md`, `contracts/security_audit_report_template.md` | ~1,200 tokens |

---

## 3. Token Compression Heuristics (RTK & Headroom Principles)

1. **AST Maps Over Raw Dumps:** Never dump an entire 5,000-line codebase into context. Use symbol maps (e.g. via `graphify` or `serena`) showing exported function signatures and interfaces.
2. **Surgical Diffs Over File Rewrites:** When editing an existing file, generate unified diffs or targeted drop-in replacements rather than rewriting the entire 500-line file.
3. **Structured Concise Logs:** Filter verbose dependency trees (`npm install` warnings, deprecation notices) and feed only exit codes and error stacks into the model context.
