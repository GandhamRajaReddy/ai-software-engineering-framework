const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { generateSlug, isValidSlug, sanitizeUrl } = require('../src/slug');
const { LinkStore } = require('../src/store');
const { createToken, verifyToken, authenticateCredentials, checkTokenRateLimit } = require('../src/auth');
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

test('Link Store: Link creation, collision prevention, and cached destination lookup', async () => {
  const localStore = new LinkStore();
  await localStore.init();

  // Create link
  const link = await localStore.createLink({
    url: 'https://news.ycombinator.com',
    customSlug: 'my-hackernews',
    tenantId: 'tenant-alpha'
  });
  assert.strictEqual(link.slug, 'my-hackernews');
  assert.strictEqual(link.destinationUrl, 'https://news.ycombinator.com/');

  // Collision prevention
  await assert.rejects(async () => {
    await localStore.createLink({
      url: 'https://other-site.com',
      customSlug: 'my-hackernews',
      tenantId: 'tenant-alpha'
    });
  }, /already exists/);

  // Cross-tenant collision prevention
  await assert.rejects(async () => {
    await localStore.createLink({
      url: 'https://other-site.com',
      customSlug: 'my-hackernews',
      tenantId: 'tenant-beta'
    });
  }, /already registered/);

  // Destination retrieval
  const dest = await localStore.getDestination('my-hackernews');
  assert.strictEqual(dest, 'https://news.ycombinator.com/');
});

test('Telemetry: Click tracking and GDPR hashed IP analytics', async () => {
  const localStore = new LinkStore();
  await localStore.init();

  await localStore.createLink({
    url: 'https://stripe.com',
    customSlug: 'stripe-ref',
    tenantId: 'tenant-stripe'
  });

  // Record clicks from two different IPs
  await localStore.recordClick('stripe-ref', { ip: '198.51.100.1', userAgent: 'Mozilla/5.0', referer: 'https://twitter.com' });
  await localStore.recordClick('stripe-ref', { ip: '198.51.100.1', userAgent: 'Mozilla/5.0', referer: 'https://twitter.com' });
  await localStore.recordClick('stripe-ref', { ip: '203.0.113.5', userAgent: 'Chrome/120', referer: 'https://linkedin.com' });

  const analytics = await localStore.getAnalytics('stripe-ref', 'tenant-stripe');
  assert.strictEqual(analytics.totalClicks, 3);
  assert.strictEqual(analytics.uniqueVisitors, 2);
  assert.strictEqual(analytics.referrers['https://twitter.com'], 2);
  assert.strictEqual(analytics.referrers['https://linkedin.com'], 1);
});

