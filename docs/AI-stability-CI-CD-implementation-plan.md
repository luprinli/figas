# AI Code Stability CI/CD Implementation Plan

**Created:** 2026-06-19
**Based on:** `docs/AI_code_stability_best_practice.md` + full codebase audit
**Goal:** Integrate the 6-section best-practice framework into a robust, automated CI/CD pipeline with quality gates, pre-commit hooks, targeted test execution, and a reorganized skills structure that enforces stability throughout the development lifecycle.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Skills Restructuring](#2-skills-restructuring)
3. [Phase 1 — Foundation: Pre-Commit Guardrails](#3-phase-1--foundation-pre-commit-guardrails)
4. [Phase 2 — CI/CD Pipeline (GitHub Actions)](#4-phase-2--cicd-pipeline-github-actions)
5. [Phase 3 — Targeted Test Execution Engine](#5-phase-3--targeted-test-execution-engine)
6. [Phase 4 — AI Agent Rules & Prompt Engineering](#6-phase-4--ai-agent-rules--prompt-engineering)
7. [Phase 5 — Quality Gates & Merge Requirements](#7-phase-5--quality-gates--merge-requirements)
8. [Phase 6 — Monitoring & Regression Smoke Suite](#8-phase-6--monitoring--regression-smoke-suite)
9. [Implementation Timeline](#9-implementation-timeline)
10. [File Manifest](#10-file-manifest)

---

## 1. Current State Assessment

### 1.1 What Exists

| Asset | Status | Notes |
|-------|--------|-------|
| **TypeScript** (`tsc --noEmit`) | ✅ Configured | `npm run typecheck` works |
| **ESLint** | ✅ Configured | `.eslintrc.cjs` with React + TS plugins; `npm run lint` |
| **Vitest** (unit + integration) | ✅ Configured | 117 tests passing (59 unit + 58 integration); `vitest.config.ts` |
| **Playwright** (E2E) | ✅ Configured | 11 spec files; `playwright.config.ts`; `npm run test:e2e` |
| **Regression Trigger Map** | ✅ Defined | In `flight-schedule/SKILL.md` §Regression Trigger Map |
| **Validation Invariants** | ✅ Defined | 10 invariants with enforcement locations and tests |
| **Edge Case Registry** | ✅ Defined | 30 edge cases with test references |
| **Database Query Contracts** | ✅ Defined | 9 queries with result shapes |
| **Test Coverage Thresholds** | ✅ Defined | 100% integration/E2E, ≥90% handler branches, ≥80% new code |
| **PR Gate Checklist** | ✅ Defined | In `flight-schedule/SKILL.md` §CI/CD Integration |

### 1.2 What Is Missing (Critical Gaps)

| Gap | Severity | Impact |
|-----|----------|--------|
| **No `.github/workflows/`** | 🔴 Critical | No automated CI runs on push/PR |
| **No Husky / pre-commit hooks** | 🔴 Critical | No local guardrails before commit |
| **No `AGENTS.md`** | 🔴 Critical | AI agents have no behavioral constraints |
| **No `.kilo/` directory** | 🔴 Critical | Kilo has no project-level configuration |
| **No targeted test runner** | 🟡 High | Full suite runs every time; no change-detection |
| **No commitlint** | 🟡 High | Inconsistent commit messages |
| **No branch protection rules** | 🟡 High | Can merge without passing checks |
| **No `kilo.json`** | 🟡 High | No Kill-specific project config |
| **No Prettier / formatter** | 🟡 Medium | Inconsistent formatting; AI may introduce noise |
| **No mutation testing** | 🟢 Low | Per best-practice §4.3 |
| **No regression smoke suite** | 🟢 Low | Per best-practice §2.4 "Guardian Test" |
| **Skills only cover 2 domains** | 🟡 Medium | Only `flight-schedule` and `figas-test-automation` exist |
| **No scope-boundary enforcement** | 🔴 Critical | AI agents can touch any file without restriction |

### 1.3 Root Cause Analysis

The project has excellent **documentation** of what should happen (test coverage thresholds, regression trigger map, PR gate checklist) but zero **automation** to enforce it. The flight-schedule skill's CI/CD section (§1631–1675) describes an ideal pipeline that does not exist in the repository. This gap between documented requirements and automated enforcement is the primary risk vector for AI-introduced regressions.

---

## 2. Skills Restructuring

### 2.1 Current Structure

```
.agents/
└── skills/
    ├── figas-test-automation/
    │   └── SKILL.md          (1619 lines — testing patterns, startup, seed data)
    └── flight-schedule/
        └── SKILL.md          (2156 lines — scheduling contracts, invariants, CI/CD)
```

**Problems:**
- `flight-schedule/SKILL.md` is 2156 lines — too large for an AI context window alongside code
- CI/CD rules are buried in a domain-specific skill instead of being universal
- No skill covers: general code stability, PR workflow, lint/format rules, component patterns
- Missing domains: check-in, finance, booking, admin, engineering

### 2.2 Proposed Structure

```
.agents/
├── AGENTS.md                          # NEW: Top-level behavioral rules (all agents)
└── skills/
    ├── _global/                       # NEW: Universal skills (all agents)
    │   ├── code-stability.md          # NEW: Core stability rules from best-practice doc
    │   ├── ci-cd-workflow.md          # NEW: CI/CD pipeline contract
    │   └── testing-standards.md       # MOVED: Extracted from figas-test-automation
    ├── flight-schedule/               # REFACTORED: Trim to contracts only
    │   └── SKILL.md                   # ~800 lines (interfaces, invariants, queries, edge cases)
    ├── figas-test-automation/         # REFACTORED: Trim to automation patterns only
    │   └── SKILL.md                   # ~600 lines (E2E patterns, POM, drag simulation)
    ├── checkin/                       # NEW
    │   └── SKILL.md                   # Check-in workflow, payment collection, weight validation
    ├── finance/                       # NEW
    │   └── SKILL.md                   # Invoicing, reconciliation, exports, Stripe integration
    ├── booking/                       # NEW
    │   └── SKILL.md                   # Booking wizard, passenger management, itinerary
    └── admin/                         # NEW
        └── SKILL.md                   # User management, PBAC, aerodromes, aircraft, settings
```

### 2.3 Skill Content Allocation

| Skill | Max Lines | Content |
|-------|-----------|---------|
| `AGENTS.md` | 200 | Behavioral rules (scope, forbidden actions, workflow, quality gates) |
| `_global/code-stability.md` | 150 | Surgical principle, explain→diff→verify, regression prevention, defensive coding |
| `_global/ci-cd-workflow.md` | 100 | Pre-commit hooks, CI pipeline stages, quality gates, merge requirements |
| `_global/testing-standards.md` | 200 | Test patterns, withRollback, factories, POM, coverage thresholds |
| `flight-schedule/SKILL.md` | 800 | Interfaces, invariants, query contracts, edge cases, regression trigger map |
| `figas-test-automation/SKILL.md` | 600 | E2E setup, seeding, drag simulation, auth-state, known pitfalls |
| `checkin/SKILL.md` | 300 | Check-in flow, payment at counter, weight validation, freight check-in |
| `finance/SKILL.md` | 300 | Invoice generation, payment allocation, reconciliation, exports |
| `booking/SKILL.md` | 300 | Booking wizard steps, passenger-leg junction, fare calculation |
| `admin/SKILL.md` | 200 | PBAC roles, user management, reference data CRUD |

### 2.4 Skill Loading Strategy

| Agent Type | Skills Loaded |
|------------|---------------|
| **All agents** | `AGENTS.md` + `_global/*` (always loaded) |
| **Schedule work** | `+ flight-schedule` |
| **Test work** | `+ figas-test-automation` |
| **Check-in work** | `+ checkin` |
| **Finance work** | `+ finance` |
| **Booking work** | `+ booking` |
| **Admin work** | `+ admin` |

---

## 3. Phase 1 — Foundation: Pre-Commit Guardrails

### 3.1 Husky + lint-staged

**Goal:** Catch violations before they enter the commit history.

```bash
npm install -D husky lint-staged
npx husky init
```

**`.husky/pre-commit`** (new file):
```bash
npx lint-staged
npx tsc --noEmit
```

**`.husky/commit-msg`** (new file):
```bash
npx --no -- commitlint --edit $1
```

**`package.json`** additions:
```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix --max-warnings 0",
      "prettier --check"
    ],
    "*.{ts,tsx,js,cjs,mjs,json,css,md}": [
      "prettier --check"
    ]
  }
}
```

### 3.2 Prettier Configuration

**`.prettierrc`** (new file):
```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always"
}
```

**`.prettierignore`** (new file):
```
node_modules
build
public/build
.netlify
generated
test-results
playwright-report
*.csv
*.sql
```

### 3.3 Commitlint Configuration

```bash
npm install -D @commitlint/config-conventional @commitlint/cli
```

**`commitlint.config.js`** (new file):
```javascript
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", [
      "feat", "fix", "docs", "style", "refactor", "perf",
      "test", "build", "ci", "chore", "revert"
    ]],
    "scope-enum": [2, "always", [
      "schedule", "checkin", "finance", "booking", "admin",
      "auth", "ui", "db", "test", "ci", "docs", "deps"
    ]]
  }
};
```

### 3.4 Pre-Commit Verification Flow

```
Developer runs `git commit`
        │
        ▼
┌───────────────────┐
│ lint-staged        │
│ ├─ eslint --fix    │  ← Only staged .ts/.tsx files
│ ├─ prettier --check│  ← Format validation
│ └─ (exit if fail)  │
└───────┬───────────┘
        │ pass
        ▼
┌───────────────────┐
│ tsc --noEmit       │  ← Full type check
│ (exit if fail)     │
└───────┬───────────┘
        │ pass
        ▼
┌───────────────────┐
│ commitlint         │  ← Validate commit message format
│ (exit if fail)     │
└───────┬───────────┘
        │ pass
        ▼
    Commit created
```

### 3.5 `.gitignore` Updates

Add:
```
# Prettier
.prettierrc

# Husky
.husky/_/
```

---

## 4. Phase 2 — CI/CD Pipeline (GitHub Actions)

### 4.1 Directory Structure

```
.github/
└── workflows/
    ├── ci.yml                  # Main CI: lint, typecheck, unit, integration
    ├── e2e.yml                 # E2E tests (slower, runs on schedule + PR)
    ├── targeted-tests.yml      # Targeted test execution based on changed files
    └── code-quality.yml        # Weekly: dependency audit, bundle analysis
```

### 4.2 Main CI Workflow (`ci.yml`)

```yaml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  unit-tests:
    needs: lint-and-typecheck
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: unit-test-results
          path: test-results/

  integration-tests:
    needs: lint-and-typecheck
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: figas_test
          POSTGRES_PASSWORD: figas_test
          POSTGRES_DB: figas_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - name: Run migrations
        run: npx tsx app/utils/migrate.ts
        env:
          DATABASE_URL: postgresql://figas_test:figas_test@localhost:5432/figas_test
      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://figas_test:figas_test@localhost:5432/figas_test

  invariant-check:
    needs: [unit-tests, integration-tests]
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - name: Verify all 10 invariants have tests
        run: node scripts/ci/verify-invariants.js
```

### 4.3 E2E Workflow (`e2e.yml`)

```yaml
name: E2E Tests
on:
  pull_request:
    branches: [main]
    paths:
      - 'app/**'
      - 'tests/e2e/**'
      - 'playwright.config.ts'
  schedule:
    - cron: '0 6 * * 1-5'  # Weekdays at 06:00 UTC

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: figas_test
          POSTGRES_PASSWORD: figas_test
          POSTGRES_DB: figas_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - name: Setup database
        run: |
          npx tsx app/utils/migrate.ts
          npm run seed:full
          npm run seed:pbac
          npm run seed:pbac:assign
        env:
          DATABASE_URL: postgresql://figas_test:figas_test@localhost:5432/figas_test
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
      - name: Run E2E tests
        run: npm run test:e2e
        env:
          DATABASE_URL: postgresql://figas_test:figas_test@localhost:5432/figas_test
          SESSION_SECRET: ci-test-secret-do-not-use-in-prod
          CSRF_SECRET: ci-test-csrf-secret
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

### 4.4 Targeted Test Workflow (`targeted-tests.yml`)

```yaml
name: Targeted Tests
on:
  pull_request:
    branches: [main, develop]

jobs:
  detect-and-run:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    outputs:
      test_suites: ${{ steps.detect.outputs.suites }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - id: detect
        name: Detect changed files and map to test suites
        run: node scripts/ci/detect-changed-suites.js
      - name: Run targeted tests
        if: steps.detect.outputs.suites != ''
        run: |
          for suite in ${{ steps.detect.outputs.suites }}; do
            echo "Running: $suite"
            npx vitest run $suite
          done
```

---

## 5. Phase 3 — Targeted Test Execution Engine

### 5.1 Design

The targeted test engine translates **file changes** → **test suites** using the Regression Trigger Map already defined in `flight-schedule/SKILL.md` §1557–1628, extended to cover all domains.

### 5.2 Implementation: `scripts/ci/detect-changed-suites.js`

This script:
1. Gets the diff between the PR base branch and HEAD via `git diff --name-only`
2. Maps each changed file to its required test suites using a lookup table
3. Outputs a deduplicated, sorted list of test suite paths
4. Special flags: if `prisma/schema.prisma` or any migration file changes → run ALL tests

### 5.3 Extension: Trigger Map for All Domains

The existing Regression Trigger Map (flight-schedule only) must be extended:

```
# scripts/ci/trigger-map.json
{
  "app/utils/scheduling/**":        ["tests/unit/scheduling", "tests/integration/scheduling"],
  "app/utils/schedule-handlers.server.ts": ["tests/integration/scheduling"],
  "app/utils/repositories/schedule.ts":     ["tests/integration/scheduling/schedule-status-flow", "tests/integration/scheduling/auto-build"],
  "app/utils/repositories/booking*.ts":     ["tests/integration/scheduling"],
  "app/components/schedule/**":             ["tests/e2e/scheduling.spec.ts"],
  "app/utils/repositories/checkin.ts":      ["tests/integration/checkin"],
  "app/utils/repositories/booking-leg-passenger.ts": ["tests/integration/scheduling", "tests/integration/checkin"],
  "app/routes/checkin.*":                   ["tests/integration/checkin", "tests/e2e/checkin.spec.ts"],
  "app/routes/finance.*":                   ["tests/e2e/finance.spec.ts"],
  "app/routes/bookings.*":                  ["tests/e2e/bookings.spec.ts"],
  "app/components/checkin/**":              ["tests/e2e/checkin.spec.ts"],
  "app/utils/pricing/**":                   ["tests/integration/scheduling"],
  "app/utils/loadsheet/**":                 ["tests/integration/scheduling"],
  "app/utils/services/no-fly.service.ts":   ["tests/integration/scheduling"],
  "prisma/schema.prisma":                   ["__ALL__"],
  "migrations/**":                          ["__ALL__"],
  "tests/fixtures/**":                      ["__ALL__"],
  "app/utils/db.server.ts":                 ["__ALL__"]
}
```

### 5.4 npm Script

```json
{
  "scripts": {
    "test:related": "node scripts/ci/detect-changed-suites.js --run"
  }
}
```

Usage: `npm run test:related` — detects changed files vs `main` and runs only the affected test suites.

---

## 6. Phase 4 — AI Agent Rules & Prompt Engineering

### 6.1 `AGENTS.md` (Root Level)

This file is loaded by Kilo and other AI agents as behavioral instructions. It enforces the best-practice document's recommendations programmatically.

```markdown
# FIGAS Agent Rules — Code Stability & Regression Prevention

## Prime Directive
Solve tasks with minimal, surgical changes. Never introduce regressions.

## Scope Enforcement
- Only modify files explicitly required for the task.
- Before editing any file, state why it must change.
- Strictly forbidden: touching package.json, tsconfig.json, .eslintrc.cjs,
  vite.config.ts, CI/CD files, or any config unless the task explicitly requires it.
- If you identify unrelated improvements, list them as "Suggestions" — do not apply.

## Step-by-Step Protocol
1. Analyze — Summarize root cause and files involved.
2. Plan — Bullet list of exact edits (file, function, line range).
   Wait for confirmation unless task is marked [AUTO].
3. Execute — One file at a time. Show diff after each.
4. Quality Gate — Run `npm run lint` and `npm run typecheck`. Fix introduced errors.
5. Verify — Run `npm run test:related` to test only affected modules.
   Never disable a test to make it pass.

## Code Integrity Rules
- Do not remove error handling, fallback logic, or safety checks.
- Do not rename variables/functions outside task scope.
- When changing an API, search all usages and update them without altering internal logic.
- Preserve all comments and documentation.
- Maintain exact indentation and formatting of surrounding code.

## Emergency Stop
If a change affects more files than planned, stop immediately and inform the user.

## Project Commands
- Lint: `npm run lint`
- Type check: `npm run typecheck`
- Related tests: `npm run test:related`
- All tests: `npm run test:all`
- Build: `npm run build`
```

### 6.2 `kilo.json` (Root Level)

```json
{
  "agents": {
    "default": {
      "instructions": ".agents/AGENTS.md",
      "skills": ["_global/code-stability", "_global/testing-standards"]
    }
  },
  "skills": {
    "flight-schedule": {
      "path": ".agents/skills/flight-schedule/SKILL.md",
      "triggers": ["app/utils/scheduling/**", "app/components/schedule/**"]
    },
    "figas-test-automation": {
      "path": ".agents/skills/figas-test-automation/SKILL.md",
      "triggers": ["tests/**", "playwright.config.ts", "vitest.config.ts"]
    },
    "code-stability": {
      "path": ".agents/skills/_global/code-stability.md",
      "always": true
    },
    "testing-standards": {
      "path": ".agents/skills/_global/testing-standards.md",
      "always": true
    },
    "ci-cd-workflow": {
      "path": ".agents/skills/_global/ci-cd-workflow.md",
      "triggers": [".github/**", ".husky/**"]
    }
  },
  "permissions": {
    "allow": [
      "app/**",
      "tests/**",
      "scripts/**",
      "prisma/**",
      "migrations/**",
      "docs/**"
    ],
    "deny": [
      ".env",
      ".env.*",
      "node_modules/**",
      "build/**",
      ".netlify/**"
    ]
  }
}
```

### 6.3 `_global/code-stability.md` Skill

Extracted from the best-practice document §1.1–1.5:

```markdown
---
name: code-stability
description: Enforces surgical change discipline, regression prevention, and mandatory verification workflow for all AI agents.
always: true
---

# Code Stability Rules

## Surgical Principle
- Prefer minimally invasive changes. A single conditional guard is better than a function rewrite.
- When changing a function signature, check ALL call sites across the codebase.
- New features must be isolated behind feature flags or new components, leaving existing paths untouched.

## Forbidden Actions (Will Cause Task Failure)
- Do NOT touch package.json, build files, configs, or CI scripts unless task explicitly states it.
- Do NOT reorder imports, change formatting, or rename variables outside the targeted scope.
- Do NOT implement additional "nice-to-have" features beyond the stated requirement.
- Do NOT remove error handling, fallbacks, or edge-case code.
- If a change requires updating multiple dependent files, list them all in the Plan step and confirm.

## Quality Gates (Must Pass)
- After editing: `npm run lint` — fix any newly introduced errors.
- For TypeScript: `npm run typecheck` must succeed.
- Run `npm run test:related` for affected modules. Never disable a test to make it pass.

## Regression Prevention
- Use `git diff` to review every changed hunk before accepting.
- Run a smoke test of unrelated areas after every change.
- Check the Regression Trigger Map in `flight-schedule/SKILL.md` for the full file→test mapping.
```

---

## 7. Phase 5 — Quality Gates & Merge Requirements

### 7.1 Branch Protection Rules (GitHub Settings)

Configured via GitHub UI or API — not committed to repo:

| Rule | Value |
|------|-------|
| **Require pull request before merging** | ✅ Enabled |
| **Required approvals** | 1 |
| **Dismiss stale approvals** | ✅ Enabled |
| **Require status checks to pass** | `lint-and-typecheck`, `unit-tests`, `integration-tests`, `invariant-check` |
| **Require conversation resolution** | ✅ Enabled |
| **Require linear history** | ✅ Enabled (no merge commits on main) |
| **Do not allow bypass** | ✅ Enabled for administrators |

### 7.2 PR Gate Checklist (Automated)

The CI pipeline enforces this checklist automatically:

| Gate | Implementation | Blocking? |
|------|---------------|-----------|
| Lint passes (0 warnings) | `npm run lint` in CI | ✅ Yes |
| TypeScript compiles | `npm run typecheck` in CI | ✅ Yes |
| Unit tests pass | `npm run test:unit` in CI | ✅ Yes |
| Integration tests pass | `npm run test:integration` in CI | ✅ Yes |
| 10 validation invariants have tests | `scripts/ci/verify-invariants.js` | ✅ Yes |
| E2E tests pass (if app/ changed) | `e2e.yml` workflow | ✅ Yes |
| Targeted tests pass (changed files) | `targeted-tests.yml` workflow | ✅ Yes |
| Commit messages follow conventional commits | `commitlint` in pre-commit hook | ✅ Yes |
| No secrets in code | Secret scanning (GitHub native) | ✅ Yes |

### 7.3 `scripts/ci/verify-invariants.js`

This script verifies that each of the 10 validation invariants has a corresponding test:

```javascript
// Maps invariant numbers to their required test files
const INVARIANT_TESTS = {
  1: "tests/integration/scheduling/auto-build.test.ts",    // No-fly day
  2: "tests/integration/scheduling/schedule-status-flow.test.ts", // Approve requires flights
  3: "tests/integration/scheduling/schedule-status-flow.test.ts", // Publish requires captain
  4: "tests/integration/scheduling/auto-build.test.ts",    // Pilot constraints
  5: "tests/unit/scheduling/flight-validation.test.ts",    // Weight & balance
  6: "tests/integration/scheduling/unassign-booking.test.ts", // Empty flight cleanup
  7: "tests/integration/scheduling/assign-booking.test.ts", // Route insertion integrity
  8: "tests/integration/scheduling/schedule-status-flow.test.ts", // Status transitions
  9: "tests/integration/scheduling/schedule-status-flow.test.ts", // Audit trail
  10: "tests/integration/scheduling/permissions.test.ts",  // Permission enforcement
};

// For each invariant, verify the test file exists and contains a relevant test case
```

### 7.4 Merge Queue Strategy

```
Developer pushes branch
        │
        ▼
┌────────────────────────────┐
│ Pre-commit hooks (local)    │
│ ├─ lint-staged              │
│ ├─ tsc --noEmit             │
│ └─ commitlint               │
└──────────┬─────────────────┘
           │ passes
           ▼
┌────────────────────────────┐
│ Push to GitHub              │
└──────────┬─────────────────┘
           │
           ▼
┌────────────────────────────┐
│ CI Pipeline (GitHub Actions) │
│ ├─ lint + typecheck          │
│ ├─ unit tests                │
│ ├─ integration tests         │
│ ├─ invariant check           │
│ ├─ targeted tests            │
│ └─ E2E (if app/** changed)   │
└──────────┬─────────────────┘
           │ all pass
           ▼
┌────────────────────────────┐
│ PR Review                    │
│ ├─ 1 approval required       │
│ ├─ All conversations resolved│
│ └─ Linear history enforced   │
└──────────┬─────────────────┘
           │ approved
           ▼
       Merge to main
```

---

## 8. Phase 6 — Monitoring & Regression Smoke Suite

### 8.1 Guardian Smoke Test Suite

A lightweight smoke test suite that runs **after every AI session**, covering critical paths that should never break:

```
tests/smoke/
├── auth.smoke.ts          # Login, logout, session persistence
├── schedule-board.smoke.ts # Schedule board renders, date picker works, flights visible
├── booking-list.smoke.ts  # Booking list loads, search works
├── checkin-counter.smoke.ts # Check-in page loads, flight selector works
└── navigation.smoke.ts    # All sidebar links resolve (200), no broken routes
```

**npm script:** `npm run test:smoke` — runs in <30 seconds, no database seeding required (uses mocks).

### 8.2 Per-Session Verification Script

A convenience script to run after an AI coding session:

```bash
#!/bin/bash
# scripts/ci/post-session-check.sh
echo "=== Post-Session Stability Check ==="
echo ""
echo "1. TypeScript compilation..."
npx tsc --noEmit && echo "   ✅ Passed" || echo "   ❌ Failed"
echo ""
echo "2. ESLint..."
npx eslint app/ --ext .ts,.tsx --max-warnings 0 && echo "   ✅ Passed" || echo "   ❌ Failed"
echo ""
echo "3. Related tests..."
npm run test:related && echo "   ✅ Passed" || echo "   ❌ Failed"
echo ""
echo "4. Git diff summary..."
git diff --stat
echo ""
echo "=== Check Complete ==="
```

### 8.3 Weekly Code Quality Audit

Scheduled GitHub Action (`code-quality.yml`):

```yaml
name: Code Quality Audit
on:
  schedule:
    - cron: '0 8 * * 1'  # Every Monday at 08:00 UTC

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
      - run: npm ci
      - name: Dependency audit
        run: npm audit --audit-level=high
      - name: Check for unused dependencies
        run: npx depcheck
      - name: Bundle size analysis
        run: npm run build
      - name: Test coverage report
        run: npx vitest run --coverage
```

### 8.4 Renovate Configuration Update

Update `renovate.json` to group AI-stability-related dependencies:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["local>netlify-templates/renovate-config"],
  "packageRules": [
    {
      "matchPackageNames": ["husky", "lint-staged", "@commitlint/*", "prettier"],
      "groupName": "CI guardrails"
    },
    {
      "matchPackageNames": ["vitest", "@playwright/test", "eslint", "typescript"],
      "groupName": "Testing & quality"
    }
  ]
}
```

---

## 9. Implementation Timeline

### Week 1 — Foundation (Phase 1)

| Day | Task | Effort |
|-----|------|--------|
| 1 | Install Husky, lint-staged, Prettier, commitlint | 2h |
| 1 | Create `.prettierrc`, `.prettierignore`, `commitlint.config.js` | 1h |
| 2 | Configure `.husky/pre-commit` and `.husky/commit-msg` hooks | 1h |
| 2 | Run Prettier on entire codebase (one-time formatting commit) | 1h |
| 3 | Create `AGENTS.md` at project root | 1h |
| 3 | Create `kilo.json` with skill definitions and permissions | 1h |
| 4 | Create `.agents/skills/_global/code-stability.md` | 1h |
| 4 | Create `.agents/skills/_global/ci-cd-workflow.md` | 1h |
| 5 | Extract `testing-standards.md` from `figas-test-automation/SKILL.md` | 1h |
| 5 | Trim `flight-schedule/SKILL.md` to contracts only | 2h |
| **Total** | | **12h** |

### Week 2 — CI/CD Pipeline (Phases 2–3)

| Day | Task | Effort |
|-----|------|--------|
| 1 | Create `.github/workflows/ci.yml` | 3h |
| 2 | Create `.github/workflows/e2e.yml` | 2h |
| 3 | Create `scripts/ci/detect-changed-suites.js` | 3h |
| 3 | Create `scripts/ci/trigger-map.json` | 2h |
| 4 | Create `scripts/ci/verify-invariants.js` | 2h |
| 4 | Create `.github/workflows/targeted-tests.yml` | 2h |
| 5 | Create `.github/workflows/code-quality.yml` | 1h |
| 5 | Add `npm run test:related` script to `package.json` | 0.5h |
| **Total** | | **15.5h** |

### Week 3 — Quality Gates & Skills (Phases 4–5)

| Day | Task | Effort |
|-----|------|--------|
| 1 | Configure branch protection rules on GitHub | 1h |
| 2 | Create `checkin/SKILL.md` | 2h |
| 2 | Create `finance/SKILL.md` | 2h |
| 3 | Create `booking/SKILL.md` | 2h |
| 3 | Create `admin/SKILL.md` | 1.5h |
| 4 | Finalize `kilo.json` with all skill triggers | 1h |
| 5 | Documentation: Update `docs/SETUP.md` with new CI workflow | 1h |
| **Total** | | **10.5h** |

### Week 4 — Smoke Suite & Polish (Phase 6)

| Day | Task | Effort |
|-----|------|--------|
| 1 | Create `tests/smoke/auth.smoke.ts` | 1h |
| 1 | Create `tests/smoke/schedule-board.smoke.ts` | 1h |
| 2 | Create `tests/smoke/booking-list.smoke.ts` | 1h |
| 2 | Create `tests/smoke/checkin-counter.smoke.ts` | 1h |
| 2 | Create `tests/smoke/navigation.smoke.ts` | 1h |
| 3 | Create `scripts/ci/post-session-check.sh` | 1h |
| 3 | Update `renovate.json` | 0.5h |
| 4 | End-to-end validation: run full CI pipeline on a test branch | 2h |
| 5 | Fix any issues found during validation | 2h |
| 5 | Final documentation polish | 1h |
| **Total** | | **10.5h** |

### Grand Total: ~48.5 hours (4 weeks)

---

## 10. File Manifest

### New Files to Create

| File | Purpose | Phase |
|------|---------|-------|
| `.husky/pre-commit` | Pre-commit hook (lint-staged + tsc) | 1 |
| `.husky/commit-msg` | Commit message validation | 1 |
| `.prettierrc` | Code formatting rules | 1 |
| `.prettierignore` | Formatting exclusions | 1 |
| `commitlint.config.js` | Commit message convention rules | 1 |
| `AGENTS.md` | Top-level AI agent behavioral rules | 1 |
| `kilo.json` | Kilo project configuration | 1 |
| `.agents/skills/_global/code-stability.md` | Universal stability rules | 1 |
| `.agents/skills/_global/ci-cd-workflow.md` | CI/CD pipeline contract | 1 |
| `.agents/skills/_global/testing-standards.md` | Extracted testing patterns | 1 |
| `.github/workflows/ci.yml` | Main CI pipeline | 2 |
| `.github/workflows/e2e.yml` | E2E test pipeline | 2 |
| `.github/workflows/targeted-tests.yml` | Change-based test execution | 2 |
| `.github/workflows/code-quality.yml` | Weekly quality audit | 2 |
| `scripts/ci/detect-changed-suites.js` | File→test mapping engine | 3 |
| `scripts/ci/trigger-map.json` | Extended regression trigger map | 3 |
| `scripts/ci/verify-invariants.js` | Invariant test presence checker | 3 |
| `scripts/ci/post-session-check.sh` | Post-AI-session verification | 6 |
| `.agents/skills/checkin/SKILL.md` | Check-in domain skill | 5 |
| `.agents/skills/finance/SKILL.md` | Finance domain skill | 5 |
| `.agents/skills/booking/SKILL.md` | Booking domain skill | 5 |
| `.agents/skills/admin/SKILL.md` | Admin domain skill | 5 |
| `tests/smoke/auth.smoke.ts` | Guardian smoke test | 6 |
| `tests/smoke/schedule-board.smoke.ts` | Guardian smoke test | 6 |
| `tests/smoke/booking-list.smoke.ts` | Guardian smoke test | 6 |
| `tests/smoke/checkin-counter.smoke.ts` | Guardian smoke test | 6 |
| `tests/smoke/navigation.smoke.ts` | Guardian smoke test | 6 |

### Files to Modify

| File | Change | Phase |
|------|--------|-------|
| `package.json` | Add `lint-staged`, `test:related`, `test:smoke`, `prepare` scripts; add devDependencies | 1, 3, 6 |
| `.gitignore` | Add `.prettierrc`, `.husky/_/` | 1 |
| `renovate.json` | Add package grouping rules | 6 |
| `.agents/skills/flight-schedule/SKILL.md` | Trim to ~800 lines (contracts only); move CI/CD to `_global/` | 1 |
| `.agents/skills/figas-test-automation/SKILL.md` | Trim to ~600 lines (automation patterns only); move testing standards to `_global/` | 1 |
| `docs/SETUP.md` | Add CI/CD setup instructions, new npm scripts | 5 |

### Files to Delete

| File | Reason | Phase |
|------|--------|-------|
| *(none)* | — | — |

---

## Appendix A: Deviation from Best-Practice Document

The best-practice document recommends **mutation testing** (§4.3). This plan defers it to a future iteration because:
1. The project has no existing mutation testing infrastructure.
2. The 10 validation invariants and 30 registered edge cases provide strong coverage already.
3. Mutation testing tools for TypeScript (Stryker) require significant configuration for Remix + Prisma.

**Future recommendation:** Evaluate StrykerJS in Quarter 3 2026 once the CI/CD pipeline is stable.

## Appendix B: Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| CI pipeline exists | ❌ No | ✅ Yes | GitHub Actions active on main branch |
| Pre-commit hooks active | ❌ No | ✅ Yes | Husky configured on all developer machines |
| Commit message convention | ❌ None | ✅ Conventional Commits | Commitlint passing |
| AI agents have behavioral rules | ❌ No | ✅ Yes | AGENTS.md + kilo.json present |
| Targeted test execution | ❌ No | ✅ Yes | `npm run test:related` functional |
| Merge blocked by failing CI | ❌ No | ✅ Yes | Branch protection rules enforced |
| Regression smoke suite | ❌ No | ✅ Yes | `tests/smoke/` with 5 suites |
| Code formatting consistent | ❌ No | ✅ Yes | Prettier enforced at pre-commit |
| Domain skills coverage | 2/6 domains | 6/6 domains | Skills exist for all major domains |
| Post-AI-session verification | ❌ No | ✅ Yes | `scripts/ci/post-session-check.sh` available |
