import { kdb } from "../db.server.kysely";
import { sql } from "kysely";
import type { PassengerSearchResult, PassengerSearchParams } from "./passenger-search.types";
import { toDateString } from "../../types/shared";

/**
 * Hybrid passenger search with scoping.
 *
 * Scopes:
 * - "family":   passengers who shared a booking with the current user, or were booked by them in the last 12 months
 * - "recent":   passengers from the current user's own bookings (last 20)
 * - "agency":   passengers from bookings under the same organization
 * - "global":   search both registered users AND booking_passengers (requires admin)
 * - "auto":     dispatches based on user permissions
 *
 * Deduplication: if the same person appears as both a registered user and a historic passenger,
 * the "registered" result takes precedence (it has richer profile data).
 */

function dedupKey(r: PassengerSearchResult): string {
  return `${r.firstName.toLowerCase()}|${r.lastName.toLowerCase()}|${r.dateOfBirth ?? ""}`;
}

function dedupResults(results: PassengerSearchResult[]): PassengerSearchResult[] {
  const seen = new Map<string, PassengerSearchResult>();
  for (const r of results) {
    const key = dedupKey(r);
    const existing = seen.get(key);
    if (!existing || (r.source === "registered" && existing.source !== "registered")) {
      seen.set(key, r);
    }
  }
  return [...seen.values()];
}

function matchesQuery(r: PassengerSearchResult, query: string): boolean {
  const parts = query.toLowerCase().split(/\s+/);
  const fullName = `${r.firstName} ${r.lastName}`.toLowerCase();
  return parts.every((p) => fullName.includes(p) || r.email?.toLowerCase().includes(p) || false);
}

async function searchRegisteredUsers(query: string, limit: number): Promise<PassengerSearchResult[]> {
  const term = `%${query}%`;
  const rows = await sql<{
    id: number; name: string; email: string | null; phone: string | null;
    date_of_birth: string | null; clothed_body_weight_kg: number | null; residency_status: string | null;
  }>`
    SELECT id, name, email, phone, date_of_birth::text, clothed_body_weight_kg, residency_status
    FROM users
    WHERE is_active = true AND (name ILIKE ${term} OR email ILIKE ${term})
    ORDER BY name
    LIMIT ${limit}
  `.execute(kdb);

  return (rows.rows ?? []).map((r: Record<string, unknown>) => ({
    id: Number(r.id),
    source: "registered" as const,
    firstName: String(r.name ?? "").split(" ")[0] ?? "",
    lastName: String(r.name ?? "").split(" ").slice(1).join(" ") ?? "",
    email: r.email != null ? String(r.email) : null,
    phone: r.phone != null ? String(r.phone) : null,
    dateOfBirth: r.date_of_birth != null ? toDateString(r.date_of_birth) : null,
    clothedWeightKg: r.clothed_body_weight_kg != null ? Number(r.clothed_body_weight_kg) : null,
    residency: r.residency_status != null ? String(r.residency_status) : null,
    passengerUserId: Number(r.id),
  }));
}

async function searchHistoricPassengers(query: string, limit: number, extraWhere: string): Promise<PassengerSearchResult[]> {
  const term = `%${query}%`;
  const rows = await sql<{
    id: number; first_name: string; last_name: string; email: string | null;
    phone: string | null; date_of_birth: string | null; clothed_body_weight_kg: number | null;
    residency_status: string | null; user_id: number | null;
  }>`
    SELECT bp.id, bp.first_name, bp.last_name, bp.email, bp.phone,
           bp.date_of_birth::text, bp.clothed_body_weight_kg, bp.residency_status, bp.user_id
    FROM booking_passengers bp
    JOIN bookings b ON b.id = bp.booking_id
    WHERE (bp.first_name ILIKE ${term} OR bp.last_name ILIKE ${term} OR bp.email ILIKE ${term})
      AND ${sql.raw(extraWhere)}
    ORDER BY b.created_at DESC
    LIMIT ${limit}
  `.execute(kdb);

  return (rows.rows ?? []).map((r: Record<string, unknown>) => ({
    id: Number(r.id),
    source: "historic" as const,
    firstName: String(r.first_name ?? ""),
    lastName: String(r.last_name ?? ""),
    email: r.email != null ? String(r.email) : null,
    phone: r.phone != null ? String(r.phone) : null,
    dateOfBirth: r.date_of_birth != null ? toDateString(r.date_of_birth) : null,
    clothedWeightKg: r.clothed_body_weight_kg != null ? Number(r.clothed_body_weight_kg) : null,
    residency: r.residency_status != null ? String(r.residency_status) : null,
    passengerUserId: r.user_id != null ? Number(r.user_id) : null,
  }));
}

async function familySearch(query: string, bookerUserId: number, limit: number): Promise<PassengerSearchResult[]> {
  return searchHistoricPassengers(query, limit, `
    (bp.user_id = ${bookerUserId}
     OR b.user_id = ${bookerUserId}
     OR b.id IN (
       SELECT bp2.booking_id FROM booking_passengers bp2 WHERE bp2.user_id = ${bookerUserId}
     ))
  `);
}

async function recentSearch(query: string, bookerUserId: number, limit: number): Promise<PassengerSearchResult[]> {
  return searchHistoricPassengers(query, limit, `b.user_id = ${bookerUserId}`);
}

async function agencySearch(query: string, organizationId: number, limit: number): Promise<PassengerSearchResult[]> {
  return searchHistoricPassengers(query, limit, `b.organization_id = ${organizationId}`);
}

async function globalSearch(query: string, limit: number): Promise<PassengerSearchResult[]> {
  const registered = await searchRegisteredUsers(query, limit);
  const historic = await searchHistoricPassengers(query, limit, "1=1");
  return dedupResults([...registered, ...historic]);
}

export async function searchPassengers(params: PassengerSearchParams): Promise<PassengerSearchResult[]> {
  const { query, bookerUserId, organizationId, scope, dateOfBirth, limit = 20 } = params;

  if (!query || query.trim().length < 2) return [];

  let results: PassengerSearchResult[] = [];

  if (scope === "global") {
    results = await globalSearch(query.trim(), limit);
  } else if (scope === "family") {
    results = await familySearch(query.trim(), bookerUserId, limit);
  } else if (scope === "recent") {
    results = await recentSearch(query.trim(), bookerUserId, limit);
  } else if (scope === "agency" && organizationId) {
    results = await agencySearch(query.trim(), organizationId, limit);
  } else if (scope === "auto") {
    // Auto: always include recent. If org exists, add agency. Registered users always included.
    const searches: Promise<PassengerSearchResult[]>[] = [
      recentSearch(query.trim(), bookerUserId, limit),
      searchRegisteredUsers(query.trim(), limit),
    ];
    if (organizationId) {
      searches.push(agencySearch(query.trim(), organizationId, limit));
    }
    const all = await Promise.all(searches);
    results = dedupResults(all.flat());
  }

  // Post-filter by DOB if provided
  if (dateOfBirth) {
    results = results.filter((r) => r.dateOfBirth === dateOfBirth);
  }

  // Post-filter by text query
  results = results.filter((r) => matchesQuery(r, query.trim()));

  return results.slice(0, limit);
}
