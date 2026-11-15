# Free LLM API Integration Guide

This directory provides a vetted catalog and a drop-in client wrapper for utilizing **official free-tier LLM APIs** (Google Gemini, Groq, OpenRouter, GitHub Models, and Mistral) to power AI agents without incurring cloud API costs.

---

## 1. Provider Comparison & Key Retrieval

| Provider | Default Model | Context Window | Free Quota | Dashboard to Obtain Free Key |
|:---------|:--------------|:--------------:|:-----------|:-----------------------------|
| **Google Gemini** | `gemini-2.0-flash` | 1,000,000 | 15 RPM / 1,500 RPD | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| **Groq Cloud** | `llama-3.3-70b-versatile` | 128,000 | 30 RPM / 14,400 RPD | [Groq Console](https://console.groq.com/keys) |
| **OpenRouter** | `meta-llama/llama-3.3-70b-instruct:free` | 131,072 | 20 RPM | [OpenRouter Keys](https://openrouter.ai/keys) |
| **GitHub Models** | `gpt-4o-mini` | 128,000 | 15 RPM | [GitHub Models](https://github.com/marketplace/models) |
| **Mistral AI** | `mistral-small-latest` | 32,768 | 1 RPS | [Mistral Console](https://console.mistral.ai/api-keys/) |

---

## 2. Using the Unified Client with Automatic Failover

The framework includes `unified_llm_client.js`. If one provider encounters a rate limit (`429 Too Many Requests`), the client automatically fails over to the next configured provider without interrupting your workflow.

### Quick Usage Example:
```javascript
const { UnifiedLLMClient } = require('./unified_llm_client');

const client = new UnifiedLLMClient({
  geminiKey: process.env.GEMINI_API_KEY,
  groqKey: process.env.GROQ_API_KEY,
  openrouterKey: process.env.OPENROUTER_API_KEY
});

async function main() {
  const response = await client.chatCompletion([
    { role: 'system', content: 'You are an expert software engineer.' },
    { role: 'user', content: 'Generate a TypeScript interface for a User model.' }
  ]);
  console.log(response.content);
}
main();
```
