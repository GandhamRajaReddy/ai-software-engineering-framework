---
name: token-budget-optimization
description: Optimizes context window consumption through selective loading, AST symbol mapping, and concise diffs inspired by RTK, Headroom, and Caveman.
---

# Token Budget Optimization

## Overview
Maximizes agent reasoning accuracy and prevents token exhaustion by eliminating unnecessary context loading.

## Rules for Selective Loading
1. **Never dump full project directories** into context prompts.
2. Load only the active lifecycle stage file and its immediate contract template.
3. Use symbol maps (exported interfaces and functions) rather than raw implementation files when planning integrations.
4. Keep git diffs surgical (<= 50 lines per change).
