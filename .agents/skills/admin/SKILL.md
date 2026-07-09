---
name: admin
description: >-
  Admin domain skill for the FIGAS administration panel. Covers PBAC role/permission
  management (65 permissions, 7 roles), user management with role assignment and SoD
  enforcement, aerodrome CRUD with distances/headings, aircraft management, fare route
  configuration, fuel rules, system settings, airframe hour tracking, and no-fly day
  management. Preserves invariants for permission checks, audit logging, segregation
  of duties, and role hierarchy.
author: FIGAS Engineering
---

# Admin Domain Skill

## Overview

This skill defines the **contract** for the FIGAS administration panel. The admin
system manages the PBAC (Permission-Based Access Control) framework, user lifecycle,
infrastructure configuration (aerodromes, aircraft, fare routes, fuel rules), system
settings, and operational constraints (no-fly days, airframe hours).

The admin domain spans 11 route files under `/admin/*` and is guarded by the `admin:access`
permission, held only by the `admin` role.

PBAC permissions for admin operations:
- User management: `user:create`, `user:view`, `user:edit`, `user:delete`, `user:assign-role`, `user:reset-password`
- Role management: `role:create`, `role:view`, `role:edit`, `role:delete`, `role:manage-permissions`
- System config: `settings:view`, `settings:edit`
- Audit: `audit:view`, `audit:export`
- No-fly: `no-fly:manage`
- Organizations: `organization:view`, `organization:create`, `organization:edit`

---

## Architecture

```
Admin Panel (/admin/*)
│
├── Dashboard (/admin/_index)
│   ├── DashboardStats: totalUsers, bookingsThisMonth, flightsThisMonth,
│   │   activeAircraft, revenueThisMonth
│   └── Quick links to all admin sections
│
├── User Management (/admin/users)
│   ├── User CRUD (create, view, edit, deactivate)
│   ├── Role assignment with SoD validation
│   ├── Password reset
│   └── Audit log for all user/role changes
│
├── Aerodrome Management (/admin/aerodromes, /admin/aerodrome-headings, /admin/aerodrome-distances)
│   ├── ICAO code + name + active flag CRUD
│   ├── Distance (nm) between aerodrome pairs
│   └── Heading (degrees) between aerodrome pairs
│
├── Aircraft Management (/admin/aircraft)
│   ├── Registration, type, seat_count, is_active
│   ├── MTOW, MLW, empty weight
│   └── Aircraft assignment to flights
│
├── Fare Routes (/admin/fares)
│   ├── origin_code → destination_code → base_fare_gbp
│   ├── is_active flag for route enablement
│   └── Bulk fare import via fare-import.server.ts
│
├── Fuel Rules (/admin/fuel-rules)
│   ├── flight_time_minutes → sectors → required_fuel_kg → minimum_fuel_kg
│   └── Fuel state classification
│
├── Airframe Hours (/admin/airframe-hours)
│   ├── Per-aircraft hour tracking
│   └── Maintenance interval alerts
│
├── System Settings (/admin/settings)
│   ├── key-value settings store
│   └── Default fare, payment terms, reminder config
│
└── No-Fly Days (via no-fly.service.ts, managed through settings)
    ├── Recurring rules (day_of_week, season_start/end)
    ├── One-off rules (specific_date)
    └── Priority-based override
```

---

## Key Files

| File | Role |
|------|------|
| `app/routes/admin._index.tsx` | Admin dashboard with KPI cards and section links |
| `app/routes/admin.users.tsx` | User list with search, role display, activation toggle |
| `app/routes/admin.aircraft.tsx` | Aircraft CRUD: registration, type, seat count, MTOW, status |
| `app/routes/admin.aerodromes.tsx` | Aerodrome CRUD: ICAO code, name, active status |
| `app/routes/admin.aerodrome-distances.tsx` | Distance matrix between aerodrome pairs |
| `app/routes/admin.aerodrome-headings.tsx` | Heading (bearing) matrix between aerodrome pairs |
| `app/routes/admin.fares.tsx` | Fare route CRUD: origin→destination→base_fare_gbp |
| `app/routes/admin.fuel-rules.tsx` | Fuel requirement rules by flight time and sectors |
| `app/routes/admin.airframe-hours.tsx` | Aircraft airframe hour tracking and maintenance intervals |
| `app/routes/admin.settings.tsx` | System settings key-value editor |
| `app/routes/admin.tsx` | Admin layout wrapper with sidebar navigation |
| `app/utils/permissions.server.ts` | Core PBAC engine: hasPermission, requirePermission, assignRole, revokeRole, SoD validation, audit log |
| `app/utils/repositories/admin.ts` | Admin repository: dashboard stats, user/aerodrome/aircraft/fare/fuel CRUD |
| `prisma/seed-pbac.ts` | Idempotent PBAC seed: 65 permissions, 7 roles, role-permission assignments |
| `app/utils/services/no-fly.service.ts` | No-fly day rule management: create, check, override |

