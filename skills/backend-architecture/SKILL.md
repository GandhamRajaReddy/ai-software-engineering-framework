---
name: backend-architecture
description: Language-neutral Clean Architecture, Domain-Driven Design (DDD), Ports & Adapters, SOLID principles, entity-boundary isolation, and repository/service patterns across polyglot backend environments (Python, Go, Java, TypeScript). Use when architecting server-side systems, establishing domain boundaries, or designing layered services.
metadata:
  origin: ASEF
---

# Universal Backend Architecture & Domain-Driven Design

Foundational, stack-neutral patterns for building robust, scalable, and testable server-side applications.

## Architectural Foundations

A production backend must decouple core business logic from delivery mechanisms (HTTP, gRPC, CLI) and persistence technologies (PostgreSQL, MongoDB, DynamoDB). Following **Clean Architecture** and **Ports & Adapters (Hexagonal Architecture)** ensures the domain layer remains pure, portable, and independently testable.

### The Dependency Rule

```
┌────────────────────────────────────────────────────────┐
│             Presentation / Transport Layer             │
│       (REST Controllers, GraphQL, gRPC, CLI)           │
├────────────────────────────────────────────────────────┤
│             Infrastructure / Drivers Layer             │
│        (Database, Cache, Message Broker, HTTP)         │
├────────────────────────────────────────────────────────┤
│                 Application Layer                      │
│        (Use Cases, Commands, Queries, Ports)           │
├────────────────────────────────────────────────────────┤
│                   Domain Layer                         │
│   (Entities, Value Objects, Aggregates, Invariants)    │
│            * ZERO EXTERNAL DEPENDENCIES *              │
└────────────────────────────────────────────────────────┘
                       ▲
        Dependencies point strictly INWARD
```

1. **Domain Layer**: Contains enterprise business rules, entities, value objects, and domain exceptions. It has no external dependencies—no ORMs, no HTTP frameworks, no vendor SDKs.
2. **Application Layer**: Contains application-specific use cases, command/query handlers, and abstract port interfaces (inbound and outbound).
3. **Infrastructure Layer**: Implements outbound ports (database repositories, message publishers, external API clients).
4. **Presentation Layer**: Implements inbound adapters (HTTP handlers, CLI commands, queue consumers) that translate transport protocols into application commands.

---

## Domain-Driven Design (DDD) Primitives

### 1. Entities and Value Objects

- **Entity**: An object defined by its continuous identity throughout its lifecycle, rather than its attributes. Two entities with the same ID represent the same business object.
- **Value Object**: An immutable object defined entirely by the combination of its attributes. It has no conceptual identity. If any attribute changes, it is a different value.

#### Python Example

```python
from dataclasses import dataclass
from decimal import Decimal
import uuid

# Value Object: Immutable with self-validation
@dataclass(frozen=True)
class Money:
    amount: Decimal
    currency: str

    def __post_init__(self):
        if self.amount < 0:
            raise ValueError("Money amount cannot be negative.")
        if len(self.currency) != 3 or not self.currency.isupper():
            raise ValueError("Currency must be a 3-letter ISO code.")

    def add(self, other: "Money") -> "Money":
        if self.currency != other.currency:
            raise ValueError(f"Cannot add {other.currency} to {self.currency}")
        return Money(self.amount + other.amount, self.currency)

# Entity: Identity-based with state transitions
class Account:
    def __init__(self, account_id: uuid.UUID, owner_id: uuid.UUID, initial_balance: Money):
        self.id = account_id
        self.owner_id = owner_id
        self._balance = initial_balance
        self._is_frozen = False

    @property
    def balance(self) -> Money:
        return self._balance

    def deposit(self, amount: Money) -> None:
        if self._is_frozen:
            raise ValueError("Cannot deposit into a frozen account.")
        self._balance = self._balance.add(amount)

    def freeze(self) -> None:
        self._is_frozen = True
```

#### Go Example

```go
package domain

import (
	"errors"
	"fmt"
	"github.com/google/uuid"
)

// Value Object: Money
type Money struct {
	amount   int64 // Stored in minor units (e.g. cents)
	currency string
}

func NewMoney(amount int64, currency string) (Money, error) {
	if amount < 0 {
		return Money{}, errors.New("money amount cannot be negative")
	}
	if len(currency) != 3 {
		return Money{}, errors.New("currency must be 3-letter ISO code")
	}
	return Money{amount: amount, currency: currency}, nil
}

func (m Money) Add(other Money) (Money, error) {
	if m.currency != other.currency {
		return Money{}, fmt.Errorf("currency mismatch: %s vs %s", m.currency, other.currency)
	}
	return Money{amount: m.amount + other.amount, currency: m.currency}, nil
}

// Entity: Account
type Account struct {
	ID       uuid.UUID
	OwnerID  uuid.UUID
	balance  Money
	isFrozen bool
}

func (a *Account) Deposit(amount Money) error {
	if a.isFrozen {
		return errors.New("cannot deposit into a frozen account")
	}
	newBalance, err := a.balance.Add(amount)
	if err != nil {
		return err
	}
	a.balance = newBalance
	return nil
}
```

---

## Ports & Adapters (Hexagonal Architecture)

