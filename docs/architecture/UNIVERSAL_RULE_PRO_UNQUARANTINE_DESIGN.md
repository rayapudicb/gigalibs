# Architecture Design: Universal Rule Engine Promotion & Adoption (Release 2 Foundation)

- **Work Item:** WI-OI-054
- **Module:** `@gigalibs/rule-engine-universal` & `modules/universal-rule-pro`
- **Blueprint Release:** Release 2 (Reusable Foundations)
- **Deployment Profile:** `configuration-local-development-v1`
- **Requirements:** FR-06, FR-08, FR-12, FR-14, FR-16; NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-PERF-001–003, NFR-OBS-001–004

---

## 1. Context & Business Drivers

The Blueprint establishes Universal Rule Pro as the enterprise declarative decision engine across financial workflows, spend thresholds, credit limits, and operational automation.
The core declarative rule engine (`@gigalibs/rule-engine-universal`) was previously placed in runtime quarantine (`config/runtime-quarantine.json`) pending test certification, prototype security hardening, and workspace integration.

WI-OI-054 executes the formal promotion gate per `docs/runtime-quarantine.md`:
1. Hardens `FactExtractor` against prototype pollution (`__proto__`, `prototype`, `constructor`).
2. Introduces comprehensive test suites for operators, fact extraction, recursive AST condition trees (`ALL`, `ANY`, `NOT`), state-aware precondition guards, and idempotency key locks.
3. Promotes `@gigalibs/rule-engine-universal` out of quarantine into the active workspace.
4. Integrates the engine as an active dependency of `modules/universal-rule-pro/apps/api`.
5. Preserves all 7 CMMS protected file hashes and validates all 6 SDLC governance audits.

---

## 2. Technical Design

### 2.1 Prototype Pollution Hardening in `FactExtractor`
```typescript
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export class FactExtractor {
  static resolvePath(facts: Record<string, unknown>, path: string): unknown {
    if (!path) return undefined;
    if (path in facts && !FORBIDDEN_KEYS.has(path)) return facts[path];

    const parts = path.split('.');
    let current: any = facts;

    for (const part of parts) {
      if (FORBIDDEN_KEYS.has(part)) return undefined;
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }
}
```

### 2.2 Operator Suite Certification
Verify standard operators with deterministic comparison semantics:
- Equality: `equal`, `notEqual`
- Numerics: `greaterThan`, `greaterThanInclusive`, `lessThan`, `lessThanInclusive` (safe NaN handling)
- Collections & Substrings: `in`, `notIn`, `contains`, `doesNotContain`, `startsWith`, `endsWith`
- Patterns & Dates: `regexMatch`, `isDateAfter`, `isDateBefore`

### 2.3 AST Evaluation & State Precondition Guards
1. Recursive evaluation of condition groups (`all`, `any`, `not`) and leaves (`fact`, `operator`, `value`).
2. Precondition guards (`requiresPriorEventId`, `idempotencyKey`).
3. Priority-sorted rule execution with audit trail generation.

### 2.4 Quarantine Promotion Checklist (Per `docs/runtime-quarantine.md`)
- [x] Authoritative implementation (no mocks or silent fallbacks).
- [x] Safe input resolution with prototype pollution guards.
- [x] Comprehensive unit test matrix (100% pass rate).
- [x] Workspace integration: remove from `config/runtime-quarantine.json` and `pnpm-workspace.yaml`.
- [x] Connect to active consumer (`@gigalibs/rules-api`).
- [x] Green SDLC audits (`api-boundary`, `package-dependencies`, `production-data`, `all-runtime-data`, `navigation`, `sdlc`).
