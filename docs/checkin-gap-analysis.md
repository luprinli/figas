# FIGAS Check-In Module — Missing Elements Analysis

**Date:** 2026-06-05
**Audit Focus:** Gap analysis comparing checkin module against other FIGAS route modules and industry touch-screen POS standards.

---

## 1. CRITICAL GAP: No Logout Functionality

The `/checkin` layout route (`checkin.tsx:57-68`) displays the user's name and email at the bottom of the dark sidebar, but provides **zero interactive controls** — no logout button, no profile link, no session management of any kind. A check-in agent assigned to the counter has no built-in path to sign out.

**Comparison with other modules:**

| Module | Layout Component | Logout | Dark Mode | Profile Link | Notification Bell |
|--------|-----------------|--------|-----------|-------------|-------------------|
| Operations | `SidebarLayout` | ✅ via `ProfilePopup` | ✅ | ✅ | ✅ (`NotificationBell`) |
| Admin | `SidebarLayout` | ✅ via `ProfilePopup` | ✅ | ✅ | — |
| Finance | `SidebarLayout` | ✅ via `ProfilePopup` | ✅ | ✅ | — |
| Pilot | `SidebarLayout` | ✅ via `ProfilePopup` | ✅ | ✅ | — |
| Engineer | `SidebarLayout` | ✅ via `ProfilePopup` | ✅ | ✅ | — |
| **Check-In** | Custom dark sidebar | ❌ | ❌ | ❌ | ❌ |

**The logout mechanism already exists application-wide** — `_auth.logout.tsx` handles both GET and POST, destroying the session cookie and redirecting to `/login`. The checkin module simply never calls it.

**Recommended fix (P0):**
```tsx
// checkin.tsx — add at line 57 (bottom of sidebar, above user info)
<div className="border-t border-slate-700 px-3 py-3 space-y-2">
  {!collapsed ? (
    <>
      <div className="text-xs text-slate-400">
        <p className="font-medium text-slate-300">{user.name}</p>
        <p className="truncate">{user.email}</p>
      </div>
      <Form action="/logout" method="POST">
        <button type="submit"
          className="w-full rounded px-3 py-2 text-xs text-slate-400 hover:bg-slate-700 hover:text-red-400 transition-colors text-left">
          Sign Out
        </button>
      </Form>
    </>
  ) : (
    <div className="flex flex-col items-center gap-2">
      <div className="w-8 h-8 rounded-full bg-slate-600 text-xs font-bold flex items-center justify-center">
        {user.name?.charAt(0) ?? "?"}
      </div>
      <Form action="/logout" method="POST">
        <button type="submit" className="text-slate-500 hover:text-red-400 text-xs" title="Sign Out">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </Form>
    </div>
  )}
</div>
```

---

## 2. GAP: No ProfilePopup / User Menu Integration

Every other FIGAS module uses the `SidebarLayout` component which bundles `<ProfilePopup>`. The `ProfilePopup` component (`ProfilePopup.tsx`) provides:

- **User initials avatar** (circle badge, cyan ring)
- **Name and email** display
- **Dark mode toggle** (`useTheme` from `ThemeProvider`)
- **Profile link** (`/profile`)
- **Logout button** (POST to `/logout`)
- **Click-outside-to-close** behavior via `Popup` component

The checkin module uses a **custom dark sidebar** (`checkin.tsx:38-69`) instead of `SidebarLayout`. This was a deliberate design choice (dark theme for high-contrast counter environments), but it came at the cost of losing all user menu functionality.

**Recommended fix (P1):**
Integrate `ProfilePopup` into the checkin custom sidebar's user info section. The popup can remain styled consistently with the dark sidebar theme:
```tsx
// Add import at top of checkin.tsx
import ProfilePopup from "../components/ProfilePopup";

// Replace lines 57-68 (user info section) with:
<div className="border-t border-slate-700 px-3 py-3">
  {!collapsed ? (
    <div className="flex items-center gap-3">
      <ProfilePopup user={user} />
      <div className="text-xs text-slate-400 min-w-0">
        <p className="font-medium text-slate-300 truncate">{user.name}</p>
        <p className="truncate">{user.email}</p>
      </div>
    </div>
  ) : (
    <div className="flex justify-center">
      <ProfilePopup user={user} />
    </div>
  )}
</div>
```

