---
name: verification-before-completion
description: Enforces the Iron Law of Verification. Requires running executable verification commands and confirming passing output before claiming work is fixed or complete.
---

# Verification Before Completion

## Overview
Evidence before claims, always. Never state or imply that code works without fresh terminal verification evidence.

## The 5-Step Verification Gate:
1. **Identify:** What terminal command definitively proves this claim? (e.g. `npm test`, `pytest`, `cargo test`).
2. **Run:** Execute the full verification command in the current turn.
3. **Inspect:** Examine the full stdout, stderr, and exit code.
4. **Confirm:** Did all tests pass with Exit Code 0?
5. **Report:** Quote the actual command output and log the evidence in `05_verification_report.md`. Only then make the completion claim.
