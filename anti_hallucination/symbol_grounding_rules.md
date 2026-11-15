# Symbol-Level AST Grounding Rules

> **Objective:** Eliminate hallucinated imports, non-existent methods, and invalid type references.

---

## 1. Symbol Grounding Invariant
Before writing any code that invokes an external function, method, or class:
1. **Verify Export:** Inspect the file where the symbol is defined to confirm it is actually exported (`export function xyz`, `export const abc`, or `__all__`).
2. **Verify Signature:** Check parameter types and return signatures. Never guess whether a function returns a Promise, accepts an object options dictionary, or takes positional arguments.
3. **Verify Module Resolution:** In TypeScript / ES Modules, check whether relative paths require extensions (`.js` in Node Next resolution) or path aliases (`@/lib/...` configured in `tsconfig.json`).

---

## 2. Prohibited Patterns & Safe Alternatives

| Prohibited Hallucination Pattern | Why It Breaks | Required Safe Protocol |
|:---------------------------------|:--------------|:-----------------------|
| Invoking unverified third-party methods (e.g. `jwt.verifyAsync()`) | Method does not exist on library | Check library type definitions or use standard `jwt.verify(token, secret, callback)` wrapped in `util.promisify` |
| Calling helper functions from other project files without checking | Function name may be different or unexported | Use grep or read target file before writing the import |
| Assuming database client methods (e.g. `db.findOrUpsert()`) | ORMs have specific APIs (`prisma.upsert()`, `drizzle.insert().onConflictDoUpdate()`) | Check ORM documentation or schema definitions |
