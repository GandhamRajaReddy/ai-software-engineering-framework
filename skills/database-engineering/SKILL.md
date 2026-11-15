---
name: database-engineering
description: Production database engineering covering PostgreSQL, MySQL, and MongoDB. Schema design, normalization, indexing strategies, ANSI SQL isolation levels, MVCC concurrency, deadlock handling, replication lag mitigation, connection pool sizing, and backup restore drills. Use when designing schemas, tuning queries, or configuring database reliability.
metadata:
  origin: ASEF
---

# Database Engineering Patterns & Production Reliability

Production-grade database patterns for relational (PostgreSQL, MySQL) and document (MongoDB) databases.

## When to Activate

- Designing relational schemas or NoSQL document models
- Indexing query paths (compound indexes, partial indexes, covering indexes)
- Selecting transaction isolation levels (Read Committed, Repeatable Read, Serializable)
- Troubleshooting slow queries, lock contention, or transaction deadlocks
- Sizing and configuring database connection pools (PgBouncer, HikariCP)
- Mitigating read replica lag with read-your-own-writes sticky routing
- Establishing automated backup verification and disaster restore drills

---

## 1. Universal Database Principles

### Primary Key Selection

| Primary Key Type | Relational Storage | B-Tree Fragmentation | Distributed Generation | Recommendation |
|------------------|-------------------|----------------------|------------------------|----------------|
| `BIGINT AUTO_INCREMENT` / `BIGSERIAL` | 8 bytes | Minimal (append-only) | Requires central sequence | Default for single-node SQL |
| `UUIDv4` (Random) | 16 bytes / 36 chars | Severe B-Tree page splits | Yes | Avoid for clustered primary keys |
| `UUIDv7` (Time-ordered) | 16 bytes | Minimal (chronological) | Yes | Best modern distributed primary key |
| `ULID` | 16 bytes (Base32) | Minimal (chronological) | Yes | Great for human-readable time IDs |
| MongoDB `ObjectId` | 12 bytes | Minimal (time-prefixed) | Yes | Default for MongoDB `_id` |

### Connection Pool Sizing Math

Never set connection pool sizes arbitrarily. PostgreSQL and MySQL processes consume significant RAM per connection.

$$\text{Max Connections} = (\text{Core Count} \times 2) + \text{Effective Spindle Count}$$

- For SSDs/NVMe: A 4-core database server typically maxes out throughput at **10 to 20 connections**.
- Over-allocating connections (e.g. 500 connections) degrades performance due to OS context switching and cache thrashing.
- Use a connection pooler (**PgBouncer** for PostgreSQL, **ProxySQL** for MySQL) in `transaction` pooling mode for high concurrency.

---

## 2. ANSI SQL Isolation Levels & MVCC Concurrency

| Isolation Level | Dirty Read | Non-Repeatable Read | Phantom Read | Serialization Anomaly / Write Skew | Use Case |
|:----------------|:----------:|:-------------------:|:------------:|:----------------------------------:|:---------|
| **Read Committed** (Default in PG/MySQL) | Prevented | Allowed | Allowed | Allowed | Standard CRUD, web reads/writes |
| **Repeatable Read** | Prevented | Prevented | Prevented (PG MVCC) | Allowed (Write Skew possible) | End-of-month reporting, analytics snapshots |
| **Serializable** | Prevented | Prevented | Prevented | Prevented | Financial ledgers, double-spend prevention |

### Write Skew Anomaly Example (Why Repeatable Read is Not Enough)
If two doctors concurrently check if at least one doctor remains on call and both take off, both transactions pass under Repeatable Read, leaving zero doctors on call. **Serializable** or explicit row locking (`SELECT ... FOR UPDATE`) is required:

```sql
-- Explicit locking under Read Committed
BEGIN;
SELECT count(*) FROM on_call_doctors WHERE active = true FOR UPDATE;
-- Safe to update now
UPDATE on_call_doctors SET active = false WHERE doctor_id = 'doc-1';
COMMIT;
```

---

## 3. Deadlock Handling & Retry Loops

When two concurrent transactions update rows in opposite order (Tx1: Row A then Row B; Tx2: Row B then Row A), the engine detects a cycle and aborts one transaction with an error (`40P01` in Postgres, `1213` in MySQL).

```typescript
// Resilient Transaction Retry with Full Jitter
export async function withTransactionRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (err: any) {
      attempt++;
      const isDeadlock =
        err.code === '40P01' || // PostgreSQL deadlock_detected
        err.code === '40001' || // PostgreSQL serialization_failure
        err.code === 'ER_LOCK_DEADLOCK' || // MySQL
        err.errno === 1213;

      if (isDeadlock && attempt < maxAttempts) {
        // Exponential backoff with full jitter (e.g., 50ms, 100ms, 200ms + random jitter)
        const baseDelay = 50 * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * baseDelay);
        await new Promise((r) => setTimeout(r, baseDelay + jitter));
        continue;
      }
      throw err;
    }
  }
}
```

---

## 4. Replication Lag Mitigation (Read-Your-Own-Writes)

Asynchronous read replicas suffer replication lag (typically 10ms to several seconds). If a user creates a record and is immediately redirected to view it, reading from a lagging replica returns 404.

### Primary Sticky Window Pattern
After any mutation (POST/PUT/PATCH/DELETE), set a short-lived cookie or header instructing the gateway to route all reads for that user to the **Primary** database for 5 seconds:

```typescript
// Middleware example:
const userLastWriteTime = await redis.get(`last_write:${userId}`);
const isWithinLagWindow = userLastWriteTime && (Date.now() - parseInt(userLastWriteTime, 10)) < 5000;

const dbConnection = isWithinLagWindow || req.method !== 'GET'
  ? primaryDbPool
  : readReplicaPool;
```

---

## 5. Automated Backup Verification & Restore Drills

Having backups is meaningless without proving they can be successfully restored.

### SRE Backup Invariants
1. **Automated Verification:** Run a weekly scheduled CI/CD job that pulls the latest backup, restores it into an isolated ephemeral test container, runs schema migrations, and asserts data integrity.
2. **Checksum Verification:** Every backup file (`.sql.gz`, WAL archive) must store an accompanying SHA-256 checksum file.
3. **RPO / RTO Objectives:**
   - **RPO (Recovery Point Objective):** Max data loss window $\le 5$ minutes (achieved via WAL streaming).
   - **RTO (Recovery Time Objective):** Max downtime to full restore $\le 30$ minutes.
