---
name: testing-standards
description: >-
  Universal testing standards for FIGAS. Defines test patterns, withRollback
  usage, factory functions, Page Object Model, coverage thresholds, and CI
  integration.
always: true
---

# Testing Standards

## Test Hierarchy

| Layer | Tool | Location | Pattern |
|-------|------|----------|---------|
| Unit | Vitest | `tests/unit/` | `vi.mock()` — no real DB |
| Integration | Vitest | `tests/integration/` | `withRollback()` — real DB, rolled back |
| E2E | Playwright | `tests/e2e/` | Page Object Model + real DB + seed |
| Smoke | Vitest | `tests/smoke/` | Fast, mocked, critical paths only |

## Integration Test Pattern

```typescript
import { withRollback } from "tests/fixtures/helpers";

test("example", async () => {
  await withRollback(async (tx) => {
    // All DB changes rolled back after test
    const result = await someRepository.create(tx, { ... });
    expect(result).toBeDefined();
  });
});
```

- Always use `withRollback` — never `beforeAll`/`afterAll` for DB state.
- Each test must be independent and parallel-safe.
- Use `generateUniqueDate()` from `tests/fixtures/factories.ts` for unique test dates.

## Unit Test Pattern

```typescript
import { vi, describe, test, expect } from "vitest";

vi.mock("~/utils/db.server", () => ({
  db: { /* mock */ },
}));

// Test pure logic without DB
```

## E2E Test Pattern

- Use Page Object Models (e.g., `SchedulePage`).
- Never inline `page.locator()` calls in spec files.
- Use helpers for complex interactions (e.g., `drag-simulator.ts`).
- Store auth state in `tests/e2e/auth-state.json`.

## Factories

Use factory functions from `tests/fixtures/factories.ts` to create test data:

```typescript
import { createTestBooking, createTestPassenger } from "tests/fixtures/factories";
```

## Coverage Thresholds

| Metric | Threshold | Enforcement |
|--------|-----------|-------------|
| Integration tests passing | 100% | CI gate |
| E2E tests passing | 100% | CI gate |
| Unit tests passing | 100% | CI gate |
| Schedule handler branches | ≥90% | Code review |
| Repository method coverage | ≥80% | Code review |
| New code test coverage | ≥80% | PR gate |

## Running Tests

```bash
npm run test           # All vitest tests
npm run test:unit      # Unit tests only
npm run test:integration # Integration tests only
npm run test:e2e       # Playwright E2E tests
npm run test:all       # vitest + playwright
npm run test:related   # Only tests for changed files
npm run test:smoke     # Fast smoke suite (<30s)
```
