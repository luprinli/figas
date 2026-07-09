# Flight Path & Stop Activity Regression Audit

**Date:** 2026-07-09
**Scope:** Flight path generation and stop activity execution — specifically the enforcement of STY (Stanley) at the start and end of flight paths.
**Type:** Read-only diagnostic audit. **No code was modified.**
**Reference backup:** `figas-remix-II-backup-20260604-230644/` (2026-06-04, pre‑CVRP refactor)
**Authoritative specs:** [`docs/business-rules.md`](business-rules.md) (v1.2.0), [`docs/SCHEDULING.md`](SCHEDULING.md), [`docs/WORKFLOWS.md`](WORKFLOWS.md), `.agents/skills/flight-schedule/SKILL.md`

---

## Executive Summary

The headline concern — *"flight paths that don't start and end at STY"* — is **not** caused by the core auto‑build pipeline. The reachable flight‑creation paths **do** enforce `STY → … → STY` at the data layer:

- **Auto‑build (CVRP)** — [`cvrp-solver.ts`](../app/utils/scheduling/cvrp-solver.ts) uses `DEPOT = "STY"` and guarantees STY at both ends of every route (including through route merges); [`index.ts:206‑217`](../app/utils/scheduling/index.ts) writes `flight_legs` from the full STY‑bounded stop list. ✅
- **Drag‑to‑create** — [`handleCreateFlightFromBooking()`](../app/utils/schedule-handlers.server.ts) (line ~988‑1003) explicitly prepends `STY → firstOrigin` and appends `lastDest → STY`. ✅

The observed regressions are concentrated in **four areas**, in order of user impact:

| # | Area | Severity | Nature |
|---|------|----------|--------|
| 1 | **Display layer renders flight‑level `origin→destination` (= "STY → STY") instead of the leg‑derived path** | **High** | Pilot Briefing and the published schedule view never query `flight_legs`, so multi‑stop `STY→A→STY` sorties render as a collapsed "STY → STY" with no intermediate stops or per‑stop activity. |
| 2 | **`buildStopActivities` is orphaned and violates RULE 2 at the source** | **Medium** | The module that RULE 2 designates as authoritative has **no consumers**, and it de‑duplicates STY (never emits the required two STY entries). The live UI re‑derives stops in `StopActivityList`, masking it. |
| 3 | **`handleCreateFlight` (the "Add Flight" modal) creates a single non‑STY leg — but is unwired** | **Medium (latent)** | Produces `origin→destination` with no STY bookends (RULE 1 violation), but it is not routed in the current `action.server.ts`. It is dead/landmine code, and the documented "Add Flight" feature is effectively missing. |
| 4 | **Per‑leg distance/heading are placeholders; W&B route drops the leading STY leg** | **Medium** | Leg distances are an even split of the total; headings are always `null`; [`index.ts:240`](../app/utils/scheduling/index.ts) slices off the leading STY stop for Phases 3–5. |

Underlying all of this is substantial **documentation drift**: the specs still describe the pre‑refactor nearest‑neighbor pipeline and reference functions/line numbers that no longer exist.

---

## 1. Conformity Check

### 1.1 Against `business-rules.md`

| Rule | Requirement | Current implementation | Verdict |
|------|-------------|------------------------|---------|
| **RULE 1** – Flight path STY bookends | First leg origin = STY, last leg destination = STY; *"Enforced by `createFlightLegs()` in `index.ts:286`"* | `createFlightLegs()` **no longer exists** (removed in CVRP refactor). Enforcement now lives in (a) `cvrp-solver.ts` (`DEPOT="STY"`) + inline leg creation [`index.ts:206‑217`](../app/utils/scheduling/index.ts), and (b) [`handleCreateFlightFromBooking()`](../app/utils/schedule-handlers.server.ts) ~L988. Both reachable paths comply. | ⚠️ **Compliant but doc reference is stale**; a third path (`handleCreateFlight`) is non‑compliant (see §2.3). |
| **RULE 2** – Stop activity logic | *"Enforced by `buildStopActivities()` in `build-stop-activities.ts:92‑109`"*; a `STY→A→STY` route must yield **two** StopActivity entries (first: departure‑only; last: arrival‑only) | [`build-stop-activities.ts`](../app/utils/scheduling/build-stop-activities.ts) de‑dupes codes (`orderedCodes.includes(...)`, L88‑89), so `STY→A→STY` collapses to `[STY, A]` — it **never emits two STY entries**. Furthermore the module has **no importers** (orphaned). | ❌ **Non‑conformant at source** (masked because the live UI re‑derives — see §3). |
| **RULE 3** – Flight number `FIG-YYYYMMDD-NNN` | Enforced by `handleCreateFlightFromBooking:1047` & auto‑build | Implemented via `generateFlightNumber()`; format correct. Doc line ref stale (actual ~L961). | ✅ (stale line ref) |
| **RULE 5 / 15 / 16** – Per‑passenger assignment & manifest persistence | Manifest queries include all flight passengers; unassigned pool filters by `blp.flight_leg_id` | `index.ts:255‑278` populates `booking_leg_passengers.flight_leg_id`; manifest queries broadly conform. | ✅ (spot‑checked) |
| **RULE 6** – W&B safety guards | Guard NaN/Infinity, clamp decimals | Present in `weight-balance.ts`. Not re‑verified in depth here. | ✅ (not the focus) |

