---
name: async-background-processing
description: Asynchronous background processing, message queues, and worker architectures. Covers Celery, BullMQ, Temporal, Asynq, retry budgets, poison-message quarantine, Dead Letter Queue (DLQ) recovery, FIFO ordering, idempotency, and Transactional Outbox recovery. Use when offloading slow tasks or scaling background workers.
metadata:
  origin: ASEF
---

# Asynchronous Background Processing & Worker Reliability

Production-grade patterns for background job queues, distributed workers, durable task execution, and failure recovery.

## When to Activate

- Offloading slow operations (email, PDF generation, AI inference, webhooks) from the request cycle
- Implementing retry budgets to prevent cascading failure storms
- Isolating and quarantining poison messages without blocking queue partitions
- Building DLQ inspection, remediation, and replay pipelines
- Guaranteeing strict FIFO ordering per customer/entity
- Implementing Transactional Outbox sweepers and failure recovery

---

## 1. Retry Budgets & Failure Storm Protection

Retrying every failed job infinitely when a downstream service is down causes a **Retry Storm** that crashes the downstream service as soon as it recovers.

### Retry Budget Invariants
1. **Max Retry Limit:** Hard limit of 3 to 5 retries per task.
2. **Global Retry Budget:** The worker fleet allocates at most **10% of total worker throughput** to retrying failed tasks. If retries exceed 10%, fail immediately to the DLQ.
3. **Exponential Backoff with Full Jitter:**
   $$\text{sleep} = \text{random}(0, \min(\text{max\_backoff}, \text{base} \times 2^{\text{attempt}}))$$

```python
import random

def get_backoff_delay(attempt: int, base: float = 1.0, max_backoff: float = 60.0) -> float:
    # Full jitter avoids synchronized reconnection bursts
    temp = min(max_backoff, base * (2 ** attempt))
    return random.uniform(0, temp)
```

---

## 2. Poison Message Quarantine & DLQ Replay

A **Poison Message** is a task that triggers an unrecoverable bug (e.g. malformed JSON, schema violation, divide by zero). Retrying a poison message simply burns worker CPU and clogs the queue.

### Poison Message Handling Strategy
1. **Non-Retryable Exceptions:** Immediately catch `ValidationError`, `JSONDecodeError`, `InvalidPayloadError` and route directly to Dead Letter Queue (`removeOnFail: false` in BullMQ).
2. **DLQ Replay Tooling:** Provide an administrative script or CLI to safely inspect and replay dead-lettered jobs after code deployment.

```typescript
// BullMQ DLQ Inspection & Replay Script
import { Queue } from 'bullmq';

async function replayFailedJobs(queueName: string, maxJobs = 100) {
  const queue = new Queue(queueName, { connection: redisConnection });
  const failedJobs = await queue.getFailed(0, maxJobs);

  console.info(`Found ${failedJobs.length} failed jobs in queue: ${queueName}`);
  for (const job of failedJobs) {
    console.info(`Replaying job ${job.id} (Error: ${job.failedReason})`);
    await job.retry(); // Re-queues job to active queue
  }
}
```

---

## 3. Strict FIFO Message Ordering (Partition Keys)

When tasks must execute in strict chronological sequence (e.g. Account Created $\to$ Deposit $\to$ Withdrawal), random concurrent worker pull creates race conditions.

### Message Group / Partition Key Rule
- Assign a **Partition Key** (`customerId` or `accountId`).
- Tasks with the same partition key are strictly sequenced and processed by a single worker thread at a time.
- Tasks with different partition keys execute concurrently in parallel across the fleet.

```typescript
// AWS SQS FIFO or BullMQ Grouping
await queue.add('processTransaction', payload, {
  jobId: `tx-${transactionId}`, // Idempotent deduplication ID
  lifo: false
});
```

---

## 4. Transactional Outbox Failure Recovery & Orphan Sweeper

When using the Transactional Outbox pattern, a publisher process might crash after reading outbox rows but before committing them to Kafka/RabbitMQ.

### Outbox Sweeper Job (PostgreSQL)
Run a dedicated lightweight background sweeper every 30 seconds to republish abandoned events:

```sql
-- Fetch unpublished events or events locked > 2 minutes ago
SELECT id, aggregate_type, aggregate_id, event_type, payload
FROM outbox_events
WHERE published_at IS NULL 
  AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '2 minutes')
ORDER BY created_at ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

Once published to the broker, mark `published_at = NOW()`.
