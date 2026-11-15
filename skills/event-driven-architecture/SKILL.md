---
name: event-driven-architecture
description: Event-driven architecture: Event schemas (CloudEvents/Avro), Kafka/RabbitMQ partition keys, strict ordering guarantees, consumer idempotency, schema evolution, and dead-letter queues. Use when designing asynchronous messaging systems, distributed event streams, or event sourcing patterns.
metadata:
  origin: ASEF
---

# Event-Driven Architecture

Architectural conventions and resilience patterns for distributed messaging systems and event streams.

## Standardized Event Envelopes (CloudEvents v1.0)

All domain and integration events must follow the CNCF CloudEvents standard structure:

```json
{
  "specversion": "1.0",
  "type": "com.company.orders.OrderPlaced",
  "source": "/services/order-service",
  "id": "A234-1234-1234",
  "time": "2026-11-15T12:00:00Z",
  "datacontenttype": "application/json",
  "subject": "order_789456",
  "data": {
    "orderId": "order_789456",
    "customerId": "cust_123",
    "totalAmount": 149.50,
    "currency": "USD"
  }
}
```

---

## Ordering Guarantees & Partition Key Strategy

In distributed logs (Kafka, AWS Kinesis):
- **Partition Ordering**: Events are strictly ordered *only within a single partition*.
- **Partition Key Selection**: Always partition by the natural aggregate entity ID (e.g., `customerId` or `orderId`). Never partition randomly or by round-robin when ordering matters for an entity.
- **Consumer Group Concurrency**: Parallelism is bounded by the number of partitions.

---

## Schema Evolution & Backward Compatibility

1. **Schema Registry**: Enforce schema registration (Avro, Protobuf, JSON Schema) in CI/CD.
2. **Compatibility Modes**: Enforce `BACKWARD` or `FULL` compatibility.
   - You MAY add new optional fields with default values.
   - You MUST NOT remove or rename existing required fields.
   - You MUST NOT change field data types.

---

## Consumer Idempotency & Poison Pill Quarantine (DLQ)

```python
async def consume_event(event_envelope, db_session, message_handler):
    event_id = event_envelope["id"]

    # 1. Idempotency Check: Reject already processed event
    existing = await db_session.execute(
        "SELECT 1 FROM processed_events WHERE event_id = :id", {"id": event_id}
    )
    if existing.scalar():
        return # Acknowledge and skip

    try:
        # 2. Execute business logic within atomic transaction
        async with db_session.begin():
            await message_handler(event_envelope["data"])
            await db_session.execute(
                "INSERT INTO processed_events (event_id, processed_at) VALUES (:id, NOW())",
                {"id": event_id}
            )
    except Exception as exc:
        # 3. Route unrecoverable / poison pill messages to Dead Letter Queue (DLQ)
        if is_fatal_error(exc):
            await dlq_producer.send("orders.dlq", event_envelope, headers={"error": str(exc)})
        raise
```

---

## Event-Driven Architecture Checklist

- [ ] All events follow CloudEvents v1.0 envelope specification.
- [ ] Partition keys map to individual Aggregate IDs to preserve strict ordering.
- [ ] Consumers enforce database-backed idempotency via `processed_events`.
- [ ] Schema evolution rules (Avro/Protobuf) validated in CI against schema registry.
- [ ] Dead Letter Queues (DLQs) configured with replay tooling and alert thresholds.
