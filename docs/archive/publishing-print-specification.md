# Schedule Publishing & Printable Loadsheet — Functional Specification

> **Version**: 1.0  
> **Date**: 2026-06-04  
> **Status**: Draft for Review  

---

## 1. Schedule Publishing System

### 1.1 Overview

Enable administrators to publish a finalized daily flight schedule to a publicly accessible URL. The system notifies passengers and stakeholders upon publication, distinguishes between initial releases and amendments, and provides a print-optimized view.

### 1.2 Data Model

```
published_schedules
├── id              SERIAL PRIMARY KEY
├── schedule_id     INTEGER REFERENCES schedules(id) ON DELETE CASCADE
├── public_token    VARCHAR(32) UNIQUE NOT NULL    -- URL-safe random token
├── version         INTEGER DEFAULT 1              -- 1 = initial, 2+ = amendment
├── published_at    TIMESTAMPTZ DEFAULT NOW()
├── published_by    INTEGER REFERENCES users(id)
├── amendment_note  TEXT                           -- reason for amendment (null for initial)
├── disclaimer_text TEXT DEFAULT 'Flights may change at short notice. Check for updates before travel.'
├── is_active       BOOLEAN DEFAULT TRUE           -- FALSE when superseded by newer version
├── created_at      TIMESTAMPTZ DEFAULT NOW()

published_schedule_flights (snapshot of flight data at publish time)
├── id                  SERIAL PRIMARY KEY
├── published_schedule_id INTEGER REFERENCES published_schedules(id) ON DELETE CASCADE
├── flight_id           INTEGER REFERENCES flights(id)
├── flight_number       VARCHAR(20)
├── origin_code         VARCHAR(4)
├── destination_code    VARCHAR(4)
├── departure_time      TIMESTAMPTZ
├── arrival_time        TIMESTAMPTZ
├── status              VARCHAR(20)
├── aircraft_type       VARCHAR(100)
├── aircraft_registration VARCHAR(20)
├── pilot_name          VARCHAR(255)
├── stop_count          INTEGER
└── notes               TEXT
```

**Key design decisions**:
- `published_schedule_flights` is a **snapshot**, not a live reference. Immutable once written.
- `public_token` uses a random 32-char URL-safe string (e.g., `a7f3b9c1...`). No sequential IDs.
- `version` increments per amendment. Previous versions marked `is_active = FALSE`.
- `disclaimer_text` is stored per-publication to allow per-schedule overrides.

### 1.3 Public URL Structure

```
https://figas.gov.fk/schedule/a7f3b9c1d2e4f6a8b0c2d4e6f8a0b2c4
```

Route: `/schedule/$publicToken`

This is a **public route** — no authentication required. The controller:

1. Looks up `published_schedules` by `public_token` WHERE `is_active = TRUE`
2. Returns `published_schedule_flights` for that publication
3. Renders a read-only schedule view with disclaimer

### 1.4 Version Control & Amendment Lifecycle

```
Initial Publication (version=1)
    │
    │ Administrator makes changes to schedule
    │ (pilot reassignment, flight cancellation, new flight)
    │
    ▼
Amendment (version=2)
    │  ── previous version marked is_active=FALSE
    │  ── new snapshot created
    │  ── amendment_note records reason
    │  ── notification sent: "AMENDMENT: Flight FIG040601 now departs 07:00"
    │
    ▼
Amendment (version=3)
    │  ...
    ▼
Superseded
```

**Amendment detection**:
When the administrator clicks "Publish" on a schedule that already has an active publication:
1. Compare current flights against the latest snapshot
2. Generate a diff: added flights, removed flights, changed times, changed pilots/aircraft
3. Prompt a confirmation dialog showing the diff
4. On confirm: increment version, snapshot, deactivate old, notify

**Display on public page**:
- Version 1 header: "Flight Schedule — 4 Jun 2026"
- Version 2+ header: "Flight Schedule — 4 Jun 2026 (Amendment #2)"
- Footer: "Published: 10:30 AM | Amended: 14:45 PM · Flights may change at short notice."

### 1.5 Notification Engine

#### 1.5.1 Trigger Points

| Event | Notification Type | Recipients |
|-------|-------------------|------------|
| Initial publication | `schedule_published` | All passengers with bookings on that date · Travel agents with bookings · Subscribed users |
| Amendment | `schedule_amended` | Same as above, plus includes summary of changes |
| Flight cancelled post-publication | `flight_cancelled` | Passengers on the cancelled flight only |

#### 1.5.2 Notification Channels

**Email** (primary):
- Template: FIGAS branded HTML email
- Content: date, flight list, link to public schedule, disclaimer
- Delivery: queued via database table, processed by background job
- Retry: 3 attempts at 5-minute intervals, then `failed` status