### 1.2 Against `SCHEDULING.md`

| Spec statement | Reality | Verdict |
|----------------|---------|---------|
| Phase 2 = **nearest‑neighbor** ([`nearest-neighbor.ts`](../app/utils/scheduling/), `buildRoute()`) | `nearest-neighbor.ts`, `route-builder.ts`, `distance-cache.ts` **deleted**; replaced by `cvrp-solver.ts` + `cvrp-types.ts` + `cvrp-validator.ts` + `distance-lookup.ts`. | ❌ **Doc describes removed architecture** |
| Invariant 10: *"All flights must start and end at **PSY** (Port Stanley)"* | Code uses **`"STY"`** everywhere as the hub code (`cvrp-solver.ts:28`, handlers, seeds). `business-rules.md` also uses `STY`. | ❌ **STY/PSY code inconsistency across docs** |
| `RouteStop.heading: number` (required) | Auto‑build writes `heading: null` on every leg ([`index.ts:215`](../app/utils/scheduling/index.ts)); `RouteStop.heading` had to be widened to `number | null`. | ⚠️ **Contract weakened; headings never populated** |
| Pipeline output distances | Per‑leg distance = `totalDistanceNm / (stops.length - 1)` (even split, [`index.ts:207`](../app/utils/scheduling/index.ts)), not real leg distances. | ⚠️ **Distances are placeholders** |

### 1.3 Deviation timeline (vs 2026‑06‑04 backup)

- The backup was **mid‑refactor**. Its [`index.ts`](../) contained *both* an older `createFlightLegs()` that used **`cluster.origin` (explicitly "not hardcoded PSY")** for the first leg — i.e. **did not enforce STY start** — *and* a newer STY‑enforcing build block (`["STY", c.origin, "STY"]`, backup L86‑162).
- The current code completed the migration to CVRP: STY enforcement is now correct for auto‑build, but `createFlightLegs()` (the function the docs still cite) was removed, and `build-stop-activities.ts` was left orphaned.
- The **backup's `build-stop-activities.ts` has the identical STY de‑dup behavior** (backup L79‑80) → the RULE 2 "two entries" contract was **never implemented**; it is aspirational doc, not a regression.
- The **backup's `handleCreateFlight` also creates a single `origin→destination` leg** (backup L540) → the non‑STY "Add Flight" path is a **long‑standing gap**, not a new regression.

---

## 2. Root Cause Analysis

### 2.1 Auto‑build flight paths — CORRECT (no regression)

`cvrp-solver.ts` builds every initial route as `STY → origin → destination → STY` ([L46‑99](../app/utils/scheduling/cvrp-solver.ts)) and `mergeStops()` always preserves the depot at both ends ([L244‑262](../app/utils/scheduling/cvrp-solver.ts)). `index.ts` then creates `flight_legs` by iterating the **full** stop list ([L206‑217](../app/utils/scheduling/index.ts)). Result: the `flight_legs` table is correctly STY‑bounded. **This path is sound.**

### 2.2 The visible "not STY" symptom is a DISPLAY problem

