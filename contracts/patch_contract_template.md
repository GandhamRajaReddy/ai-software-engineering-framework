# Patch Contract Template

> **Patch ID:** PATCH-[TASK_ID]-[SEQUENCE]  
> **Target Task:** [TASK-003]  
> **Responsible Agent:** `Senior Builder`  
> **Timestamp:** [YYYY-MM-DDTHH:MM:SSZ]

---

## 1. Patch Metadata
- **Target File Path:** `[relative/path/to/file.ext]`
- **Action Type:** [CREATE | MODIFY | DELETE]
- **Original Line Count:** [0 if new file]
- **Lines Added / Changed:** [<= 50 lines per surgical patch]
- **Pre-Change Verification:** File verified on disk (exists: YES).

---

## 2. Technical Justification
[Explain why this specific minimal change fulfills the task requirement without touching unrelated code.]

---

## 3. Surgical Code Change
*(Full complete code without any ellipsis placeholders like `// ... rest of code`)*

```typescript
// Complete runnable code
```

---

## 4. TDD Verification Evidence
- **Test File Target:** `[path/to/test.ts]`
- **Red Verification (Failing before change):**
  - Command: `[test command]`
  - Output: `[Test failed as expected with Exit Code 1]`
- **Green Verification (Passing after change):**
  - Command: `[test command]`
  - Output: `[All tests passing with Exit Code 0]`