**In-App Notification** (secondary):
- Stored in `notifications` table (existing schema)
- Appears in user's notification center
- Marked as read on view

**SMS** (optional future):
- Gate behind `sms_notifications_enabled` flag per user
- Only for critical changes (cancellations, >2hr delays)

#### 1.5.3 Notification Data Flow

```
handlePublishSuccess(scheduleId)
    │
    ├── 1. Query all booking_passengers for the schedule date
    │       SELECT DISTINCT bp.email, bp.user_id
    │       FROM booking_passengers bp
    │       JOIN booking_legs bl ON bl.booking_id = bp.booking_id
    │       JOIN flights f ON f.id = bl.flight_id
    │       WHERE f.schedule_id = $1
    │
    ├── 2. Query travel agents with bookings
    │       SELECT DISTINCT o.email, o.id
    │       FROM organizations o
    │       JOIN bookings b ON b.organization_id = o.id
    │       WHERE b.id IN (SELECT booking_id FROM booking_legs ... WHERE schedule_id = $1)
    │
    ├── 3. Query subscribed users (opted into schedule notifications)
    │       SELECT u.email FROM users u
    │       WHERE u.notify_schedule_published = TRUE
    │
    └── 4. Batch create notifications
            FOR EACH recipient:
                INSERT INTO notifications (recipient_email, notification_type, ...)
```

#### 1.5.4 Email Template

```
Subject: FIGAS Flight Schedule — 4 June 2026 [AMENDMENT]

FIGAS — Falkland Islands Government Air Service

Flight Schedule for Thursday, 4 June 2026

Flight    Route                    Depart  Arrive  Aircraft    Pilot
FIG040601 STY→SPI→PHP→PSC→BKI→STY  08:30   11:10   BN-2 VP-FBN  D. Smith
FIG040602 BKI→SPI→PHP→PSC→STY      07:00   09:00   BN-2 VP-FBD  J. Doe

⚠ Flights may change at short notice.
View live schedule: https://figas.gov.fk/schedule/a7f3b9...

Check in 30 minutes before departure.
Contact: +500 27219 | ops@figas.gov.fk
```

### 1.6 Print-Optimized Public Schedule

Route: `/schedule/$publicToken?print=1`

Same data as the public page, but with:
- `@media print` CSS removing navigation, footer, and interactive elements
- Single-page layout: all flights in a compact table
- FIGAS logo and contact info in header
- Disclaimer in footer
- QR code linking to the live public URL (for scanning from a printed sheet)

### 1.7 UI Flow

```
Operations > Schedule Builder
    │
    ├── [Approve] → [Publish] buttons on approved schedule
    │       │
    │       ├── If first publish:
    │       │     Confirm dialog: "Publish schedule for 4 Jun 2026? 3 flights, 8 passengers will be notified."
    │       │     [Publish] → generates public_token → sends notifications → shows public URL
    │       │
    │       └── If amendment:
    │             Diff dialog showing changes (added/removed flights, time changes)
    │             amendment_note input (required)
    │             [Publish Amendment] → increments version → sends amendment notifications
    │
    └── Public schedule link displayed in schedule status bar
          "📋 Published: /schedule/a7f3b9... [Copy] [View] [Print]"
```

---

## 2. Printable Loadsheet Module

### 2.1 Overview

Generate a two-page, landscape-oriented, print-optimized PDF from the loadsheet modal. Page 1 is the Passenger Manifest. Page 2 is Sector Calculations & Weight/Fuel Planning. Designed for double-sided printing on A4.

### 2.2 Print Trigger

- Button in loadsheet modal header: `[Print Loadsheet]`
- Button on full-page loadsheet view: `[Print]`
- Both open a new browser tab at: `/ops/flight/:flightId/loadsheet/print`

### 2.3 Print Route

Route: `/ops/flight/:flightId/loadsheet.print`

**Loader**: Same as the loadsheet loader — returns all data needed for both pages.

**Component**: Renders both pages as fixed-size A4 landscape divs with `@media print` CSS.

### 2.4 Page Layout

#### Page 1 — Passenger Manifest

