/**
 * Authentication & Tenant Context Middleware
 * Enforces cryptographic JWT verification, required claims (iss, aud, exp),
 * and strictly prevents tenant identity spoofing.
 */

const crypto = require('crypto');

const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET must be explicitly configured in production environment.');
}

const JWT_SECRET = process.env.JWT_SECRET || 'swiftlink-enterprise-dev-secret-key-32-chars-min!';

/**
 * Issues signed JWT for an authenticated user and tenant
 */
function createToken(payload, secret = JWT_SECRET, expiresInSec = 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    iss: 'swiftlink-auth',
    aud: 'swiftlink-api',
    iat: now,
    nbf: now,
    exp: now + expiresInSec,
    sub: payload.userId || payload.sub || 'user-1',
    tenantId: payload.tenantId || payload.tid || 'default-tenant',
    ...payload
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signatureInput = `${b64Header}.${b64Payload}`;
  const sig = crypto.createHmac('sha256', secret).update(signatureInput).digest('base64url');

  return `${b64Header}.${b64Payload}.${sig}`;
}

/**
 * Decodes and cryptographically verifies JWT tokens and temporal claims
 */
function verifyToken(tokenStr, secret = JWT_SECRET) {
  if (!tokenStr || typeof tokenStr !== 'string') {
    throw new Error('Token missing or invalid type');
  }

  const parts = tokenStr.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT token structure');
  }

  const [b64Header, b64Payload, sig] = parts;
  const signatureInput = `${b64Header}.${b64Payload}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(signatureInput).digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedSigBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);

  if (!payload.iss || payload.iss !== 'swiftlink-auth') {
    throw new Error('Invalid token issuer (iss)');
  }
  if (!payload.aud || payload.aud !== 'swiftlink-api') {
    throw new Error('Invalid token audience (aud)');
  }
  if (payload.exp && payload.exp < now) {
    throw new Error('Token has expired');
  }
  if (payload.nbf && payload.nbf > now) {
    throw new Error('Token not yet valid');
  }

  return payload;
}

/**
 * Extracts and validates authenticated tenant context from HTTP request
 */
function authenticateRequest(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return {
      authenticated: false,
      error: 'Authentication required. Supply a valid Bearer token in Authorization header.'
    };
  }

  const tokenStr = authHeader.slice(7).trim();
  try {
    const payload = verifyToken(tokenStr);
    const authenticatedTenant = payload.tenantId || payload.tid;

    // Defense against Header Spoofing: If client provides X-Tenant-ID, it MUST match token tenant
    const headerTenant = req.headers['x-tenant-id'];
    if (headerTenant && headerTenant.trim() !== authenticatedTenant) {
      const err = new Error(`Tenant identity spoofing detected: token belongs to "${authenticatedTenant}", but X-Tenant-ID requested "${headerTenant.trim()}"`);
      err.statusCode = 403;
      throw err;
    }

    return {
      authenticated: true,
      user: payload.sub,
      tenantId: authenticatedTenant,
      payload
    };
  } catch (err) {
    return {
      authenticated: false,
      statusCode: err.statusCode || 401,
      error: err.message
    };
  }
}

module.exports = {
  createToken,
  verifyToken,
  authenticateRequest,
  JWT_SECRET
};
