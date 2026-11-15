---
name: database-engineering
description: Production database engineering covering PostgreSQL, MySQL, and MongoDB. Schema design, normalization, indexing strategies (B-Tree, GIN, BRIN, compound ESR rule), transaction isolation, deadlocks, connection pool tuning, and query optimization. Use when designing schemas, tuning queries, or choosing database patterns.
metadata:
  origin: ASEF
---

# Database Engineering Patterns & Practices

Production-grade database patterns for relational (PostgreSQL, MySQL) and document (MongoDB) databases.

## When to Activate

- Designing relational schemas or NoSQL document models
- Indexing query paths (compound indexes, partial indexes, covering indexes)
- Selecting primary keys (UUIDv7 vs ULID vs BigInt Auto-increment)
- Troubleshooting slow queries, lock contention, or transaction deadlocks
- Sizing and configuring database connection pools
- Handling concurrency with optimistic locking or `SELECT ... FOR UPDATE`

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

## 2. PostgreSQL Patterns

### Schema & Data Types

| Use Case | Correct Type | Avoid | Reason |
|----------|-------------|-------|--------|
| Primary Key | `bigint GENERATED ALWAYS AS IDENTITY` or `uuid` (v7) | `serial`, `varchar` | Identity is SQL standard; avoids sequence drift |
| Strings | `text` | `varchar(255)` | In Postgres, `text` and `varchar` have identical storage |
| Timestamps | `timestamptz` | `timestamp` | `timestamptz` preserves absolute UTC instant |
| Monies / Quantities | `numeric(12, 4)` | `float`, `double` | Floats suffer IEEE-754 precision errors |
| Semi-Structured Data | `jsonb` | `json`, `text` | `jsonb` stores parsed binary format, supports indexing |

### Index Strategy

```sql
-- Equality first, then range/sort
CREATE INDEX idx_orders_customer_created ON orders (customer_id, created_at DESC);

-- Covering Index (Index-Only Scan)
CREATE INDEX idx_users_email_covering ON users (email) INCLUDE (first_name, last_name, role);

-- Partial Index (Zero overhead for inactive data)
CREATE INDEX idx_active_subscriptions ON subscriptions (user_id) WHERE status = 'active';

-- GIN Index for JSONB Search
CREATE INDEX idx_audit_metadata_gin ON audit_logs USING gin (metadata jsonb_path_ops);
```

### Keyset Pagination (O(1) vs O(N) OFFSET)

```sql
-- DO NOT USE: OFFSET 100000 LIMIT 20 (scans and discards 100,000 rows)
-- USE KEYSET:
SELECT id, total_amount, created_at
FROM orders
WHERE (created_at, id) < ('2026-05-01T12:00:00Z', 48920)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

### Queue Processing with SKIP LOCKED

```sql
UPDATE tasks
SET status = 'processing', locked_at = NOW(), worker_id = 'worker-1'
WHERE id = (
    SELECT id FROM tasks
    WHERE status = 'pending' AND scheduled_at <= NOW()
    ORDER BY priority DESC, id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

---

## 3. MySQL / InnoDB Patterns

### InnoDB Clustered Index Rules

In InnoDB, table rows are physically stored in the B-Tree of the Primary Key.
1. **Always declare an explicit Primary Key**: Without one, InnoDB generates an implicit 6-byte hidden row ID (`DB_ROW_ID`), serialized across all tables.
2. **Keep Secondary Indexes narrow**: Secondary indexes store the Primary Key value as their row pointer. Large composite primary keys bloat every secondary index.

### Collation and Defaults

```sql
CREATE TABLE accounts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    account_uuid BINARY(16) NOT NULL,
    organization_id BIGINT UNSIGNED NOT NULL,
    slug VARCHAR(64) NOT NULL,
    balance DECIMAL(15, 4) NOT NULL DEFAULT 0.0000,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_org_slug (organization_id, slug),
    KEY idx_org_active (organization_id, is_active, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### Deadlock Handling & Retries

In MySQL, concurrent transactions updating rows in opposite order will deadlock (`ER_LOCK_DEADLOCK` / Error 1213).
Applications must wrap write transactions in an exponential backoff retry loop:

```typescript
async function executeWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      const isDeadlock = err.code === 'ER_LOCK_DEADLOCK' || err.errno === 1213;
      if (isDeadlock && attempt < maxRetries) {
        attempt++;
        const jitter = Math.floor(Math.random() * 50);
        await new Promise(r => setTimeout(r, (2 ** attempt * 50) + jitter));
        continue;
      }
      throw err;
    }
  }
}
```

---

## 4. MongoDB & Document Store Patterns

### Embedding vs Referencing Rules

| Relationship | Ratio | Strategy | Rationale |
|--------------|-------|----------|-----------|
| User Profile + Address | 1:1 or 1:Few (fixed) | **Embed** | Retrieved together in a single atomic read/write |
| Order + Line Items | 1:10-50 (bounded) | **Embed** | Line items must freeze prices at purchase time |
| Product + Reviews | 1:Many (unbounded) | **Reference** (or Bucket) | Prevents hitting 16MB document size limit |
| Log Events / Sensor Readings | 1:Squillions | **Bucket Pattern** | Group by hour/day in time-series collections |

### Compound Index ESR Rule (Equality, Sort, Range)

When indexing MongoDB queries containing equality, sorting, and range criteria:
1. **E**quality: Fields filtered by exact match (`{ status: "active", orgId: "123" }`)
2. **S**ort: Field used for ordering (`.sort({ createdAt: -1 })`)
3. **R**ange: Fields filtered by range/inequality (`{ price: { $gte: 10, $lte: 100 } }`)

```javascript
// Query:
db.orders.find({ orgId: "org_1", status: "completed", total: { $gte: 50 } })
         .sort({ createdAt: -1 });

// Correct ESR Index:
db.orders.createIndex({
  orgId: 1,       // Equality
  status: 1,      // Equality
  createdAt: -1,  // Sort
  total: 1        // Range
});
```

### Write Concerns & Consistency

- **`{ w: "majority", j: true }`**: Production standard for financial or critical data. Acknowledged only after written to majority of replica nodes and written to on-disk journal.
- **Transactions (`withTransaction`)**: Use multi-document ACID transactions only when updating multiple separate collections atomically; avoid overusing when single-document embedded mutations suffice.
