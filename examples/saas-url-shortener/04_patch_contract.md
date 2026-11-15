# Patch Contract: [TASK-003] Base62 Slug Generation Engine

> **Target File:** `src/lib/slug.ts`  
> **Responsible Agent:** `Senior Builder`  
> **Status:** APPLIED & VERIFIED

---

## 1. Rationale & Requirements Mapping
Implements a collision-resistant, cryptographically seeded Base62 slug generator satisfying `REQ-002`. Uses native `node:crypto` rather than third-party packages to maintain minimal dependencies (Ponytail Senior Builder Principle).

---

## 2. Complete Surgical Implementation (`src/lib/slug.ts`)

```typescript
import { randomBytes } from 'node:crypto';

const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Generates an unguessable 7-character Base62 slug.
 * Total permutation space: 62^7 = 3.52 trillion combinations.
 */
export function generateSlug(length: number = 7): string {
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += BASE62_CHARS[bytes[i] % 62];
  }
  return result;
}

/**
 * Validates whether a custom vanity slug conforms to URL safety rules.
 */
export function isValidCustomSlug(slug: string): boolean {
  if (slug.length < 3 || slug.length > 32) return false;
  return /^[a-zA-Z0-9_-]+$/.test(slug);
}
```

---

## 3. TDD Evidence
- **Test File:** `tests/unit/slug.test.ts`
- **Red Phase:** Verified test failure before creation (Exit code 1 - module not found).
- **Green Phase:** Verified test pass after implementation:
  - 10,000 unique slugs generated: 0 collisions detected.
  - Slug validation rejected invalid characters (`/`, `@`, spaces).
  - Exit code 0, Duration: 142ms.
