---
name: backend-security
description: Production backend security architecture covering OWASP API Security Top 10, STRIDE threat modeling, multi-tenant authorization matrices, tenant boundary tests, SSRF DNS-rebinding defense, webhook replay protection, and zero-downtime secret rotation. Use when designing authentication, multi-tenant authorization, or auditing backend security.
metadata:
  origin: ASEF
---

# Backend Security Engineering & Hardening

Production-grade security standards and operational patterns for backend services, APIs, and data access layers.

## When to Activate

- Conducting STRIDE threat modeling on new features or API designs
- Defining role-based or attribute-based authorization matrices (RBAC/ABAC)
- Writing automated tenant-isolation boundary tests
- Mitigating SSRF with DNS-rebinding and private CIDR socket pinning
- Implementing webhook signature and replay defense
- Executing zero-downtime secret rotation protocols

---

## 1. STRIDE Threat Model Template

Before writing implementation code for sensitive features (auth, payments, data export, external webhooks), complete the STRIDE matrix:

| STRIDE Threat Category | Definition & Impact | Primary Engineering Defense | Verification Test |
|:-----------------------|:--------------------|:----------------------------|:------------------|
| **Spoofing** | Impersonating another user, service, or tenant | Asymmetric JWT (RS256) in `HttpOnly` cookies, mTLS for internal RPC | Auth forgery test with invalid/expired keys |
| **Tampering** | Altering in-transit requests or database rows | HMAC-SHA256 signatures, parameterized queries, Pydantic/Zod strict schema validation | Mutation test modifying payload bits |
| **Repudiation** | Denying performed financial or critical actions | Tamper-evident append-only audit log with `user_id`, `org_id`, `ip_address`, `timestamp` | Audit log generation assert test |
| **Information Disclosure** | Leaking sensitive data in responses or error logs | DTO response filtering (Pydantic `response_model`, Jackson `@JsonView`), PII masking | Snapshot test asserting no secrets in error JSON |
| **Denial of Service** | Exhausting memory, database connections, or CPU | Tiered Redis token bucket rate limiting, payload size limits (1MB), cursor pagination | Load test verifying 429 Too Many Requests |
| **Elevation of Privilege** | Normal user invoking admin endpoints or crossing tenants | Controller-level RBAC guards + database `WHERE org_id = current_user.org_id` | Cross-tenant access boundary test |

---

## 2. Multi-Tenant Authorization Matrix

Every backend entity must map to an explicit permission matrix:

| Role | Tenant Resources (`/org/:id/*`) | Billing Settings | Team Member Management | Read Public Feed |
|:-----|:--------------------------------|:-----------------|:-----------------------|:-----------------|
| **Owner / SuperAdmin** | Full CRUD | Full CRUD | Full CRUD | Read |
| **Org Admin** | Full CRUD | View Only | Invite / Remove Members | Read |
| **Member / Editor** | Create / Read / Update Own | Denied (403) | View Directory | Read |
| **Viewer / Auditor** | Read Only | Denied (403) | View Directory | Read |
| **Anonymous** | Denied (401) | Denied (401) | Denied (401) | Read |

---

## 3. Automated Tenant-Boundary Isolation Tests

Multi-tenant SaaS architectures must prove that Tenant A cannot access Tenant B's data, even if Tenant A knows the exact UUID of Tenant B's record.

### Python / FastAPI + pytest Tenant Isolation Test
```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_tenant_isolation_boundary_enforced(client: AsyncClient, db_session):
    # Setup Tenant Alpha and Tenant Beta
    tenant_alpha_token = create_test_jwt(tenant_id="tenant-alpha-123", user_id="user-a")
    tenant_beta_token = create_test_jwt(tenant_id="tenant-beta-456", user_id="user-b")

    # Tenant Alpha creates a private document
    create_res = await client.post(
        "/api/v1/documents",
        json={"title": "Alpha Confidential Q2 Strategy"},
        headers={"Authorization": f"Bearer {tenant_alpha_token}"}
    )
    assert create_res.status_code == 201
    doc_id = create_res.json()["data"]["id"]

    # 1. Tenant Beta attempts to READ Tenant Alpha's document -> MUST return 404 (Not 403, preventing ID enumeration)
    get_res = await client.get(
        f"/api/v1/documents/{doc_id}",
        headers={"Authorization": f"Bearer {tenant_beta_token}"}
    )
    assert get_res.status_code == 404, "Tenant boundary breached: foreign tenant could read document!"

    # 2. Tenant Beta attempts to UPDATE Tenant Alpha's document -> MUST return 404
    update_res = await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"title": "Hacked Title"},
        headers={"Authorization": f"Bearer {tenant_beta_token}"}
    )
    assert update_res.status_code == 404

    # 3. Tenant Beta attempts to DELETE Tenant Alpha's document -> MUST return 404
    delete_res = await client.delete(
        f"/api/v1/documents/{doc_id}",
        headers={"Authorization": f"Bearer {tenant_beta_token}"}
    )
    assert delete_res.status_code == 404
```

