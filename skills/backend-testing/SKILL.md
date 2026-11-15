---
name: backend-testing
description: Production backend testing methodologies including unit testing, API integration testing, database transaction rollback fixtures, concurrency and race condition testing, contract testing, and TDD red-green verification loops. Use when designing backend test suites, writing integration tests, or verifying backend reliability.
metadata:
  origin: ASEF
---

# Backend Testing & Verification Patterns

Comprehensive testing patterns for robust backend systems across Python, Node.js/TypeScript, Go, and Java.

## When to Activate

- Designing unit and integration test suites for backend services
- Implementing database transaction rollback test fixtures
- Testing API endpoints, status codes, and RFC 7807 error formats
- Detecting race conditions, concurrency bugs, and deadlock scenarios
- Mocking external third-party services safely (WireMock, MSW, httpx-mock)
- Enforcing the Iron Law of Testing: 100% test pass rate with fresh execution evidence

---

## 1. Backend Testing Pyramid

```text
       /\
      /  \      E2E / Synthetic Smoke Tests (10%)
     /----\     - Critical user journeys, deployed environment health
    /      \    API Contract & Integration Tests (20%)
   /--------\   - Real DB transactions, repository layers, HTTP route contracts
  /          \  Unit Tests (70%)
 /------------\ - Domain logic, value objects, calculations, validation rules
```

---

## 2. Database Transaction Rollback Pattern

Avoid slow migrations and manual test cleanup by executing each integration test inside a database transaction that automatically rolls back when the test concludes.

### Python (pytest + SQLAlchemy asyncpg)

```python
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

@pytest_asyncio.fixture
async def db_session():
    # Connect to test database
    engine = create_async_engine("postgresql+asyncpg://test:test@localhost:5432/test_db")
    connection = await engine.connect()
    transaction = await connection.begin()
    
    # Bind session to the transaction
    session_factory = sessionmaker(bind=connection, class_=AsyncSession, expire_on_commit=False)
    session = session_factory()

    yield session

    # Roll back after test finishes — zero test leakage
    await session.close()
    await transaction.rollback()
    await connection.close()
```

### Java / Spring Boot (@Transactional Test)

```java
@SpringBootTest
@Transactional // Automatically rolls back database changes after each test method
class OrderServiceIntegrationTest {

    @Autowired
    private OrderService orderService;

    @Autowired
    private OrderRepository orderRepository;

    @Test
    void shouldCreateOrderAndDeductInventory() {
        OrderDto request = new OrderDto("item-123", 2);
        OrderResult result = orderService.placeOrder(request);

        assertThat(result.status()).isEqualTo(OrderStatus.CONFIRMED);
        assertThat(orderRepository.findById(result.orderId())).isPresent();
    }
}
```

---

## 3. Concurrency & Race Condition Testing

Backend services must be tested under concurrent contention to expose lost updates, deadlocks, and race conditions.

### Go Race Detector
Always run Go tests with the race detector enabled:
```bash
go test -race -v -count=1 ./...
```

### Python Asyncio Concurrent Hammer Test
Verify atomic balance transfers or inventory deductions under concurrent requests:

```python
import asyncio
import pytest

@pytest.mark.asyncio
async def test_concurrent_transfers_prevent_double_spending(bank_service):
    account_id = await bank_service.create_account(initial_balance=100)

    # Launch 10 concurrent withdrawal tasks of $20 each
    tasks = [
        bank_service.withdraw(account_id, amount=20)
        for _ in range(10)
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    successful_withdrawals = [r for r in results if not isinstance(r, Exception)]
    
    # Exactly 5 should succeed (5 x 20 = 100), 5 should fail with InsufficientFunds
    assert len(successful_withdrawals) == 5
    final_balance = await bank_service.get_balance(account_id)
    assert final_balance == 0
```

---

## 4. External Dependency Mocking Discipline

- **RULE 1**: Do NOT mock the primary database when writing integration tests. Use a local Docker test database or ephemeral instance.
- **RULE 2**: Mock third-party external HTTP APIs (e.g., Stripe, Twilio, SendGrid) at the HTTP boundary, not by monkey-patching internal classes.
- Use tools like **WireMock**, **MSW (Mock Service Worker)**, or **pytest-httpx**.

```typescript
// Testing Stripe Webhook verification with nock / MSW
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  http.post('https://api.stripe.com/v1/payment_intents', () => {
    return HttpResponse.json({ id: 'pi_test_123', status: 'succeeded' });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

---

## 5. The Iron Law of Verification

A feature or bug fix is NEVER done until:
1. A test reproducing the requirement/defect runs and fails (**RED**).
2. The minimal implementation code makes the test pass (**GREEN**).
3. The complete test suite runs from a clean terminal state and exits with **code 0**.
4. Coverage metrics verify no untested branches in core business logic.
