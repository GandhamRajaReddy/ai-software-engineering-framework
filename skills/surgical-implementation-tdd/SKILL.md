---
name: surgical-implementation-tdd
description: Implements features and fixes using Test-Driven Development (Red-Green-Refactor) and minimal surgical patches adhering to Ponytail & Karpathy principles.
---

# Surgical Implementation & TDD

## Overview
Adopt the senior developer mindset: make the smallest possible change that robustly solves the issue. Never rewrite files wholesale when a 10-line patch achieves the requirement.

## TDD Execution Protocol
1. **Red:** Write a dedicated unit or integration test specifying expected inputs and outputs. Execute the test and verify that it fails cleanly.
2. **Green:** Write the minimal code needed to pass the test. Prefer built-in standard library utilities. Execute the test and verify Exit Code 0.
3. **Refactor:** Clean up naming, ensure TypeScript/type-hints are strict, and re-run tests.
4. **Contract:** Record the change in `contracts/patch_contract_template.md`.
