# SwiftLink Enterprise

High-Performance, Privacy-First URL Infrastructure and Base62 Redirection Service.

## Overview
SwiftLink Enterprise is an ultra-low-latency URL shortening and click telemetry platform designed with multi-tenant isolation, cryptographic Base62 generation, and privacy-preserving GDPR-compliant analytics.

## Features
- **Sub-5ms Hot Redirects:** In-memory LRU caching layer for hot URL paths.
- **Base62 Cryptographic Routing:** Non-sequential 7-character Base62 slugs with collision resistance.
- **SSRF Hardening:** Strict scheme validation blocking loopbacks, metadata services, and non-HTTP protocols.
- **GDPR Analytics:** Client IPs are salted and hashed with HMAC-SHA256, preserving privacy while delivering unique visitor metrics.
- **Production Container:** Hardened multi-stage Alpine Docker container running as unprivileged user `node`.

## Getting Started

### Local Development
```bash
# Run test suite
npm test

# Start service
npm start
```

### Docker Deployment
```bash
docker compose up -d
```
