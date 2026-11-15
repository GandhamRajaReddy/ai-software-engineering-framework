# AI_ENTRYPOINT.md — Universal Agent Entrypoint

> **Framework:** AI Software Engineering Framework (ASEF) v1.0.0  
> **Repository:** [https://github.com/GandhamRajaReddy/ai-software-engineering-framework](https://github.com/GandhamRajaReddy/ai-software-engineering-framework)  
> **Loading Rule:** Every agent turn in Claude Code, Cursor, Antigravity, Windsurf, or Codex begins here.

---

## ⚡ 10-Second Quick Start for AI Agents
1. **Identify the Task Stage** using the Stage Routing Table below.
2. **Selectively Load ONLY the files listed for that stage** (Do not load all files to conserve token budget).
3. **Enforce the Anti-Hallucination Iron Laws** (`anti_hallucination/iron_laws.md`):
   - Never assert a file exists without inspecting the filesystem.
   - Never mark a feature/bug complete without executing the verification command in the current turn.
4. **Produce the Required Contract** before moving to the next stage.

---

## 🎯 Stage Routing & Selective Context Loading Matrix

| User Request / Task Type | Lifecycle Stage | Active Persona | Files to Load into Context | Output Contract |
|:-------------------------|:---------------:|:---------------|:---------------------------|:----------------|
| *"Build X from scratch"*, *"I have an idea for Y"* | **Stage 00** | `Orchestrator` & `Requirements Analyst` | `lifecycle/00_PROBLEM_INGESTION.md`<br/>`contracts/problem_statement_template.md` | `00_problem_statement.md` |
| *"Specify requirements"*, *"Define user stories"* | **Stage 01** | `Requirements Analyst` | `lifecycle/01_REQUIREMENTS.md`<br/>`00_problem_statement.md` | `01_requirements_spec.md` |
| *"What stack should I use?"*, *"Can I use MERN?"* | **Stage 02** | `System Architect` | `lifecycle/02_ARCHITECTURE.md`<br/>`cli/stack-evaluator.js` | `02_tech_decision_record.md` |
| *"Break down into tasks"*, *"Create implementation plan"* | **Stage 03** | `Task Planner` | `lifecycle/03_PLANNING.md`<br/>`02_architecture_spec.md` | `03_implementation_plan.md` |
| *"Implement feature X"*, *"Fix bug Y"* | **Stage 04** | `Senior Builder` (Ponytail Ethos) | `lifecycle/04_IMPLEMENTATION.md`<br/>`anti_hallucination/iron_laws.md`<br/>Target task in plan | `patch_contract.md` + Code |
| *"Test this"*, *"Verify implementation"*, *"Security scan"* | **Stage 05** | `Test Lead` & `Security Auditor` | `lifecycle/05_VERIFICATION.md`<br/>`cli/skillspector-scanner.js` | `05_verification_report.md` |
| *"Containerize"*, *"Create Dockerfile"*, *"Setup CI/CD"* | **Stage 06** | `DevOps Engineer` | `lifecycle/06_DEPLOYMENT.md` | `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml` |
| *"Is this production ready?"*, *"Ship to production"* | **Stage 07** | `Orchestrator` & `Release Manager` | `lifecycle/07_RELEASE_GATE.md`<br/>`cli/release-gate-checker.js` | `RELEASE_MANIFEST.md` |

---

## 🛡️ Anti-Hallucination Execution Guard
If you are about to say:
- *"This should work now"* → **STOP.** Run the test command instead.
- *"File X is located at Y"* → **STOP.** Run `ls` or `dir` to verify.
- *"I will import helper Z"* → **STOP.** Verify that helper Z is exported in the source file.
