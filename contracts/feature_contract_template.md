# Feature Contract Template

> **Contract ID:** FC-[MODULE]-[NUMBER]  
> **Related Requirements:** [REQ-001, NFR-002]  
> **Responsible Agent:** `Architect`  
> **Target Files:** [file1.ts, file2.ts]

---

## 1. Feature Purpose
[Concise description of the capability being introduced or modified.]

---

## 2. API Contract Specification
- **Endpoint:** `[METHOD] /api/v1/[resource]`
- **Authentication:** [Public | Bearer JWT | API Key]
- **Rate Limit:** [e.g. 60 req/min]

### Request Body Schema:
```json
{
  "field1": "string (required)",
  "field2": "number (optional)"
}
```

### Response Schema:
- **Success (HTTP 200/201):**
```json
{
  "status": "success",
  "data": {}
}
```
- **Error (HTTP 400/404/422/500):**
```json
{
  "status": "error",
  "code": "VALIDATION_FAILED",
  "message": "Human readable explanation"
}
```

---

## 3. Data Model & Database Schema
```sql
CREATE TABLE [table_name] (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Test & Verification Acceptance Criteria (Gherkin)
- **Scenario 1 (Happy Path):**
  - *Given* [precondition]
  - *When* [action triggered]
  - *Then* [expected outcome]
- **Scenario 2 (Edge Case / Failure Mode):**
  - *Given* [invalid input or network error]
  - *When* [action triggered]
  - *Then* [error handled cleanly with appropriate HTTP status]
