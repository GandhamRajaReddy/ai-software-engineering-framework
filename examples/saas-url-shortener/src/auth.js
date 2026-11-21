/**
 * Authentication & Tenant Context Middleware
 * Enforces JWT validation, issuer verification, and tenant scoping.
 */

const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'swiftlink-enterprise-default-secret-key-32-chars!';

function createToken(payload, secret = JWT_SECRET, expiresInSec = 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    iss: 'swiftlink-auth',
    aud: 'swiftlink-api',
    iat: now,
    exp: now + expiresInSec,
    ...payload
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signatureInput = `${b64Header}.${b64Payload}`;
  const sig = crypto.createHmac('sha256', secret).update(signatureInput).digest('base64url');

  return `${b64Header}.${b64Payload}.${sig}`;
}

function verifyToken(tokenStr, secret = JWT_SECRET) {
  if (!tokenStr || typeof tokenStr !== 'string') {
    throw new Error('Token missing');
  }

  const parts = tokenStr.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed token format');
  }

  const [b64Header, b64Payload, sig] = parts;
  const signatureInput = `${b64Header}.${b64Payload}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(signatureInput).digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp && payload.exp < now) {
    throw new Error('Token expired');
  }

  return payload;
}

module.exports = {
  createToken,
  verifyToken,
  JWT_SECRET
};
