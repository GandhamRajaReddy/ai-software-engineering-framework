/**
 * Provider Execution Manager (Multi-Agent Dispatch & Fallback Provenance)
 * Dispatches tasks to Claude Code CLI, Codex CLI, Direct LLMs, or isolated Mock.
 * Strictly records fallback chains, tracks actual execution providers, and prevents
 * mock results from posing as real model execution.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { ProviderManager } = require('../resources/provider_management');

class ProviderExecutionManager {
  constructor(options = {}) {
    this.requestedBackend = options.backend || process.env.ASEF_AGENT_BACKEND || 'direct-llm';
    this.allowMockFallback = options.allowMockFallback !== undefined ? options.allowMockFallback : true;
    this.projectDir = path.resolve(options.projectDir || process.cwd());
    this.providerManager = options.providerManager || new ProviderManager();
  }

  /**
   * Dispatches task to provider with full fallback tracking, health verification, and rate limiting
   */
  async execute(prompt, stage, options = {}) {
    const fallbackChain = [];
    const targetBackend = options.backend || this.requestedBackend;
    const requiredCapabilities = options.requiredCapabilities || [];

    // 1. Primary Attempt
    let result = { success: false, error: 'Provider unavailable, unhealthy, or rate-limited' };
    
    // Check capability validation if capabilities required
    const providerMeta = { id: targetBackend, capabilities: ['code_generation', 'reasoning', 'file_editing'] };
    const hasCapabilities = this.providerManager.validateCapabilities(providerMeta, requiredCapabilities);
    
    // Rate limit bucket check
    const bucket = this.providerManager.getTokenBucket(targetBackend);
    const hasTokens = bucket.tryConsume(1);

    if (!hasCapabilities) {
      result.error = `Provider ${targetBackend} lacks required capabilities: ${requiredCapabilities.join(', ')}`;
    } else if (!hasTokens) {
      result.error = `Provider ${targetBackend} token bucket exhausted (rate limit exceeded)`;
      this.providerManager.recordRateLimit(targetBackend);
    } else if (this.providerManager.isProviderAvailable(targetBackend)) {
      const health = await this.providerManager.checkProviderHealth(targetBackend);
      if (!health.healthy) {
        result.error = `Provider ${targetBackend} health check failed: ${health.reason || 'unhealthy'}`;
      } else {
        result = await this.tryBackend(targetBackend, prompt, stage, options);
        if (result.success) {
          this.providerManager.recordSuccess(targetBackend);
        } else if (result.error && (result.error.includes('429') || result.error.includes('rate limit'))) {
          this.providerManager.recordRateLimit(targetBackend);
        }
      }
    }

    fallbackChain.push({
      backend: targetBackend,
      success: result.success,
      error: result.error || null,
      timestamp: new Date().toISOString()
    });

    if (result.success) {
      return {
        content: result.content,
        requestedBackend: targetBackend,
        actualBackend: targetBackend,
        isMock: targetBackend === 'mock',
        fallbackChain
      };
    }

    // 2. Select next healthy fallback provider
    const candidateFallbacks = [
      { id: 'direct-llm', capabilities: ['code_generation', 'reasoning', 'file_editing'] },
      { id: 'mock', capabilities: ['code_generation', 'reasoning', 'file_editing'] }
    ].filter(p => p.id !== targetBackend);

    const nextHealthy = await this.providerManager.selectHealthyProvider(candidateFallbacks, requiredCapabilities);

    if (nextHealthy && nextHealthy.id === 'direct-llm') {
      const fbBucket = this.providerManager.getTokenBucket('direct-llm');
      if (fbBucket.tryConsume(1)) {
        const fallbackResult = await this.tryBackend('direct-llm', prompt, stage, options);
        if (fallbackResult.success) {
          this.providerManager.recordSuccess('direct-llm');
        } else if (fallbackResult.error && (fallbackResult.error.includes('429') || fallbackResult.error.includes('rate limit'))) {
          this.providerManager.recordRateLimit('direct-llm');
        }

        fallbackChain.push({
          backend: 'direct-llm',
          success: fallbackResult.success,
          error: fallbackResult.error || null,
          timestamp: new Date().toISOString()
        });

        if (fallbackResult.success) {
          return {
            content: fallbackResult.content,
            requestedBackend: targetBackend,
            actualBackend: 'direct-llm',
            isMock: false,
            fallbackChain
          };
        }
      }
    }

    // 3. Fallback to Mock if permitted by configuration
    if (this.allowMockFallback) {
      const mockResult = await this.tryBackend('mock', prompt, stage);
      fallbackChain.push({
        backend: 'mock',
        success: mockResult.success,
        error: null,
        timestamp: new Date().toISOString()
      });

      return {
        content: mockResult.content,
        requestedBackend: targetBackend,
        actualBackend: 'mock',
        isMock: true, // EXPLICITLY TAGGED AS MOCK
        fallbackChain
      };
    }

    throw new Error(`All agent execution backends failed. Fallback chain: ${JSON.stringify(fallbackChain)}`);
  }

  /**
   * Attempts a specific execution backend
   */
  async tryBackend(backend, prompt, stage, options = {}) {
    const timeoutMs = options.timeoutMs || 1000;
    switch (backend) {
      case 'claude-code':
        return this.invokeClaudeCLI(prompt, timeoutMs);
      case 'codex':
        return this.invokeCodexCLI(prompt, timeoutMs);
      case 'direct-llm':
        return this.invokeDirectLLM(prompt, stage);
      case 'mock':
      default:
        return { success: true, content: this.generateMockContent(stage) };
    }
  }

  /**
   * Invokes Claude Code CLI shell-free
   */
  async invokeClaudeCLI(prompt, timeoutMs = 3000) {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timer = null;

      const safeResolve = (val) => {
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);
          resolve(val);
        }
      };

      let child;
      try {
        child = spawn(process.platform === 'win32' ? 'claude.cmd' : 'claude', ['-p', prompt], {
          cwd: this.projectDir,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        });
      } catch (err) {
        safeResolve({ success: false, error: `Claude CLI spawn error: ${err.message}` });
        return;
      }

      timer = setTimeout(() => {
        try { if (child) child.kill('SIGTERM'); } catch (e) { /* ignore */ }
        safeResolve({ success: false, error: `Claude CLI timed out after ${timeoutMs}ms` });
      }, timeoutMs);

      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });

      child.on('close', code => {
        if (code === 0 && stdout.trim()) {
          safeResolve({ success: true, content: stdout.trim() });
        } else {
          safeResolve({ success: false, error: stderr.trim() || `Claude CLI exited with code ${code}` });
        }
      });

      child.on('error', err => {
        safeResolve({ success: false, error: `Claude CLI spawn error: ${err.message}` });
      });
    });
  }

  /**
   * Invokes Codex CLI shell-free
   */
  async invokeCodexCLI(prompt, timeoutMs = 3000) {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timer = null;

      const safeResolve = (val) => {
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);
          resolve(val);
        }
      };

      let child;
      try {
        child = spawn(process.platform === 'win32' ? 'codex.cmd' : 'codex', ['exec', prompt], {
          cwd: this.projectDir,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        });
      } catch (err) {
        safeResolve({ success: false, error: `Codex CLI spawn error: ${err.message}` });
        return;
      }

      timer = setTimeout(() => {
        try { if (child) child.kill('SIGTERM'); } catch (e) { /* ignore */ }
        safeResolve({ success: false, error: `Codex CLI timed out after ${timeoutMs}ms` });
      }, timeoutMs);

      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });

      child.on('close', code => {
        if (code === 0 && stdout.trim()) {
          safeResolve({ success: true, content: stdout.trim() });
        } else {
          safeResolve({ success: false, error: stderr.trim() || `Codex CLI exited with code ${code}` });
        }
      });

      child.on('error', err => {
        safeResolve({ success: false, error: `Codex CLI spawn error: ${err.message}` });
      });
    });
  }

  /**
   * Direct LLM invocation with failover
   */
  async invokeDirectLLM(prompt, stage) {
    const apiKey = process.env.OPENROUTER_API_KEY ||
                   process.env.GEMINI_API_KEY ||
                   process.env.GROQ_API_KEY ||
                   process.env.ANTHROPIC_API_KEY ||
                   process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return { success: false, error: 'No API keys configured for direct LLM execution' };
    }

    try {
      // Check if UnifiedLLMClient is present
      const clientPath = path.join(this.projectDir, 'resources', 'free_llm_apis', 'unified_llm_client.js');
      if (fs.existsSync(clientPath)) {
        const { UnifiedLLMClient } = require(clientPath);
        const client = new UnifiedLLMClient();
        const response = await client.complete([
          { role: 'system', content: `You are specialist persona "${stage.agent}". Output clean file blocks.` },
          { role: 'user', content: prompt }
        ]);
        return { success: true, content: response.content };
      }
    } catch (e) {
      return { success: false, error: `Direct LLM client error: ${e.message}` };
    }

    return { success: false, error: 'UnifiedLLMClient not available or failed' };
  }

  /**
   * Generates deterministic mock content for testing and dry-runs
   */
  generateMockContent(stage) {
    let mockContent = `# Automated Output: ${stage.name} (${stage.id})\n\n`;
    mockContent += `> **Executed Agent Persona:** \`${stage.agent}\`\n`;
    mockContent += `> **Primary Skill:** \`${stage.skill}\`\n`;
    mockContent += `> **Execution Mode:** \`MOCK_TEST_RUN\`\n`;
    mockContent += `> **Timestamp:** ${new Date().toISOString()}\n\n`;

    if (stage.targetArtifact) {
      mockContent += `\`\`\`filepath:${stage.targetArtifact}\n`;
      mockContent += `# ${stage.name}\n\n`;
      mockContent += `## 1. Summary\nAuto-scaffolded verified contract for stage ${stage.id}.\n\n`;
      mockContent += `## 2. Invariants & Guarantees\n- All requirements mapped to tests\n- Clean architecture adhered to\n`;
      mockContent += `\`\`\`\n`;
    }

    return mockContent;
  }
}

module.exports = {
  ProviderExecutionManager
};
