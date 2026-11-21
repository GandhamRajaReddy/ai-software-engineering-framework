/**
 * SwiftLink Enterprise - Main Application HTTP Server
 * High-performance, zero-external-dependency Node.js production service.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { LinkStore } = require('./src/store');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const dataFilePath = process.env.SWIFTLINK_DATA_FILE || (process.env.NODE_ENV === 'test' ? null : path.join(__dirname, '.data', 'swiftlink-store.json'));
const store = new LinkStore({ dataFile: dataFilePath });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method;

  // Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID');

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
    res.end(JSON.stringify({ ready: true, storage: 'in-memory-cached', version: '1.0.0' }));
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

  // 3. API: Create Short Link
  if (method === 'POST' && pathname === '/api/links') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 65536) { // 64KB max payload
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
        const link = store.createLink({
          url: payload.url,
          customSlug: payload.customSlug,
          tenantId
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

  // 4. API: List Links
  if (method === 'GET' && pathname === '/api/links') {
    const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
    const links = store.listLinks(tenantId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(links));
    return;
  }

  // 5. API: Analytics for a Slug
  if (method === 'GET' && pathname.startsWith('/api/analytics/')) {
    const slug = pathname.replace('/api/analytics/', '').trim();
    const tenantId = req.headers['x-tenant-id'] || null;
    const analytics = store.getAnalytics(slug, tenantId);

    if (!analytics) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `No analytics found for slug '${slug}'` }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(analytics));
    return;
  }

  // 6. Fast Redirect Route (/s/:slug or /:slug)
  let redirectSlug = null;
  if (pathname.startsWith('/s/')) {
    redirectSlug = pathname.slice(3).trim();
  } else if (pathname.length > 1 && !pathname.includes('.') && !pathname.startsWith('/api/')) {
    redirectSlug = pathname.slice(1).trim();
  }

  if (method === 'GET' && redirectSlug) {
    const destination = store.getDestination(redirectSlug);
    if (destination) {
      // Record click telemetry asynchronously
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || '';
      const referer = req.headers['referer'] || '';
      store.recordClick(redirectSlug, { ip: clientIp, userAgent, referer });

      // Immediate 302 Redirect
      res.writeHead(302, {
        'Location': destination,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate'
      });
      res.end();
      return;
    }
  }

  // 7. Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint or short link not found', path: pathname }));
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`🚀 SwiftLink Enterprise running at http://${HOST}:${PORT}`);
  });
}

module.exports = { server, store };
