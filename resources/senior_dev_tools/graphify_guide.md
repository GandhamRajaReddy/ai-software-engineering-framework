# Graphify Integration Guide

> **Official Repo:** [https://github.com/Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)  
> **Purpose:** AST-based code graph extraction without vector embeddings.

---

## 1. What Problem It Solves
Vector RAG frequently misses symbol dependencies (e.g. caller-callee relationships, interface implementations, and database foreign keys). Graphify parses code into a deterministic Abstract Syntax Tree (AST) knowledge graph where every edge is an explicit relationship.

---

## 2. Installation & Setup
Requires Python 3.10+ and `uv`:

```bash
# 1. Install via uv
uv tool install graphifyy

# 2. Register with your coding assistant
graphify install
```

- **Usage:** Run `/graphify` in Claude Code or your agent session to index the workspace. The agent queries precise callers and cross-file dependencies without loading thousands of lines of irrelevant code.
