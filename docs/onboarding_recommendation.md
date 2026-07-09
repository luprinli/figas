## Library Recommendation: Driver.js

Based on the comparison and your project context, **Driver.js** is the strongest candidate:

| Criteria | Driver.js | Intro.js | Shepherd.js |
|----------|-----------|----------|-------------|
| **License** | MIT (SaaS-friendly) | AGPL (requires commercial license for closed-source) | AGPL (commercial license required) |
| **Framework** | Vanilla JS — works anywhere | Vanilla JS | Framework-agnostic |
| **Learning Curve** | Low — fast to ship | Low | Higher — more setup required |
| **Customization** | Strong defaults, moderate theming | Standard UI, easy to start | Highly customizable, more "bring your own UI" |
| **SPA Readiness** | Requires guards for async elements | Requires guards | Better with framework wrappers |

**Why Driver.js wins for FIGAS:**

1. **MIT License** — No commercial license fees, no legal overhead for a government operation
2. **Lightweight** — ~5KB, minimal performance impact
3. **Framework-agnostic** — Works with Remix's server-rendered pages without fighting the framework
4. **Spotlight UX** — The highlight + overlay approach is ideal for feature discovery and guided workflows
5. **Simple API** — Quick to implement across 15+ pages

---

## Implementation Plan

### Step 1: Install Driver.js

```bash
npm install driver.js
```

### Step 2: Create Shared Tour Infrastructure

**File:** `app/utils/tour/tour-manager.client.ts`

```typescript
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export type TourStep = {
  element?: string | Element;
  popover?: {
    title?: string;
    description: string;
    side?: 'top' | 'right' | 'bottom' | 'left';
    align?: 'start' | 'center' | 'end';
  };
};

export type TourConfig = {
  steps: TourStep[];
  showProgress?: boolean;
  showButtons?: string[];
  onDestroyed?: () => void;
  onNextClick?: () => void;
  onPrevClick?: () => void;
};

export function createTour(config: TourConfig) {
  const driverObj = driver({
    showProgress: config.showProgress ?? true,
    showButtons: config.showButtons ?? ['next', 'prev', 'close'],
    steps: config.steps,
    onDestroyed: config.onDestroyed,
    onNextClick: config.onNextClick,
    onPrevClick: config.onPrevClick,
  });
  return driverObj;
}

// Tour completion tracking
const TOUR_COMPLETED_KEY = 'figas_tours_completed';

export function markTourCompleted(pageKey: string): void {
  const completed = getCompletedTours();
  completed.add(pageKey);
  localStorage.setItem(TOUR_COMPLETED_KEY, JSON.stringify([...completed]));
}

export function getCompletedTours(): Set<string> {
  try {
    const data = localStorage.getItem(TOUR_COMPLETED_KEY);
    return new Set(data ? JSON.parse(data) : []);
  } catch {
    return new Set();
  }
}

export function isTourCompleted(pageKey: string): boolean {
  return getCompletedTours().has(pageKey);
}

export function resetAllTours(): void {
  localStorage.removeItem(TOUR_COMPLETED_KEY);
}
```

### Step 3: Create Tour Definitions

**Directory:** `app/utils/tour/definitions/`

Each file exports a `TourConfig` for a specific page.

**Example:** `app/utils/tour/definitions/operations-schedule.ts`

