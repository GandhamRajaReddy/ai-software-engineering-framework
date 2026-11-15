---
name: identity-access-engineering
description: Production identity and access management: OAuth2/OIDC with PKCE, JWT token lifecycle and rotation, RBAC/ABAC authorization engines, mutual TLS (mTLS) service identity (SPIFFE/SPIRE), and tenant boundary isolation. Use when designing authentication systems, security boundaries, or zero-trust access control.
metadata:
  origin: ASEF
---

# Identity & Access Engineering

Production-grade protocols for authentication, cryptographic token lifecycle, fine-grained authorization, and zero-trust service identity.

## Authentication Architectures

### OAuth 2.1 & OpenID Connect (OIDC) with PKCE

For all user-facing clients (Single Page Apps, Mobile, Web), enforce Authorization Code Flow with Proof Key for Code Exchange (PKCE) to eliminate authorization code interception attacks:

```
Client                     Auth Server (IdP)             Resource Server (API)
  │                               │                                │
  ├─ 1. Auth Req (code_challenge)─►│                                │
  │                               │                                │
  │◄─ 2. Auth Code ───────────────┤                                │
  │                               │                                │
  ├─ 3. Token Req (code_verifier)─►│                                │
  │                               │                                │
  │◄─ 4. Access + Refresh Token───┤                                │
  │                                                                │
  ├─ 5. API Call (Bearer Access Token)────────────────────────────►│
  │                                                                │
  │◄─ 6. Resource Response ────────────────────────────────────────┤
```

### JWT Token Lifecycle & Cryptographic Signing

1. **Algorithm**: Always use asymmetric signing (`RS256` or `EdDSA`/`ES256`). Never use symmetric `HS256` in distributed architectures to prevent leaking signing secrets to verifying services.
2. **Short-Lived Access Tokens**: Lifetime of 5–15 minutes.
3. **Refresh Token Rotation with Reuse Detection**: When a refresh token is exchanged, issue a new refresh token and invalidate the old one. If an already-used refresh token is presented, immediately revoke all tokens in the entire token family (compromise indicator).

```python
import jwt
import time
from typing import Dict, Any

class TokenManager:
    def __init__(self, private_key_pem: str, public_key_pem: str, issuer: str, audience: str):
        self.private_key = private_key_pem
        self.public_key = public_key_pem
        self.issuer = issuer
        self.audience = audience

    def issue_access_token(self, subject: str, tenant_id: str, roles: list[str]) -> str:
        now = int(time.time())
        payload = {
            "sub": subject,
            "iss": self.issuer,
            "aud": self.audience,
            "tid": tenant_id,
            "roles": roles,
            "iat": now,
            "exp": now + 900, # 15 minutes
        }
        return jwt.encode(payload, self.private_key, algorithm="RS256")

    def verify_token(self, token_str: str) -> Dict[str, Any]:
        return jwt.decode(
            token_str,
            self.public_key,
            algorithms=["RS256"],
            issuer=self.issuer,
            audience=self.audience,
            options={"require": ["exp", "iss", "aud", "sub", "tid"]}
        )
```

---

## Authorization Models: RBAC vs ABAC

### Role-Based Access Control (RBAC)

RBAC maps permissions to roles, and roles to users. Ideal for coarse-grained administrative models.

```python
ROLE_PERMISSIONS = {
    "admin": {"org:read", "org:write", "users:manage", "billing:read", "billing:write"},
    "member": {"org:read", "projects:create", "projects:read", "projects:write"},
    "viewer": {"org:read", "projects:read"},
}

def user_has_permission(user_roles: list[str], required_permission: str) -> bool:
    for role in user_roles:
        if required_permission in ROLE_PERMISSIONS.get(role, set()):
            return True
    return False
```

### Attribute-Based Access Control (ABAC)

ABAC evaluates dynamic runtime policies over subject, resource, action, and environment attributes:

```python
from dataclasses import dataclass

@dataclass
class AuthContext:
    user_id: str
    tenant_id: str
    roles: list[str]
    is_mfa_authenticated: bool

def authorize_document_edit(ctx: AuthContext, document) -> bool:
    # 1. Tenant boundary must strictly match
    if ctx.tenant_id != document.tenant_id:
        return False

    # 2. Document author can always edit
    if ctx.user_id == document.author_id:
        return True

    # 3. Editors require MFA if document is classified as restricted
    if "editor" in ctx.roles:
        if document.classification == "RESTRICTED" and not ctx.is_mfa_authenticated:
            return False
        return True

    return False
```

---

## Zero-Trust Service Identity (mTLS & SPIFFE/SPIRE)

In microservices architectures, perimeter network security is insufficient. Every service must cryptographically prove its identity:

1. **SPIFFE ID**: Standardized URI identifying workloads (e.g., `spiffe://prod.internal/ns/finance/sa/payment-service`).
2. **Mutual TLS (mTLS)**: Both client and server exchange X.509 SVID certificates during TLS handshake.
3. **Authorization Header**: Even with mTLS, downstream services must propagate the end-user JWT in the `Authorization` header to maintain user context.

---

## Identity Verification Checklist

- [ ] PKCE mandatory on all Authorization Code flows.
- [ ] Asymmetric signing (`RS256` or `EdDSA`) enforced on all JWTs.
- [ ] Access token TTL capped at 15 minutes.
- [ ] Refresh token rotation with immediate family revocation on reuse detection.
- [ ] Tenant ID (`tid`) validated on every single protected database query.
- [ ] Direct service-to-service communication authenticated via mTLS.
