---
name: distributed-systems-reliability
description: Distributed systems reliability patterns covering Transactional Outbox/Inbox, Saga orchestrators, distributed idempotency keys, FIFO message ordering, bulkhead fault isolation, circuit breakers, and exponential backoff with full jitter. Use when designing resilient microservices, preventing dual-write corruption, or implementing distributed transactions.
metadata:
  origin: ASEF
---

# Distributed Systems Reliability Patterns

Production patterns for fault-tolerant microservices, resilient event pipelines, and distributed consistency.

## When to Activate

- Preventing dual-write database and message queue inconsistencies
- Implementing multi-service distributed transactions (Saga pattern)
- Guaranteeing idempotent message handling with at-least-once delivery
- Preventing cascading system failures with Circuit Breakers and Bulkheads
- Handling deadlocks, timeouts, and network partitions gracefully

---

## 1. The Dual-Write Problem & Transactional Outbox

### Dual-Write Anti-Pattern (VULNERABLE)
Writing to a database and publishing an event to a message broker in two separate operations is inherently broken. If the broker crashes or network drops after the DB commit, the event is permanently lost, causing data desynchronization.

### Transactional Outbox Pattern (SAFE)
Save the domain state update and the outgoing event into the **same relational database transaction**. A separate publisher process reads the `outbox` table and safely forwards messages to the broker.

```sql
-- Relational Schema
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    customer_id UUID NOT NULL,
    total NUMERIC(10, 2) NOT NULL,
    status VARCHAR(32) NOT NULL
);

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ NULL
);
```

### Atomic Commit Example (TypeScript / Drizzle / Prisma)

```typescript
await db.transaction(async (tx) => {
  // 1. Mutate domain state
  const order = await tx.orders.create({
    data: { id: orderId, customerId, total, status: 'CREATED' }
  });

  // 2. Insert event into outbox in the SAME transaction
  await tx.outboxEvents.create({
    data: {
      aggregateType: 'Order',
      aggregateId: orderId,
      eventType: 'OrderCreated',
      payload: { orderId, customerId, total }
    }
  });
});
// DB transaction guarantees both or neither succeed
```

---

## 2. Distributed Transactions: Saga Pattern

In microservices, avoid 2-phase commits (2PC) which lock database rows across services. Use a **Saga** with explicit compensating transactions.

```text
[ Order Service ] ──Create Order──► [ Inventory Service ] ──Deduct Stock──► [ Payment Service ]
        ▲                                   │                                    │
        │                             Stock Empty?                         Charge Failed?
        │                             (Abort Saga)                         (Compensate!)
        └─────── Compensate: Cancel Order ◄─┴──────── Compensate: Restore Stock ─┘
```

1. **Forward Steps:** `CreateOrder` $\to$ `ReserveStock` $\to$ `ProcessPayment`.
2. **Compensating Steps:** If `ProcessPayment` fails, orchestrator triggers `ReleaseStock` $\to$ `MarkOrderFailed`.
3. Every step and compensation MUST be strictly idempotent.

---

## 3. Circuit Breakers & Fault Isolation (Bulkheads)

Prevent a failing downstream service from exhausting the connection pool and crashing your service.

```typescript
class SimpleCircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private threshold = 5,
    private resetTimeoutMs = 15000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit Breaker OPEN: Downstream service unavailable');
      }
    }

    try {
      const result = await fn();
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
      }
      return result;
    } catch (err) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      if (this.failureCount >= this.threshold) {
        this.state = 'OPEN';
      }
      throw err;
    }
  }
}
```
