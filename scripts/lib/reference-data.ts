import { Pool } from "pg";
import type {
  AerodromeRef,
  AircraftRef,
  FareRouteRef,
  NoFlyRuleRef,
  UserRef,
  OrganizationRef,
  ReferenceData,
} from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * PostgreSQL returns DATE columns as JavaScript Date objects.
 * Convert them to YYYY-MM-DD strings.
 */
function toDateStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

/**
 * PostgreSQL returns INTEGER[] arrays. They may come as a JS array already,
 * or as a string like "{0,2,4}". Normalise to a proper number[].
 */
function parseDayOfWeek(val: unknown): number[] | null {
  if (val === null || val === undefined) return null;
  // Already an array
  if (Array.isArray(val)) return (val as unknown[]).map(Number);
  // String like "{0,2,4}"
  if (typeof val === "string") {
    const trimmed = val.replace(/[{}]/g, "");
    if (trimmed.length === 0) return null;
    return trimmed.split(",").map(Number);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fetch reference data
// ---------------------------------------------------------------------------

export async function fetchReferenceData(pool: Pool): Promise<ReferenceData> {
  const [aeroRes, aircraftRes, fareRes, noFlyRes, usersRes, orgsRes] =
    await Promise.all([
      pool.query(
        `SELECT id, code, name, is_active FROM aerodromes WHERE is_active = true ORDER BY code`
      ),
      pool.query(
        `SELECT id, registration, model, seat_count, max_payload_kg, max_freight_weight FROM aircraft WHERE is_active = true`
      ),
      pool.query(
        `SELECT id, origin_code, destination_code, base_fare_gbp, base_fare FROM fare_routes WHERE is_active = true`
      ),
      pool.query(
        `SELECT id, rule_type, day_of_week, specific_date, season_start, season_end, is_active FROM no_fly_rules WHERE is_active = true`
      ),
      pool.query(
        `SELECT id, name, email, role FROM users WHERE is_active = true ORDER BY id`
      ),
      pool.query(
        `SELECT id, name, credit_limit_gbp FROM organizations WHERE is_active = true`
      ),
    ]);

  const aerodromes: AerodromeRef[] = aeroRes.rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    is_active: r.is_active,
  }));

  const aircraft: AircraftRef[] = aircraftRes.rows.map((r) => ({
    id: r.id,
    registration: r.registration,
    model: r.model ?? "",
    seat_capacity: r.seat_count ?? 0,
    max_baggage_kg: Number(r.max_payload_kg ?? r.max_freight_weight ?? 0),
  }));

  const fareRoutes: FareRouteRef[] = fareRes.rows.map((r) => ({
    id: r.id,
    origin_code: r.origin_code,
    destination_code: r.destination_code,
    base_fare: Number(r.base_fare_gbp ?? r.base_fare ?? 0),
    passenger_fare: 0,
    freight_rate: 0,
  }));

  const noFlyRules: NoFlyRuleRef[] = noFlyRes.rows.map((r) => ({
    id: r.id,
    rule_type: r.rule_type as "recurring" | "one_off",
    day_of_week: parseDayOfWeek(r.day_of_week),
    specific_date: toDateStr(r.specific_date),
    season_start: toDateStr(r.season_start),
    season_end: toDateStr(r.season_end),
    is_active: r.is_active,
  }));

  const users: UserRef[] = usersRes.rows.map((r) => ({
    id: r.id,
    name: r.name ?? r.email,
    email: r.email,
    role: r.role,
  }));

  const organizations: OrganizationRef[] = orgsRes.rows.map((r) => ({
    id: r.id,
    name: r.name,
    credit_limit: Number(r.credit_limit_gbp ?? 0),
  }));

  return { aerodromes, aircraft, fareRoutes, noFlyRules, users, organizations };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateReferenceData(data: ReferenceData): void {
  const checks: { name: string; count: number; min: number }[] = [
    { name: "aerodromes", count: data.aerodromes.length, min: 2 },
    { name: "aircraft", count: data.aircraft.length, min: 1 },
    { name: "fare routes", count: data.fareRoutes.length, min: 1 },
    { name: "users", count: data.users.length, min: 1 },
  ];

  for (const check of checks) {
    if (check.count < check.min) {
      console.error(
        `❌ Insufficient ${check.name}: found ${check.count}, need at least ${check.min}`
      );
      process.exit(1);
    }
  }

  console.log(`  ✓ ${data.aerodromes.length} aerodromes loaded`);
  console.log(`  ✓ ${data.aircraft.length} aircraft loaded`);
  console.log(`  ✓ ${data.fareRoutes.length} fare routes loaded`);
  console.log(`  ✓ ${data.noFlyRules.length} no-fly rules loaded`);
  console.log(`  ✓ ${data.users.length} users loaded`);
  console.log(`  ✓ ${data.organizations.length} organizations loaded`);
}