```typescript
import type { TourConfig } from '../tour-manager.client';

export const operationsScheduleTour: TourConfig = {
  showProgress: true,
  steps: [
    {
      element: '#schedule-date-picker',
      popover: {
        title: 'Select a Date',
        description: 'Choose any date to build or review the flight schedule for that day.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '#schedule-status-bar',
      popover: {
        title: 'Schedule Status',
        description: 'The status bar shows the current state — Draft, Building, Approved, Published, or Completed.',
        side: 'bottom',
      },
    },
    {
      element: '#unassigned-pool',
      popover: {
        title: 'Unassigned Bookings',
        description: 'Drag bookings from this pool onto flight cards to assign them. Bookings appear here after confirmation.',
        side: 'left',
      },
    },
    {
      element: '#schedule-board',
      popover: {
        title: 'Flight Schedule Board',
        description: 'Each card represents a flight. Drag bookings onto flights, reorder flights, or drag passengers between flights.',
        side: 'top',
      },
    },
    {
      element: '#draft-flight-placeholder',
      popover: {
        title: 'Create a New Flight',
        description: 'Drag a booking here to instantly create a new flight. The system will route it optimally.',
        side: 'top',
      },
    },
    {
      element: '#schedule-actions',
      popover: {
        title: 'Schedule Actions',
        description: 'Approve, publish, revise, or cancel the schedule. Actions are permission-gated.',
        side: 'left',
      },
    },
  ],
  onDestroyed: () => {
    // Optional: track tour completion analytics
  },
};
```

**Define tours for these pages:**

| Page | File | Steps |
|------|------|-------|
| Operations Dashboard | `operations-dashboard.ts` | 5–6 |
| Operations Schedule | `operations-schedule.ts` | 6–7 |
| Operations Bookings List | `operations-bookings.ts` | 4–5 |
| Operations Booking Detail | `operations-booking-detail.ts` | 8–10 |
| Check-in Counter | `checkin-counter.ts` | 6–8 |
| Check-in Lookup | `checkin-lookup.ts` | 3–4 |
| Finance Dashboard | `finance-dashboard.ts` | 5–6 |
| Finance Invoices | `finance-invoices.ts` | 4–5 |
| Finance Payments | `finance-payments.ts` | 4–5 |
| Pilot Dashboard | `pilot-dashboard.ts` | 4–5 |
| Pilot Briefing | `pilot-briefing.ts` | 5–6 |
| Engineer Dashboard | `engineer-dashboard.ts` | 4–5 |
| Admin Dashboard | `admin-dashboard.ts` | 4–5 |
| Admin Users | `admin-users.ts` | 3–4 |
| Bookings (passenger) | `bookings.ts` | 4–5 |

### Step 4: Create Tour Trigger Component

**File:** `app/components/TourTrigger.tsx`

```typescript
import { useEffect, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { createTour, isTourCompleted, markTourCompleted, type TourConfig } from '~/utils/tour/tour-manager.client';

interface TourTriggerProps {
  pageKey: string;
  tourConfig: TourConfig;
  label?: string;
  autoStart?: boolean;
  className?: string;
}

export function TourTrigger({ 
  pageKey, 
  tourConfig, 
  label = 'Take a tour', 
  autoStart = false,
  className = '',
}: TourTriggerProps) {
  const [tourStarted, setTourStarted] = useState(false);
  const [shouldAutoStart, setShouldAutoStart] = useState(autoStart);

  useEffect(() => {
    // Auto-start only once per page load and if tour not completed
    if (shouldAutoStart && !isTourCompleted(pageKey) && !tourStarted) {
      const timer = setTimeout(() => {
        startTour();
      }, 800); // Delay to ensure DOM is ready
      return () => clearTimeout(timer);
    }
  }, [shouldAutoStart, pageKey, tourStarted]);

  const startTour = () => {
    const tour = createTour({
      ...tourConfig,
      onDestroyed: () => {
        markTourCompleted(pageKey);
        setTourStarted(false);
        if (tourConfig.onDestroyed) tourConfig.onDestroyed();
      },
    });
    tour.drive();
    setTourStarted(true);
    setShouldAutoStart(false);
  };

  // Don't show the button if tour is completed
  if (isTourCompleted(pageKey)) {
    return null;
  }

  return (
    <button
      onClick={startTour}
      className={`inline-flex items-center gap-1.5 rounded-md bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-colors ${className}`}
      aria-label={`Start ${label}`}
    >
      <HelpCircle size={14} absoluteStrokeWidth />
      {label}
    </button>
  );
}
```

### Step 5: Integrate Tour Trigger into Layouts

**File:** `app/components/SidebarLayout.tsx` (or individual page headers)

Add the tour trigger to the header area of each page:

