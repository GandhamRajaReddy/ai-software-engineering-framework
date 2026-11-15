---
name: production-incident-response
description: Production incident response: SEV-1 to SEV-4 classification, Incident Command System (ICS), operational runbooks, blameless postmortems with 5 Whys, automated rollback, and disaster recovery drills. Use when managing production outages, establishing on-call procedures, or conducting root-cause reviews.
metadata:
  origin: ASEF
---

# Production Incident Response

Standard operating procedures, command protocols, and post-incident learning frameworks for production systems.

## Incident Severity Tiers & Response SLAs

Incidents must be classified immediately upon detection based on blast radius and business impact:

| Severity | Definition | Target Ack | Target Mitigation | Communication Cadence |
|:---------|:-----------|:----------:|:-----------------:|:---------------------:|
| **SEV-1 (Critical)** | Core service down for >10% of all users; data corruption; security breach | < 5 mins | < 30 mins | Every 15 mins to executive/status page |
| **SEV-2 (Major)** | Major feature unavailable; high latency breaching critical SLO; no workaround | < 15 mins | < 2 hours | Every 30 mins |
| **SEV-3 (Minor)** | Minor degradation; partial user impact with existing workaround | < 1 hour | < 8 hours | Daily summary |
| **SEV-4 (Low)** | Cosmestic bug, non-critical background worker delay | Next Day | Next Sprint | Sprint backlog |

---

## Incident Command Structure

During SEV-1 and SEV-2 events, engineering transitions into an Incident Command structure:

1. **Incident Commander (IC)**: Holds single point of command. Manages triage, assigns tasks, prevents scope churn, and makes final decisions on rollbacks or failovers. Does NOT write code or investigate logs directly.
2. **Operations / Tech Lead**: Investigates logs, metrics, telemetry, and executes diagnostic commands or rollback procedures directed by the IC.
3. **Communications Lead**: Posts updates to status pages, internal stakeholders, and customer support channels.

---

## Runbook Architecture

Every production alert must link directly to an operational runbook with actionable steps:

```markdown
# Runbook: High Database Connection Saturation

## Symptoms
- Alert: `PostgresConnectionPoolExhausted` (>90% max connections for 3m)
- Application API returns HTTP 503 Service Unavailable.

## Immediate Mitigation Steps
1. Identify offending queries holding open transactions:
   ```sql
   SELECT pid, now() - xact_start AS duration, query, state 
   FROM pg_stat_activity 
   WHERE state != 'idle' 
   ORDER BY duration DESC LIMIT 10;
   ```
2. Terminate rogue blocking queries:
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = <PID>;
   ```
3. If connection storm persists, throttle non-essential background worker replicas:
   `kubectl scale deployment/batch-indexer --replicas=0`

## Escalation Path
- Primary On-Call: SRE Team Pager
- Secondary Escalation: Database Reliability Lead
```

---

## Blameless Postmortem Methodology

Within 48 hours of resolving a SEV-1 or SEV-2 incident, the team must conduct a blameless postmortem:

### Key Principles
1. **Focus on System Failures, Not Human Error**: Human error is the symptom of an inadequate system design. Ask *why* the system allowed the mistake to cause an outage.
2. **5 Whys Root Cause Analysis**: Dig beneath the initial trigger to find systemic organizational and tooling gaps.
3. **Action Items with Concrete Owners**: Every action item must have a assigned owner and target completion date.

### Postmortem Template

```markdown
# Postmortem: [INCIDENT-YYYY-MM-DD] [Brief Title]

## Summary
- **Duration**: [Start Time UTC] to [Resolution Time UTC] ([X] minutes)
- **Impact**: [Number of affected users, dropped requests, revenue impact]
- **Root Cause**: [One-sentence explanation of underlying flaw]

## Timeline (All times in UTC)
- `14:02` - Deploy `v2.4.1` containing migration 008 completed.
- `14:05` - `PostgresConnectionPoolExhausted` alert fires; on-call paged.
- `14:08` - Incident Commander declares SEV-1; war room opened.
- `14:15` - Mitigation: Traffic rolled back to `v2.4.0`.
- `14:18` - Connection pool levels normalized; incident mitigated.

## Contributing Factors
- Migration 008 executed `ALTER TABLE orders ADD COLUMN status_code INT NOT NULL` without default on a 50M row table.
- Shadow migration rehearsal step was skipped in CI pipeline.

## Action Items
| Action Item | Type | Owner | Due Date | Ticket |
|:------------|:-----|:------|:---------|:-------|
| Add zero-downtime DDL linter to CI | Prevent | @lead-sre | 2026-11-25 | SRE-104 |
| Enforce shadow DB migration check in release gate | Mitigate | @devops | 2026-11-20 | REL-202 |
```

---

## Incident Response Checklist

- [ ] Clear SEV-1 to SEV-4 definitions agreed upon and published.
- [ ] Every alert includes a direct URL to an actionable runbook.
- [ ] Incident Commander role assigned immediately upon SEV declaration.
- [ ] Automated single-command or Git-revert rollback paths tested monthly.
- [ ] Blameless postmortem conducted within 48 hours for all SEV-1/SEV-2 incidents.
- [ ] Action items tracked in sprint backlog with verified completion evidence.
