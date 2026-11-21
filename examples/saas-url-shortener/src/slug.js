/**
 * Base62 Cryptographic Slug Engine & URL Sanitizer
 * Implements collision-resistant Base62 generation and SSRF-hardened destination URL parsing.
 */

const crypto = require('crypto');

const BASE62_CHARSET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SLUG_REGEX = /^[0-9a-zA-Z_-]{3,32}$/;

/**
 * Generates an unguessable 7-character Base62 slug
 */
function generateSlug(length = 7) {
  const bytes = crypto.randomBytes(length);
  let slug = '';
  for (let i = 0; i < length; i++) {
    slug += BASE62_CHARSET[bytes[i] % 62];
  }
  return slug;
}

/**
 * Validates slug format and length
 */
function isValidSlug(slug) {
  if (typeof slug !== 'string') return false;
  const trimmed = slug.trim();
  if (trimmed.length < 3 || trimmed.length > 32) return false;
  return SLUG_REGEX.test(trimmed);
}

/**
 * Sanitizes and validates incoming destination URLs against SSRF & malicious schemes
 */
function sanitizeUrl(rawUrl) {
  if (typeof rawUrl !== 'string') {
    throw new Error('Destination URL must be a string');
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Destination URL cannot be empty');
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (e) {
    throw new Error(`Invalid destination URL format: ${e.message}`);
  }

  // Enforce HTTP / HTTPS scheme strictly
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Forbidden protocol '${parsed.protocol}'. Only 'http:' and 'https:' are permitted.`);
  }

  // SSRF Protection: Block localhost, loopbacks, and metadata IPs
  const hostname = parsed.hostname.toLowerCase();
  const forbiddenHosts = ['localhost', '127.0.0.1', '::1', '0.0.0.0', '169.254.169.254'];
  if (forbiddenHosts.includes(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error(`Restricted destination hostname '${hostname}' (SSRF prevention).`);
  }

  return parsed.toString();
}

module.exports = {
  generateSlug,
  isValidSlug,
  sanitizeUrl,
  BASE62_CHARSET
};
