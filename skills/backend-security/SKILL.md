---
name: backend-security
description: Production backend security architecture covering OWASP API Security Top 10, JWT/OAuth2 authentication, RBAC/ABAC authorization, SQL and NoSQL injection prevention, SSRF defense, rate limiting, and secret management. Use when designing authentication, securing endpoints, or conducting backend security audits.
metadata:
  origin: ASEF
---

# Backend Security Engineering

Production-grade security standards and patterns for backend services, APIs, and data access layers.

## When to Activate

- Designing authentication, session handling, or token verification
- Implementing authorization (RBAC, ABAC, multi-tenant data isolation)
- Protecting endpoints against injection (SQL, NoSQL, command injection)
- Preventing Server-Side Request Forgery (SSRF) when fetching external URLs
- Adding rate limiting, brute-force mitigation, and DDoS shields
- Conducting code audits against the OWASP API Security Top 10

---

## 1. OWASP API Security Top 10 Checklist

| Vulnerability | Core Defense |
|---------------|--------------|
| **API1: Broken Object Level Authorization (BOLA)** | Validate user ownership on every record query: `WHERE id = :id AND org_id = :user_org_id`. Never rely solely on record ID from URL. |
| **API2: Broken Authentication** | Use short-lived JWTs (15 min) + secure refresh tokens in `HttpOnly, Secure, SameSite=Strict` cookies. Use argon2id or bcrypt (cost >= 12). |
| **API3: Broken Object Property Level Auth** | Strictly whitelist incoming payload fields (Pydantic `extra='forbid'`, Zod `.strict()`). Never mass-assign request bodies directly to DB models. |
| **API4: Unrestricted Resource Consumption** | Enforce pagination limits (max page size 100), request payload limits (max 1MB JSON), and distributed rate limiting via Redis. |
| **API5: Broken Function Level Authorization (BFLA)** | Enforce role/permission checks at the route guard/controller level before business logic executes. |
| **API6: Unrestricted Access to Sensitive Business Flows** | Protect login, password reset, checkout, and coupon redemption with CAPTCHA or proof-of-work and tight rate limits. |
| **API7: Server-Side Request Forgery (SSRF)** | Parse and validate target IP addresses against private and cloud metadata CIDR blocks (127.0.0.1, 169.254.169.254, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16). |
| **API8: Security Misconfiguration** | Disable debug mode in production. Strip internal stack traces from error responses. Set HSTS, CSP, and X-Content-Type-Options headers. |
| **API9: Improper Inventory Management** | Version APIs explicitly (`/v1/`). Deprecate and decommission old versions promptly; never leave unmonitored debug endpoints open. |
| **API10: Unsafe Consumption of APIs** | Validate and sanitize all responses received from third-party APIs as untrusted input. |

---

## 2. Authentication & Token Architecture

### JWT Handling Rules
1. **Never store access tokens in `localStorage` or `sessionStorage`** (vulnerable to XSS).
2. Store tokens in `HttpOnly`, `Secure`, `SameSite=Strict` (or `Lax`) cookies.
3. Sign JWTs using asymmetric cryptography (**RS256** or **Ed25519**) in distributed microservices so worker services only need the public key to verify.
4. Set short access token TTLs (15 minutes). Use a rotating refresh token stored in a database or Redis with a revoked tokens blocklist.

```typescript
// Secure Cookie Configuration Example
res.cookie('access_token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 15 * 60 * 1000, // 15 minutes
  path: '/'
});
```

---

## 3. Multi-Tenant Authorization & BOLA Defense

Never query resources by primary key alone when the resource belongs to an account or tenant.

```python
# VULNERABLE: Broken Object Level Authorization
@router.get("/documents/{doc_id}")
async def get_document(doc_id: str, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, doc_id)
    return doc

# SECURE: Explicit Tenant/User Ownership Enforcement
@router.get("/documents/{doc_id}")
async def get_document(
    doc_id: str, 
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Document).where(
        Document.id == doc_id,
        Document.tenant_id == current_user.tenant_id  # Grounded in authenticated token
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc
```

---

## 4. Injection Defenses

### Parameterized Queries (SQL)
Never concatenate or format strings into raw SQL queries.

```typescript
// VULNERABLE:
const query = `SELECT * FROM accounts WHERE email = '${inputEmail}'`;

// SECURE: Parameterized Query
const result = await pool.query(
  'SELECT id, email, hashed_password FROM accounts WHERE email = $1',
  [inputEmail]
);
```

### NoSQL Injection Defense (MongoDB)
Ensure query objects cannot be poisoned by JSON query operators like `{"$gt": ""}`.

```javascript
// VULNERABLE: Direct body insertion allows { username: { $gt: "" } }
db.users.findOne({ username: req.body.username });

// SECURE: Enforce string type check via Zod / sanitization
const username = String(req.body.username);
db.users.findOne({ username: { $eq: username } });
```

---

## 5. SSRF Defense (Server-Side Request Forgery)

When accepting a URL from a client to fetch or scrape, validate the resolved IP against blocked IP ranges before initiating the socket connection:

```python
import ipaddress
import socket
from urllib.parse import urlparse

BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.169.254/32"), # AWS/GCP metadata service
    ipaddress.ip_network("::1/128"),
]

def validate_safe_url(target_url: str) -> bool:
    parsed = urlparse(target_url)
    if parsed.scheme not in ("http", "https"):
        return False
    
    hostname = parsed.hostname
    if not hostname:
        return False

    # Resolve IP addresses
    resolved_ips = socket.getaddrinfo(hostname, None)
    for family, _, _, _, sockaddr in resolved_ips:
        ip = ipaddress.ip_address(sockaddr[0])
        for blocked in BLOCKED_NETWORKS:
            if ip in blocked:
                raise ValueError(f"SSRF violation: target IP {ip} is within restricted network {blocked}")
    return True
```

---

## 6. Rate Limiting & Abuse Prevention

Use Redis-backed sliding window or token bucket rate limiting for sensitive endpoints:

```typescript
// Key naming pattern:
const rateLimitKey = `rate_limit:${endpoint}:${clientIp}`;

// Tiered Limits:
// - Public endpoints: 100 req/min
// - Authenticated API: 1,000 req/min
// - /auth/login: 5 attempts/15 min
// - Password reset: 3 attempts/hour
```
