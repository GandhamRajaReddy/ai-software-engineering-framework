---
name: backend-compliance-privacy
description: Backend compliance and privacy engineering: Data classification (PII, PCI-DSS, HIPAA), retention policies, cryptographic erasure (crypto-shredding), tamper-evident audit trails, and privacy-by-design patterns. Use when implementing compliance requirements, GDPR deletion requests, or security audit trails.
metadata:
  origin: ASEF
---

# Backend Compliance & Privacy Engineering

Architectural frameworks for regulatory compliance (GDPR, CCPA, HIPAA, PCI-DSS) and data privacy.

## Data Classification Taxonomy

Every data element stored or transmitted must carry an explicit classification:

| Tier | Category | Examples | Storage Controls | Transit Controls |
|:-----|:---------|:---------|:-----------------|:-----------------|
| **Tier 1** | **Restricted / Sensitive PII** | Passwords, Social Security Numbers, Health Records | Field-level encryption (AES-256-GCM), masked in logs | TLS 1.3 only |
| **Tier 2** | **Confidential / PII** | Full Name, Email, IP Address, Physical Address | Encryption-at-rest, access logged | TLS 1.3 / 1.2 |
| **Tier 3** | **Internal Business** | Product catalogs, internal documentation | Standard DB encryption | TLS 1.3 / 1.2 |
| **Tier 4** | **Public** | Marketing copy, public API docs | Unrestricted | Standard HTTP/HTTPS |

---

## Right to Erasure & Cryptographic Shredding

Under GDPR Article 17 ("Right to be Forgotten"), user data must be permanently erased upon request:

### The Cryptographic Shredding Pattern

In immutable logs, backups, or append-only ledgers, physical record deletion is impossible or corrupts historical integrity. Use **Crypto-Shredding**:
1. Assign each user a dedicated per-user encryption key stored in a Key Management Service (KMS).
2. Encrypt all user PII fields using their per-user data key.
3. Upon receiving a verified erasure request, permanently destroy the user's encryption key in the KMS.
4. Without the key, all historical backups, logs, and database snapshots are mathematically irreversible cipher noise.

---

## Tamper-Evident Audit Trails

Compliance frameworks require that audit logs cannot be modified, reordered, or deleted—even by database administrators:

```python
import hashlib
import json
import time

class AuditLogEntry:
    def __init__(self, actor_id: str, action: str, resource_id: str, previous_hash: str):
        self.timestamp = int(time.time())
        self.actor_id = actor_id
        self.action = action
        self.resource_id = resource_id
        self.previous_hash = previous_hash
        self.entry_hash = self._compute_hash()

    def _compute_hash(self) -> str:
        payload = f"{self.timestamp}:{self.actor_id}:{self.action}:{self.resource_id}:{self.previous_hash}"
        return hashlib.sha256(payload.encode('utf-8')).hexdigest()
```

---

## Privacy Engineering Checklist

- [ ] All database columns containing PII cataloged and classified.
- [ ] PII strictly masked or excluded from application log streams.
- [ ] Automated cryptographic shredding or deletion routines tested for GDPR erasure requests.
- [ ] Audit logs write to append-only, tamper-evident immutable storage (S3 Object Lock / WORM).
- [ ] Data retention TTL policies automatically purge obsolete records.
