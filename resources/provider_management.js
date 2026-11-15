/**
 * Provider Health, Capability Validation, and Dynamic Fallback Manager
 *
 * Implements real-time provider HTTP health checking, token bucket rate limiting,
 * exponential backoff with full jitter, strict capability matching, and transparent failover.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

class TokenBucket {
  constructor(capacity = 60, refillPerSecond = 1) {
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefill = now;
  }

  tryConsume(tokens = 1) {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }
}

class ProviderManager {
  constructor(options = {}) {
    this.healthCache = new Map();
    this.rateLimitState = new Map();
    this.failureCounts = new Map();
    this.tokenBuckets = new Map();

    this.baseCooldownMs = options.baseCooldownMs || 2000;
    this.maxCooldownMs = options.maxCooldownMs || 60000;
  }

  /**
   * Initializes or gets token bucket for provider
   */
  getTokenBucket(providerId, capacity = 60, refillPerSecond = 1) {
    if (!this.tokenBuckets.has(providerId)) {
      this.tokenBuckets.set(providerId, new TokenBucket(capacity, refillPerSecond));
    }
    return this.tokenBuckets.get(providerId);
  }

  /**
   * Exponential backoff with Full Jitter (AWS Architecture recommendation)
   */
  recordRateLimit(providerId) {
    const failures = (this.failureCounts.get(providerId) || 0) + 1;
    this.failureCounts.set(providerId, failures);

    // Full jitter formula: sleep = rand(0, min(max_backoff, base * 2 ^ (failures - 1)))
    const exponentialLimit = Math.min(
      this.maxCooldownMs,
      this.baseCooldownMs * Math.pow(2, failures - 1)
    );
    const delayWithJitter = Math.floor(Math.random() * (exponentialLimit - this.baseCooldownMs + 1)) + this.baseCooldownMs;

    const unblockAt = Date.now() + delayWithJitter;
    this.rateLimitState.set(providerId, {
      blocked: true,
      failures,
      delayMs: delayWithJitter,
      unblockAt
    });

    return delayWithJitter;
  }

  /**
   * Records successful response to reset failure backoff
   */
  recordSuccess(providerId) {
    this.failureCounts.delete(providerId);
    this.rateLimitState.delete(providerId);
  }

  /**
   * Checks if provider is currently in cooldown or rate-limited
   */
  isProviderAvailable(providerId) {
    const state = this.rateLimitState.get(providerId);
    if (!state) return true;
    if (Date.now() >= state.unblockAt) {
      this.rateLimitState.delete(providerId);
      return true;
    }
    return false;
  }

  /**
   * Validates if a provider satisfies required capabilities.
   * Strict: returns FALSE if required capabilities are specified but provider metadata is missing.
   */
  validateCapabilities(provider, requiredCapabilities = []) {
    if (!requiredCapabilities || requiredCapabilities.length === 0) return true;
    if (!provider || !Array.isArray(provider.capabilities)) {
      return false; // Missing metadata cannot satisfy capabilities
    }
    for (const cap of requiredCapabilities) {
      if (!provider.capabilities.includes(cap)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Performs real HTTP/HTTPS health probe with 2.5s timeout
   */
  async checkProviderHealth(provider) {
    const id = provider.id || provider;
    const cached = this.healthCache.get(id);
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached.status;
    }

    if (!this.isProviderAvailable(id)) {
      const status = { healthy: false, reason: 'rate_limited_cooldown', providerId: id };
      this.healthCache.set(id, { timestamp: Date.now(), status });
      return status;
    }

    // If baseUrl is provided, issue a lightweight HTTP/HTTPS probe
    const baseUrl = provider.baseUrl || (typeof provider === 'object' ? provider.url : null);
    if (!baseUrl) {
      // Local CLI or mock provider
      const status = { healthy: true, latencyMs: 0, providerId: id };
      this.healthCache.set(id, { timestamp: Date.now(), status });
      return status;
    }

    try {
      const parsedUrl = new URL(baseUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      const startTime = Date.now();
      const status = await new Promise((resolve) => {
        const req = transport.request(
          parsedUrl,
          {
            method: 'HEAD',
            timeout: 2500,
            headers: { 'User-Agent': 'ASEF-ProviderManager/1.0' }
          },
          (res) => {
            const latencyMs = Date.now() - startTime;
            // Any response (even 401/404) indicates host is alive and reachable
            resolve({
              healthy: res.statusCode < 500,
              statusCode: res.statusCode,
              latencyMs,
              providerId: id
            });
          }
        );

        req.on('timeout', () => {
          req.destroy();
          resolve({ healthy: false, reason: 'timeout_breached', providerId: id });
        });

        req.on('error', (err) => {
          resolve({ healthy: false, reason: err.message, providerId: id });
        });

        req.end();
      });

      this.healthCache.set(id, { timestamp: Date.now(), status });
      return status;
    } catch (err) {
      const status = { healthy: false, reason: err.message, providerId: id };
      this.healthCache.set(id, { timestamp: Date.now(), status });
      return status;
    }
  }

  /**
   * Evaluates healthiest provider in the priority chain with availability and capability checks
   */
  async selectHealthyProvider(providers, requiredCapabilities = []) {
    for (const p of providers) {
      const id = p.id || p;
      if (!this.isProviderAvailable(id)) {
        continue;
      }
      if (typeof p === 'object' && !this.validateCapabilities(p, requiredCapabilities)) {
        continue;
      }
      const health = await this.checkProviderHealth(p);
      if (health.healthy) {
        return p;
      }
    }
    return null;
  }
}

module.exports = {
  ProviderManager,
  TokenBucket
};