Multiple user‑facing views derive the route from **flight‑level** `origin_code`/`destination_code` (or `origin_aerodrome_id`/`destination_aerodrome_id`) instead of `flight_legs`. For CVRP and booking‑created flights, those flight‑level fields are **both STY** (round trip), so a real `STY→A→STY` sortie renders as a meaningless **"STY → STY"** with no stops. Where a view instead uses the *booking* leg codes, a `CCI→STY` booking renders as "CCI → STY" — i.e. **not starting at STY**. Either way the true leg‑derived path is not shown. Affected surfaces are enumerated in §3.

### 2.3 `handleCreateFlight` (the "Add Flight" modal) — non‑STY, and orphaned

[`schedule-handlers.server.ts:490‑495`](../app/utils/schedule-handlers.server.ts) creates exactly one leg:
```ts
[{ leg_sequence: 1, origin_code: originCode, destination_code: destinationCode }]
```
with flight‑level `origin_aerodrome_id`/`destination_aerodrome_id` set to the **user‑chosen** aerodromes — **no STY bookends** (RULE 1 violation). **However**, the current split router [`action.server.ts`](../app/routes/operations.schedule._index/action.server.ts) exposes only these intents: `auto-build, preview-build, accept-build, approve, revise, publish, publish-schedule, cancel, reorder-flights, assign-booking, transfer-booking, create-flight-from-booking, unassign-booking, remove-flight, assign-pilot, assign-aircraft, suggest-route, reset-draft`. There is **no `add-flight`/`create-flight` case**, and `handleCreateFlight` is referenced only inside `schedule-handlers.server.ts` (definition + an internal alias). **Conclusion:** the handler is unreachable dead code today — a latent landmine if re‑wired — and the "Add Flight" modal documented in the flight‑schedule skill is effectively **missing from the product**.

### 2.4 Stop activity execution — orphaned module + RULE 2 gap

- [`build-stop-activities.ts`](../app/utils/scheduling/build-stop-activities.ts) has **no importers** in `app/` (only the dev script `scripts/test-stops.ts` references it). It is not part of the live render path.
- Its `orderedCodes` de‑dup (L86‑90) means `STY→A→STY` becomes `[STY, A]`; the `isLast`/`lastIndexOf` branch (L96‑99) is therefore dead. So it does **not** satisfy RULE 2's "two STY entries."
- The **live** stop rendering is done by [`StopActivityList.tsx`](../app/components/schedule/StopActivityList.tsx) (~L99‑100), which re‑derives stops as `[legs[0].origin_code, …each leg.destination_code]` (not de‑duped) and correctly applies first‑stop‑departures‑only / last‑stop‑arrivals‑only. **This is correct as long as `flight_legs` are present and leg‑derived** — but it silently breaks if the leading `STY→X` leg is ever missing (the first stop then becomes `X`).

### 2.5 W&B / distance accuracy

- [`index.ts:240`](../app/utils/scheduling/index.ts) builds the `RouteResult` for Phases 3–5 from `cvrpRoute.stops.slice(1)`, **dropping the leading STY stop**. The aircraft‑assignment and weight‑balance phases therefore operate on a route missing its first leg.
- Per‑leg distance is an **even split** (`total / (n‑1)`), and **heading is always `null`** ([L207‑216](../app/utils/scheduling/index.ts)). Stop activity and loadsheet distance/heading columns are consequently inaccurate.

---

## 3. UI/UX Audit

Legend: 🟥 shows the regression to users · 🟧 fragile/degrades badly · 🟩 correct.

