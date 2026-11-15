---
name: backend-reliability-engineering
description: Production backend reliability engineering: Service Level Objectives (SLOs), Service Level Indicators (SLIs), error budgets, multi-window burn-rate alerting, circuit breakers, bulkheads, graceful degradation, failover topologies, and RTO/RPO targets. Use when designing high-availability systems, fault-tolerant architectures, or reliability policies.
metadata:
  origin: ASEF
---

# Backend Reliability Engineering

Architectural patterns, operational telemetry, and resilience protocols for mission-critical, high-availability backend services.

## Core Reliability Foundations

Reliability is not the absence of failure; it is the ability to operate continuously and recover automatically when components inevitably fail.

### SLIs, SLOs, and Error Budgets

1. **Service Level Indicator (SLI)**: A quantifiable metric measuring service performance from the user's perspective (e.g., ratio of successful HTTP requests with latency < 200ms).
2. **Service Level Objective (SLO)**: The target reliability agreed upon by product and engineering (e.g., 99.9% valid requests succeed over a rolling 30-day window).
3. **Error Budget**: The allowable unreliability ($1.0 - \text{SLO}$). For a 99.9% SLO, the service can fail up to 0.1% of the time ($\approx 43.8$ minutes per month).

$$\text{Error Budget Consumed} = \frac{\text{Failed Requests}}{\text{Total Requests} \times (1 - \text{SLO})}$$

### Google SRE Multi-Window Multi-Burn-Rate Alerts

Never alert solely on instant spike percentages. Use multi-window burn-rate alerts to detect both rapid catastrophic failures and slow budget drains:

| Alert Tier | Burn Rate | % Budget Consumed | Short Window | Long Window | Notification Target |
|:-----------|:---------:|:-----------------:|:------------:|:-----------:|:--------------------|
| **Page (Critical)** | $14.4\times$ | 2% in 1 hour | 2 minutes | 1 hour | PagerDuty (Immediate On-Call) |
| **Page (High)** | $6.0\times$ | 5% in 6 hours | 15 minutes | 6 hours | PagerDuty |
| **Ticket (Medium)**| $1.0\times$ | 10% in 3 days | 1 hour | 3 days | Next Business Day Queue |

---

## Fault Tolerance & Resilience Patterns

### 1. Circuit Breakers with Exponential Backoff

Prevent cascading failures by halting calls to an unstable downstream dependency:

```python
import time
from enum import Enum
import threading

class CircuitState(Enum):
    CLOSED = "CLOSED"     # Normal operation
    OPEN = "OPEN"         # Fast fail; do not call dependency
    HALF_OPEN = "HALF_OPEN" # Canary probe

class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 30.0):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.state = CircuitState.CLOSED
        self.last_state_change = time.time()
        self._lock = threading.Lock()

    def can_execute(self) -> bool:
        with self._lock:
            now = time.time()
            if self.state == CircuitState.OPEN:
                if now - self.last_state_change >= self.recovery_timeout:
                    self.state = CircuitState.HALF_OPEN
                    self.last_state_change = now
                    return True
                return False
            return True

    def record_success(self):
        with self._lock:
            self.failure_count = 0
            self.state = CircuitState.CLOSED

    def record_failure(self):
        with self._lock:
            self.failure_count += 1
            if self.failure_count >= self.failure_threshold:
                self.state = CircuitState.OPEN
                self.last_state_change = time.time()
```

### 2. Bulkhead Isolation

Isolate resources (thread pools, connection pools, memory) so failure in one subsystem cannot exhaust global capacity.

```python
from concurrent.futures import ThreadPoolExecutor
from fastapi import HTTPException

# Separate dedicated pools for critical path vs non-critical background jobs
checkout_executor = ThreadPoolExecutor(max_workers=20, thread_name_prefix="checkout_pool")
reporting_executor = ThreadPoolExecutor(max_workers=5, thread_name_prefix="reporting_pool")

def execute_checkout_task(task_func, *args):
    # Reject immediately if queue is saturated to protect thread pool
    if checkout_executor._work_queue.qsize() > 50:
        raise HTTPException(status_code=503, detail="Checkout capacity saturated. Try again shortly.")
    return checkout_executor.submit(task_func, *args)
```

### 3. Graceful Degradation & Load Shedding

When CPU or database latency breaches safe thresholds:
1. Drop or shed low-priority background requests (e.g. recommendation widgets, analytics sync).
2. Return cached or default static responses instead of throwing 500 errors.
3. Emit `Retry-After` headers to throttle incoming traffic.

---

## High Availability & Failover Topologies

### Active-Active vs Active-Passive

| Topology | Recovery Time Objective (RTO) | Recovery Point Objective (RPO) | Operational Complexity | Cost |
|:---------|:-----------------------------:|:------------------------------:|:----------------------:|:----:|
| **Active-Passive (Warm Standby)** | Minutes (< 5m) | Low (< 1m via streaming rep) | Moderate | $1.5\times$ |
| **Active-Active (Multi-Region)** | Seconds (< 10s) | Near Zero ($0$ within quorum) | High (Conflict resolution) | $2.5\times$ |

### RTO & RPO Definitions

- **RTO (Recovery Time Objective)**: The maximum tolerable duration of system downtime before service is restored.
- **RPO (Recovery Point Objective)**: The maximum tolerable period of data loss measured in time (e.g. data lost between the last replicated transaction and failure).

---

## Reliability Verification Checklist

- [ ] Every user-facing endpoint has an explicit SLI and SLO definition.
- [ ] Multi-window burn-rate alerts configured; instant spike alerts eliminated.
- [ ] Circuit breakers wrap all external HTTP/gRPC network calls.
- [ ] Bulkhead thread and connection pools isolate critical operations from background tasks.
- [ ] RTO and RPO targets documented and validated through automated disaster recovery rehearsals.
- [ ] Load shedding and graceful degradation paths tested under simulated saturation.
