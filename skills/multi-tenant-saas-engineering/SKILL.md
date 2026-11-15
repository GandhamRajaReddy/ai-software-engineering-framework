---
name: multi-tenant-saas-engineering
description: Multi-tenant SaaS engineering: Pooled vs siloed tenancy models, PostgreSQL Row-Level Security (RLS), per-tenant rate limits, noisy-neighbor mitigation, tenant lifecycle provisioning, and cross-tenant access prevention. Use when building multi-tenant SaaS backends, isolation boundaries, or per-tenant metering.
metadata:
  origin: ASEF
---

# Multi-Tenant SaaS Engineering

Architectural strategies, data isolation boundaries, and noisy-neighbor mitigations for SaaS platforms.

## Tenancy Isolation Models

| Model | Isolation Level | Blast Radius | Infrastructure Cost | Operational Complexity |
|:------|:---------------:|:------------:|:-------------------:|:----------------------:|
| **Silo (Database-per-Tenant)** | Highest | Isolated to 1 tenant | Very High | High (Hundreds of DB migrations) |
| **Bridge (Schema-per-Tenant)** | High | Namespace level | Moderate | Moderate |
| **Pool (Shared DB, Discriminator Column)** | Logical | Shared | Lowest | Lowest (Requires strict query scoping) |

---

## PostgreSQL Row-Level Security (RLS) Pattern

In pooled tenancy architectures, application bugs can easily omit `WHERE tenant_id = :id` filters. Enforce tenant isolation at the database kernel level with PostgreSQL RLS:

```sql
-- 1. Enable RLS on multi-tenant table
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- 2. Define policy tied to connection session variable
CREATE POLICY tenant_isolation_policy ON documents
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 3. Application sets session variable on every checkout from connection pool
SET LOCAL app.current_tenant_id = 'c4b5744b-7038-4e89-a292-0b299e9842a2';
```

---

## Noisy Neighbor Mitigation & Per-Tenant Throttling

Prevent single large tenants from monopolizing shared backend compute and queue worker bandwidth:

```python
import redis

class MultiTenantRateLimiter:
    def __init__(self, redis_client):
        self.redis = redis_client

    def allow_request(self, tenant_id: str, plan_tier: str) -> bool:
        limit_map = {"free": 60, "pro": 1000, "enterprise": 10000}
        max_requests = limit_map.get(plan_tier, 60)

        key = f"ratelimit:{tenant_id}:{int(time.time() // 60)}"
        current = self.redis.incr(key)
        if current == 1:
            self.redis.expire(key, 65)

        return current <= max_requests
```

---

## Multi-Tenant Review Checklist

- [ ] Tenancy model (Silo vs Bridge vs Pool) explicitly documented with rationale.
- [ ] In pooled models, Row-Level Security (RLS) or mandatory base query filtering enforced.
- [ ] Per-tenant rate limits and queue concurrency caps prevent noisy neighbors.
- [ ] Tenant onboarding and offboarding (complete data purge) automated and tested.
- [ ] Cross-tenant access attack vectors tested in automated security regression suite.
