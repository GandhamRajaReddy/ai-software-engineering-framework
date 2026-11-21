/**
 * SwiftLink Enterprise - Main Application HTTP Server
 * High-performance, authenticated, multi-tenant Node.js production service.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { LinkStore } = require('./src/store');
const {
  authenticateRequest,
  createToken,
  authenticateCredentials,
  checkTokenRateLimit
} = require('./src/auth');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const dataFilePath = process.env.SWIFTLINK_DATA_FILE || (process.env.NODE_ENV === 'test' ? null : path.join(__dirname, '.data', 'swiftlink-store.json'));
const store = new LinkStore({ dataFile: dataFilePath });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method;

  // Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Hardened CORS: Avoid wildcard in production
  const allowedOrigin = process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? 'https://swiftlink.app' : '*');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID, X-API-Key');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Health & Readiness Checks
  if (method === 'GET' && (pathname === '/api/healthz' || pathname === '/healthz')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }));
    return;
  }

  if (method === 'GET' && (pathname === '/api/readyz' || pathname === '/readyz')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const storageMode = process.env.DATABASE_URL ? 'postgresql-connected' : 'in-memory-cached';
    res.end(JSON.stringify({ ready: true, storage: storageMode, version: '1.0.0' }));
    return;
  }

  // 2. Static Dashboard Web UI
  if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(htmlPath)) {
      const content = fs.readFileSync(htmlPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
      return;
    }
  }

  // 3. API: Authenticated Token Issuance (Credentials / API-Key Verified)
  if (method === 'POST' && pathname === '/api/auth/token') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const rateLimit = checkTokenRateLimit(clientIp);
    if (!rateLimit.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(rateLimit.resetInSeconds || 60) });
      res.end(JSON.stringify({ error: `Rate limit exceeded. Try again in ${rateLimit.resetInSeconds} seconds.` }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const tenantId = (payload.tenantId || payload.tid || '').trim();
        const userId = (payload.userId || payload.sub || 'user-1').trim();
        const apiKey = payload.apiKey || payload.clientSecret || req.headers['x-api-key'] || '';

        const authResult = authenticateCredentials({ tenantId, userId, apiKey });
        if (!authResult.authenticated) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: authResult.error }));
          return;
        }

        const token = createToken({
          userId: authResult.userId,
          tenantId: authResult.tenantId,
          roles: authResult.roles
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          token,
          tokenType: 'Bearer',
          expiresIn: 3600,
          tenantId: authResult.tenantId,
          userId: authResult.userId
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON request body' }));
      }
    });
    return;
  }

  // 4. API: Create Short Link (Authenticated & Tenant Scoped)
  if (method === 'POST' && pathname === '/api/links') {
    const auth = authenticateRequest(req);
    if (!auth.authenticated) {
      res.writeHead(auth.statusCode || 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: auth.error }));
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 65536) { // 64KB max payload
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
      }
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        // Tenant identity is strictly derived from the authenticated token
        const link = await store.createLink({
          url: payload.url,
          customSlug: payload.customSlug,
          tenantId: auth.tenantId,
          createdBy: auth.user
        });

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(link));
      } catch (err) {
        const status = err.message.includes('already exists') || err.message.includes('already registered') ? 409 : 400;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 5. API: List Links (Authenticated & Tenant Scoped)
  if (method === 'GET' && pathname === '/api/links') {
    const auth = authenticateRequest(req);
    if (!auth.authenticated) {
      res.writeHead(auth.statusCode || 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: auth.error }));
      return;
    }

    try {
      const links = await store.listLinks(auth.tenantId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(links));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 6. API: Analytics for a Slug (Authenticated & Tenant Scoped)
  if (method === 'GET' && pathname.startsWith('/api/analytics/')) {
    const auth = authenticateRequest(req);
    if (!auth.authenticated) {
      res.writeHead(auth.statusCode || 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: auth.error }));
      return;
    }

    const slug = pathname.replace('/api/analytics/', '').trim();
    try {
      const analytics = await store.getAnalytics(slug, auth.tenantId);

      if (!analytics) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `No analytics found for slug '${slug}' under your tenant` }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(analytics));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 7. Fast Public Redirect Route (/s/:slug or /:slug)
  let redirectSlug = null;
  if (pathname.startsWith('/s/')) {
    redirectSlug = pathname.slice(3).trim();
  } else if (pathname.length > 1 && !pathname.includes('.') && !pathname.startsWith('/api/')) {
    redirectSlug = pathname.slice(1).trim();
  }

  if (method === 'GET' && redirectSlug) {
    try {
      const destination = await store.getDestination(redirectSlug);
      if (destination) {
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        const userAgent = req.headers['user-agent'] || '';
        const referer = req.headers['referer'] || '';
        await store.recordClick(redirectSlug, { ip: clientIp, userAgent, referer });

        // Immediate 302 Redirect
        res.writeHead(302, {
          'Location': destination,
          'Cache-Control': 'private, no-cache, no-store, must-revalidate'
        });
        res.end();
        return;
      }
    } catch (err) {
      // Fall through to 404
    }
  }

  // 8. Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint or short link not found', path: pathname }));
});

async function startServer(port = PORT, host = HOST) {
  await store.init();
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`🚀 SwiftLink Enterprise running at http://${host}:${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

if (require.main === module) {
  startServer(PORT, HOST).catch(err => {
    console.error('FATAL:', err.message);
    process.exit(1);
  });
}

module.exports = { server, store, startServer };
