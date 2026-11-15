# Production Release Manifest

> **Release Version:** [vX.Y.Z]  
> **Release Date:** [YYYY-MM-DD]  
> **Git Commit / Hash:** [Commit SHA]  
> **Release Status:** [PROD_READY]

---

## 1. Release Scorecard (7 Iron Gates)
- [x] **Gate 1:** Requirements Traceability (15/15)
- [x] **Gate 2:** Executable Test Evidence (25/25)
- [x] **Gate 3:** Security & SkillSpector Scan (20/20)
- [x] **Gate 4:** Filesystem Grounding (15/15)
- [x] **Gate 5:** Independent Review (10/10)
- [x] **Gate 6:** Deployment Artifacts & Health Checks (10/10)
- [x] **Gate 7:** Release Manifest & Rollback Runbook (5/5)
- **Total Production Score:** **100 / 100**

---

## 2. Included Features & Changelog
- **[REQ-001]:** [Feature description]
- **[REQ-002]:** [Feature description]

---

## 3. Deployment Artifacts
- **Docker Image Tag:** `[registry/image:vX.Y.Z]`
- **Container Port:** `[3000]`
- **Health Check Endpoint:** `http://localhost:3000/healthz`
- **Configuration Schema:** Documented in `.env.example`

---

## 4. Disaster Recovery & Rollback Procedure
1. **Rollback Trigger Conditions:** Error rate > 1% on `/healthz` or p99 latency > 1000ms.
2. **Reversion Step:** Execute `docker compose -f docker-compose.yml down && docker run [previous_stable_image]`
3. **Database Rollback:** Run `npm run db:migrate:down` or restore pre-deploy snapshot.