test('Security & Cryptography: Strict JWT Claims, Algorithm Enforcement & Rate Limiting', () => {
  // 1. Valid token passes
  const validToken = createToken({ tenantId: 'tenant-a', userId: 'user-a' });
  const verified = verifyToken(validToken);
  assert.strictEqual(verified.tenantId, 'tenant-a');
  assert.strictEqual(verified.sub, 'user-a');
  assert.strictEqual(typeof verified.exp, 'number');

  // 2. Reject non-numeric exp claim
  const now = Math.floor(Date.now() / 1000);
  const crypto = require('crypto');
  const { JWT_SECRET } = require('../src/auth');

  const b64H = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const badExpPayload = { iss: 'swiftlink-auth', aud: 'swiftlink-api', iat: now, tenantId: 'tenant-a' }; // missing exp
  const b64P = Buffer.from(JSON.stringify(badExpPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${b64H}.${b64P}`).digest('base64url');
  assert.throws(() => verifyToken(`${b64H}.${b64P}.${sig}`), /missing or invalid numeric expiration/);

  // 3. Reject unsupported algorithm 'none'
  const noneH = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const noneSig = crypto.createHmac('sha256', JWT_SECRET).update(`${noneH}.${b64P}`).digest('base64url');
  assert.throws(() => verifyToken(`${noneH}.${b64P}.${noneSig}`), /Unsupported token algorithm/);

  // 4. Rate limiter allows normal traffic and blocks floods
  const testIp = '198.51.100.99';
  const initial = checkTokenRateLimit(testIp, 5, 10000);
  assert.strictEqual(initial.allowed, true);
  for (let i = 0; i < 4; i++) checkTokenRateLimit(testIp, 5, 10000);
  const throttled = checkTokenRateLimit(testIp, 5, 10000);
  assert.strictEqual(throttled.allowed, false);
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
    const normalizedHeaders = { host: 'localhost:3000' };
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }
    req.headers = normalizedHeaders;
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

test('Authentication & Tenant Boundary: Tokens, Spoofing Defense & Isolation', async () => {
  // 1. Unauthenticated requests to protected endpoints return 401
  const unauthRes = await makeRequest(server, {
    method: 'POST',
    url: '/api/links',
    body: { url: 'https://example.com' }
  });
  assert.strictEqual(unauthRes.status, 401);
  const unauthData = await unauthRes.json();
  assert.match(unauthData.error, /Authentication required/);

  // 2. Reject unauthenticated/unknown tenant token request
  const badAuthRes = await makeRequest(server, {
    method: 'POST',
    url: '/api/auth/token',
    body: { tenantId: 'unknown-intruder-tenant', userId: 'attacker' }
  });
  assert.strictEqual(badAuthRes.status, 401);

  // 3. Obtain token for Tenant A
  const tokenARes = await makeRequest(server, {
    method: 'POST',
    url: '/api/auth/token',
    body: { tenantId: 'tenant-a', userId: 'alice', apiKey: 'tenant-a-secret-key-12345' }
  });
  assert.strictEqual(tokenARes.status, 200);
  const tokenAData = await tokenARes.json();
  assert.strictEqual(tokenAData.tenantId, 'tenant-a');
  const tokenA = tokenAData.token;

  // 4. Obtain token for Tenant B
  const tokenBRes = await makeRequest(server, {
    method: 'POST',
    url: '/api/auth/token',
    body: { tenantId: 'tenant-b', userId: 'bob', apiKey: 'tenant-b-secret-key-67890' }
  });
  assert.strictEqual(tokenBRes.status, 200);
  const tokenB = (await tokenBRes.json()).token;

  // 5. Create link as Tenant A
  const acmeSlug = 'acme-portal-' + Math.random().toString(36).slice(2, 8);
  const createRes = await makeRequest(server, {
    method: 'POST',
    url: '/api/links',
    headers: { 'Authorization': `Bearer ${tokenA}` },
    body: { url: 'https://acme.org/internal', customSlug: acmeSlug }
  });
  assert.strictEqual(createRes.status, 201);
  const createdLink = await createRes.json();
  assert.strictEqual(createdLink.tenantId, 'tenant-a');

  // 6. Tenant Spoofing Attempt: User with Token A supplies X-Tenant-ID: tenant-b -> Rejected 403
  const spoofRes = await makeRequest(server, {
    method: 'POST',
    url: '/api/links',
    headers: {
      'Authorization': `Bearer ${tokenA}`,
      'X-Tenant-ID': 'tenant-b'
    },
    body: { url: 'https://acme.org/spoof', customSlug: 'acme-spoof-' + Math.random().toString(36).slice(2, 8) }
  });
  assert.strictEqual(spoofRes.status, 403);
  assert.match((await spoofRes.json()).error, /Tenant identity spoofing detected/);

  // 7. Tenant B cannot see Tenant A's links in GET /api/links
  const listBRes = await makeRequest(server, {
    method: 'GET',
    url: '/api/links',
    headers: { 'Authorization': `Bearer ${tokenB}` }
  });
  assert.strictEqual(listBRes.status, 200);
  const linksB = await listBRes.json();
  assert.ok(linksB.every(l => l.slug !== acmeSlug));

  // 8. Tenant B cannot see Tenant A's analytics
  const analyticsBRes = await makeRequest(server, {
    method: 'GET',
    url: `/api/analytics/${acmeSlug}`,
    headers: { 'Authorization': `Bearer ${tokenB}` }
  });
  assert.strictEqual(analyticsBRes.status, 404);
});

test('E2E HTTP Server: Endpoints, Public 302 Redirect, and Health Check', async () => {
  const dynamicSlug = 'fastapi-docs-' + Math.random().toString(36).slice(2, 8);

  // 1. Health & readiness checks (public)
  const healthRes = await makeRequest(server, { method: 'GET', url: '/api/healthz' });
  assert.strictEqual(healthRes.status, 200);
  assert.strictEqual((await healthRes.json()).status, 'ok');

  const readyRes = await makeRequest(server, { method: 'GET', url: '/api/readyz' });
  assert.strictEqual(readyRes.status, 200);
  assert.strictEqual((await readyRes.json()).ready, true);

  // 2. Issue valid token
  const token = createToken({ tenantId: 'ci-tenant', userId: 'ci-user' });

  // 3. Create link via POST /api/links with Bearer token
  const createRes = await makeRequest(server, {
    method: 'POST',
    url: '/api/links',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: { url: 'https://fastapi.tiangolo.com', customSlug: dynamicSlug }
  });
  assert.strictEqual(createRes.status, 201);
  const linkData = await createRes.json();
  assert.strictEqual(linkData.slug, dynamicSlug);
  assert.strictEqual(linkData.tenantId, 'ci-tenant');

  // 4. Follow public redirect /s/:slug (no auth required)
  const redirectRes = await makeRequest(server, { method: 'GET', url: `/s/${dynamicSlug}` });
  assert.strictEqual(redirectRes.status, 302);
  assert.strictEqual(redirectRes.headers.get('location'), 'https://fastapi.tiangolo.com/');

  // 5. Verify analytics updated under authenticated tenant
  const analyticsRes = await makeRequest(server, {
    method: 'GET',
    url: `/api/analytics/${dynamicSlug}`,
    headers: { 'authorization': `Bearer ${token}` }
  });
  assert.strictEqual(analyticsRes.status, 200);
  const analyticsData = await analyticsRes.json();
  assert.strictEqual(analyticsData.totalClicks, 1);
});
