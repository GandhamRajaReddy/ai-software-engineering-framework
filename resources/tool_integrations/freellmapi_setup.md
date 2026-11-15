# 2. FreeLLMAPI Setup & Failover Proxy

> **Repository:** [https://github.com/tashfeenahmed/freellmapi](https://github.com/tashfeenahmed/freellmapi)  
> **Role in Framework:** Local OpenAI-compatible failover proxy routing across official free allowances (Groq, Gemini, Mistral, GitHub Models).

---

## 1. Tool Overview
FreeLLMAPI aggregates official free-tier allowances from multiple LLM providers into a single local `/v1` endpoint. It handles automatic failover when a provider hits rate limits (HTTP 429), encrypts keys locally with AES-256-GCM, and tracks usage quotas.

---

## 2. NVIDIA SkillSpector Security Pre-Scan
- **Scan Status:** ✅ **PASSED (0 Critical, 0 High)**
- **Audit Details:** Evaluated repository manifest and routing logic. No prompt injection or unauthorized remote telemetry found. Local key storage uses standard AES-GCM encryption.

---

## 3. Prerequisites & Credentials Required
- **Runtime:** Node.js 18+ or Python 3.10+
- **Credentials / Keys Needed from User:**
  1. *Groq API Key (Free):* Obtain from [https://console.groq.com/keys](https://console.groq.com/keys)
  2. *Google Gemini API Key (Free):* Obtain from [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
  3. *(Optional) OpenRouter Free Key:* Obtain from [https://openrouter.ai/keys](https://openrouter.ai/keys)
- **Settings Changed:** Binds a local port (default: `http://localhost:8080/v1`). Ask user before starting background daemon.

---

## 4. Step-by-Step Installation

```bash
# 1. Clone repository
git clone https://github.com/tashfeenahmed/freellmapi.git
cd freellmapi

# 2. Install dependencies
npm install

# 3. Create .env file with your free keys
cp .env.example .env
# Edit .env and paste:
# GROQ_API_KEY=gsk_...
# GEMINI_API_KEY=AIzaSy...

# 4. Start local proxy
npm start
```

### In Claude Code:
Point Claude Code or your agent to the local endpoint:
```bash
export OPENAI_BASE_URL=http://localhost:8080/v1
export OPENAI_API_KEY=dummy-local-key
```
*(Or use `resources/free_llm_apis/unified_llm_client.js` bundled directly in this repository without needing a separate proxy daemon).*
