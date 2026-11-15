---
name: backend-data-integrity
description: Backend data integrity engineering: ACID transaction boundaries, distributed consistency models, PACELC tradeoffs, automated backup verification, shadow restore drills, and asynchronous data reconciliation jobs. Use when designing financial ledgers, transactional databases, or data consistency verification audits.
metadata:
  origin: ASEF
---

# Backend Data Integrity Engineering

Foundational principles and operational practices for guaranteeing data correctness, durability, and consistency in production systems.

## Transaction Boundaries & ACID Guarantees

Data corruption occurs when transactions span arbitrary code blocks or fail to model true atomicity boundaries.

### Core ACID Rules

1. **Keep Transactions Short**: Acquire locks at the very end of the business logic flow; release them immediately upon commit. Never perform network I/O, external HTTP calls, or file uploads inside an open database transaction.
2. **Order Resource Acquisition**: When acquiring locks on multiple rows or entities, always sort keys in ascending order (e.g. `ORDER BY id ASC` or `sorted([id_a, id_b])`) to eliminate database deadlocks.
3. **Idempotent State Transitions**: Explicitly guard updates with optimistic concurrency checks (`WHERE version = :expected_version`) or state checks (`WHERE status = 'PENDING'`).

---

## Distributed Consistency: Sagas & Outbox vs 2PC

Two-Phase Commit (2PC) creates blocking distributed locks across services, resulting in extreme latency and vulnerability to coordinator failure. Production microservices use **Event-Driven Sagas with the Transactional Outbox**:

```
Service A (Order)                              Service B (Payment)
  │                                                    │
  ├─ 1. Atomic DB Tx:                                 │
  │     - Insert Order (PENDING)                       │
  │     - Insert Outbox Record                         │
  │  (Commit Tx)                                       │
  │                                                    │
  ├─ 2. Outbox Relay publishes OrderCreated ──────────►│
  │                                                    │
  │                                                    ├─ 3. Atomic DB Tx:
  │                                                    │     - Deduplicate Event ID
  │                                                    │     - Process Payment
  │                                                    │     - Insert Outbox Record
  │                                                    │  (Commit Tx)
  │                                                    │
  │◄─ 4. Outbox Relay publishes PaymentProcessed ──────┤
  │                                                    │
  ├─ 5. Update Order to CONFIRMED                      │
```

---

## Automated Backup Verification & Restore Drills

A backup is only theoretical until it is successfully restored. Treating backup creation exit code `0` as proof of backup integrity is a critical fallacy:

### Automated Daily Shadow Restore Pipeline

```
┌──────────────────────┐
│ Production Database  │
└──────────┬───────────┘
           │ 1. Continuous WAL Archival + Nightly pg_dump
           ▼
┌──────────────────────┐
│ S3 / GCS Cold Storage│
└──────────┬───────────┘
           │ 2. Automated Ephemeral Restore Worker
           ▼
┌────────────────────────────────────────────────────────┐
│ Isolated Ephemeral Database (Shadow Container)         │
│                                                        │
│ 3. Restore Dump & Replay WALs                          │
│ 4. Run Checksum & Row-Count Verification Invariants    │
│ 5. Execute Synthetic Smoke Queries                     │
│ 6. Destroy Container & Record Cryptographic Evidence   │
└────────────────────────────────────────────────────────┘
```

### Integrity Verification Invariants

```sql
-- Invariant 1: Total debits must equal total credits in accounting ledgers
SELECT 
    SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) AS total_debits,
    SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) AS total_credits
FROM ledger_entries;
-- ASSERT: total_debits == total_credits

-- Invariant 2: Zero orphaned line items
SELECT COUNT(*) FROM order_lines ol 
LEFT JOIN orders o ON ol.order_id = o.id 
WHERE o.id IS NULL;
-- ASSERT: count == 0
```

---

## Asynchronous Data Reconciliation

In distributed systems, eventual consistency introduces transient discrepancies. Run scheduled reconciliation jobs to detect and repair drift:

```python
import logging
from typing import List

logger = logging.getLogger("reconciliation")

def reconcile_account_balances(db_session, ledger_service):
    """
    Nightly reconciliation job: Verifies cached account balances match 
    the immutable ledger sum.
    """
    divergent_accounts: List[str] = []

    # Stream accounts in batches
    accounts = db_session.query(Account).yield_per(1000)
    for account in accounts:
        actual_ledger_sum = ledger_service.sum_entries(account.id)
        if account.cached_balance != actual_ledger_sum:
            divergent_accounts.append(account.id)
            logger.error(
                "DATA DIVERGENCE DETECTED on account %s! Cached: %s, Ledger: %s",
                account.id, account.cached_balance, actual_ledger_sum
            )
            # Automatic self-healing: Update cached projection from source of truth
            account.cached_balance = actual_ledger_sum
            account.drift_reconciled_at = datetime.utcnow()

    db_session.commit()
    return divergent_accounts
```

---

## Data Integrity Checklist

- [ ] Zero network I/O or external API calls inside open database transactions.
- [ ] Row locks sorted consistently to guarantee deadlock prevention.
- [ ] Optimistic concurrency control (`version` column) used on mutable aggregates.
- [ ] Transactional Outbox pattern implemented for all domain event publication.
- [ ] Automated restore drill pipeline runs daily against fresh backups.
- [ ] Invariant reconciliation audits run periodically to detect and heal eventual consistency drift.
