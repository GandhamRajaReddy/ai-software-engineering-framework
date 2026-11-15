# Context7 Integration Guide

> **Official Repo:** [https://github.com/upstash/context7](https://github.com/upstash/context7)  
> **Purpose:** Up-to-date, version-specific documentation injection to eliminate hallucinated library APIs.

---

## 1. What Problem It Solves
AI models frequently invent methods or use deprecated APIs from old training data (e.g. Next.js 12 router syntax in Next.js 15, or outdated LangChain syntax). Context7 pulls live, version-specific documentation into context before the agent generates code.

---

## 2. Installation & Setup
Requires Node.js 22.13 or newer:

```bash
npx ctx7 setup
```
Target Claude Code or Cursor:
```bash
npx ctx7 setup --claude
# or
npx ctx7 setup --cursor
```

- **Free API Key:** Recommended from [https://context7.com/dashboard](https://context7.com/dashboard) for higher rate limits.
- **Usage Tip:** Include the library's Context7 ID directly in prompts: `"Use context7:drizzle-orm to configure the PostgreSQL client with connection pooling."`
