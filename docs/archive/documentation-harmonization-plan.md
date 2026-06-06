# FIGAS Flight Scheduling — Documentation Harmonization Plan
**Date:** 2026-06-02
**Status:** Complete
**Scope:** Consolidate, organize, and reduce documentation clutter across `plans/`, `docs/`, and `.agents/` directories

---

## Section 1: Current Documentation Inventory

| File | Type | Lines | Status | Notes |
|------|------|-------|--------|-------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Production docs | 1297 | ✅ Current | Comprehensive system architecture |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Production docs | 983 | ✅ Current | ER diagrams, column docs |
| [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md) | Production docs | 1129 | ✅ Current | Workflow documentation |
| [`docs/SETUP.md`](docs/SETUP.md) | Production docs | 466 | ✅ Current | Setup guide |
| [`plans/scheduling-architectural-specification.md`](plans/scheduling-architectural-specification.md) | Planning | 1490 | ⚠️ Slightly outdated | Uses `STY` instead of `PSY` |
| [`plans/scheduling-implementation-plan.md`](plans/scheduling-implementation-plan.md) | Planning | 550 | ❌ DEPRECATED | Marked as deprecated, contains incorrect claims |
| [`plans/schedule-backup-gap-analysis.md`](plans/schedule-backup-gap-analysis.md) | Planning | ~500 | ✅ Current | Authoritative gap analysis |
| [`plans/scheduling-audit-report.md`](plans/scheduling-audit-report.md) | Planning | NEW | ✅ Current | This audit document |
| [`plans/old/scheduling-flight-assignment-plan.md`](plans/old/scheduling-flight-assignment-plan.md) | Historical | ~300 | ❌ Archive | Original vision reference |
| [`plans/old/scheduling-implementation-plan.md`](plans/old/scheduling-implementation-plan.md) | Historical | ~400 | ❌ Archive | Original implementation plan |
| [`plans/old/scheduling-integration-points.md`](plans/old/scheduling-integration-points.md) | Historical | ~200 | ❌ Archive | Original integration contracts |
| [`plans/old/scheduling-migration-plan.md`](plans/old/scheduling-migration-plan.md) | Historical | ~500 | ❌ Archive | Original migration SQL |
| [`plans/old/scheduling-route-map.md`](plans/old/scheduling-route-map.md) | Historical | ~150 | ❌ Archive | Original route structure |
| [`plans/old/scheduling-ui-components.md`](plans/old/scheduling-ui-components.md) | Historical | ~300 | ❌ Archive | Original component specs |
| [`plans/old/scheduling-workflow-pipeline.md`](plans/old/scheduling-workflow-pipeline.md) | Historical | ~250 | ❌ Archive | Original workflow pipeline |
| [`plans/old/schema-redesign-passenger-leg.md`](plans/old/schema-redesign-passenger-leg.md) | Historical | ~400 | ❌ Archive | Original schema redesign |
| [`.agents/skills/flight-schedule/SKILL.md`](.agents/skills/flight-schedule/SKILL.md) | Agent skill | ~500 | ✅ Current | Authoritative skill definition |
| [`plans/database-audit-phase1.md`](plans/database-audit-phase1.md) | Planning | ~200 | ✅ Complete | Database audit |
| [`plans/database-audit-phase2-env.md`](plans/database-audit-phase2-env.md) | Planning | ~100 | ✅ Complete | Environment audit |
| [`plans/database-audit-phase3-duplicates.md`](plans/database-audit-phase3-duplicates.md) | Planning | ~100 | ✅ Complete | Duplicate audit |
| [`plans/database-audit-verification.md`](plans/database-audit-verification.md) | Planning | ~100 | ✅ Complete | Verification |
| [`plans/migration-consolidation-plan.md`](plans/migration-consolidation-plan.md) | Planning | ~200 | ✅ Complete | Migration consolidation |
| [`plans/prisma-orm-feasibility-analysis.md`](plans/prisma-orm-feasibility-analysis.md) | Planning | ~300 | ✅ Complete | ORM analysis |

