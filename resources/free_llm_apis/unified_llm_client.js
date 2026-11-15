/**
 * Unified Failover Free-Tier LLM Client
 * Routes requests across official free allowances (Groq, Gemini, OpenRouter) with auto-failover.
 */

class UnifiedLLMClient {
  constructor(config = {}) {
    this.geminiKey = config.geminiKey || process.env.GEMINI_API_KEY || '';
    this.groqKey = config.groqKey || process.env.GROQ_API_KEY || '';
    this.openrouterKey = config.openrouterKey || process.env.OPENROUTER_API_KEY || '';
  }

  async chatCompletion(messages, options = {}) {
    const errors = [];

    // 1. Try Groq (Fastest inference)
    if (this.groqKey) {
      try {
        return await this._callGroq(messages, options);
      } catch (err) {
        errors.push({ provider: 'groq', error: err.message });
      }
    }

    // 2. Failover to Google Gemini (Largest context)
    if (this.geminiKey) {
      try {
        return await this._callGemini(messages, options);
      } catch (err) {
        errors.push({ provider: 'gemini', error: err.message });
      }
    }

    // 3. Failover to OpenRouter Free tier
    if (this.openrouterKey) {
      try {
        return await this._callOpenRouter(messages, options);
      } catch (err) {
        errors.push({ provider: 'openrouter', error: err.message });
      }
    }

    throw new Error(`All free LLM providers failed. Errors: ${JSON.stringify(errors)}`);
  }

  async _callGroq(messages, options) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.groqKey}`
      },
      body: JSON.stringify({
        model: options.model || 'llama-3.3-70b-versatile',
        messages,
        temperature: options.temperature !== undefined ? options.temperature : 0.2
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return {
      provider: 'groq',
      model: data.model,
      content: data.choices[0].message.content
    };
  }

  async _callGemini(messages, options) {
    // Format messages for Gemini API
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      content: text
    };
  }

  async _callOpenRouter(messages, options) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openrouterKey}`
      },
      body: JSON.stringify({
        model: options.model || 'meta-llama/llama-3.3-70b-instruct:free',
        messages,
        temperature: options.temperature !== undefined ? options.temperature : 0.2
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return {
      provider: 'openrouter',
      model: data.model,
      content: data.choices[0].message.content
    };
  }
}

module.exports = {
  UnifiedLLMClient
};