| Page / Component | Renders route/stops from | Finding | Ref |
|------------------|--------------------------|---------|-----|
| 🟥 **Pilot Briefing** | flight‑level `ao.code → ad.code` (aerodrome ids) | Shows **"STY → STY"** for round trips; **no intermediate stops, no per‑stop arriving/departing**. W&B uses a single `ORDER BY id DESC LIMIT 1` snapshot, not per‑leg. Pilots see a wrong route. | [`PilotBriefing.tsx:82‑91`](../app/components/pilot/PilotBriefing.tsx); [`pilot.briefing.$flightId.tsx:29,92‑104`](../app/routes/pilot.briefing.$flightId.tsx) |
| 🟥 **Published schedule view** | flight‑level `f.origin_code → f.destination_code` | Renders **"STY → STY"** for every round‑trip flight; no stops. User‑facing published output. | [`operations.schedule.$scheduleId.tsx:27‑38,73`](../app/routes/operations.schedule.$scheduleId.tsx) |
| 🟥 **Public shared link** | `f.originCode → f.destinationCode` | Same flight‑level collapse ("STY → STY"). | [`schedule.$token.tsx:79`](../app/routes/schedule.$token.tsx) |
| 🟧 **Schedule builder – FlightCard** | `flight_legs` (correct) with fallback to flight‑level | Correct multi‑stop `STY→A→STY` **when legs are loaded**; falls back to "STY → STY" if `flight_legs` empty/unloaded. | [`FlightCard.tsx:140‑141,356‑357`](../app/components/schedule/FlightCard.tsx) |
| 🟧 **StopActivityList** | re‑derives from `flight_legs` | Correct two‑STY layout & RULE 2 rules, **but** first stop = `legs[0].origin_code`; a missing leading STY leg silently relabels the origin and drops STY departures. | [`StopActivityList.tsx:99‑119`](../app/components/schedule/StopActivityList.tsx) |
| 🟧 **ops.flight…passengers** | sectors (legs) but **not STY‑forced** | Route summary starts at first sector origin; if the leading STY sector is missing it shows `X` first. | [`ops.flight.$flightId.passengers.tsx:106‑114`](../app/routes/ops.flight.$flightId.passengers.tsx) |
| 🟩 **ops.flight…loadsheet** | forces `stopCodes = ["STY", …, "STY"]` | Robust; per‑sector W&B/fuel from legs; best‑behaved STY renderer. | [`ops.flight.$flightId.loadsheet.tsx:117‑123,563‑609`](../app/routes/ops.flight.$flightId.loadsheet.tsx) |
| 🟩 **Loadsheet / ManifestJourney / LoadsheetModal** | forced `stopCodes`, per‑leg | STY start/end always shown; degrades to "—" instead of mis‑rendering. | `ManifestJourney.tsx:69‑140`, `LoadsheetModal.tsx:196` |
| 🟩 **Check‑in counter** | per‑passenger booking legs; gating on `pax.origin === "STY"` | Manifest and remote/counter gating are domain‑correct (booking‑leg‑driven). Header "STY → STY" is cosmetic only. | [`checkin.counter.tsx:263,359,434`](../app/routes/checkin.counter.tsx) |
| 🟩 **build-flight-card-flight.ts** | `flight_legs` passthrough + dedup weights | Correct source of truth for the card. | [`build-flight-card-flight.ts:61‑112`](../app/utils/scheduling/build-flight-card-flight.ts) |
| ⬜ **RouteStrip.tsx** | leg‑derived multi‑stop strip | Correct **but unused** (dead code); FlightCard hand‑builds its route inline instead. | [`RouteStrip.tsx`](../app/components/schedule/RouteStrip.tsx) |
| ⬜ **ScheduleBoard aria‑label** | `${origin_code} to ${destination_code}` | Screen‑reader says "STY to STY" (a11y cosmetic). | [`ScheduleBoard.tsx:115`](../app/components/schedule/ScheduleBoard.tsx) |

**Root structural issue:** the route/stop **source of truth is inconsistent**. The loadsheet family is leg/sector‑driven and STY‑forced; Pilot Briefing and the published `$scheduleId` view read flight‑level aerodrome ids (always STY↔STY for these sorties) and therefore cannot show the true path or per‑stop activity.

---

## 4. Gap Analysis — remaining work for a complete UX

Ordered by priority. (Descriptions only — no changes made.)

**P1 — Correct the flight‑path/stop display (the user‑visible regression)**
1. Make **Pilot Briefing** derive its route and per‑stop activity from `flight_legs` (not `origin/destination_aerodrome_id`), and show per‑leg W&B rather than a single latest snapshot.
2. Make the **published schedule view** (`operations.schedule.$scheduleId.tsx`) and **public link** (`schedule.$token.tsx`) render the leg‑derived `STY→…→STY` path with stops.
3. Audit all remaining flight‑level `origin_code → destination_code` renderers and switch route display to a single shared, leg‑derived helper (candidate: revive/using `RouteStrip.tsx`).