```
╔══════════════════════════════════════════════════════════════════�—
║ FIGAS — Falkland Islands Government Air Service                  ║
║                                                                  ║
║ LOADSHEET                  Flight: FIG040601                     ║
║ Date: 04 Jun 2026          Aircraft: BN-2 Islander VP-FBN        ║
║ Pilot: Capt. D. Smith      Empty Wt: 1,627 kg  MTOW: 2,994 kg   ║
║                                                                  ║
║ PASSENGER MANIFEST                                               ║
║                                                                  ║
║ Seat  Passenger         Wt     Bag   STY  BKI  SPI  PHP  PSC  ║
║ ───────────────────────────────────────────────────────────── ║
║ 1C    H. Irving         85 kg    —    �—�━━━━━━━━━━━━━━━━━━━━▶    ║
║ 2L    O. Harrison       80 kg    —    �—�━━━━━━━━━━━━━━▶           ║
║ 2R    D. McDonald       81 kg    —    �—�━━━━━━━━━━━━━▶            ║
║ ──    Aft Hold (Baggage)         15 kg ─ ─ ─ ─ ─ ─ ─ ─ ─ ─     ║
║                                                                  ║
║ Total Pax: 3    Total Pax Wt: 246 kg    Total Baggage: 15 kg    ║
║                                                                  ║
║ �—� Board    ▶ Alight    ─ In transit                              ║
║                                                                  ║
║ ⚠ This is an uncontrolled document when printed.                ║
║ Printed: 04 Jun 2026 10:45   Loadsheet ID: LS-0042              ║
╚══════════════════════════════════════════════════════════════════╝
```

#### Page 2 — Sector Calculations & Weight/Fuel Planning

```
╔══════════════════════════════════════════════════════════════════�—
║ FIGAS — Falkland Islands Government Air Service                  ║
║                                                                  ║
║ LOADSHEET                  Flight: FIG040601                     ║
║ Date: 04 Jun 2026          Aircraft: BN-2 Islander VP-FBN        ║
║                                                                  ║
║ SECTOR CALCULATIONS & WEIGHT / FUEL PLANNING                     ║
║                                                                  ║
║ #  From→To    Dist  Plan  ETD   ETA   ATD   ATA   TOW    LW    ║
║ ───────────────────────────────────────────────────────────── ║
║ 1  STY→BKI    62nm  27m  0830  0857  ____  ____  2,519  2,508  ║
║ 2  BKI→SPI    73nm  31m  0907  0938  ____  ____  2,508  2,497  ║
║ 3  SPI→PHP    41nm  18m  0948  1006  ____  ____  2,497  2,488  ║
║ 4  PHP→PSC    40nm  17m  1016  1033  ____  ____  2,488  2,479  ║
║ 5  PSC→STY    52nm  22m  1043  1105  ____  ____  2,479  2,468  ║
║                                                                  ║
║ #  CG (mm)    CG Sts   FOB   Burn   Rem   Fuel Sts              ║
║ ───────────────────────────────────────────────────────────── ║
║ 1  1,939.7    VIOL⚠   84kg   11kg  73kg   OK                    ║
║ 2  1,993.6    VIOL⚠   73kg   11kg  62kg   OK                    ║
║ 3  2,000.4    VIOL⚠   62kg    7kg  55kg   OK                    ║
║ 4  2,000.4    VIOL⚠   55kg    7kg  48kg   OK                    ║
║ 5  2,000.4    VIOL⚠   48kg    9kg  39kg   OK                    ║
║                                                                  ║
║ Starting Fuel: 84 kg  │  Total Burn: 45 kg                      ║
║ Reserve: 35 kg  │  Remaining at STY: 39 kg (OK)                ║
║                                                                  ║
║ CG Limits: 81.0"–101.0" (2057–2565 mm)  MTOW: 2,994 kg         ║
║ Only Stanley (STY) has refueling facilities.                     ║
║                                                                  ║
║ Pilot Signature: _______________   Date: _______________        ║
║                                                                  ║
║ ⚠ This is an uncontrolled document when printed.                ║
║ Printed: 04 Jun 2026 10:45   Loadsheet ID: LS-0042              ║
╚══════════════════════════════════════════════════════════════════╝
```

### 2.5 Technical Implementation

#### 2.5.1 CSS Approach (`@media print`)

Create a print-specific stylesheet applied to `/ops/flight/:id/loadsheet/print`:

```css
@media print {
  @page {
    size: A4 landscape;
    margin: 12mm;
  }

  .no-print { display: none !important; }
  .modal-overlay { display: none !important; }

  .print-page {
    page-break-after: always;
    width: 277mm;
    height: 190mm;
    padding: 8mm;
    border: 1px solid #e2e8f0;
    font-size: 9pt;
    font-family: 'Courier New', monospace; /* monospace for loadsheet authenticity */
    background: white;
  }

  .print-page:last-child {
    page-break-after: avoid;
  }
}
```

#### 2.5.2 PDF Export (Alternative)

For server-side PDF generation, use `@react-pdf/renderer`:

```typescript
// app/utils/loadsheet/print.server.ts
import { renderToStream } from "@react-pdf/renderer";
import { LoadsheetPDF } from "../../components/loadsheet/LoadsheetPDF";

export async function generateLoadsheetPDF(flightId: number): Promise<ReadableStream> {
  const data = await fetchLoadsheetData(flightId);
  return renderToStream(<LoadsheetPDF data={data} />);
}
```