---

## PBAC Permission System

### Permission Format

All permissions follow `resource:action` format:
```
booking:create      flight:view       schedule:approve
finance:reconcile   user:assign-role  role:manage-permissions
```

### Permission Catalog (65 permissions in seed-pbac.ts)

| Resource | Count | Actions |
|----------|-------|---------|
| booking | 10 | create, view, edit, cancel, checkin, approve, assign-flight, manage-passengers, manage-freight, manage-payment |
| flight | 7 | create, view, edit, cancel, manage-manifest, assign-pilot, manage-seats |
| schedule | 6 | create, view, edit, approve, publish, assign-pilot |
| user | 6 | create, view, edit, delete, assign-role, reset-password |
| role | 5 | create, view, edit, delete, manage-permissions |
| finance | 7 | view, create-invoice, record-payment, reconcile, manage-exports, manage-reminders, manage-credit |
| settings | 2 | view, edit |
| report | 2 | view, export |
| audit | 2 | view, export |
| checkin | 3 | view, process, manage-reminders |
| maintenance | 8 | view, edit, manage-airframe, log-flight, create-task, sign-off, defer-defect, manage-components |
| organization | 3 | view, create, edit |
| admin | 1 | access |
| no-fly | 1 | manage |
| loadsheet | 2 | view, edit |

### 7 System Roles

| Role | Hierarchy Level | Key Permissions Count | Description |
|------|----------------|----------------------|-------------|
| admin | 100 | 65 (all) | Full system access |
| operations | 80 | ~28 | Flight ops and scheduling management |
| finance | 70 | ~13 | Invoices, payments, reconciliation, exports |
| checkin | 60 | ~5 | Check-in counter operations |
| pilot | 50 | ~5 | Flight manifests and schedules |
| engineer | 40 | ~8 | Maintenance and airframe tracking |
| passenger | 10 | ~3 | Self-service booking and itinerary |

### Role Hierarchy

Hierarchy levels are for **display and ordering only**, NOT for permission inheritance.
Every permission is explicitly assigned via `role_permissions` table. No role "inherits"
permissions from lower-level roles.

### Permission Check Flow

```typescript
// Route loader/action guard — throws redirect if unauthorized
await requirePermission(request, "admin:access");

// UI conditional rendering — returns boolean, must be called from loader
const canEdit = await hasPermission(userId, "settings:edit");

// Require any of multiple permissions
await requireAnyPermission(request, ["finance:view", "report:view"]);

// Require all of multiple permissions
await requireAllPermissions(request, ["booking:view", "booking:edit"]);
```

### Permission Cache

Permissions are cached per-user with a 60-second TTL (`CACHE_TTL_MS = 60_000`).
`clearPermissionCache(userId)` invalidates the cache (called after role/permission changes).

---

## Data Flow

### User Management

**Repository:** `app/utils/repositories/admin.ts`

```typescript
interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;        // deprecated — use user_roles junction instead
  is_active: boolean;
  created_at: string;
}
```

- Create: `adminRepository.createUser()` → hashes password via `hashPassword()` from `password.server.ts`
- Role assign: `assignRole(actorId, userId, roleId)` → validates actor permission, checks SoD, inserts `user_roles`, records audit log, clears cache
- Role revoke: `revokeRole(actorId, userId, roleId)` → validates actor permission, deletes from `user_roles`, records audit log, clears cache
- Deactivate: `adminRepository.deactivateUser()` — sets `is_active = false`

### Segregation of Duties (SoD)

**File:** `app/utils/permissions.server.ts:532-536`

Three incompatible permission pairs:

