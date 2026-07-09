# FIGAS Enhancement Implementation Plan — v1.0

**Date:** 2026-06-25  
**Purpose:** Detailed, actionable instructions for a coding agent to implement weight & balance real-time engine, paperless loadsheet with pilot interactivity, comprehensive email alerting system, and high-impact low-effort enhancements across modules.  
**Guiding Principles:** Backward compatibility, minimal regressions, reuse of existing components and services.

---

## Table of Contents

1. [Phase 0: Email Alerting System Setup](#phase-0-email-alerting-system-setup)
2. [Phase 1: Real-Time Weight & Balance Engine](#phase-1-real-time-weight--balance-engine)
3. [Phase 2: Interactive Loadsheet for Pilots](#phase-2-interactive-loadsheet-for-pilots)
4. [Phase 3: Enhanced Pilot Briefing](#phase-3-enhanced-pilot-briefing)
5. [Phase 4: Offline Capability (PWA) for Pilot Tools](#phase-4-offline-capability-pwa-for-pilot-tools)
6. [Phase 5: Automated W&B Checks in Scheduling Pipeline](#phase-5-automated-wb-checks-in-scheduling-pipeline)
7. [Phase 6: Low-Effort High-Impact Enhancements](#phase-6-low-effort-high-impact-enhancements)
8. [Testing and Quality Gates](#testing-and-quality-gates)
9. [Deployment Considerations](#deployment-considerations)
10. [Summary of New/Modified Files](#summary-of-newmodified-files)

---

## Phase 0: Email Alerting System Setup

**Goal:** Establish a unified email service to send notifications for registration, booking confirmations, schedule broadcasts, pilot alerts, payment reminders, etc. **Backward compatibility:** Keep existing placeholder emails (if any) but replace with robust system.

### 0.1 Install Email Library

```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

If using SendGrid or other provider, adapt accordingly.

### 0.2 Create Email Configuration

**File:** `app/utils/email.server.ts`

- Load SMTP settings from environment variables:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Provide a `sendEmail` function with retry logic (exponential backoff).
- Define email template rendering using plain text or React Email (optional). For simplicity, use string interpolation or Mustache.

```typescript
import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@figas.gov.fk',
    to,
    subject,
    html,
    text,
  });
}
```

### 0.3 Define Email Templates

**Directory:** `app/emails/`

Create template functions for each scenario:

- `welcome.ts` — user registration
- `booking-confirmation.ts` — after booking creation
- `booking-update.ts` — status change
- `schedule-published.ts` — broadcast to pilots/passengers
- `pilot-assignment.ts` — pilot assigned to flight
- `payment-reminder.ts` — due/overdue
- `checkin-reminder.ts` — 24h before departure
- `invoice-issued.ts` — invoice generated

Each template returns `{ subject, html, text }`.

### 0.4 Integrate Email Sending in Existing Services

**File:** `app/utils/services/reminder.service.ts` — already has logic to fetch pending reminders. Modify to call `sendEmail` for each reminder type.

**File:** `app/routes/_auth.signup.tsx` — after user creation, send welcome email.

**File:** `app/routes/operations.bookings.new.tsx` — after booking creation, send confirmation (if user has email).

**File:** `app/routes/operations.bookings.$bookingId.tsx` — on status changes (e.g., APPROVED, COMPLETED), send update emails.

**File:** `app/routes/operations.schedule._index/action.server.ts` — when schedule status becomes `PUBLISHED`, broadcast to all pilots and passengers on that schedule.

**File:** `app/utils/schedule-handlers.server.ts` — when `assign-pilot` is called, send pilot assignment email.

**File:** `app/utils/services/payment.service.ts` — when payment succeeds or invoice is issued, send relevant emails.

### 0.5 Environment Variables

Add to `.env.example`:

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=user
SMTP_PASS=pass
SMTP_FROM=noreply@figas.gov.fk
```

---

## Phase 1: Real-Time Weight & Balance Engine

**Goal:** Create a client-side W&B calculator that consumes flight data and allows live adjustments.

**Backward Compatibility:** Existing `weight_balance_snapshots` table and server-side calculations remain unchanged. The new engine will be an additional layer that can recalculate on the fly.

### 1.1 Create Client-Side W&B Library

**File:** `app/utils/weight-balance/calculator.client.ts` (note `.client.ts` suffix to avoid server-side import)

- Use the same formulas as `app/utils/scheduling/weight-balance.ts` but in pure TypeScript.
- Expose a function `computeWeightBalance(params: WbInput): WbOutput`
- Input:
  - `aircraft`: { emptyWeight, mtow, mlw, cgArm, fuelCapacity, fuelBurnRate, cruiseSpeed, maxRange }
  - `legs`: array of { origin, destination, distanceNm }
  - `passengers`: array of { id, name, clothedWeight, baggageWeight, origin, destination }
  - `freightWeight`: number
  - `pilotWeight`: number
  - `fuelOnBoard`: number (starting fuel)
  - `reserveFuel`: number
  - `taxiFuel`: number
  - `seatAssignments`: optional array of { passengerId, seatNumber, arm }
- Output:
  - `perStop`: array of { stopCode, takeoffWeight, landingWeight, mtowUsedPct, mlwUsedPct, cogPositionMm, status: 'ok'|'warning'|'violation', messages[] }
  - `totalPayload`: total passenger + baggage + freight
  - `fuelPlan`: { totalBurn, remainingFuel, enduranceMinutes }

- Use `loadCSVDistanceMap()` for distance lookups (import from `app/utils/scheduling/distance-lookup.ts` but ensure it works on client via static data or preloaded map). We can pass distance map as parameter.

### 1.2 Create React Hook for W&B State

**File:** `app/hooks/useWeightBalance.ts`

- Accepts `flightId` and fetches initial data from `/api/flight/${flightId}/wb-data` (new API endpoint).
- Returns `{ data, recalculate, updatePassenger, updateFuel, updateFreight, updatePilotWeight }`
- Uses `useFetcher` or `useLoaderData` for initial load, then local state for adjustments.

### 1.3 Create API Endpoint for W&B Data

**File:** `app/routes/api.flight.$flightId.wb-data.ts`

- Loader: fetches flight, aircraft, legs, passengers, existing snapshot (if any), distance map.
- Returns JSON with all necessary inputs for the client calculator.
- Use existing repositories: `flightRepository`, `aircraftRepository`, `flightLegRepository`, `bookingLegPassengerRepository`.

### 1.4 Create CG Envelope Chart Component

**File:** `app/components/seat-map/CGEnvelopeChart.tsx` (already exists but may need enhancements)

- Use D3 or canvas to draw CG envelope.
- Accept `cgPositionMm`, `status`, `warnings`.
- Color-code: green if within limits, amber if near, red if violation.
- Show current CG point and envelope.

---

## Phase 2: Interactive Loadsheet for Pilots

**Goal:** Transform `LoadsheetModal` into a full-featured interactive tool pilots can use during boarding, with real-time W&B updates and digital sign-off.

**Backward Compatibility:** Existing loadsheet generation (server-side) remains unchanged. The modal will now use the client-side calculator for live preview but still can save final data back to server.

### 2.1 Enhance LoadsheetModal

**File:** `app/components/loadsheet/LoadsheetModal.tsx`

- Integrate `useWeightBalance` hook to manage state.
- Replace static data display with dynamic recalculation on any input change.
- Add input fields for:
  - Adjusting individual passenger weights (override)
  - Changing baggage weights per passenger
  - Adjusting freight weight
  - Changing fuel on board (if pilot can decide)
  - Adjusting pilot weight (if needed)
- Show `CGEnvelopeChart` in the Operations tab.
- Add "Digital Sign-off" button (only when no violations and pilot is assigned). On click, submit to server via fetcher with `intent: "sign-off"`.
- Server action in `ops.flight.$flightId.loadsheet.tsx` should update loadsheet status to `finalized` and record sign-off timestamp.

### 2.2 Update Server Action for Loadsheet

**File:** `app/routes/ops.flight.$flightId.loadsheet.tsx`

- Add `intent: "sign-off"` handler:
  - Check that user has `flight:manage-manifest` or `flight:sign-off` permission.
  - Ensure no violations exist (re-run server-side W&B to confirm).
  - Update `loadsheets` table: `status = 'finalized'`, `finalized_at = NOW()`, `finalized_by = userId`.
  - Optionally, store final W&B snapshot in `weight_balance_snapshots` table for audit.
- Existing `intent: "regenerate"`, `intent: "toggle-boarding"`, etc. remain.

### 2.3 Add Boarding/Disembarking Toggle

**File:** `app/components/loadsheet/LoadsheetModal.tsx` — already has toggle-boarding. Ensure it updates local W&B state (passenger on-board status) to reflect correct weight at each stop. The client calculator should account for passenger on/off per leg.

- Modify `computeWeightBalance` to accept `passengerOnLeg` mapping or derive from origin/destination and current stop.

---

## Phase 3: Enhanced Pilot Briefing

**Goal:** Make `PilotBriefing` a comprehensive digital document with interactive W&B and sign-off.

**File:** `app/components/pilot/PilotBriefing.tsx`

- Integrate the same `useWeightBalance` hook but with a read-only or limited-edit mode.
- Embed `CGEnvelopeChart`.
- Add "Accept Briefing" button that logs pilot acceptance (store in `pilot_assignments` or new table `briefing_acceptances`).
- Add weather and NOTAMs sections (already placeholders, ensure they are populated from real sources via API).

**File:** `app/routes/pilot.briefing.$flightId.tsx` — loader should fetch more data (weather, NOTAMs) to populate the briefing.

---

## Phase 4: Offline Capability (PWA) for Pilot Tools

**Goal:** Allow pilots to access briefing and loadsheet offline, crucial for remote airstrips.

**Backward Compatibility:** Service worker currently exists (`public/sw.js`). Enhance it to cache the required routes and assets.

### 4.1 Update Service Worker

**File:** `public/sw.js` (or if using Workbox, adjust `vite.config.ts`)

- Cache the following routes:
  - `/pilot/briefing/*`
  - `/ops/flight/*/loadsheet` (but with offline fallback)
  - `/api/flight/*/wb-data` (cache with stale-while-revalidate)
- Add a strategy: when offline, show a cached version of the page and data.
- Ensure the client-side W&B calculator works offline (all data is in the cached payload).

### 4.2 PWA Manifest

**File:** `public/manifest.json` — ensure it's complete with icons, theme color, and `display: "standalone"`.

### 4.3 Offline Data Caching Hook

**File:** `app/hooks/useOfflineData.ts` — a custom hook that checks online status and uses cached data if offline.

---

## Phase 5: Automated W&B Checks in Scheduling Pipeline

**Goal:** Prevent flights from being scheduled with W&B violations.

**File:** `app/utils/scheduling/weight-balance.ts` — already computes W&B. Modify `buildSchedule` to:

- After Phase 4 (Weight & Balance), check if any leg violates MTOW/MLW/CG.
- If violation, add a `warning` or `error` to `ScheduleBuildResult`.
- Optionally, prevent schedule approval if violations exist (configurable).

**File:** `app/utils/schedule-handlers.server.ts` — in `handleApprove`, run a validation that checks all flights for W&B violations; if any, reject approval with message.

**UI:** In `operations.schedule._index/route.tsx`, show validation banners from `ValidationBanner` component (already exists) using the result.

---

## Phase 6: Low-Effort High-Impact Enhancements

**Goal:** Quick wins across other modules.

### 6.1 Operations Dashboard

**File:** `app/routes/operations._index.tsx`

- Enhance "Needs Attention" section: instead of just count, list top 5 items with links.
- Add a row of quick-action buttons: "New Booking", "Start Check-in", "Build Schedule".

### 6.2 Check-in Module

**File:** `app/routes/checkin.counter.tsx`

- Add "Batch Check-in" button for a flight: check in all passengers with one click (after confirmation).
- Improve passenger search: use a more flexible search (e.g., partial name, booking reference, flight number) via `checkinRepository.searchBookings` (already there, but ensure UI supports fuzzy search).

### 6.3 Finance Module

**File:** `app/utils/services/reminder.service.ts` — already planned in Phase 0. Ensure payment reminders are sent automatically.

**File:** `app/routes/finance.reports.*` — add "Export CSV" buttons for all report pages (aging, daily sales, etc.) using existing `export.service.ts`.

### 6.4 Admin Module

**File:** `app/routes/admin.*` — add CSV import for aerodromes, aircraft, fares. Use `papaparse` or similar.

**File:** `app/routes/admin.audit-log.tsx` — new route to view audit log with filters (user, resource, date range).

---

## Testing and Quality Gates

For each phase, ensure:

- **Unit Tests**: For client-side W&B calculator (using Vitest). Test with sample data.
- **Integration Tests**: For email sending (mock SMTP), loadsheet sign-off, batch check-in.
- **E2E Tests**: For pilot briefing and loadsheet interaction (Playwright). Test offline mode with service worker.
- **Lint/Typecheck**: Run `npm run lint` and `npm run typecheck` after each file modification.
- **Backward Compatibility**: Existing functionality must not break. Run existing test suites.

**Test Files to Create/Update:**

- `tests/unit/weight-balance/calculator.test.ts`
- `tests/integration/email/email.test.ts`
- `tests/integration/loadsheet/sign-off.test.ts`
- `tests/e2e/pilot-briefing.spec.ts`
- `tests/e2e/loadsheet-interactive.spec.ts`

---

## Deployment Considerations

- **Environment Variables**: Add SMTP settings to deployment environment (Netlify, etc.).
- **Service Worker**: Ensure the new service worker is properly registered and cached.
- **Database**: No new tables needed except possibly `briefing_acceptances` (optional). If we add new columns, create migrations (e.g., `020_add_briefing_acceptance.sql`).
- **Performance**: The client-side W&B calculator should be lightweight; avoid heavy dependencies.
- **Security**: Email sending should use environment variables; no hardcoded credentials.

---

## Summary of New/Modified Files

### New Files
- `app/utils/email.server.ts`
- `app/emails/*.ts` (templates)
- `app/utils/weight-balance/calculator.client.ts`
- `app/hooks/useWeightBalance.ts`
- `app/routes/api.flight.$flightId.wb-data.ts`
- `app/hooks/useOfflineData.ts`
- `app/routes/admin.audit-log.tsx`

### Modified Files
- `app/utils/services/reminder.service.ts`
- `app/routes/_auth.signup.tsx`
- `app/routes/operations.bookings.new.tsx`
- `app/routes/operations.bookings.$bookingId.tsx`
- `app/routes/operations.schedule._index/action.server.ts`
- `app/utils/schedule-handlers.server.ts`
- `app/utils/services/payment.service.ts`
- `app/components/loadsheet/LoadsheetModal.tsx`
- `app/components/pilot/PilotBriefing.tsx`
- `app/routes/pilot.briefing.$flightId.tsx`
- `app/routes/ops.flight.$flightId.loadsheet.tsx`
- `app/routes/operations._index.tsx`
- `app/routes/checkin.counter.tsx`
- `app/routes/finance.reports.*.tsx`
- `app/routes/admin.*.tsx` (add import feature)
- `public/sw.js`
- `public/manifest.json`
- `.env.example`

---

## Next Steps for Coding Agent

1. Start with Phase 0 (Email System) as it's a foundational service.
2. Then Phase 1 (W&B Engine) and Phase 2 (Interactive Loadsheet) in parallel.
3. Continue with Phases 3, 4, 5, 6 in order, ensuring each phase's tests pass.

Throughout, maintain backward compatibility by not altering existing server-side W&B calculations unless absolutely necessary. The client-side engine is additive.

Use the existing repositories and services; do not rewrite them. Add new functions as needed.

Document any new environment variables and update README.

---

---

## Critical Review Amendments (2026-06-26)

The following corrections were identified during codebase review and **must** be applied before or during implementation. Issues marked **[FIXED]** have been resolved in the codebase.

### A. CG Unit Mismatch — Phase 1.1 Correction **[CRITICAL]**

The plan references `app/utils/scheduling/weight-balance.ts` as the formula source for the client-side calculator. **This is wrong.** That engine outputs `cgPositionPct` (percentage MAC), but `CGEnvelopeChart` accepts `cgMM` (millimeters from datum).

**Correction**: The client-side calculator MUST use `app/utils/loadsheet/seat-assignment.ts`'s `computeCG()` function as its foundation. This function:
- Uses per-seat millimeter arm positions (`SEAT_ARMS_MM` — 9 positions for BN-2 Islander)
- Produces `cogMm` output matching `CGEnvelopeChart`'s expected input
- Is a **pure function** (no DB/FS dependencies) and fully client-safe
- Already includes CG limit validation (`CG_FWD_LIMIT_MM` = 2057.4, `CG_AFT_LIMIT_MM` = 2565.4)

The client-side calculator should:
1. Import/replicate `computeCG()` from `seat-assignment.ts`
2. Add per-sector fuel cascade using the BN-2 burn rate constants
3. Add MTOW/MLW checks against aircraft limits
4. Accept pre-loaded distance maps as parameters (from API endpoint)

### B. Broken W&B Query in Pilot Briefing — Phase 3 Prerequisite **[FIXED]**

`app/routes/pilot.briefing.$flightId.tsx:70-84` queried `WHERE flight_id = $1` on `weight_balance_snapshots`, but that table uses `flight_leg_id` (not `flight_id`). The query always returned 0 rows, causing hardcoded-zero fallback.

**Fix applied**: Query now JOINs through `flight_legs fl ON fl.id = wbs.flight_leg_id WHERE fl.flight_id = $1`.

### C. Hardcoded `finalizedBy: 1` — Loadsheet Route **[FIXED]**

`app/routes/ops.flight.$flightId.loadsheet.tsx:249` used `finalizedBy: 1` (hardcoded). The `requireUser()` call at line 167 was discarding the returned `userId`.

**Fix applied**:
1. Destructure `userId` from `requireUser()`: `const { userId } = await requireUser(request)`
2. Pass `userId` to `loadsheetRepository.finalize(loadsheet.id, userId, checksum)`
3. Pass `actor_id: userId` to `loadsheetRepository.logAudit()`

### D. Sequencing Error — Phase Dependencies

The plan states "Phase 1 (W&B Engine) and Phase 2 (Interactive Loadsheet) in parallel." **This is impossible.** Phase 2 requires:
- Client-side `computeWeightBalance` from Phase 1.1
- `useWeightBalance` hook from Phase 1.2
- API endpoint from Phase 1.3

**Correction**: Phase 1 must be completed before Phase 2. Recommended order:
1. Phase 0 (Email) — can run in parallel with Phase 1
2. Phase 1 (W&B Engine) — complete 1.1 → 1.2 → 1.3 sequentially
3. Phase 2 (Interactive Loadsheet) — depends on Phase 1 completion
4. Phase 3 (Pilot Briefing) — depends on Phase 1 + Phase 2
5. Phase 5 (Automated W&B Checks) — depends on Phase 1
6. Phase 4 (PWA) — can run independently
7. Phase 6 (Enhancements) — can run independently

### E. Orphaned Notification System — Phase 0 Integration

The plan ignores the existing `notifications` table and `app/routes/operations.notifications.tsx` route (219 lines) which already has:
- `notificationRepository` with `create()`, `findById()`, `markAsSent()`, `markAsFailed()`
- Notification status lifecycle: `pending` → `sent`/`failed`
- "Resend" functionality for failed notifications
- UI with DataTable showing all notifications by type, recipient, related flight/booking

**Correction**: The email service should integrate with this existing system:
1. `sendEmail()` creates a `notifications` row (status: `pending`) before sending
2. On success, call `notificationRepository.markAsSent(notificationId)`
3. On failure, call `notificationRepository.markAsFailed(notificationId)`
4. The existing `/operations/notifications` UI provides visibility and retry

### F. PWA Section Correction

The plan mentions Workbox, but the current SW is a **vanilla service worker** at `public/sw.js` (no Workbox, no VitePWA plugin). All PWA changes must be made directly to `public/sw.js`.

### G. Which W&B Engine for Sign-Off Validation?

The plan proposes server-side W&B re-validation on sign-off (Phase 2.2), but doesn't specify which engine. The two engines (`scheduling/weight-balance.ts` vs `loadsheet/loadsheet-calculations.server.ts`) produce different CG results (pct% vs mm, different arm data, different fuel models).

**Correction**: Use the **loadsheet calculator** (`loadsheet-calculations.server.ts`) for sign-off validation, since:
- It produces `cogMm` matching `CGEnvelopeChart`
- It uses per-seat arm data (more accurate)
- The loadsheet data model stores `cog_position_mm` from this engine

### H. `sign_offs` Table Exists but Is Unused

The `sign_offs` table (`entity_type`, `entity_id`, `signed_by`, `signed_at`, `certification_statement`, `licence_number`) exists in the database but is never referenced in `app/` code. The plan should explicitly state whether to:
- Use `sign_offs` for loadsheet sign-off (set `entity_type = 'loadsheet'`, `entity_id = loadsheet.id`)
- Or keep using `loadsheets.finalized_by`/`finalized_at` columns (current approach)

**Recommendation**: Use `loadsheets.finalized_by`/`finalized_at` for the immediate sign-off (already implemented). Reserve `sign_offs` for future multi-signature or certification workflows.

### I. Missing Dependency Declarations

The following must be added to Phase 0 and Phase 6:
- **Phase 0**: `npm install nodemailer` + `npm install --save-dev @types/nodemailer`
- **Phase 6.4**: `npm install papaparse` + `npm install --save-dev @types/papaparse`

### J. New Environment Variables

Add to `.env.example` in Phase 0:
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=user
SMTP_PASS=pass
SMTP_FROM=noreply@figas.gov.fk
```

### K. Summary of Pre-Existing Bugs Fixed

| # | File | Bug | Fixed |
|---|------|-----|-------|
| 1 | `pilot.briefing.$flightId.tsx:80` | W&B query uses `flight_id` column that doesn't exist on `weight_balance_snapshots` | ✅ JOIN through `flight_legs` |
| 2 | `ops.flight.$flightId.loadsheet.tsx:249` | `finalizedBy` hardcoded to `1` | ✅ Uses `userId` from `requireUser()` |

---

**End of Plan**