---
name: ci-cd-workflow
description: >-
  CI/CD pipeline contract for FIGAS. Defines pre-commit hooks, CI pipeline
  stages, quality gates, and merge requirements.
triggers: [".github/**", ".husky/**", "package.json"]
---

# CI/CD Workflow Contract

## Pre-Commit Hooks

Before every commit, the following run automatically via Husky:

1. **lint-staged** — ESLint (`--fix`, `--max-warnings 0`) + Prettier (`--check`) on staged `.ts`/`.tsx` files
2. **TypeScript** — `tsc --noEmit` on the full project
3. **commitlint** — Validates commit message against Conventional Commits

## CI Pipeline (GitHub Actions)

On every push to `main`/`develop` and every PR:

| Stage | What Runs | Timeout |
|-------|-----------|---------|
| `lint-and-typecheck` | `npm run lint` + `npm run typecheck` | 10 min |
| `unit-tests` | `npm run test:unit` | 10 min |
| `integration-tests` | `npm run test:integration` (with PostgreSQL service) | 15 min |
| `invariant-check` | `scripts/ci/verify-invariants.js` | 5 min |

## E2E Tests

Run on PRs that touch `app/**`, `tests/e2e/**`, or `playwright.config.ts`, and on weekdays at 06:00 UTC.

## Targeted Tests

`scripts/ci/detect-changed-suites.js` maps changed files to test suites using `scripts/ci/trigger-map.json` and runs only affected suites.

## Quality Gates (All Blocking Merge)

- Lint passes (0 warnings)
- TypeScript compiles
- Unit tests pass
- Integration tests pass
- All 10 validation invariants have tests
- E2E tests pass (if app/ changed)
- Targeted tests pass (based on changed files)
- Commit messages follow Conventional Commits
- No secrets in code (GitHub native scanning)

## Branch Protection

- Require PR before merging
- 1 approval required
- Dismiss stale approvals
- Status checks: `lint-and-typecheck`, `unit-tests`, `integration-tests`, `invariant-check`
- Require conversation resolution
- Require linear history
