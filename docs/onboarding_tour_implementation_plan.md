# FIGAS Onboarding Tour — Technical Implementation Plan

> **Companion to:** [`docs/onboarding_recommendation.md`](onboarding_recommendation.md)
> **Library:** [driver.js](https://driverjs.com) v1.x (MIT)
> **Status:** Proposed — not yet implemented
> **Scope:** Interactive, spotlight-style guided tours across 15 core pages, with per-user progress tracking, dark-mode-aware theming, and SPA/SSR-safe element handling.

---

## 1. Purpose & How This Plan Extends the Recommendation

The recommendation document ([`onboarding_recommendation.md`](onboarding_recommendation.md)) establishes **why** driver.js is the right choice and sketches the infrastructure. This plan is the **buildable** version. It corrects and hardens the recommendation against the actual codebase, which surfaced several blocking gaps:

| Area | Recommendation doc assumes | Reality in code | Impact |
|------|----------------------------|-----------------|--------|
| Unassigned pool selector | `#unassigned-pool` | Real id is `#unassign-pool` ([`route.tsx:152`](../app/routes/operations.schedule._index/route.tsx)) | Step would silently no-op |
| Schedule board / status bar | `#schedule-board`, `#schedule-status-bar` | Only `data-testid` exists, **no `id`** (`ScheduleBoard.tsx:36`, `ScheduleStatusBar.tsx:27`) | Steps would fail |
| Date picker / actions | `#schedule-date-picker`, `#schedule-actions` | Do **not** exist | Steps would fail |
| `showButtons: ['prev', ...]` | `'prev'` | driver.js v1 uses **`'previous'`** | Prev button missing |
| Element mounting | "delay 500–800ms" | Many targets are **conditionally rendered** (status/board/POS/weight inputs) and gated by loading skeletons; a fixed delay is not sufficient | Flaky tours |
| dnd-kit collision | n/a | `unassign-pool` and `draft-flight-placeholder` DOM ids **are dnd-kit droppable ids** — must not be renamed | Renaming breaks drag |
| Duplicate id | n/a | `#draft-flight-placeholder` is rendered **twice** (empty state + below board) | Ambiguous target |
| Header placement | "add to SidebarLayout header" | **Three** inconsistent header patterns coexist (PageLayout, PageHeader, inline `<h1>`) | No single drop-in point |

Everything below is written to be correct against the current code (file/line references throughout) and against the driver.js v1 API.

**Design principles carried over from the recommendation:** short tours (4–7 steps), stable selectors, async-safe start, never force users, track completion, WCAG-aware, match the design system.

---

## 2. Architecture Overview

```
app/
├── styles/
│   └── driver-theme.css                     # design-system + dark-mode overrides
├── utils/tour/
│   ├── tour-manager.client.ts               # driver.js wrapper, storage, element-wait
│   ├── storage.client.ts                    # pluggable progress store (localStorage → server-ready)
│   ├── registry.ts                          # pageKey → () => Promise<TourConfig> (lazy)
│   ├── types.ts                             # shared, SSR-safe types (no driver.js import)
│   └── definitions/
│       ├── operations-schedule.ts
│       ├── checkin-counter.ts
│       ├── pilot-briefing.ts
│       └── … (15 files)
├── hooks/
│   └── useTour.ts                           # React lifecycle glue + autostart guard
└── components/
    ├── TourTrigger.tsx                       # "Take a tour" button (help affordance)
    └── ProfilePopup.tsx                      # + "Reset onboarding tours" (edit)
```

**Layering rationale**

- **`types.ts`** contains only plain TS types (`TourStep`, `TourConfig`) and imports nothing from `driver.js`. This lets tour **definitions** and the **registry** be imported by server-rendered route modules without pulling driver.js (a browser-only library) into the server bundle.
- **`tour-manager.client.ts`** is the only module that imports `driver.js` and its CSS. The `.client.ts` suffix + Vite ensure it is never evaluated on the server.
- **`storage.client.ts`** abstracts persistence behind an interface so we can start with `localStorage` and later add server sync (§7) without touching any call site.
- **`registry.ts`** maps `pageKey → () => import('./definitions/…')` for **lazy loading**, so a page only ships its own tour definition.

---

## 3. Remix / SSR Considerations (critical)

driver.js touches `window`, `document`, and `localStorage`. In Remix these rules apply:

1. **No driver.js at module top level of a route.** Route modules run on the server. Import tour **definitions** (plain data) directly, but load `tour-manager.client.ts` only inside effects/handlers, or via the `useTour` hook which is client-gated.
2. **Guard all storage reads.** `localStorage` is undefined during SSR. All reads happen inside `useEffect` or event handlers (never during render), and are wrapped in `try/catch` (matches the recommendation's `getCompletedTours`).
3. **Hydration safety for the trigger button.** `TourTrigger` must render **identical** markup on server and first client paint. It must **not** hide itself based on `isTourCompleted()` during render (that reads `localStorage` and causes hydration mismatch). Instead it renders a stable button and adjusts visibility in an effect (see §5.3).
4. **CSS import.** `import 'driver.js/dist/driver.css'` lives in `tour-manager.client.ts`; Vite injects it on the client. The theme override (`driver-theme.css`) is added to the root `links()` export so it loads deterministically and can be purged/cache-busted like other app CSS.
5. **`autoStart` on navigation.** Remix client-side navigations do not remount the root. Autostart logic keys off `pageKey` changes and a per-session "already offered" guard to avoid re-triggering when a loader revalidates.

---

## 4. Step-by-Step Integration Guide

### Step 0 — Preconditions (anchor audit)

Before any tour is wired, add the missing stable anchors. **Convention: use `data-tour="<key>"` as the primary hook** (per recommendation best-practice #2), because ids on this codebase are overloaded for dnd-kit and accessibility. Tour selectors will be written as `[data-tour="…"]`. Existing `id`/`data-testid` hooks are reused where already stable.

See **§6.1 Anchor Inventory** for the exact file/line edits. These are small, non-behavioral attribute additions.

> **dnd-kit safety:** do **not** rename or remove the existing `id="unassign-pool"` / `id="draft-flight-placeholder"` — they are dnd-kit droppable ids ([`route.tsx:152`](../app/routes/operations.schedule._index/route.tsx), [`DraftFlightPlaceholder.tsx:20`](../app/components/schedule/DraftFlightPlaceholder.tsx)). Add a *separate* `data-tour` attribute instead.

### Step 1 — Install

```bash
npm install driver.js
```

Adds `driver.js` to `dependencies` in `package.json`. No other runtime deps (lucide-react `HelpCircle`/`RotateCcw` are already available in `lucide-react@1.17.0`).

### Step 2 — Shared types (SSR-safe)

**File:** `app/utils/tour/types.ts`

```typescript
// No driver.js import here — safe for server bundles.
export type TourSide = "top" | "right" | "bottom" | "left" | "over";
export type TourAlign = "start" | "center" | "end";

export interface TourStep {
  /** CSS selector (prefer [data-tour="…"]) or a live Element. Omit for a centered modal step. */
  element?: string | Element;
  popover?: {
    title?: string;
    description: string;
    side?: TourSide;
    align?: TourAlign;
  };
  /**
   * Optional: run before this step highlights. Use to open panels / switch modes
   * so a conditionally-rendered target exists (returns when the element is ready).
   */
  onBeforeHighlight?: () => void | Promise<void>;
  /** If true, the step is skipped when `element` is not in the DOM (default true). */
  skipIfMissing?: boolean;
}

export interface TourConfig {
  /** Stable key used for progress tracking, e.g. "operations-schedule". */
  pageKey: string;
  /** Bump when step content materially changes to re-show to returning users. */
  version: number;
  steps: TourStep[];
  showProgress?: boolean;
  /** Whether first-time visitors are auto-offered this tour. */
  autoStart?: boolean;
}
```

### Step 3 — Progress storage (pluggable)

**File:** `app/utils/tour/storage.client.ts`

```typescript
const STORAGE_KEY = "figas_tours_completed_v1";

/** Completion record: pageKey → highest completed version. */
type CompletionMap = Record<string, number>;

interface TourStore {
  getCompletion(pageKey: string): number | null;
  setCompletion(pageKey: string, version: number): void;
  reset(): void;
}

function readMap(): CompletionMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as CompletionMap;
  } catch {
    return {};
  }
}

function writeMap(map: CompletionMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode — non-fatal, tour just re-offers next session */
  }
}

export const localTourStore: TourStore = {
  getCompletion: (pageKey) => readMap()[pageKey] ?? null,
  setCompletion: (pageKey, version) => {
    const map = readMap();
    map[pageKey] = version;
    writeMap(map);
  },
  reset: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
};

/** Swap this for a server-backed store later (see §7) without changing call sites. */
export const tourStore: TourStore = localTourStore;

/** A tour is "done" only if the stored version is >= the current tour version. */
export function isTourCompleted(pageKey: string, version: number): boolean {
  const done = tourStore.getCompletion(pageKey);
  return done !== null && done >= version;
}

export function markTourCompleted(pageKey: string, version: number): void {
  tourStore.setCompletion(pageKey, version);
}

export function resetAllTours(): void {
  tourStore.reset();
}
```

> **Improvement over the recommendation:** completion is version-aware (`pageKey → version`) rather than a flat `Set<string>`. Bumping a definition's `version` re-shows the tour to users who saw the old one — essential as the UI evolves.

### Step 4 — Tour manager (driver.js wrapper + async guards)

**File:** `app/utils/tour/tour-manager.client.ts`

```typescript
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "~/styles/driver-theme.css";
import { markTourCompleted } from "./storage.client";
import type { TourConfig, TourStep } from "./types";

/** Poll for an element up to `timeout`ms (driver.js has no native wait). */
export function waitForElement(selector: string, timeout = 4000): Promise<Element | null> {
  return new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);
    const started = Date.now();
    const interval = window.setInterval(() => {
      const el = document.querySelector(selector);
      if (el || Date.now() - started > timeout) {
        window.clearInterval(interval);
        resolve(el);
      }
    }, 100);
  });
}

function isPresent(step: TourStep): boolean {
  if (!step.element) return true; // centered modal step
  if (typeof step.element !== "string") return true;
  return !!document.querySelector(step.element);
}

/**
 * Build and start a driver.js tour from a TourConfig.
 * Returns the Driver instance (or null if there was nothing to show).
 */
export async function startTour(config: TourConfig): Promise<Driver | null> {
  // Filter out steps whose targets are absent (unless the step wants to force itself)
  const steps = config.steps.filter(
    (s) => s.skipIfMissing === false || isPresent(s)
  );
  if (steps.length === 0) return null;

  const driverObj = driver({
    showProgress: config.showProgress ?? true,
    progressText: "{{current}} of {{total}}",
    showButtons: ["next", "previous", "close"], // NOTE: v1 uses "previous", not "prev"
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    allowClose: true,
    smoothScroll: true,
    stagePadding: 6,
    stageRadius: 8,
    popoverClass: "figas-tour",
    steps: steps.map((s) => ({
      element: s.element,
      popover: s.popover,
      onHighlightStarted: s.onBeforeHighlight
        ? async () => {
            await s.onBeforeHighlight?.();
          }
        : undefined,
    })),
    onDestroyed: () => {
      // Fires on completion AND on close — either way, stop re-offering this version.
      markTourCompleted(config.pageKey, config.version);
    },
  });

  driverObj.drive();
  return driverObj;
}
```

**API notes baked in above (all verified against driver.js v1):**

- `showButtons` values are `"next" | "previous" | "close"` — the recommendation's `'prev'` is wrong and would drop the Back button.
- `onDestroyed` fires for **both** "Done" and "×/Esc/overlay-close", so it is the correct single place to record completion (no separate close handler needed).
- If a step defines `onNextClick`/`onPrevClick`, driver.js stops auto-advancing and you must call `driverObj.moveNext()` yourself. We deliberately avoid those in favor of `onHighlightStarted` (via `onBeforeHighlight`) so navigation stays automatic.
- `progressText` uses the `{{current}}/{{total}}` template tokens.

### Step 5 — React glue

#### 5.1 `useTour` hook

**File:** `app/hooks/useTour.ts`

```typescript
import { useCallback, useEffect, useRef } from "react";
import type { Driver } from "driver.js";
import type { TourConfig } from "~/utils/tour/types";
import { isTourCompleted } from "~/utils/tour/storage.client";

interface UseTourOptions {
  /** When true, auto-offer to first-time users once the page is ready. */
  autoStart?: boolean;
  /** Gate autostart on data readiness (e.g. !isLoading). */
  ready?: boolean;
}

export function useTour(config: TourConfig, opts: UseTourOptions = {}) {
  const driverRef = useRef<Driver | null>(null);
  const offeredRef = useRef(false); // guard against loader revalidation re-triggers

  const start = useCallback(async () => {
    const { startTour } = await import("~/utils/tour/tour-manager.client");
    driverRef.current?.destroy();
    driverRef.current = await startTour(config);
  }, [config]);

  useEffect(() => {
    const ready = opts.ready ?? true;
    if (!opts.autoStart || offeredRef.current || !ready) return;
    if (isTourCompleted(config.pageKey, config.version)) return;

    offeredRef.current = true;
    // Give Remix's transition + any skeleton swap a beat to settle.
    const t = window.setTimeout(start, 400);
    return () => window.clearTimeout(t);
  }, [opts.autoStart, opts.ready, config.pageKey, config.version, start]);

  // Clean up if the user navigates away mid-tour.
  useEffect(() => () => driverRef.current?.destroy(), []);

  return { start };
}
```

#### 5.2 `TourTrigger` component (hydration-safe)

**File:** `app/components/TourTrigger.tsx`

```tsx
import { useEffect, useState } from "react";
import { HelpCircle } from "lucide-react";
import { useTour } from "~/hooks/useTour";
import { isTourCompleted } from "~/utils/tour/storage.client";
import type { TourConfig } from "~/utils/tour/types";

interface TourTriggerProps {
  config: TourConfig;
  label?: string;
  autoStart?: boolean;
  ready?: boolean;
  className?: string;
}

export function TourTrigger({
  config,
  label = "Take a tour",
  autoStart = false,
  ready = true,
  className = "",
}: TourTriggerProps) {
  const { start } = useTour(config, { autoStart, ready });
  // Render a stable button on SSR + first paint; refine after mount to avoid
  // hydration mismatch from reading localStorage during render.
  const [completed, setCompleted] = useState(false);
  useEffect(() => {
    setCompleted(isTourCompleted(config.pageKey, config.version));
  }, [config.pageKey, config.version]);

  return (
    <button
      type="button"
      onClick={() => void start()}
      className={`inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-800/50 ${className}`}
      aria-label={completed ? `Replay ${label}` : `Start ${label}`}
      title={completed ? "Replay tour" : label}
    >
      <HelpCircle size={14} aria-hidden />
      {completed ? "Replay tour" : label}
    </button>
  );
}
```

> **Improvement over the recommendation:** the button is **never removed from the tree** after completion (recommendation returned `null`, causing a hydration mismatch and removing the only discoverability affordance). Instead it flips to "Replay tour", satisfying best-practice #4 (users keep control) and giving a permanent help entry point.

#### 5.3 Registry (lazy definitions)

**File:** `app/utils/tour/registry.ts`

```typescript
import type { TourConfig } from "./types";

export const tourRegistry: Record<string, () => Promise<{ default: TourConfig }>> = {
  "operations-schedule": () => import("./definitions/operations-schedule"),
  "checkin-counter": () => import("./definitions/checkin-counter"),
  "pilot-briefing": () => import("./definitions/pilot-briefing"),
  // … one entry per page
};
```

Pages that want the smallest footprint can `import` their definition directly; the registry exists for a future global "Help → tours for this page" launcher and for the reset flow.

### Step 6 — Layout integration (three header patterns)

There is no single global header, so integrate per pattern (all three are one-liners once `TourTrigger` exists):

**Pattern A — `PageLayout.headerActions`** ([`PageLayout.tsx:11-19`](../app/components/PageLayout.tsx)) — used by operations booking detail, bookings dashboard, schedule:

```tsx
<PageLayout
  title={booking.booking_reference}
  headerActions={<TourTrigger config={bookingDetailTour} />}
>
```

**Pattern B — `PageHeader.actions`** ([`PageHeader.tsx:34`](../app/components/PageHeader.tsx)) — used by **all finance routes**:

```tsx
<PageHeader
  title="Invoices"
  actions={
    <>
      <TourTrigger config={financeInvoicesTour} />
      <Button>Export CSV</Button>
    </>
  }
/>
```

**Pattern C — inline `<h1>`** (operations/pilot/engineer/admin dashboards) — drop into the existing right-aligned action cluster, e.g. [`operations._index.tsx:200`](../app/routes/operations._index.tsx):

```tsx
<div className="flex items-center gap-2">
  <TourTrigger config={operationsDashboardTour} autoStart />
  <NotificationBell … />
</div>
```

> For pages with a **bare `<h1>` and no action row** (finance dashboard `finance._index.tsx:181`, admin dashboard `admin._index.tsx:58`), wrap the `<h1>` in a `flex items-center justify-between` and add the trigger — a 2-line change per page.

### Step 7 — Global "Reset onboarding tours"

Add to the existing user dropdown, which already hosts Dark Mode / Profile / Logout ([`ProfilePopup.tsx:50-75`](../app/components/ProfilePopup.tsx)) — globally reachable from every `SidebarLayout` page:

```tsx
import { RotateCcw } from "lucide-react";
import { resetAllTours } from "~/utils/tour/storage.client";

<button
  type="button"
  onClick={() => {
    resetAllTours();
    window.location.reload();
  }}
  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
>
  <RotateCcw size={14} aria-hidden />
  Reset onboarding tours
</button>
```

A secondary copy can live in the currently-empty [`settings.tsx`](../app/routes/settings.tsx) shell for discoverability.

---

## 5. Configuration Strategy

Aligned with the recommendation's defaults, hardened for this app:

| Setting | Value | Rationale |
|---------|-------|-----------|
| `showProgress` | `true` | Users see length up front (recommendation §1 keep-it-short) |
| `progressText` | `"{{current}} of {{total}}"` | Plain-language, non-technical audience |
| `showButtons` | `["next","previous","close"]` | **`previous`**, not `prev` (v1 API) |
| `nextBtnText` / `prevBtnText` / `doneBtnText` | `Next` / `Back` / `Done` | Consistent voice |
| `allowClose` | `true` | Never trap users (best-practice #4) |
| `smoothScroll` | `true` | Long pages (schedule board, booking detail) scroll the target into view |
| `stagePadding` / `stageRadius` | `6` / `8` | Matches Tailwind `rounded-lg` design language |
| `popoverClass` | `"figas-tour"` | Namespaced theming hook |
| `disableActiveInteraction` | `true` **only** on drag-related steps | Prevents accidental drags while the pool/board is spotlighted |
| Autostart | first-time only, gated on `ready` | No fixed-delay guesswork |
| Persistence | version-aware `localStorage`, server-ready | §7 |

**Theming** — `app/styles/driver-theme.css`, added to root `links()`:

```css
.driver-popover.figas-tour {
  border-radius: 0.5rem;                 /* rounded-lg */
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  font-family: inherit;
}
.driver-popover.figas-tour .driver-popover-title { font-weight: 600; }
.driver-popover.figas-tour .driver-popover-next-btn {
  background: #2563eb; color: #fff; border: none; border-radius: 0.375rem;
}
/* Dark mode: the app toggles a `.dark` class on <html> (ThemeProvider). */
.dark .driver-popover.figas-tour {
  background: #1e293b; color: #e2e8f0;
}
.dark .driver-popover.figas-tour .driver-popover-title { color: #f8fafc; }
.dark .driver-popover.figas-tour .driver-popover-arrow-side-left.driver-popover-arrow { border-left-color: #1e293b; }
/* …repeat arrow color per side for dark mode */
```

> driver.js also exposes CSS variables (e.g. `--driver-popover-bg`); either approach works. Class overrides are used here to match the existing Tailwind palette and the app's `.dark` strategy.

---

## 6. Detailed Tour Step Sequences (mapped to real UI)

### 6.1 Anchor Inventory (must-add before wiring)

These are the additive `data-tour` (and a few `id`) attributes required. All are non-behavioral.

| # | File / line | Element | Add |
|---|-------------|---------|-----|
| 1 | [`operations.schedule._index/route.tsx:795`](../app/routes/operations.schedule._index/route.tsx) | date-picker toolbar wrapper | `data-tour="schedule-date"` |
| 2 | [`ScheduleStatusBar.tsx:27`](../app/components/schedule/ScheduleStatusBar.tsx) | status bar root (has `data-testid`) | `data-tour="schedule-status"` |
| 3 | `route.tsx:152` unassign pool | already `id="unassign-pool"` | reuse `#unassign-pool` (do **not** rename) |
| 4 | [`ScheduleBoard.tsx:36`](../app/components/schedule/ScheduleBoard.tsx) | board root (has `data-testid`) | `data-tour="schedule-board"` |
| 5 | `DraftFlightPlaceholder.tsx:20` | placeholder (rendered twice) | `data-tour="new-flight"` **on the empty-state instance only**, or de-dupe (see §8) |
| 6 | [`AutoBuildPanel.tsx:180`](../app/components/schedule/AutoBuildPanel.tsx) | auto-build panel root | `data-tour="schedule-autobuild"` |
| 7 | `route.tsx:833` | schedule action buttons wrapper | `data-tour="schedule-actions"` |
| 8 | [`checkin.counter.tsx:462`](../app/routes/checkin.counter.tsx) | POS column card | `data-tour="checkin-pos"` |
| 9 | `checkin.counter.tsx:546` | Complete Sale submit | `data-tour="checkin-complete"` |
| 10 | `checkin.counter.tsx:402` | manifest card | `data-tour="checkin-manifest"` |
| 11 | `checkin.counter.tsx:245` | flight list (select mode) | `data-tour="checkin-flight-list"` |
| 12 | [`PilotBriefing.tsx`](../app/components/PilotBriefing.tsx) `BriefingSection` | add optional `id`/`data-tour` prop → per-section anchors | `data-tour` passthrough |
| 13 | `pilot.briefing.$flightId.tsx` accept button | Accept Briefing submit | `data-tour="accept-briefing"` |
| 14 | Dashboard KPI grids (ops/finance/pilot/engineer/admin) | KPI row wrapper | `data-tour="<page>-kpis"` |
| 15 | [`admin.users.tsx:176`](../app/routes/admin.users.tsx) | create-user card | `data-tour="create-user"` (field ids already exist) |

Reused as-is (no change): `#unassign-pool`, `#draft-flight-placeholder`, `#pilot-briefing`, `#booking-results`, `#status-filter` (finance), `#reference`/`#q` (lookup), `#counter-body-weight`/`#counter-baggage-weight`, `#create-*` (admin users).

### 6.2 Operations Schedule — `pageKey: "operations-schedule"` (7 steps, autoStart)

**File:** `app/utils/tour/definitions/operations-schedule.ts`

| Step | Target | Copy (title → description) |
|------|--------|----------------------------|
| 1 | `[data-tour="schedule-date"]` | **Select a Date** → Choose any day to build or review its flight schedule. |
| 2 | `[data-tour="schedule-status"]` | **Schedule Status** → Tracks the lifecycle: Draft → Approved → Published → Active → Completed. |
| 3 | `[data-tour="schedule-autobuild"]` | **Auto-Build** → Generate an optimized schedule automatically, then fine-tune by hand. |
| 4 | `#unassign-pool` | **Unassigned Bookings** → Confirmed bookings land here. Drag them onto a flight to assign. |
| 5 | `[data-tour="schedule-board"]` | **Flight Board** → Each card is a flight. Drag bookings on, reorder flights, or move passengers between them. |
| 6 | `[data-tour="new-flight"]` | **Create a Flight** → Drop a booking here and the system routes a brand-new flight for you. |
| 7 | `[data-tour="schedule-actions"]` | **Schedule Actions** → Approve, publish, revise, or cancel. Buttons appear based on your permissions and the schedule's state. |

Config: `showProgress: true`, `autoStart: true`. Steps 4–6 set `disableActiveInteraction: true` (drag-sensitive). Because status/board/new-flight are conditionally rendered, each has `skipIfMissing: true` (default) so an empty-schedule day still yields a coherent shorter tour. Wire with `ready={!isLoading}` from the route's loading state ([`route.tsx:219`](../app/routes/operations.schedule._index/route.tsx)).

### 6.3 Check-in Counter — `pageKey: "checkin-counter"` (two-mode, 6 steps)

The route renders **FlightSelect** (no `flightId`) or **CheckinWorkflow** (with `flightId`) ([`checkin.counter.tsx:562`](../app/routes/checkin.counter.tsx)). Use **two definitions** selected at runtime by which mode is active (detect via presence of `[data-tour="checkin-flight-list"]` vs `[data-tour="checkin-manifest"]`), or a single definition where mode-specific steps carry `skipIfMissing`.

**Select mode (3 steps):** date picker → `[data-tour="checkin-flight-list"]` (pick a flight) → row hint.

**Workflow mode (6 steps):**
| Step | Target | Copy |
|------|--------|------|
| 1 | `[data-tour="checkin-manifest"]` | **Passenger Manifest** → Every passenger booked on this flight. Select one to begin check-in. |
| 2 | `#counter-body-weight` | **Verify Weight** → Enter measured passenger + baggage weight (required for STY departures). |
| 3 | `#counter-baggage-weight` | **Baggage** → Excess baggage is flagged automatically for charging. |
| 4 | `[data-tour="checkin-pos"]` | **Take Payment** → Collect any balance by card, cash, invoice, or pay-on-arrival. |
| 5 | `[data-tour="checkin-complete"]` | **Complete Check-in** → Confirms the passenger and prints boarding/bag tags. |
| 6 | (centered) | **Done** → Repeat for each passenger, then close out the flight. |

Weight steps (2–3) only exist for `origin === "STY"` and un-checked-in passengers ([`checkin.counter.tsx:439`](../app/routes/checkin.counter.tsx)); POS only when `posActive`. All carry `skipIfMissing: true`. Autostart **off** (task-focused screen); expose via the header trigger only.

### 6.4 Pilot Briefing — `pageKey: "pilot-briefing"` (6 steps)

Add a `data-tour` passthrough to `BriefingSection` so each section anchors. Sequence: `#pilot-briefing` (overview) → Route → Crew/Aircraft → Passenger manifest → Weight & Balance → Fuel → `[data-tour="accept-briefing"]` (**Accept Briefing** → Confirms you've reviewed the sortie; unlocks departure). Cap at 6 by merging Crew+Aircraft. Autostart off.

### 6.5 Operations Booking Detail — `pageKey: "operations-booking-detail"` (7 steps)

Summary card → status/payment badges → passengers panel → cost summary → **Payment Options** button (`onBeforeHighlight` clicks the toggle at [`booking detail:689`](../app/routes/operations.bookings.$bookingId.tsx) so the `PaymentMethodSelector` mounts before its step) → payment selector → action bar (Cancel/Back). Demonstrates the `onBeforeHighlight` pattern for elements behind a disclosure.

### 6.6 Remaining pages (4–6 steps each)

| pageKey | Anchors (real) | Autostart |
|---------|----------------|-----------|
| `operations-dashboard` | header cluster → `[data-tour="ops-kpis"]` → recent bookings table → today's flights → NotificationBell → "Schedule Builder" link | Yes |
| `operations-bookings` | header/New Booking → `input[name="q"]` search → `#booking-status-tabs` (add) → `#booking-results` → row action `[aria-label^="View booking"]` | Yes |
| `checkin-lookup` | `#reference` → `#q` → results grid → "Check In" action | No |
| `finance-dashboard` | `[data-tour="finance-kpis"]` → alerts strip → revenue sparkline → receivables aging → recent payments | Yes |
| `finance-invoices` | PageHeader/Export → `#status-filter` → invoices grid → pagination | No |
| `finance-payments` | PageHeader/Export → `#status-filter` → payments grid | No |
| `pilot-dashboard` | header → `[data-tour="pilot-kpis"]` → `[data-tour="pilot-sorties"]` (Briefing link) → upcoming schedule | Yes |
| `engineer-dashboard` | header/View Fleet → `[data-tour="engineer-kpis"]` → `[data-tour="engineer-fleet"]` → recent airframe hours | Yes |
| `admin-dashboard` | KPIs → system health → `[data-tour="admin-management"]` quick actions | Yes |
| `admin-users` | header/search → `[data-tour="create-user"]` (fields `#create-*`) → `[data-tour="users-table"]` → row role select | No |
| `bookings` (passenger) | header/New Booking → search → date filter → status tabs → results | Yes |

> **Passenger bookings caveat:** confirm whether [`bookings.tsx`](../app/routes/bookings.tsx) (dashboard, `PageLayout`, no `<Outlet/>`) or [`bookings._index.tsx`](../app/routes/bookings._index.tsx) (list) is the live view before instrumenting; anchors differ.

---

## 7. Managing User Progress

**Phase 1 (ship): `localStorage`, version-aware** (§3, §Step 3). Per-user on a shared kiosk is a limitation (check-in counters are shared machines) — acceptable for v1 since tours are lightweight and dismissible.

**Phase 2 (server-backed, recommended for shared terminals):** implement a `TourStore` that syncs to the authenticated user.

- **Schema:** a single `tour_progress JSONB` column on `users`, or a `user_tour_progress(user_id, page_key, version, completed_at)` table (follows the repo's migration conventions in [`migrations/consolidated/`](../migrations/consolidated/)).
- **Read:** the root/layout loader returns `tourProgress` for the session user; hydrate `tourStore` from it on mount so completion is correct on any device.
- **Write:** `markTourCompleted` also POSTs to a resource route (e.g. `app/routes/api.tour-progress.ts`) using `fetch`/`useFetcher`; `localStorage` remains the offline-first cache.
- **No call-site changes:** only `storage.client.ts`'s `tourStore` export is swapped — every component keeps calling `isTourCompleted` / `markTourCompleted`.

**Versioning policy:** each definition owns a `version: number`. Materially changing steps → bump version → returning users are re-offered exactly once. Trivial copy edits do not bump.

**Analytics hook (optional):** `onDestroyed` and a per-step `onHighlightStarted` can emit events (step reached, tour completed vs abandoned) to the existing notification/audit plumbing if desired.

---

## 8. Edge Cases & Mitigations

| Edge case | Where it bites | Mitigation |
|-----------|----------------|------------|
| **Target not yet mounted** (loading skeletons) | schedule (`ScheduleSkeleton`, 150ms), dashboards (nav-state skeletons), any loader-driven page | Gate autostart on `ready` (`!isLoading`); `waitForElement` before driving; never rely on a fixed delay. |
| **Conditionally-rendered targets** | status bar/board (only when schedule + flights exist), POS (`posActive`), weight inputs (STY only), payment selector (behind toggle) | `skipIfMissing: true` filters absent steps; `onBeforeHighlight` opens disclosures (payment panel) before their step. |
| **Two-mode screens** | check-in counter (Select vs Workflow) | Detect mode by anchor presence and load the matching definition; mode-specific steps use `skipIfMissing`. |
| **Duplicate id** | `#draft-flight-placeholder` rendered twice ([`route.tsx:938`](../app/routes/operations.schedule._index/route.tsx) & `:992`) | Put `data-tour="new-flight"` on **one** instance, or refactor so only one renders at a time; never target the shared `id` for the tour. |
| **dnd-kit id collision** | `unassign-pool`, `draft-flight-placeholder` ids are droppable ids | Reuse for read-only spotlight; **never rename**; drag-sensitive steps set `disableActiveInteraction: true`. |
| **Navigation mid-tour** | Remix client nav / back button | `useTour` destroys the driver on unmount; `offeredRef` prevents re-trigger on loader revalidation. |
| **Permission-gated elements** | schedule actions, "New Booking", admin controls | Targets simply absent → `skipIfMissing` yields a correct shorter tour per role. |
| **Hydration mismatch** | reading `localStorage` during render | `TourTrigger` renders stable markup; visibility/label refined in `useEffect`. |
| **SSR crash** | `window`/`localStorage` undefined | driver.js confined to `.client.ts` (dynamic `import()`); all storage access guarded. |
| **Private mode / quota** | `localStorage.setItem` throws | `try/catch`; tour simply re-offers next session. |
| **Shared kiosk** (check-in) | one browser, many staff | Phase-2 server-backed store keyed to the logged-in user. |
| **Mobile / tablet** | popover side/overflow | `smoothScroll: true`; prefer `side:"bottom"`/`align:"start"`; test at check-in tablet widths (recommendation Next-Steps #5). |
| **Reduced motion** | `prefers-reduced-motion` users | Consider disabling `smoothScroll` when the media query matches. |
| **Esc / overlay close** | counts as completion? | `onDestroyed` marks completed for the current version — user won't be nagged, but can Replay from the header. |

---

## 9. Accessibility

- driver.js manages focus into the popover and supports keyboard nav (Tab/Esc/arrows); verify focus returns to the trigger on close.
- Ensure popover text meets WCAG AA contrast in **both** themes (the dark-mode overrides in §5 exist for this).
- `TourTrigger` has descriptive `aria-label`; icons are `aria-hidden`.
- Respect `prefers-reduced-motion` (see §8).
- Keep step descriptions plain-language (mixed technical proficiency across FIGAS personas).

---

## 10. Testing Strategy

Leverages the repo's existing Vitest + Playwright setup (`tests/`, see [`docs/SETUP.md`](SETUP.md#6-testing)).

**Unit (Vitest):**
- `storage.client.ts`: completion set/get, version comparison, quota-throw resilience, SSR (`window` undefined) safety.
- `tour-manager` step filtering (`skipIfMissing`, missing elements) with a jsdom DOM.

**E2E (Playwright)** — mirror existing specs under `tests/e2e/`:
- Autostart fires for a first-time user on `operations-schedule`; does **not** re-fire after completion (assert `localStorage` key).
- Full step-through: Next/Back/Done navigate; Esc closes and records completion.
- Conditional pages: empty-schedule day yields the shortened tour without errors.
- "Reset onboarding tours" in ProfilePopup clears state and re-enables autostart.
- Tablet viewport smoke for check-in counter.

---

## 11. Rollout Plan

Following the recommendation's "3–5 pages first" guidance:

| Phase | Deliverable |
|-------|-------------|
| **0** | Install driver.js; build `types.ts`, `storage.client.ts`, `tour-manager.client.ts`, `useTour`, `TourTrigger`, theme CSS; add ProfilePopup reset. |
| **1** | Add anchors + definitions for the 3 highest-value pages: **Operations Schedule, Check-in Counter, Pilot Briefing**. Wire triggers + autostart. Test desktop + tablet. |
| **2** | Operations Dashboard/Bookings/Booking Detail; Finance Dashboard/Invoices/Payments. |
| **3** | Pilot/Engineer/Admin dashboards, Admin Users, Passenger Bookings. |
| **4** | (Optional) Phase-2 server-backed progress for shared terminals; analytics events. |

**Estimated effort:** Phase 0 ≈ 3–4h (infra + hydration/SSR hardening beyond the recommendation's sketch); Phases 1–3 ≈ 6–9h; server persistence ≈ +3–4h. Total ≈ **12–16h** including the anchor audit and tests.

### File inventory

**New:** `app/utils/tour/{types.ts, storage.client.ts, tour-manager.client.ts, registry.ts}`, `app/utils/tour/definitions/*.ts` (≈15), `app/hooks/useTour.ts`, `app/components/TourTrigger.tsx`, `app/styles/driver-theme.css`, `tests/unit/tour/*`, `tests/e2e/onboarding.spec.ts`.

**Modified (attribute/trigger additions only):** schedule route + `ScheduleBoard`/`ScheduleStatusBar`/`AutoBuildPanel`/`DraftFlightPlaceholder`; `checkin.counter.tsx`; `PilotBriefing.tsx` + briefing route; the 15 page headers (via `PageLayout`/`PageHeader`/inline); `ProfilePopup.tsx`; `root.tsx` (`links()` for theme CSS); `package.json` (dependency).

---

## 12. Open Questions

1. **Shared kiosks:** do check-in/ops terminals warrant Phase-2 server progress from day one? (Recommend yes for check-in.)
2. **Passenger bookings:** which route is live — `bookings.tsx` or `bookings._index.tsx`? (§6.6 caveat.)
3. **Autostart scope:** offer autostart only to operational roles, or all personas? (PBAC role from the session loader could gate it.)
4. **Draft placeholder de-dupe:** fix the double render, or tag a single instance? (Prefer de-dupe.)
</content>
</invoke>
