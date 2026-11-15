---
name: evidence-based-stack-selection
description: Evaluates user-proposed software stacks against functional and non-functional requirements using multi-criteria scoring to produce justified architectural decisions.
---

# Evidence-Based Stack Selection

## Overview
Do not blindly accept or enforce a generic technology stack. When a problem statement is presented (or a user suggests a stack like MERN), invoke this skill to evaluate feasibility, data integrity, SEO, concurrency, and type safety.

## Execution Steps
1. Parse the project's requirements:
   - Does it need multi-table ACID transactions?
   - Does it require public search engine indexing (SEO) / fast initial paint?
   - What is the expected throughput (RPS)?
   - Are there AI/ML or vector database requirements?
2. Execute the ASEF evaluator:
   ```bash
   node bin/asef.js evaluate-stack --proposed <user_stack> --acid <true|false> --seo <true|false> --rps <number>
   ```
3. Review the generated trade-off report.
4. If the user's stack scores lower than an alternative, present the objective trade-offs and explain the recommended architecture in `02_tech_decision_record.md`.