| Permission A | Permission B | Rationale |
|-------------|-------------|-----------|
| `finance:record-payment` | `finance:reconcile` | Same person cannot record payments AND reconcile bank statements |
| `finance:create-invoice` | `finance:record-payment` | Same person cannot create invoices AND record payments against them |
| `user:create` | `user:assign-role` | Same person cannot create users AND assign them roles |

`validateSoDForRole()` checks all three pairs when assigning a role. Throws before the assignment if a conflict would be created.

### Aerodrome Management

Three interconnected resources:

1. **Aerodromes** (`admin.aerodromes.tsx`) — Basic CRUD with `code` (ICAO), `name`, `is_active`
2. **Distances** (`admin.aerodrome-distances.tsx`) — `origin_code → destination_code → distance_nm`
3. **Headings** (`admin.aerodrome-headings.tsx`) — `origin_code → destination_code → heading_degrees`

Deactivating an aerodrome (`is_active = false`) prevents it from appearing in flight route selectors but preserves historical data.

### Aircraft Management

**Route:** `app/routes/admin.aircraft.tsx`

```typescript
interface AdminAircraftRow {
  id: number;
  registration: string;    // e.g., "VP-FIG"
  type: string;           // e.g., "BN-2B Islander"
  seat_count: number;     // e.g., 9
  is_active: boolean;
}
```

Additional fields managed through the aircraft detail view: MTOW (kg), MLW (kg), basic empty weight (kg).

### Fare Routes

**Route:** `app/routes/admin.fares.tsx`

```typescript
interface FareRouteRow {
  id: number;
  origin_code: string;
  destination_code: string;
  base_fare_gbp: number;
  is_active: boolean;
}
```

Bulk import supported via `app/utils/pricing/fare-import.server.ts`. The `fare_matrix` table is the source of truth queried by `lookupFare()` in `pricing-engine.server.ts`.

### Fuel Rules

**Route:** `app/routes/admin.fuel-rules.tsx`

```typescript
interface FuelRuleRow {
  id: number;
  flight_time_minutes: number;
  sectors: number;
  required_fuel_kg: string;
  minimum_fuel_kg: string;
  fuel_state: string;
}
```

Used by the scheduling pipeline to calculate fuel requirements per flight based on estimated flight time and number of sectors.

### System Settings

**Route:** `app/routes/admin.settings.tsx`

Key-value store (`key → value`) for global configuration:
- `DEFAULT_FARE_PER_PASSENGER` — fallback when no fare route exists
- `FREIGHT_RATE_PER_KG` — freight charge per kg
- `DEFAULT_PAYMENT_TERM_DAYS` — invoice due date offset
- Various reminder and notification configurations

### No-Fly Day Management

**Service:** `app/utils/services/no-fly.service.ts`

```typescript
interface NoFlyRuleRow {
  id: number;
  label: string;
  description: string | null;
  rule_type: "recurring" | "one_off";
  is_active: boolean;
  day_of_week: number[];        // 0=Sunday, 6=Saturday
  season_start: string | null;  // MM-DD
  season_end: string | null;    // MM-DD
  specific_date: string | null; // YYYY-MM-DD
  priority: number;
  override_reason: string | null;
}
```

Referenced by `isNoFlyDay(date)` in `schedule-handlers.server.ts` to block auto-build and booking assignment on no-fly days.

### Audit Log

All admin actions are tracked via `createAuditLogEntry()`:

```typescript
{
  actorId, action, entityType, entityId,
  oldValues, newValues, ipAddress, userAgent
}
```

Common actions: `role.assigned`, `role.revoked`, `permission.granted`, `permission.revoked`, `user.created`, `user.deactivated`, `settings.updated`.

`queryAuditLog()` supports filtering by `actorId`, `action`, `entityType`, `entityId`, date range, with pagination.

---

## Validation Rules

### Invariant 1: Self-Approval Prevention
`validateApproval(initiatorId, approverId)` throws if `initiatorId === approverId`. No user may approve their own actions.

### Invariant 2: SoD Enforcement
`validateSoDForRole()` runs before every role assignment. The three incompatible pairs must never coexist on a single user. This check is in the `assignRole()` function itself — it cannot be bypassed.