```typescript
// In operations.schedule._index/route.tsx
import { TourTrigger } from '~/components/TourTrigger';
import { operationsScheduleTour } from '~/utils/tour/definitions/operations-schedule';

// Inside the header section:
<TourTrigger 
  pageKey="operations-schedule" 
  tourConfig={operationsScheduleTour}
  autoStart={true}  // Auto-start for first-time users
/>
```

**Placement pattern:**

```tsx
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-bold">Schedule Builder</h1>
  <div className="flex items-center gap-2">
    <TourTrigger pageKey="operations-schedule" tourConfig={operationsScheduleTour} />
    {/* Other action buttons */}
  </div>
</div>
```

### Step 6: Reset Tour Option

**File:** `app/routes/settings.tsx` (or user menu dropdown)

Add a "Reset Onboarding Tours" button:

```typescript
import { resetAllTours } from '~/utils/tour/tour-manager.client';

// In settings page:
<button
  onClick={() => {
    resetAllTours();
    window.location.reload();
  }}
  className="text-sm text-slate-600 hover:text-blue-600"
>
  Reset all onboarding tours
</button>
```

---

## Best Practices Applied

### 1. Keep Tours Short
Each tour should have **4–7 steps maximum**. Users lose patience beyond that. Focus on the 20% of features that deliver 80% of value.

### 2. Use Stable Selectors
Add `data-tour` attributes to elements rather than relying on CSS classes that may change:

```tsx
<div id="schedule-board" data-tour="schedule-board">
  {/* content */}
</div>
```

### 3. Handle Async Elements
Driver.js can fail if elements aren't mounted. Delay tour start until after data loads:

```typescript
// In page component
useEffect(() => {
  if (!isLoading && !isTourCompleted('page-key')) {
    const timer = setTimeout(() => startTour(), 500);
    return () => clearTimeout(timer);
  }
}, [isLoading]);
```

### 4. Don't Force Users
Always allow skipping. Driver.js's `close` button provides this. Auto-start only for first-time users.

### 5. Track Completion
Use `localStorage` to track which tours users have completed. Don't show completed tours again unless reset.

### 6. Accessibility
Driver.js supports keyboard navigation. Ensure:
- Focus management works
- Color contrast meets WCAG standards
- ARIA attributes are present

### 7. Design Consistency
Match the tour UI to your design system. Driver.js allows customization of popover styles via CSS.

---

## Example: Operations Schedule Tour Steps

```
Step 1: Date Picker → "Select any date to build or review the schedule"
Step 2: Status Bar → "Shows current state: Draft → Building → Approved → Published → Completed"
Step 3: Unassigned Pool → "Drag bookings onto flights to assign them"
Step 4: Flight Cards → "Each card represents a flight. Drag to reorder."
Step 5: Draft Flight Placeholder → "Drag a booking here to create a new flight"
Step 6: Actions → "Approve, publish, revise, or cancel the schedule"
```

---

## Summary of New/Modified Files

### New Files
- `app/utils/tour/tour-manager.client.ts` — Core tour management
- `app/utils/tour/definitions/*.ts` — Tour definitions for each page (15 files)
- `app/components/TourTrigger.tsx` — Reusable tour trigger component

### Modified Files
- `app/components/SidebarLayout.tsx` — Add TourTrigger to header
- `app/routes/*.tsx` — Each page gets TourTrigger integration (15 pages)
- `app/routes/settings.tsx` — Add "Reset Tours" button

---

## Next Steps

1. **Install Driver.js** (`npm install driver.js`)
2. **Create `tour-manager.client.ts`** with the core infrastructure
3. **Define tours** for the 3–5 most important pages first (Operations Schedule, Check-in Counter, Pilot Briefing)
4. **Integrate** TourTrigger into those pages
5. **Test** on desktop and tablet
6. **Iterate** based on user feedback
7. **Expand** to remaining pages

The total implementation effort is estimated at **8–12 hours** for all 15 pages, with the first 3 pages taking ~3 hours and the rest being faster once patterns are established.