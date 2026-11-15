---
name: backend-performance-engineering
description: Backend performance engineering covering load testing (k6, Locust), database query execution plan analysis (EXPLAIN ANALYZE), latency percentiles (p95/p99), CPU and heap profiling, connection pool saturation tuning, and cache stampede prevention. Use when benchmarking APIs, tuning slow queries, or resolving high-throughput latency bottlenecks.
metadata:
  origin: ASEF
---

# Backend Performance Engineering & Load Profiling

Production standards for identifying, benchmarking, and eliminating performance bottlenecks across CPU, memory, database I/O, and network layers.

## When to Activate

- Designing load tests and measuring throughput under peak stress (RPS)
- Analyzing database query plans (`EXPLAIN (ANALYZE, BUFFERS)`)
- Profiling memory leaks and CPU hotspots (Node.js, Go, Python)
- Establishing latency budgets (p50 $\le$ 20ms, p95 $\le$ 100ms, p99 $\le$ 250ms)
- Preventing cache stampedes with mutexes or probabilistic early expiration

---

## 1. Load Testing with k6

Never deploy backend updates without validating throughput against target concurrency.

```javascript
// load-test.js (Run with: k6 run --vus 50 --duration 30s load-test.js)
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 20 },  // Ramp up
    { duration: '30s', target: 100 }, // Steady state stress
    { duration: '10s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<150', 'p(99)<300'], // 95% of requests < 150ms
    http_req_failed: ['rate<0.01'],                 // Error rate < 1%
  },
};

export default function () {
  const res = http.get('http://localhost:8080/api/v1/orders/healthz');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'latency under 200ms': (r) => r.timings.duration < 200,
  });
  sleep(0.1);
}
```

---

## 2. PostgreSQL Query Plan Analysis (`EXPLAIN ANALYZE`)

When a query takes > 50ms, run `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)`:

### Red Flags in Query Plans
1. **Seq Scan (Sequential Scan):** Entire table read from disk. Missing index on filtered column.
2. **Sort Method: external merge Disk:** Sort memory exceeded `work_mem`. Spilled to disk, 10x slower.
3. **Hash Join with High Inner Rows:** High memory usage; consider index on join key.
4. **Buffers: read > 1000:** Excessive disk I/O; query is not cache-resident.

```sql
-- Safe diagnostic query:
EXPLAIN (ANALYZE, BUFFERS)
SELECT customer_id, SUM(total)
FROM orders
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY customer_id
ORDER BY SUM(total) DESC
LIMIT 10;
```

---

## 3. Cache Stampede Prevention (Mutex & XFetch)

When a hot cache key expires under high concurrency (e.g. 5,000 requests/second), hundreds of threads hit the database simultaneously to rebuild it, causing cascading DB failure.

### Solution 1: Distributed Lock (Mutex)
Only the first request acquires the lock and queries the DB; other requests wait or return stale cache.

### Solution 2: Probabilistic Early Expiration (XFetch Algorithm)

$$\text{should\_refresh} = -\beta \times \delta \times \ln(\text{random}()) > (\text{expiry} - \text{now})$$

```typescript
// Probabilistic Early Refresh
function shouldRefreshEarly(expiryMs: number, computeDurationMs: number, beta = 1.0): boolean {
  const timeRemainingMs = expiryMs - Date.now();
  const randomFactor = Math.log(Math.random());
  return -(computeDurationMs * beta * randomFactor) > timeRemainingMs;
}
```
