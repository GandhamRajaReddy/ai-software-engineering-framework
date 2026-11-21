const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { generateSlug, isValidSlug, sanitizeUrl } = require('../src/slug');
const { LinkStore } = require('../src/store');
const { server, store } = require('../server');

test('Slug Engine: Base62 generation produces unguessable valid slugs', () => {
  const slugs = new Set();
  for (let i = 0; i < 100; i++) {
    const s = generateSlug(7);
    assert.strictEqual(s.length, 7);
    assert.strictEqual(isValidSlug(s), true);
    slugs.add(s);
  }
  assert.strictEqual(slugs.size, 100, 'All 100 generated slugs should be unique');

  // Format validation
  assert.strictEqual(isValidSlug('valid-slug_123'), true);
  assert.strictEqual(isValidSlug('ab'), false, 'Too short');
  assert.strictEqual(isValidSlug('invalid slug with spaces'), false);
  assert.strictEqual(isValidSlug('slug$with*bad#chars'), false);
});

test('Security: URL Sanitizer allows legitimate HTTP/HTTPS and blocks SSRF/bad protocols', () => {
  // Valid URLs
  assert.strictEqual(sanitizeUrl('https://github.com/torvalds/linux'), 'https://github.com/torvalds/linux');
  assert.strictEqual(sanitizeUrl('http://example.org/path?q=1'), 'http://example.org/path?q=1');

  // Blocked protocols
  assert.throws(() => sanitizeUrl('javascript:alert(1)'), /Forbidden protocol/);
  assert.throws(() => sanitizeUrl('data:text/html;base64,PHNjcmlwdD4='), /Forbidden protocol/);
  assert.throws(() => sanitizeUrl('file:///etc/passwd'), /Forbidden protocol/);

  // SSRF protection
  assert.throws(() => sanitizeUrl('http://localhost:8080/admin'), /Restricted destination hostname/);
  assert.throws(() => sanitizeUrl('http://127.0.0.1:3000/api'), /Restricted destination hostname/);
  assert.throws(() => sanitizeUrl('http://169.254.169.254/latest/meta-data/'), /Restricted destination hostname/);
});

test('Link Store: Link creation, collision prevention, and cached destination lookup', () => {
  const localStore = new LinkStore();

  // Create link
  const link = localStore.createLink({
    url: 'https://news.ycombinator.com',
    customSlug: 'my-hackernews',
    tenantId: 'tenant-alpha'
  });
  assert.strictEqual(link.slug, 'my-hackernews');
  assert.strictEqual(link.destinationUrl, 'https://news.ycombinator.com/');

  // Collision prevention
  assert.throws(() => {
    localStore.createLink({
      url: 'https://other-site.com',
      customSlug: 'my-hackernews',
      tenantId: 'tenant-alpha'
    });
  }, /already exists/);

  // Cross-tenant collision prevention
  assert.throws(() => {
    localStore.createLink({
      url: 'https://other-site.com',
      customSlug: 'my-hackernews',
      tenantId: 'tenant-beta'
    });
  }, /already registered/);

  // Destination retrieval
  const dest = localStore.getDestination('my-hackernews');
  assert.strictEqual(dest, 'https://news.ycombinator.com/');
});

test('Telemetry: Click tracking and GDPR hashed IP analytics', () => {
  const localStore = new LinkStore();
  localStore.createLink({
    url: 'https://stripe.com',
    customSlug: 'stripe-ref',
    tenantId: 'tenant-stripe'
  });

  // Record clicks from two different IPs
  localStore.recordClick('stripe-ref', { ip: '198.51.100.1', userAgent: 'Mozilla/5.0', referer: 'https://twitter.com' });
  localStore.recordClick('stripe-ref', { ip: '198.51.100.1', userAgent: 'Mozilla/5.0', referer: 'https://twitter.com' });
  localStore.recordClick('stripe-ref', { ip: '203.0.113.5', userAgent: 'Chrome/120', referer: 'https://linkedin.com' });

  const analytics = localStore.getAnalytics('stripe-ref', 'tenant-stripe');
  assert.strictEqual(analytics.totalClicks, 3);
  assert.strictEqual(analytics.uniqueVisitors, 2);
  assert.strictEqual(analytics.referrers['https://twitter.com'], 2);
  assert.strictEqual(analytics.referrers['https://linkedin.com'], 1);
});

function makeRequest(srv, { method = 'GET', url = '/', headers = {}, body = null } = {}) {
  return new Promise((resolve) => {
    const { EventEmitter } = require('events');
    const { Readable } = require('stream');

    const req = new Readable({
      read() {
        if (body) {
          this.push(typeof body === 'string' ? body : JSON.stringify(body));
        }
        this.push(null);
      }
    });
    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost:3000', ...headers };
    req.socket = { remoteAddress: '127.0.0.1' };

    let resBody = '';
    const resHeaders = {};
    let statusCode = 200;

    const res = new EventEmitter();
    res.setHeader = (k, v) => { resHeaders[k.toLowerCase()] = v; };
    res.getHeader = (k) => resHeaders[k.toLowerCase()];
    res.writeHead = (code, headersObj = {}) => {
      statusCode = code;
      if (headersObj) {
        for (const [k, v] of Object.entries(headersObj)) {
          resHeaders[k.toLowerCase()] = v;
        }
      }
    };
    res.write = (chunk) => { if (chunk) resBody += chunk.toString(); };
    res.end = (chunk) => {
      if (chunk) resBody += chunk.toString();
      resolve({
        status: statusCode,
        headers: { get: (k) => resHeaders[k.toLowerCase()] },
        text: async () => resBody,
        json: async () => JSON.parse(resBody || '{}')
      });
    };

    srv.emit('request', req, res);
  });
}

test('E2E HTTP Server: Endpoints, 302 Redirect, and Health Check', async () => {
  const dynamicSlug = 'fastapi-docs-' + Math.random().toString(36).slice(2, 8);

  // 1. Health check
  const healthRes = await makeRequest(server, { method: 'GET', url: '/api/healthz' });
  assert.strictEqual(healthRes.status, 200);
  const healthData = await healthRes.json();
  assert.strictEqual(healthData.status, 'ok');

  // 2. Create link via POST /api/links
  const createRes = await makeRequest(server, {
    method: 'POST',
    url: '/api/links',
    headers: { 'content-type': 'application/json', 'x-tenant-id': 'e2e-tenant' },
    body: { url: 'https://fastapi.tiangolo.com', customSlug: dynamicSlug }
  });
  assert.strictEqual(createRes.status, 201);
  const linkData = await createRes.json();
  assert.strictEqual(linkData.slug, dynamicSlug);

  // 3. Follow redirect /s/:slug
  const redirectRes = await makeRequest(server, { method: 'GET', url: `/s/${dynamicSlug}` });
  assert.strictEqual(redirectRes.status, 302);
  assert.strictEqual(redirectRes.headers.get('location'), 'https://fastapi.tiangolo.com/');

  // 4. Verify analytics updated
  const analyticsRes = await makeRequest(server, {
    method: 'GET',
    url: `/api/analytics/${dynamicSlug}`,
    headers: { 'x-tenant-id': 'e2e-tenant' }
  });
  assert.strictEqual(analyticsRes.status, 200);
  const analyticsData = await analyticsRes.json();
  assert.strictEqual(analyticsData.totalClicks, 1);
});
