---
name: backend-observability
description: Backend observability engineering covering structured JSON logging, correlation IDs, OpenTelemetry tracing, Prometheus RED & USE metrics, SLOs/Error Budgets, multi-window burn-rate alerts, cardinality limits, and incident runbooks. Use when implementing logging, metrics, tracing, alerts, or incident runbooks.
metadata:
  origin: ASEF
---

# Backend Observability & Incident Reliability

Production-grade observability architecture: structured logging, distributed tracing, metrics, SLO alert design, and incident triage.

## When to Activate

- Instrumenting services with Prometheus RED (Rate, Errors, Duration) and USE (Utilization, Saturation, Errors) metrics
- Defining Service Level Objectives (SLOs), Service Level Indicators (SLIs), and Error Budgets
- Implementing multi-window multi-burn-rate alerting rules
- Preventing metric store crashes by enforcing strict cardinality limits
- Writing operational incident response runbooks and triage checklists
- Propagating W3C Trace Context across distributed microservices

---

## 1. RED vs USE Metrics Framework

| Metric Framework | Target | Dimensions Measured | Primary Alert Triggers |
|:-----------------|:-------|:--------------------|:-----------------------|
| **RED Method** | Request-driven services (HTTP APIs, RPCs) | **R**ate (req/s), **E**rrors (5xx rate), **D**uration (latency p95/p99) | High 5xx rate, p99 latency breach |
| **USE Method** | Internal resources (CPUs, DB pools, Disks) | **U**tilization (% busy), **S**aturation (queue length), **E**rrors (hardware/driver faults) | Connection pool saturation > 85%, disk full |

---

## 2. SLOs & Error Budget Math

Never alert on arbitrary CPU thresholds. Alert when the **user experience** is degrading and consuming the service's **Error Budget**.

- **SLI (Service Level Indicator):** Proportion of successful requests:
  $$\text{SLI} = \frac{\text{Count of HTTP requests with status } < 500 \text{ and latency } \le 200\text{ms}}{\text{Total HTTP requests}}$$
- **SLO (Service Level Objective):** 99.9% over rolling 30 days.
- **Error Budget:** $100\% - 99.9\% = 0.1\%$ allowable bad events ($43.8\text{ minutes/month}$).

### Multi-Window Multi-Burn-Rate Alerting Rules (Google SRE Standard)

| Severity | Burn Rate | Budget Consumed | Short Window | Long Window | Action |
|:---------|:---------:|:---------------:|:------------:|:-----------:|:-------|
| **P1 - Page** | 14.4x | 2% in 1 hour | 5 minutes | 1 hour | PagerDuty immediately |
| **P2 - Page** | 6.0x | 5% in 6 hours | 30 minutes | 6 hours | PagerDuty during business hours |
| **P3 - Ticket** | 1.0x | 10% in 3 days | 2 hours | 3 days | File issue tracker ticket |

---

## 3. High Cardinality Rule (Prometheus Protection)

High cardinality occurs when a metric label contains an unbounded set of distinct values (e.g. user IDs, email addresses, order UUIDs). This causes Prometheus to explode in memory and crash.

```typescript
// ANTI-PATTERN: Fatal high cardinality in Prometheus
httpRequestsTotal.labels(req.method, req.path, userId).inc(); // CRASHES PROMETHEUS!

// SECURE PATTERN: Low cardinality bounded labels
httpRequestsTotal.labels(req.method, req.route.path, res.statusCode).inc();
// req.route.path is bounded: "/api/v1/orders/:id"
```

---

## 4. Production Incident Response Runbook

When an alert fires, follow the 4-phase incident triage protocol:

```text
 ┌──────────────────────────────┐
 │ 1. ASSESS & CLASSIFY (5 min) │ ──► Determine customer impact & severity (SEV-1 to SEV-3)
 └──────────────┬───────────────┘
                │
                ▼
 ┌──────────────────────────────┐
 │ 2. MITIGATE FIRST (10 min)   │ ──► DO NOT DEBUG ROOT CAUSE FIRST. Mitigate immediately:
 └──────────────┬───────────────┘     Rollback deployment, flip feature flag, scale replicas
                │
                ▼
 ┌──────────────────────────────┐
 │ 3. INVESTIGATE & RECOVER     │ ──► Trace correlation IDs, inspect error logs, verify health
 └──────────────┬───────────────┘
                │
                ▼
 ┌──────────────────────────────┐
 │ 4. BLAMELESS POSTMORTEM      │ ──► Timeline, root cause, preventative action items
 └──────────────────────────────┘
```
