# FIGAS Documentation

**Last Updated:** 2026-07-14

---

## Reading Guide

| Audience | Start Here | Then Read |
|----------|-----------|-----------|
| **New Developer** | `docs/SETUP.md` | `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md` |
| **QA / Test Engineer** | `docs/playwright_test_design.md` | `docs/test-coverage-plan.md` |
| **Product Owner** | `docs/full_system_audit.md` | `docs/business-rules.md` |
| **DevOps** | `docs/SETUP.md` | `docs/playwright_test_design.md` (CI section) |

---

## Document Index

### Core Architecture
| Document | Description | Updated |
|----------|-------------|---------|
| `ARCHITECTURE.md` | System architecture, route hierarchy, component tree, data flow | 2026-05-21 |
| `DATA_MODEL.md` | Complete database schema reference — all 30+ tables with columns, types, and relationships | 2026-07-13 |
| `WORKFLOWS.md` | End-to-end workflows: booking, scheduling, check-in, finance | 2026-05-21 |

### Domain-Specific
| Document | Description | Updated |
|----------|-------------|---------|
| `SCHEDULING.md` | Scheduling pipeline, status lifecycle, 22 validation invariants, drag-and-drop architecture | — |
| `business-rules.md` | 18 business logic rules — the single source of truth for system behavior | 2026-07-12 |
| `pilot_flight_bag.md` | Pilot EFB implementation plan: fuel orders, checklists, flight plans, notifications | 2026-07-13 |

### Testing
| Document | Description | Updated |
|----------|-------------|---------|
| `playwright_test_design.md` | E2E test infrastructure: page objects, drag helpers, CI/CD setup | 2026-07-13 |
| `test-coverage-plan.md` | 7-phase test remediation plan — 245 planned tests across services, repos, and E2E | 2026-07-13 |
| `booking_ui_audit.md` | Booking UI audit prompt — accessibility, responsive design, booking wizard | — |

### Operations
| Document | Description | Updated |
|----------|-------------|---------|
| `SETUP.md` | Environment setup, database provisioning, seed scripts, bootstrap command | — |
| `full_system_audit.md` | System audit prompt — scope, checklists, risk assessment dimensions | — |

---

## Key Commands

```bash
npm run dev          # Start dev server (auto-migrates)
npm run test         # Run Vitest suite (unit + integration + smoke)
npm run test:e2e     # Run Playwright E2E tests
npm run lint         # ESLint check
npm run typecheck    # TypeScript type check
npm run bootstrap    # Full DB reset: migrate + seed:comprehensive + seed:pbac + assign
npm run build        # Production build
npm run start        # Production server (migrations run separately)
```

---

## Document Status

| Document | Status | Notes |
|----------|--------|-------|
| ARCHITECTURE.md | ⚠ Stale | Missing EFB, fueler role, fare calculator, reconciliation |
| WORKFLOWS.md | ⚠ Stale | Missing pilot EFB, fueler, finance reconciliation workflows |
| SETUP.md | ⚠ Incomplete | Migration table lists only 7 of 37 files |
| DATA_MODEL.md | ✅ Current | v1.1, includes operational tables |
| SCHEDULING.md | ✅ Current | Core scheduling reference |
| business-rules.md | ⚠ Needs Update | Missing EFB/fuel-order rules, weight threshold contradiction |
| pilot_flight_bag.md | ✅ Current | Section 12 has corrected plan; Sections 3-6 are superseded |
| playwright_test_design.md | ⚠ Needs Update | Test counts need reconciliation with test-coverage-plan |
| test-coverage-plan.md | ✅ Current | Phase 1 partially implemented (53 of 63 service tests done) |