### Invariant 3: Role Deletion Validation
`validateRoleDeletion(roleId)` throws if any users are assigned to the role. Roles must be empty before deletion.

### Invariant 4: Permission Format
All permissions must match `resource:action` format. `hasPermission()` splits on `:` and throws `Invalid permission format` if the format is invalid.

### Invariant 5: Audit Trail Immutability
Audit log entries are append-only. Never delete or modify audit records. The `audit:view` and `audit:export` permissions are read-only.

### Invariant 6: Aerodrome Code Uniqueness
ICAO codes in aerodromes must be unique across active records. Deactivated aerodromes can share codes with historical data.

### Invariant 7: System Role Protection
The 7 system roles (`is_system = true`) cannot be deleted. Custom roles created via `role:create` can be deleted if empty.

### Invariant 8: Cache Invalidation
After any role or permission mutation, `clearPermissionCache(userId)` must be called. Failure to invalidate causes stale permission checks for up to 60 seconds.

---

## Integration Points

### Admin → Operations
Aerodromes, aircraft, and fare routes configured in admin are consumed by the operations scheduling pipeline. Changing an aerodrome code requires updating all booking legs and flight legs referencing that code (handled via cascade or soft reference).

### Admin → Check-in
`MAX_FREE_BAGGAGE_KG` and `EXCESS_RATE_PER_KG` constants affect counter payment collection. These are currently hardcoded in `checkin.counter.tsx` — potential system settings migration target.

### Admin → Finance
`DEFAULT_PAYMENT_TERM_DAYS` and `DEFAULT_FARE_PER_PASSENGER` settings affect invoice generation and fare calculation. Tax rate configuration affects `finance.reports.tax`.

### Admin → Scheduling
No-fly day rules block schedule auto-build and booking-to-flight assignment. Fuel rules affect flight fuel calculations. Airframe hours affect maintenance scheduling and aircraft availability.

### PBAC Seeding
`prisma/seed-pbac.ts` is idempotent — safe to re-run. Uses upsert within a transaction. The admin role gets all permissions explicitly (no wildcards). Any new permission added to `PERMISSIONS` array is automatically assigned to admin.

---

## Do's and Don'ts

### Do

- ✅ Do use `requirePermission()` in admin route loaders/actions (never rely on role slugs alone)
- ✅ Do run `validateSoDForRole()` before every role assignment via `assignRole()`
- ✅ Do run `validateRoleDeletion()` before deleting any role
- ✅ Do clear the permission cache after any role/permission mutation (`clearPermissionCache(userId)`)
- ✅ Do record audit log entries for all admin mutations via `createAuditLogEntry()`
- ✅ Do use the idempotent `seed-pbac.ts` for seeding — it uses upsert within a transaction
- ✅ Do assign permissions explicitly — roles are containers, not inheritance chains
- ✅ Do use the `adminRepository` for dashboard stats (not raw queries in route files)
- ✅ Do validate aerodrome codes against the ICAO standard (4-character alphanumeric)
- ✅ Do deactivate rather than delete aerodromes/aircraft — preserves referential integrity
- ✅ Do generate waybill numbers in `FW-YYYYMMDD-NNNNN` format consistent with check-in freight
- ✅ Do use `is_active` flags for soft-delete on aerodromes, aircraft, fare routes

### Don't

- ❌ Don't check roles directly in loaders — use `hasPermission()` or `requirePermission()` with specific permission keys
- ❌ Don't rely on hierarchy levels for permission inheritance — permissions are explicit only
- ❌ Don't skip SoD validation when assigning roles — the three incompatible pairs must be enforced
- ❌ Don't delete users with bookings — deactivate (`is_active = false`) instead
- ❌ Don't delete aerodromes referenced by active legs/flights — deactivate instead
- ❌ Don't modify audit log entries — they are append-only
- ❌ Don't create users with the `user:assign-role` permission directly — go through `assignRole()`
- ❌ Don't use `user.role` column — it's deprecated; use `user_roles` junction table
- ❌ Don't change the PBAC seed's `is_system = true` flag on the 7 built-in roles
- ❌ Don't skip permission cache invalidation after mutations
- ❌ Don't add permissions to the catalog without updating the admin role's explicit assignment list
- ❌ Don't remove the bidirectional fare lookup fallback in `lookupFare()` — some routes exist in one direction only