**P2 — Resolve the "Add Flight" path**
4. Decide the fate of `handleCreateFlight`: either (a) **re‑wire** the "Add Flight" modal *and* fix it to build `STY→…→STY` legs (RULE 1), or (b) **remove** the dead handler and the modal from the skill/docs. Currently the feature is missing and the handler is a landmine.

**P3 — Stop activity module + accuracy**
5. Reconcile `build-stop-activities.ts` with reality: either wire it back in as the single source for stop activities and fix the STY de‑dup to honor RULE 2's two‑entry contract, or delete it and formalize `StopActivityList`'s derivation as authoritative (and update `scripts/test-stops.ts`).
6. Populate **real per‑leg distances and headings** from `aerodrome_distances`/`aerodrome_headings` instead of the even‑split placeholder and `null` heading ([`index.ts:207‑216`](../app/utils/scheduling/index.ts)).
7. Fix the **`RouteResult` `slice(1)`** ([`index.ts:240`](../app/utils/scheduling/index.ts)) so Phases 3–5 (aircraft/W&B) see the full STY‑bounded route.

**P4 — Documentation conformity**
8. Update `SCHEDULING.md` Phase 2 to describe the **CVRP** solver (remove nearest‑neighbor references).
9. Resolve the **STY vs PSY** hub‑code inconsistency across `SCHEDULING.md` (Invariant 10) and `business-rules.md` — standardize on `STY`.
10. Fix stale enforcement line references: RULE 1 (`createFlightLegs()` `index.ts:286` — removed), RULE 2 (`build-stop-activities.ts:92‑109` — orphaned), RULE 3 (`handleCreateFlightFromBooking:1047` — actual ~L880/961).

**P5 — Test coverage**
11. `tests/unit/scheduling/nearest-neighbor.test.ts` was deleted with the refactor; add **CVRP solver tests** asserting every returned route starts and ends at `STY` (including post‑merge), and a stop‑activity test asserting the two‑STY layout for `STY→A→STY`.
12. Add a regression test that a **manually created flight** (whichever path is kept) yields STY‑bounded `flight_legs`.

---

## Appendix A — Evidence index (file:line)

| Claim | Location |
|-------|----------|
| CVRP depot = STY, STY‑bounded routes | `app/utils/scheduling/cvrp-solver.ts:28,46‑99,244‑262` |
| Auto‑build writes legs from full stops | `app/utils/scheduling/index.ts:206‑217` |
| RouteResult drops leading STY (slice(1)) | `app/utils/scheduling/index.ts:240` |
| Even‑split distance, null heading | `app/utils/scheduling/index.ts:207‑216` |
| Drag‑create enforces STY bookends | `app/utils/schedule-handlers.server.ts:988‑1003` |
| Add‑flight handler: single non‑STY leg | `app/utils/schedule-handlers.server.ts:490‑495` |
| Add‑flight handler not routed | `app/routes/operations.schedule._index/action.server.ts:30‑208` |
| `buildStopActivities` de‑dup / no consumers | `app/utils/scheduling/build-stop-activities.ts:86‑110` |
| Pilot Briefing flight‑level route | `app/components/pilot/PilotBriefing.tsx:82‑91`; `app/routes/pilot.briefing.$flightId.tsx:29,92‑104` |
| Published view flight‑level route | `app/routes/operations.schedule.$scheduleId.tsx:27‑38,73` |
| Loadsheet forces STY stopCodes | `app/routes/ops.flight.$flightId.loadsheet.tsx:117‑123` |
| Backup used `cluster.origin` (not STY) in old `createFlightLegs` | `figas-remix-II-backup-20260604-230644/app/utils/scheduling/index.ts:280‑297` |
| Backup add‑flight also single non‑STY leg | `figas-remix-II-backup-20260604-230644/app/utils/schedule-handlers.server.ts:540` |

## Appendix B — What is confirmed CORRECT (no action needed)

- CVRP auto‑build produces STY‑bounded `flight_legs`.
- `handleCreateFlightFromBooking` (drag‑to‑create) produces STY‑bounded legs.
- Loadsheet / ManifestJourney / LoadsheetModal STY rendering.
- `StopActivityList` RULE 2 rendering **when** legs are present.
- Check‑in counter manifest & STY‑based check‑in gating.
- Flight number format (RULE 3) and per‑passenger `flight_leg_id` population (RULES 5/15/16), spot‑checked.
</content>