---

## Section 2: Current State Assessment

### Problems

1. **Directory sprawl** — Documentation is spread across `docs/`, `plans/`, `plans/old/`, and `.agents/skills/` with no clear delineation of which directory is authoritative for what.
2. **Stale planning documents** — [`plans/scheduling-implementation-plan.md`](plans/scheduling-implementation-plan.md) is marked as deprecated but still sits alongside active planning documents, creating confusion.
3. **Outdated references** — [`plans/scheduling-architectural-specification.md`](plans/scheduling-architectural-specification.md) uses `STY` instead of the current `PSY` hub code.
4. **No scheduling-specific reference** — The scheduling subsystem documentation is embedded within [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (1297 lines), making it hard to find scheduling-specific information.
5. **No clear lifecycle** — Documents lack clear status markers (draft, current, deprecated, archive), making it hard to know which documents to trust.
6. **Agent skill not synced** — [`.agents/skills/flight-schedule/SKILL.md`](.agents/skills/flight-schedule/SKILL.md) may not reflect the latest audit findings.

### Strengths

1. **Production docs are current** — All four files in `docs/` are marked as current and well-maintained.
2. **Historical archive exists** — `plans/old/` provides a clean separation for historical reference documents.
3. **Completed audits are preserved** — Database audit phases and migration plans are marked as complete and kept for reference.
4. **Agent skill is authoritative** — The flight schedule skill is the single source of truth for technical contracts.

---

## Section 3: Proposed Directory Structure

```
docs/                          # Production documentation (single source of truth)
├── ARCHITECTURE.md            # System architecture (keep, update hub code)
├── DATA_MODEL.md              # Data model (keep, update ScheduleStatus enum)
├── WORKFLOWS.md               # Workflows (keep, update status lifecycle)
├── SETUP.md                   # Setup guide (keep)
└── SCHEDULING.md              # NEW: Scheduling-specific reference (extract from ARCHITECTURE.md)

plans/                         # Active planning documents
├── scheduling-audit-report.md # NEW: This audit document
├── documentation-harmonization-plan.md # NEW: This plan
├── schedule-backup-gap-analysis.md # Keep as authoritative roadmap
├── scheduling-architectural-specification.md # Update hub code, keep as reference
├── database-audit-phase1.md   # Keep (completed audits)
├── database-audit-phase2-env.md
├── database-audit-phase3-duplicates.md
├── database-audit-verification.md
├── migration-consolidation-plan.md
└── prisma-orm-feasibility-analysis.md

plans/old/                     # Historical archive (keep for reference)
├── scheduling-flight-assignment-plan.md
├── scheduling-implementation-plan.md
├── scheduling-integration-points.md
├── scheduling-migration-plan.md
├── scheduling-route-map.md
├── scheduling-ui-components.md
├── scheduling-workflow-pipeline.md
└── schema-redesign-passenger-leg.md

.agents/skills/                # Agent skills (keep as authoritative contracts)
└── flight-schedule/SKILL.md   # Keep, update with audit findings
```

---

## Section 4: Actions

### Immediate (Week 1)

1. **Mark [`plans/scheduling-implementation-plan.md`](plans/scheduling-implementation-plan.md) as DEPRECATED** with a clear banner at the top of the file. Move it to `plans/old/` or add a prominent deprecation notice.

2. **Update [`plans/scheduling-architectural-specification.md`](plans/scheduling-architectural-specification.md)** to use `PSY` instead of `STY` as the hub code. Search for all occurrences of `STY` and replace with `PSY`.

3. **Create [`docs/SCHEDULING.md`](docs/SCHEDULING.md)** extracted from [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md):
   - Extract all scheduling-specific sections from ARCHITECTURE.md
   - Add scheduling-specific content from the audit findings
   - Cross-reference back to ARCHITECTURE.md for system-level context
   - Include: status lifecycle, pipeline phases, dnd-kit architecture, validation rules

### Short-term (Week 2)

4. **Update [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** to reflect the current status lifecycle (6-stage: DRAFT→BUILDING→APPROVED→PUBLISHED→COMPLETED→CANCELLED).

5. **Update [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)** to include:
   - ScheduleStatus enum documentation with all 6 values
   - `booking_leg_passengers` table documentation
   - `weight_balance_snapshots` table documentation

6. **Update [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md)** to reflect the current 6-stage lifecycle and the auto-build pipeline flow.

7. **Update [`.agents/skills/flight-schedule/SKILL.md`](.agents/skills/flight-schedule/SKILL.md)** with audit findings:
   - Add G-01 through G-22 to the gaps section
   - Update test counts to reflect current 78/78 passing
   - Add the two-crew vs single-crew deviation
   - Add the production-readiness plan phases

### Ongoing

8. **Keep `plans/old/` as read-only archive** — do not modify any files in this directory. Reference only for historical context.

9. **All new planning goes in `plans/`** with clear status markers:
   - `**Status:** Draft` — initial planning
   - `**Status:** Current` — active, trusted document
   - `**Status:** Complete` — finished, kept for reference
   - `**Status:** Deprecated` — superseded, do not use

10. **Production documentation in `docs/` is the single source of truth** — when code changes, update `docs/` in the same PR.

11. **Agent skills in `.agents/skills/` are the authoritative technical contracts** — interfaces, validation invariants, query contracts, edge cases, and gaps should be defined here first.

---

## Section 5: Single Source of Truth Rules

1. **`docs/` is the single source of truth** for all production documentation. Any question about system architecture, data model, workflows, or setup should be answerable from these files.

2. **`.agents/skills/flight-schedule/SKILL.md` is the single source of truth** for technical contracts including:
   - Core specifications and interfaces
   - Validation invariants
   - Database query contracts
   - Edge cases (EC-1 through EC-30)
   - Implementation gaps (G-01 through G-22)
   - Test coverage requirements

3. **`plans/` contains active planning documents** — these are transient and may become outdated. They represent work in progress, proposed changes, or completed analyses. Always verify against `docs/` and `.agents/skills/` before acting on planning documents.

4. **`plans/old/` is a historical archive** — do not modify files in this directory. Reference only for understanding the original vision or historical context.

5. **When updating code, update `docs/` and `.agents/skills/` in the same PR.** This ensures documentation stays synchronized with implementation.

6. **When a plan is completed**, mark it with a status banner (`**Status:** Complete`) and move to `plans/archive/` (create the directory if needed). This keeps `plans/` focused on active work.

7. **When a plan is superseded**, mark it with a status banner (`**Status:** Deprecated`) and move to `plans/archive/`. Add a note explaining which document supersedes it.

---

## Section 6: File Lifecycle

```
[Draft] → [Current] → [Complete] → [Archive]
                              ↘
                         [Deprecated] → [Archive]
```

| Status | Meaning | Location | Action |
|--------|---------|----------|--------|
| Draft | Initial planning, may change | `plans/` | Review and iterate |
| Current | Active, trusted document | `plans/` or `docs/` | Keep updated |
| Complete | Finished, kept for reference | `plans/` or `plans/archive/` | Do not modify |
| Deprecated | Superseded, do not use | `plans/archive/` | Do not use |
| Archive | Historical reference only | `plans/old/` or `plans/archive/` | Read-only |

---

## Section 7: Recommendations

1. **Implement the harmonization plan immediately** — the current documentation sprawl creates confusion and risks stale information being treated as authoritative.

2. **Create [`docs/SCHEDULING.md`](docs/SCHEDULING.md) as a priority** — the scheduling subsystem is complex enough to warrant its own reference document, separate from the general architecture doc.

3. **Establish a documentation review cadence** — review `docs/` and `.agents/skills/` quarterly to ensure they remain current with the codebase.

4. **Add a documentation check to the CI pipeline** — a simple lint step that verifies `docs/` files have correct status markers and cross-references.

5. **Train the team on the Single Source of Truth rules** — ensure all developers understand which directory is authoritative for what type of information.