This is heavier but guarantees pixel-perfect rendering regardless of browser print engine.

#### 2.5.3 Route Handler

```typescript
// app/routes/ops.flight.$flightId.loadsheet.print.tsx

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { userId } = await requireUser(request);
  const flightId = Number(params.flightId);

  // ... fetch same data as loadsheet loader ...

  return json({ ...data, printMode: true });
}

export default function PrintLoadsheet() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="print-container">
      {/* Page 1 — Manifest */}
      <div className="print-page">
        <PrintHeader data={data} pageTitle="PASSENGER MANIFEST" />
        <ManifestJourney passengers={data.passengers} stopCodes={data.stopCodes} />
        <PrintFooter data={data} />
      </div>

      {/* Page 2 — Sector Calculations */}
      <div className="print-page">
        <PrintHeader data={data} pageTitle="SECTOR CALCULATIONS & WEIGHT / FUEL PLANNING" />
        <SectorPrintTable sectors={data.sectors} />
        <PrintFooter data={data} />
      </div>
    </div>
  );
}
```

### 2.6 Print-Mode UX

1. User clicks `[Print Loadsheet]` in the modal or full-page view
2. New tab opens at `/ops/flight/:id/loadsheet/print`
3. Page renders both A4 landscape pages inline
4. `window.print()` is triggered automatically on load (with a 500ms delay for render)
5. After printing, tab can be closed — no interactive elements remain
6. User returns to the schedule page / modal where they left off

### 2.7 Required FIGAS Branding on Printed Documents

All printed documents must include:
- FIGAS logo (inline SVG or base64 PNG, no external resources)
- "Falkland Islands Government Air Service" official name
- Contact: `ops@figas.gov.fk | +500 27219`
- Document metadata: loadsheet ID, print timestamp, version
- Watermark: "UNCONTROLLED WHEN PRINTED" in diagonal gray text
- Pilot signature line (Page 2 only)
- Disclaimer: "This document is generated from the FIGAS Flight Operations System."

---

## 3. Implementation Roadmap

### Phase 1: Schedule Publishing (Days 1–3)

| Task | Effort | File |
|------|--------|------|
| Create `published_schedules` + `published_schedule_flights` tables | 2h | Migration |
| Create `publicToken` generation utility (crypto.randomBytes) | 1h | `app/utils/publishing/token.ts` |
| Create `handlePublishSchedule` server handler (snapshot + notifications) | 3h | `schedule-handlers.server.ts` |
| Create `handlePublishAmendment` handler (diff + version) | 2h | `schedule-handlers.server.ts` |
| Create public route `/schedule/$token` | 2h | Route |
| Create email template (HTML) + notification batch processor | 3h | `app/utils/publishing/notifications.server.ts` |
| Add "Publish" button UI to schedule status bar | 1h | `operations.schedule._index.tsx` |

### Phase 2: Printable Loadsheet (Days 4–5)

| Task | Effort | File |
|------|--------|------|
| Create print route `/ops/flight/:id/loadsheet/print` | 2h | Route |
| Create `@media print` CSS stylesheet | 2h | `app/styles/print.css` |
| Create `PrintHeader` component (FIGAS branding) | 1h | Component |
| Create `SectorPrintTable` component | 1h | Component |
| Add `[Print Loadsheet]` button to modal + full-page view | 1h | Modal / Route |
| Auto-trigger `window.print()` on load | 0.5h | Print route |
| Add "UNCONTROLLED WHEN PRINTED" watermark | 0.5h | CSS |

### Phase 3: Polish (Day 6)

| Task | Effort |
|------|--------|
| QR code on public schedule → links to live URL | 1h |
| Password protect public schedules (optional PIN) | 1h |
| Analytics: track public schedule views | 1h |
| End-to-end test: publish → notify → view → print | 2h |

---

## 4. Edge Cases & Considerations

| Scenario | Handling |
|----------|----------|
| No passengers booked on published date | Still publish, notification skipped. Public page shows date header with "No scheduled flights" message. |
| User unsubscribes between publish and amendment | Check `notify_schedule_published` flag again before sending amendment. |
| Public token guessed/brute-forced | 32-char hex = 128 bits. Rate limit: 10 requests/minute per IP on public schedule route. |
| Administrator publishes multiple times rapidly | Debounce: 30-second cooldown between publish actions on same schedule. |
| Print with 0 passengers on flight | Page 1 shows "No passengers" placeholder. Still prints for repositioning/ferry flights. |
| Browser blocks `window.print()` popup | Fallback: show a "Click here to print" button. User manually triggers print dialog. |
| Loadsheet not yet generated (no sectors) | Print route triggers auto-generation before rendering. |
