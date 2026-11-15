---
name: async-background-processing
description: Asynchronous background processing, message queues, and worker architectures. Covers Celery, BullMQ, Temporal, and Asynq, queue topologies, worker concurrency, idempotency keys, exponential backoff with full jitter, and Dead Letter Queues (DLQs). Use when offloading slow tasks, designing event-driven workflows, or scaling background workers.
metadata:
  origin: ASEF
---

# Asynchronous Background Processing & Worker Architecture

Production-grade patterns for background job queues, distributed workers, and durable task execution.

## When to Activate

- Offloading slow operations (email sending, report generation, video processing, AI inference) from the request-response cycle
- Designing resilient worker pools (Celery, BullMQ, Temporal, Asynq)
- Guaranteeing idempotency for at-least-once message delivery
- Implementing exponential backoff with full jitter for retries
- Routing poison-pill and failed tasks to Dead Letter Queues (DLQ)
- Managing periodic cron jobs and task schedules

---

## 1. Core Architecture

```text
[ Client / Web API ] 
         │ (Push task + Idempotency Key)
         ▼
 ┌───────────────┐
 │ Message Broker│ (Redis / RabbitMQ / AWS SQS / Kafka)
 └───────┬───────┘
         │ (Pull / Prefetch)
 ┌───────▼───────┐      Success
 │ Worker Pool   │ ────────────────► [ Database / S3 / Cache ]
 └───────┬───────┘
         │ Max Retries Exceeded
         ▼
 ┌───────────────┐
 │   DLQ (Dead   │ ────────────────► [ Alerting: Slack / PagerDuty ]
 │ Letter Queue) │
 └───────────────┘
```

---

## 2. Idempotency Pattern

Because distributed message brokers provide **at-least-once** delivery, tasks may be delivered multiple times. Every worker must be strictly idempotent.

```typescript
// Idempotent Job Execution with Redis Distributed Lock
async function processPaymentJob(job: { id: string; idempotencyKey: string; amount: number; userId: string }) {
  const lockKey = `lock:payment:${job.idempotencyKey}`;
  const processedKey = `processed:payment:${job.idempotencyKey}`;

  // 1. Check if already processed
  const alreadyProcessed = await redis.get(processedKey);
  if (alreadyProcessed) {
    console.info(`Task ${job.idempotencyKey} already processed. Skipping.`);
    return JSON.parse(alreadyProcessed);
  }

  // 2. Acquire short-lived processing lock (prevent concurrent duplicate processing)
  const acquired = await redis.set(lockKey, 'locked', 'PX', 30000, 'NX');
  if (!acquired) {
    throw new Error('Concurrent task execution in progress, retry later');
  }

  try {
    // 3. Execute business logic within database transaction
    const result = await db.$transaction(async (tx) => {
      return await paymentGateway.charge(job.userId, job.amount);
    });

    // 4. Record successful execution with 7-day TTL
    await redis.set(processedKey, JSON.stringify(result), 'EX', 7 * 86400);
    return result;
  } finally {
    await redis.del(lockKey);
  }
}
```

---

## 3. Retry Strategy: Exponential Backoff with Full Jitter

Fixed delay retries cause the **thundering herd problem** when a downstream service recovers. Always use exponential backoff with full jitter.

$$\text{sleep} = \text{random}(0, \min(\text{max\_backoff}, \text{base} \times 2^{\text{attempt}}))$$

```python
import random
import time

def calculate_backoff(attempt: int, base: float = 1.0, max_backoff: float = 60.0) -> float:
    # Exponential calculation
    temp = min(max_backoff, base * (2 ** attempt))
    # Full jitter: random between 0 and temp
    sleep_duration = random.uniform(0, temp)
    return sleep_duration
```

---

## 4. BullMQ (Node.js / TypeScript) Standard Setup

```typescript
import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null // Required by BullMQ
});

// Queue configuration
export const emailQueue = new Queue('emails', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000 // 2s, 4s, 8s, 16s...
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: false // Keep failed jobs for DLQ inspection
  }
});

// Worker with prefetch tuning
export const emailWorker = new Worker(
  'emails',
  async (job) => {
    await sendTransactionalEmail(job.data.to, job.data.subject, job.data.body);
  },
  {
    connection,
    concurrency: 10 // Tune based on network/CPU limits
  }
);
```

---

## 5. Celery (Python) Production Settings

```python
# settings.py / celery.py
CELERY_BROKER_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

# Critical settings for reliability:
CELERY_TASK_ACKS_LATE = True            # Only acknowledge after task completes
CELERY_WORKER_PREFETCH_MULTIPLIER = 1   # Prevent worker from hoarding tasks
CELERY_TASK_TIME_LIMIT = 600            # Hard timeout: 10 minutes
CELERY_TASK_SOFT_TIME_LIMIT = 540       # Soft timeout: 9 minutes (allows cleanup)
CELERY_TASK_DEFAULT_RETRY_DELAY = 5
CELERY_TASK_MAX_RETRIES = 3

@app.task(bind=True, max_retries=3)
def process_report(self, report_id: str):
    try:
        generate_report(report_id)
    except RecoverableExternalError as exc:
        # Retry with exponential backoff
        countdown = 2 ** self.request.retries * 5
        raise self.retry(exc=exc, countdown=countdown)
```
