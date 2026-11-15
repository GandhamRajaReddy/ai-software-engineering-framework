# Production Reference Backend Service (FastAPI)

A reference implementation demonstrating production-grade backend engineering within the AI Software Engineering Framework (ASEF).

## Architecture Highlights

- **Framework**: FastAPI with Pydantic v2 validation and RFC 7807 problem details error responses.
- **ORM & Persistence**: SQLAlchemy 2.0 async engine with UUIDv7 primary keys and optimistic concurrency versioning.
- **Multi-Tenancy**: Logical tenant isolation enforced at the database query level.
- **Migrations**: Alembic with zero-downtime expand/contract schema evolution.
- **Observability**: Structured JSON logging with W3C trace context, `/healthz` (liveness), and `/readyz` (readiness) probes.
- **Deployment Hardening**: Non-root multi-stage Docker build with built-in container healthcheck.
- **Verification Evidence**: Complete pytest test suite with tenant boundary isolation assertions.

## Directory Structure

```
backend-production-service/
├── app/
│   ├── main.py              # Lifespan, CORS, probes, error handlers
│   ├── core/
│   │   ├── config.py        # Validated environment configuration
│   │   ├── logging.py       # Structured JSON logging
│   │   └── database.py      # Async SQLAlchemy session factory
│   ├── models/
│   │   ├── base.py          # UUIDv7 base model
│   │   ├── tenant.py        # Tenant entity
│   │   └── item.py          # Tenant-scoped business entity
│   └── api/
│       └── v1/
│           ├── schemas.py   # Pydantic v2 DTOs & RFC 7807 schemas
│           └── endpoints.py # REST endpoints with idempotency support
├── migrations/
│   ├── env.py               # Alembic async environment
│   └── versions/
│       └── 001_initial_schema.py
├── tests/
│   ├── conftest.py          # Async test database fixtures
│   ├── test_api.py          # API contract & validation tests
│   └── test_tenant_isolation.py # Multi-tenant security regression tests
├── 06_deployment_config/
│   └── Dockerfile           # Multi-stage non-root container
├── 07_release_manifest.md   # Signed release manifest
└── requirements.txt
```

## Running Tests

```bash
pytest tests/ -v
```
