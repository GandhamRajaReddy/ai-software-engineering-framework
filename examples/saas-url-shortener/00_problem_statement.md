# Problem Statement: Enterprise SaaS URL Shortener & Analytics

> **Project Name:** SwiftLink Enterprise  
> **Status:** APPROVED

---

## 1. Executive Summary
- **Business Friction:** Marketing teams and developers need a high-performance, branded link-shortening service with real-time geo-analytics, custom domains, and strict privacy compliance. Commercial alternatives charge exorbitant enterprise rates and sell consumer click telemetry.
- **Value Proposition:** Self-hosted or managed micro-SaaS providing sub-50ms redirect latencies, tamper-proof click analytics, zero external tracking cookies, and multi-tenant custom domain routing.
- **Target Audience:** Digital marketers, technical founders, and enterprise DevOps teams.

---

## 2. Scope Boundaries
### In-Scope (Phase 1 MVP):
- Custom short slug generation and vanity domain mapping.
- Sub-50ms redirect via HTTP 301/302.
- Aggregated click counts and geographic referrers (anonymized IP hashing).
- JWT-authenticated dashboard for link management.

### Out-of-Scope (Non-Goals):
- Complex A/B split URL routing (Deferred to Phase 2).
- Native iOS/Android mobile apps (Mobile web responsive only).

---

## 3. Engineering Constraints
- **Redirect Latency:** p99 < 50ms under 2,000 concurrent RPS.
- **SEO & Social Previews:** Public link preview cards (OpenGraph / Twitter Cards) must render server-side.
- **Data Integrity:** Strict ACID compliance for user accounts and link ownership (no orphan analytics).
- **Target Budget:** Capable of running on a single $5/month Docker instance or free-tier cloud hosting.
