# 5. Agent-Reach Setup (Zero-Cost Web & Platform Scraping)

> **Repository:** [https://github.com/Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach)  
> **Role in Framework:** Unified CLI bridge allowing AI agents to read, search, and scrape public web platforms (Twitter/X, Reddit, YouTube, GitHub, Web Search) with zero or minimal API fees.

---

## 1. Tool Overview
Agent-Reach acts as an external context bridge. When a software engineering project requires public data (market research, sentiment analysis, documentation search, public competitor audits), Agent-Reach provides reliable scraping utilities that convert raw web content into clean Markdown without costly API subscriptions.

---

## 2. NVIDIA SkillSpector Security Pre-Scan
- **Scan Status:** ✅ **PASSED (0 Critical, 0 High)**
- **Audit Details:** CLI utility with targeted scraping backends. Does not expose local files or exfiltrate private credentials. Network requests are restricted to specified target URLs.

---

## 3. Prerequisites & Credentials Required
- **Runtime:** Python 3.10+
- **Credentials / Keys Needed from User:**
  - *Standard Web & Reddit Search:* **NO KEY REQUIRED**.
  - *(Optional) Twitter/X or Authenticated Sessions:* User cookies or session tokens if scraping behind login walls. Ask user explicitly before requesting any login cookies.
- **Settings Changed:** Installs global Python CLI `agent-reach`.

---

## 4. Step-by-Step Installation

```bash
# 1. Clone the repository
git clone https://github.com/Panniantong/Agent-Reach.git
cd Agent-Reach

# 2. Install dependencies via pip or uv
pip install -r requirements.txt
pip install -e .

# 3. Test verification command
agent-reach --help
```

### Integration into Claude Code / ASEF:
Use Agent-Reach inside research or data-gathering tasks:
```bash
agent-reach search "FastAPI vs Next.js p99 benchmarks" --format markdown
```
The agent receives structured Markdown without raw HTML bloat, preserving token budget while grounding external research.
