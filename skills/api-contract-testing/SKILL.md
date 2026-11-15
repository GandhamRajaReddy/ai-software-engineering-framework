---
name: api-contract-testing
description: API contract testing, OpenAPI 3.1/AsyncAPI schema validation, Consumer-Driven Contract (CDC) testing with Pact, breaking change detection, and mock service verification. Use when validating API agreements, preventing breaking changes across microservices, or testing consumer-provider contracts.
metadata:
  origin: ASEF
---

# API Contract Testing & Schema Validation

Production-grade contract testing patterns to guarantee breaking-change immunity across frontend-backend and microservice boundaries.

## When to Activate

- Defining or validating OpenAPI 3.1 or AsyncAPI specifications
- Implementing Consumer-Driven Contract (CDC) testing (Pact)
- Detecting breaking API changes before merging pull requests
- Validating mock services (Prism, WireMock) against living schemas
- Testing webhook signatures and event payload contracts

---

## 1. The Contract Testing Pyramid

```text
 ┌───────────────────────┐
 │   End-to-End Tests    │  (Slow, flaky, environment-heavy)
 ├───────────────────────┤
 │   Contract Tests      │  ◄── FAST, DECOUPLED, CATCHES INTEGRATION BUGS
 ├───────────────────────┤
 │   Unit & Route Tests  │  (Fast, isolated, mocks provider behavior)
 └───────────────────────┘
```

Contract tests verify that a service provider satisfies the exact schema expectations of its consumers without spinning up both services simultaneously.

---

## 2. OpenAPI 3.1 Schema Validation (FastAPI & Node.js)

### Automated Breaking Change Detection
In CI/CD, compare the current branch's OpenAPI specification against the production version (`main` branch):

```bash
# Using openapi-diff
npx @openapitools/openapi-diff-cli --fail-on-incompatible ./openapi.current.json ./openapi.main.json
```

### Breaking vs Non-Breaking Change Rules

| API Modification | Classification | Permitted in Minor/Patch Version? |
|------------------|----------------|-----------------------------------|
| Adding optional query parameter or body field | Non-Breaking | ✅ Yes |
| Adding new endpoint route | Non-Breaking | ✅ Yes |
| Adding a required field to request body | **BREAKING** | ❌ No (Requires `/v2/` version bump) |
| Removing or renaming a response field | **BREAKING** | ❌ No (Requires `/v2/` version bump) |
| Changing field type (e.g. `number` $\to$ `string`) | **BREAKING** | ❌ No |
| Narrowing allowed enum values | **BREAKING** | ❌ No |

---

## 3. Consumer-Driven Contract (CDC) Testing with Pact

### Consumer Test (TypeScript / Jest)
The consumer asserts its expectation and generates a verified contract JSON file (Pact file):

```typescript
import { PactV3, MatchersV3 } from '@pact-foundation/pact';

const provider = new PactV3({
  consumer: 'web-frontend',
  provider: 'user-service'
});

describe('User Service API Contract', () => {
  it('returns user details for an existing user ID', async () => {
    provider
      .uponReceiving('a request for user 101')
      .withRequest({
        method: 'GET',
        path: '/api/v1/users/101',
        headers: { Accept: 'application/json' }
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          id: MatchersV3.string('101'),
          email: MatchersV3.regex('^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$', 'user@example.com'),
          status: MatchersV3.equal('ACTIVE')
        }
      });

    await provider.executeTest(async (mockServer) => {
      const response = await fetch(`${mockServer.url}/api/v1/users/101`, {
        headers: { Accept: 'application/json' }
      });
      const data = await response.json();
      expect(data.id).toBe('101');
      expect(data.status).toBe('ACTIVE');
    });
  });
});
```

### Provider Verification (Python / FastAPI)
The provider service runs verification against the published Pact file:

```python
# tests/test_pact_provider.py
import pytest
from pact import Verifier

def test_verify_user_service_pact():
    verifier = Verifier(provider="user-service", provider_base_url="http://localhost:8000")
    success, logs = verifier.verify_pacts("./pacts/web-frontend-user-service.json")
    assert success == 0, f"Pact contract verification failed:\n{logs}"
```
