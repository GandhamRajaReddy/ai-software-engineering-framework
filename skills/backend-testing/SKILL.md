---
name: backend-testing
description: Production backend testing methodologies including property-based testing, mutation testing, concurrency/race testing, database transaction rollbacks, migration rollback tests, and failure injection. Use when designing backend test suites or verifying backend reliability.
metadata:
  origin: ASEF
---

# Backend Testing & Verification Patterns

Comprehensive testing patterns for robust backend systems across Python, Node.js/TypeScript, Go, and Java.

## When to Activate

- Writing property-based tests to discover unknown edge cases and boundary crashes
- Implementing mutation testing to verify that tests actually fail when bugs are injected
- Testing database schema migrations with automated upgrade and rollback drills
- Detecting race conditions and deadlock scenarios under concurrent load
- Executing failure-injection and chaos resilience tests
- Enforcing the Iron Law of Testing: 100% test pass rate with fresh execution evidence

---

## 1. Property-Based Testing (Hypothesis & fast-check)

Unit tests with fixed inputs only test the scenarios the developer thought of. Property-based testing generates hundreds of randomized edge cases (empty strings, Unicode nulls, extreme timestamps, negative numbers) to prove invariants hold.

### Python (Hypothesis)
```python
from hypothesis import given, strategies as st
from app.core.pricing import calculate_discounted_total

@given(
    original_price=st.decimals(min_value=0, max_value=100000, places=2),
    discount_percent=st.integers(min_value=0, max_value=100)
)
def test_discount_invariant_always_holds(original_price, discount_percent):
    total = calculate_discounted_total(original_price, discount_percent)
    # INVARIANT 1: Total is never negative
    assert total >= 0
    # INVARIANT 2: Discounted total never exceeds original price
    assert total <= original_price
```

### TypeScript (fast-check)
```typescript
import fc from 'fast-check';
import { parsePaginationParams } from './pagination';

test('pagination params invariant: page size is strictly between 1 and 100', () => {
  fc.assert(
    fc.property(fc.integer(), fc.integer(), (page, limit) => {
      const parsed = parsePaginationParams(page, limit);
      return parsed.limit >= 1 && parsed.limit <= 100 && parsed.page >= 1;
    })
  );
});
```

---

## 2. Mutation Testing (Stryker & Mutmut)

Code coverage percentages can be gamed with assertions that don't verify state. **Mutation testing** introduces deliberate mutations (flipping `>` to `<`, changing `true` to `false`, removing function calls) and verifies that tests fail.

$$\text{Mutation Score} = \frac{\text{Killed Mutants}}{\text{Total Mutants}} \times 100 \ge 80\%$$

- **Surviving Mutant:** A bug was injected into production code and the test suite still passed (indicates missing test assertion).
- **Killed Mutant:** The test suite immediately caught the bug and failed.

---

## 3. Database Migration Rollback & Upgrade Tests

Never run migrations in production without verifying that the rollback script actually works.

```python
# test_migrations.py (Alembic or Django)
def test_migration_upgrade_and_downgrade(alembic_runner):
    # 1. Upgrade to latest migration
    alembic_runner.migrate_up_to("head")
    assert alembic_runner.current_revision() == "head"

    # 2. Downgrade one revision (test rollback)
    alembic_runner.migrate_down_to("-1")

    # 3. Re-upgrade cleanly
    alembic_runner.migrate_up_to("head")
```

---

## 4. Failure Injection & Chaos Resilience Tests

Verify that backend services degrade gracefully when secondary dependencies (Redis, S3, Email Gateway) fail:

```typescript
test('service degrades gracefully and returns cached data when primary DB times out', async () => {
  // Simulate database timeout
  jest.spyOn(db, 'query').mockImplementationOnce(() => 
    new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 500))
  );

  const res = await request(app).get('/api/v1/catalog');
  // Service should return stale cached response with warning header, NOT a 500 Internal Error
  expect(res.status).toBe(200);
  expect(res.headers['x-cache-status']).toBe('stale-degraded');
});
```