---

## 3. GAP: Missing Operational Footer Stats

Operations layout (`operations.tsx:56-67`) has a footer section in the sidebar showing live operational metrics:

```tsx
footer={
  <>
    <div className="flex justify-between">
      <span>Today's Flights</span>
      <span className="font-bold">{todaysFlights}</span>
    </div>
    <div className="flex justify-between">
      <span>Pending Manifests</span>
      <span className="font-bold">{pendingManifests}</span>
    </div>
  </>
}
```

The checkin layout loads similar data in its loader (`checkin.tsx:15-18`):
- `pendingCount` — reminders pending
- `flights` — today's flight list

But neither is displayed in the sidebar — they're only shown in `checkin._index.tsx` KPI cards. For a counter agent who is always on `/checkin/counter`, these stats are invisible unless they navigate back to the dashboard.

**Recommended fix (P1):**
Add footer stats to checkin sidebar, visible even when the agent is on the counter route:
```tsx
{!collapsed && (
  <div className="border-t border-slate-700 px-3 py-3 space-y-2 text-xs">
    <div className="flex justify-between text-slate-400">
      <span>Today's Flights</span>
      <span className="font-bold text-slate-300">{flights.length}</span>
    </div>
    <div className="flex justify-between text-slate-400">
      <span>Pending</span>
      <span className={`font-bold ${pendingCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>{pendingCount}</span>
    </div>
  </div>
)}
```

---

## 4. GAP: Touch-Screen Optimization

The checkin module is used on counter terminals which are frequently **touch-screen devices** (Microsoft Surface, iPad, touch kiosks). Several interactive elements fail WCAG 2.1 touch target requirements (44×44px minimum).

### 4.1 Sidebar Collapse Toggle

| Element | Current Size | Required | Status |
|---------|-------------|----------|--------|
| Collapse button | `w-4 h-4` (16×16px) plus `p-1` = 24×24px | 44×44px | ❌ 45% undersized |
| Nav links | `py-2` (8px vertical) | 44px height | ❌ 81% undersized |
| Profile area | No interactive target | N/A | ❌ Passive only |

**Fix:** Increase collapse button to `min-w-[44px] min-h-[44px]`, nav links to `min-h-[44px]`, user area clickable.

### 4.2 Payment Method Buttons

`checkin.counter.tsx:461` uses `flex flex-wrap gap-1.5` with `Button variant="outlined"`. On a 768px touch screen, these 4 buttons are packed tightly:
- Each button is approximately 80px wide
- 4 buttons × 80px = 320px → they fit but have small text
- Touch target height depends on Button component (typically 36-40px)

**Fix:** Increase to `min-h-[48px]` for touch, `text-sm` (from default `text-xs`), `gap-2` for separation.

### 4.3 Navigation Items

`checkin.tsx:52` nav links use `py-2` (8px padding) — total height approximate 32px. Below WCAG touch targets.

**Fix:** `min-h-[44px] flex items-center` on each nav link.

### 4.4 Lookup and Freight Form Inputs

Form inputs in `checkin.lookup.tsx` and `checkin.freight.tsx` use standard `py-2` (8px padding) on inputs. For touch, inputs should be `min-h-[44px] py-3`.

---

## 5. RECURRING PATTERNS TO INTEGRATE

### 5.1 NotificationBell (`NotificationBell.tsx`)

Used in `operations._index.tsx:9` to display system alerts with a badge count. Check-in agents should see:
- Flight delays affecting their counter
- New bookings assigned since last refresh
- System alerts (e.g., "Scale calibration due")

**Integration:** Add `NotificationBell` to checkin layout header (`checkin.tsx:39-47`).

### 5.2 StatusBadge (`StatusBadge.tsx`)

Used consistently across bookings, operations, and finance routes. The checkin counter manually inlines status badges with raw Tailwind classes (`checkin.counter.tsx:294`). Replacing with `StatusBadge` ensures color consistency.

### 5.3 ExpandableSection (`ExpandableSection.tsx`)

Used in `bookings.tsx:11` for progressive disclosure of detailed booking info. The freight form (`checkin.freight.tsx:133-150`) has dimensions fields (length/width/height) that should be collapsed behind an "Advanced / Dimensions" toggle.

### 5.4 CountdownBar (`CountdownBar.tsx`)

Used in `bookings.tsx:10` to show time-remaining visual indicators. Could be adapted for:
- "Check-in closes in 1h 23m" countdown on counter header
- Flight departure countdown

### 5.5 Breadcrumb / Back Navigation

All other modules have navigation via the `SidebarLayout` component which provides clear hierarchy. Checkin has no breadcrumb pattern. Counter agents on `/checkin/counter?flightId=X` have no visual indication of where they are or how to return to flight selection.

**Integration:** Add a top bar to the counter route showing:
```
Check-In → {Flight #} → Checking in {Passenger Name}
```

---

## 6. FEATURE PARITY WITH OPERATIONS MODULE

| Feature | Operations | Check-In | Gap |
|---------|-----------|---------|-----|
| Sidebar navigation | ✅ | ✅ | No collapse/expand labels |
| User profile menu | ✅ `ProfilePopup` | ❌ | Missing entirely |
| Logout | ✅ POST `/logout` | ❌ | Missing entirely |
| Dark mode toggle | ✅ | ❌ | Missing entirely |
| Notification bell | ✅ `NotificationBell` | ❌ | Missing |
| Footer operational stats | ✅ | ❌ | Missing |
| Breadcrumb / page header | ✅ `PageHeader` | ❌ | No contextual nav |
| Status badges (shared) | ✅ `StatusBadge` | ❌ (inline) | Inconsistent colors |
| Expandable sections | ✅ `ExpandableSection` | ❌ | Freight form dense |
| Touch targets ≥44px | ✅ (most) | ❌ | Sidebar, nav, buttons |
| Session timeout / refresh | ✅ (implicit) | ❌ | No awareness |

---

## 7. PRIORITIZED ACTION PLAN

### P0 — Critical (Blocking for production counter use)

| # | Action | Files |
|---|--------|-------|
| P0-1 | Add logout button to checkin sidebar (expanded and collapsed states) | `checkin.tsx` |
| P0-2 | Integrate `ProfilePopup` or custom user menu with dark mode + logout | `checkin.tsx` |
| P0-3 | Increase sidebar collapse button to 44×44px touch target | `checkin.tsx:41` |
| P0-4 | Increase nav links to `min-h-[44px]` for touch | `checkin.tsx:52` |

### P1 — High Priority (UX parity with operations)

| # | Action | Files |
|---|--------|-------|
| P1-1 | Add operational footer stats to sidebar (flights today, pending) | `checkin.tsx` |
| P1-2 | Add `NotificationBell` to checkin layout header | `checkin.tsx` |
| P1-3 | Replace inline status badges with shared `StatusBadge` component | `checkin.counter.tsx`, `checkin._index.tsx` |
| P1-4 | Add breadcrumb/top bar to counter route | `checkin.counter.tsx` |
| P1-5 | Increase payment method buttons to `min-h-[48px]` for touch | `checkin.counter.tsx:461` |

### P2 — Medium Priority (Refinement)

| # | Action | Files |
|---|--------|-------|
| P2-1 | Collapse freight dimensions behind `ExpandableSection` | `checkin.freight.tsx` |
| P2-2 | Add `CountdownBar` for departure time on counter header | `checkin.counter.tsx` |
| P2-3 | Increase form input heights to `min-h-[48px]` for touch in lookup/freight | `checkin.lookup.tsx`, `checkin.freight.tsx` |
| P2-4 | Add session refresh indicator / auto-logout warning | `checkin.tsx` |

---

## 8. TOUCH-SCREEN DESIGN SPECIFICATIONS

All interactive elements in the check-in module must meet these minimums:

| Element Type | Min Height | Min Width | Spacing | Font Size |
|-------------|-----------|-----------|---------|-----------|
| Primary buttons (Complete Sale) | 48px | 160px | 12px gap | 16px |
| Sidebar nav items | 48px | 100% | 4px gap | 15px |
| Payment method buttons | 48px | 100px | 8px gap | 14px |
| Keypad buttons | 40px | 40px | 4px gap | 15px |
| Form inputs | 48px | 100% | 8px below | 16px |
| Checkbox + label | 44px | 44px (checkbox) | 12px gap | 14px |
| Sidebar toggle | 48px | 48px | — | 18px icon |
| Action icons (void, remove) | 44px | 44px | — | 14px |

---

*End of Analysis*
