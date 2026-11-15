# Magic MCP (21st.dev) Integration Guide

> **Provider:** 21st.dev (Magic MCP)  
> **Purpose:** Drop-in, high-end Tailwind & React component design generation to eradicate ugly AI templates.

---

## 1. What Problem It Solves
Standard AI coding agents generate generic, outdated UI components (uninspired buttons, generic table styles). Magic MCP connects your agent directly to curated, polished UI component libraries (shadcn/ui, Tailwind CSS, Framer Motion) designed by top human product designers.

---

## 2. Configuration
Add to your `.mcp.json` or Claude Code config:
```json
{
  "mcpServers": {
    "21st-magic": {
      "command": "npx",
      "args": ["-y", "@21st-dev/magic-mcp@latest"],
      "env": {
        "MAGIC_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

- **Usage:** `"Use Magic MCP to fetch a high-conversion pricing card component with toggleable annual billing."`