---

## 4. Advanced SSRF Defense (DNS Rebinding & Socket Pinning)

Naive URL validation that checks `urlparse(url).hostname` is vulnerable to **DNS Rebinding** (where an attacker's domain resolves to an external IP during validation, but returns `127.0.0.1` or `169.254.169.254` when the HTTP client initiates the connection).

### Robust Socket Pinning Protocol
1. Parse the hostname from the target URL.
2. Resolve DNS queries to IP addresses ahead of time.
3. Validate **all** resolved IPs against blocked private, loopback, and cloud metadata CIDR ranges.
4. Pin the socket directly to the validated IP, passing the original `Host` header for TLS SNI and virtual hosting.

```python
import ipaddress
import socket
import httpx

BLOCKED_CIDRS = [
    ipaddress.ip_network("127.0.0.0/8"),       # Loopback
    ipaddress.ip_network("10.0.0.0/8"),        # RFC 1918 Private
    ipaddress.ip_network("172.16.0.0/12"),     # RFC 1918 Private
    ipaddress.ip_network("192.168.0.0/16"),    # RFC 1918 Private
    ipaddress.ip_network("169.254.169.254/32"),# AWS/GCP Instance Metadata Service (IMDSv1/v2)
    ipaddress.ip_network("::1/128"),           # IPv6 Loopback
    ipaddress.ip_network("fc00::/7"),          # IPv6 Unique Local
]

def resolve_and_verify_safe_ip(hostname: str) -> str:
    addr_info = socket.getaddrinfo(hostname, None)
    if not addr_info:
        raise ValueError("DNS resolution failed")
    
    for _, _, _, _, sockaddr in addr_info:
        ip = ipaddress.ip_address(sockaddr[0])
        # Detect IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        
        for blocked in BLOCKED_CIDRS:
            if ip in blocked:
                raise PermissionError(f"SSRF Alert: IP address {ip} belongs to restricted network {blocked}")
    
    # Return the first safe resolved IP
    return addr_info[0][4][0]
```

---

## 5. Webhook Replay & Signature Protection

Incoming webhooks (e.g. Stripe, GitHub, Twilio) must be protected against replay attacks and forgery:

```typescript
import crypto from 'crypto';

export function verifyWebhookSignature(payloadRaw: string, signatureHeader: string, secret: string, toleranceSeconds = 300): boolean {
  // Format: t=1715000000,v1=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
  const parts = Object.fromEntries(signatureHeader.split(',').map(p => p.split('=')));
  const timestamp = parseInt(parts.t, 10);
  const signature = parts.v1;

  if (isNaN(timestamp) || !signature) {
    return false;
  }

  // 1. Replay Attack Prevention (Tolerance Window Check)
  const currentTimestamp = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTimestamp - timestamp) > toleranceSeconds) {
    throw new Error('Webhook replay rejected: timestamp outside allowable tolerance window');
  }

  // 2. Compute Expected HMAC
  const signedPayload = `${timestamp}.${payloadRaw}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // 3. Constant-Time Timing Attack Safe Equality Check
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(expectedSignature, 'utf8')
  );
}
```

---

## 6. Zero-Downtime Secrets Rotation Protocol

Never rotate production secrets (database passwords, JWT signing keys, encryption keys) with a single hard cutover. Use the **Dual-Key Grace Window**:

1. **Phase 1: Introduce New Key as Secondary:** Deploy new key `KEY_V2`. Services sign with `KEY_V1` and verify with `[KEY_V1, KEY_V2]`.
2. **Phase 2: Promote New Key to Primary Signer:** Services sign with `KEY_V2` and verify with `[KEY_V2, KEY_V1]`.
3. **Phase 3: Grace Window Expiration:** Wait for maximum token TTL (e.g., 24 hours).
4. **Phase 4: Decommission Old Key:** Remove `KEY_V1`. Services only accept `KEY_V2`.
