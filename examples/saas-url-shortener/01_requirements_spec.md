# Requirements Specification: SwiftLink Enterprise

> **Document ID:** SPEC-SWIFTLINK-001  
> **Status:** APPROVED

---

## 1. Functional Requirements Matrix (FRM)

### [REQ-001] User Authentication & Tenant Isolation (Priority: P0)
- **Actor:** Marketer / Developer
- **Description:** Users register and authenticate via email/password. Password hashed with Argon2id. Issues short-lived access JWT (15 min) and secure HTTP-only refresh token (7 days).
- **Acceptance Criteria:**
  - Valid credentials return HTTP 200 with JWT and user metadata.
  - Invalid credentials return HTTP 401 with generic "Invalid email or password".

### [REQ-002] Short Link Creation & Slug Collision Prevention (Priority: P0)
- **Actor:** Authenticated User
- **Description:** User submits a destination URL (must be valid HTTP/HTTPS). System generates a Base62 7-character slug or accepts an optional custom vanity slug.
- **Acceptance Criteria:**
  - Duplicate vanity slug on the same domain returns HTTP 409 Conflict.
  - Successfully generated link returns HTTP 201 with short URL and QR code.

### [REQ-003] Ultra-Low-Latency Redirect & Click Telemetry (Priority: P0)
- **Actor:** Anonymous Web Traffic
- **Description:** Incoming request to `GET /:slug` looks up destination in cache/database, increments click count asynchronously, hashes IP for privacy, and issues an immediate HTTP 302 redirect.
- **Acceptance Criteria:**
  - Response time p99 < 50ms.
  - Missing slug returns HTTP 404 with custom branded fallback page.

---

## 2. Non-Functional Requirements (NFR)

- **[NFR-PERF-01]:** Cache layer (Redis or in-memory LRU) ensures hot link lookups complete in < 5ms.
- **[NFR-SEC-01]:** OWASP Top 10 compliance: Strict CORS, Content-Security-Policy headers, rate-limiting (100 req/min per IP on creation endpoints).
- **[NFR-A11Y-01]:** Admin dashboard achieves 100% WCAG 2.1 AA keyboard and contrast compliance.