Ports define contracts that decouple domain orchestration from concrete implementations.

### Outbound Port: Repository Interface

The application defines what persistence capabilities it requires. The database adapter fulfills the interface.

```python
# application/ports/account_repository.py
from abc import ABC, abstractmethod
import uuid
from typing import Optional
from domain.account import Account

class AccountRepositoryPort(ABC):
    @abstractmethod
    def find_by_id(self, account_id: uuid.UUID) -> Optional[Account]:
        """Retrieve an account by its unique ID."""
        pass

    @abstractmethod
    def save(self, account: Account) -> None:
        """Persist account state changes."""
        pass
```

### Use Case: Application Orchestration

Use cases execute domain rules and coordinate state changes through ports.

```python
# application/use_cases/deposit_funds.py
from dataclasses import dataclass
from decimal import Decimal
import uuid
from application.ports.account_repository import AccountRepositoryPort
from domain.account import Money

@dataclass(frozen=True)
class DepositCommand:
    account_id: uuid.UUID
    amount: Decimal
    currency: str

class DepositFundsUseCase:
    def __init__(self, account_repo: AccountRepositoryPort):
        self._account_repo = account_repo

    def execute(self, cmd: DepositCommand) -> None:
        account = self._account_repo.find_by_id(cmd.account_id)
        if not account:
            raise ValueError(f"Account {cmd.account_id} not found.")

        money = Money(cmd.amount, cmd.currency)
        account.deposit(money)
        self._account_repo.save(account)
```

---

## Aggregate Roots and Consistency Boundaries

An **Aggregate** is a cluster of associated objects treated as a single unit for data changes. Every aggregate has an **Aggregate Root**:
- External objects may only hold references to the Aggregate Root.
- Invariants within the aggregate boundary are enforced synchronously within a single database transaction.
- **Rule of Thumb**: One database transaction should modify exactly one Aggregate instance.
- Cross-aggregate consistency must be achieved asynchronously via Domain Events and the Transactional Outbox pattern.

```
┌────────────────────────────────────────────────────────┐
│ Order Aggregate (Boundary)                             │
│                                                        │
│  ┌───────────────────────┐                             │
│  │ Order (Aggregate Root)│                             │
│  └──────────┬────────────┘                             │
│             │ 1..*                                     │
│  ┌──────────▼────────────┐                             │
│  │ OrderLine (Entity)    │                             │
│  └──────────┬────────────┘                             │
│             │ 1                                        │
│  ┌──────────▼────────────┐                             │
│  │ Price (Value Object)  │                             │
│  └───────────────────────┘                             │
└────────────────────────────────────────────────────────┘
```

---

## Domain Events & Eventual Consistency

When an Aggregate undergoes state transitions that affect other contexts, it records a Domain Event:

```python
@dataclass(frozen=True)
class OrderPlacedEvent:
    event_id: uuid.UUID
    order_id: uuid.UUID
    customer_id: uuid.UUID
    total_amount: Decimal
    currency: str
    occurred_at: str

class Order:
    def __init__(self, order_id: uuid.UUID, customer_id: uuid.UUID):
        self.id = order_id
        self.customer_id = customer_id
        self.events: list[object] = []

    def place_order(self, lines: list[OrderLine], currency: str) -> None:
        if not lines:
            raise ValueError("Order must contain at least one line item.")
        self.events.append(OrderPlacedEvent(
            event_id=uuid.uuid4(),
            order_id=self.id,
            customer_id=self.customer_id,
            total_amount=self.calculate_total(),
            currency=currency,
            occurred_at=datetime.utcnow().isoformat()
        ))
```

---

## Architecture Anti-Patterns

| Anti-Pattern | Symptom | Correct Architecture Solution |
|:-------------|:--------|:------------------------------|
| **Anemic Domain Model** | Entities are bags of getters/setters; all logic resides in "Fat Services" | Encapsulate business invariants and state transitions inside Domain Entities |
| **Leaky Abstraction** | ORM entities (SQLAlchemy, Hibernate) are passed directly to API responses | Map ORM models to Domain Entities in the persistence adapter; map to DTOs in presentation |
| **God Service** | Single service class with 50+ methods handling multiple business capabilities | Decompose into focused Use Case classes implementing a single command or query |
| **Distributed Monolith** | Microservices sharing a single database or requiring synchronous cascading HTTP calls | Enforce database-per-service; communicate via asynchronous events and eventual consistency |
| **Direct Vendor Coupling** | Domain logic imports AWS SDK, Stripe client, or database driver | Abstract third-party services behind Application Port interfaces; implement in Infrastructure |

---

## Architecture Review Checklist

- [ ] Domain entities have zero dependencies on frameworks, ORMs, or transport libraries.
- [ ] Business invariants are checked within Entities and Value Objects, not in controllers.
- [ ] Database access is abstracted behind Repository interfaces (Outbound Ports).
- [ ] Each database transaction modifies exactly one Aggregate instance.
- [ ] Cross-boundary communication relies on immutable DTOs and Domain Events.
- [ ] Input validation (structure/types) occurs in the presentation layer; business validation occurs in the domain.
- [ ] Composition root is the only location where concrete adapters are wired to use cases.
