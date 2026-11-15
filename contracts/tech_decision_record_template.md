# Architectural Decision Record (ADR) Template

> **ADR ID:** ADR-[NUMBER]  
> **Title:** [Decision Title: e.g. Selection of PostgreSQL + Drizzle over MongoDB for SaaS URL Shortener]  
> **Status:** [PROPOSED | ACCEPTED | REJECTED | SUPERSEDED]  
> **Date:** [YYYY-MM-DD]  
> **Deciders:** [System Architect, User]

---

## 1. Context & Problem Statement
[Describe the technical context, requirements, and constraints driving this decision. Mention what the user proposed and what functional/non-functional needs exist.]

---

## 2. Considered Alternatives & Multi-Criteria Evaluation Matrix

| Alternative Stack | ACID & Integrity (25%) | SEO & SSR (20%) | Type Safety (15%) | Concurrency (15%) | Velocity (15%) | Total (/100) |
|:------------------|:----------------------:|:---------------:|:-----------------:|:-----------------:|:--------------:|:------------:|
| **Option A (User Proposed)** | [Score] | [Score] | [Score] | [Score] | [Score] | **[Total]** |
| **Option B (Alternative 1)** | [Score] | [Score] | [Score] | [Score] | [Score] | **[Total]** |
| **Option C (Alternative 2)** | [Score] | [Score] | [Score] | [Score] | [Score] | **[Total]** |

---

## 3. Decision Outcome & Technical Rationale
**Chosen Option:** [Option Name]

### Rationale:
1. **[Reason 1]:** [Detailed explanation]
2. **[Reason 2]:** [Detailed explanation]
3. **[Reason 3]:** [Detailed explanation]

---

## 4. Pros and Cons of the Chosen Architecture
### Positive Consequences:
- [Advantage 1]
- [Advantage 2]

### Negative Consequences / Trade-offs:
- [Trade-off 1 and how it will be mitigated]
- [Trade-off 2 and how it will be mitigated]

---

## 5. Migration Strategy from User-Proposed Stack (if different)
[Step-by-step notes on how developer skills and concepts map cleanly to the recommended stack without disruption.]
