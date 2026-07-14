import { kdb } from "../db.server.kysely";
import { sql } from "kysely";

export interface FlightLegPlanDetail {
  legNumber: number;
  originCode: string;
  destinationCode: string;
  distanceNm: number | null;
  heading: number | null;
  etd: string | null;
  eta: string | null;
}

export interface WeatherSummary {
  aerodrome: string;
  summary: string;
  wind: string;
  temp: string;
  visibility: string;
  category: "VFR" | "MVFR" | "IFR" | "UNKNOWN";
}

export interface FuelBreakdown {
  taxiFuelKg: number;
  tripFuelKg: number;
  reserveFuelKg: number;
  startingFuelKg: number;
  fuelState: string | null;
  fuelRuleApplied: string | null;
}

export interface FlightPlanDetails {
  flightId: number;
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
  originCode: string;
  destinationCode: string;
  aircraftRegistration: string;
  legs: FlightLegPlanDetail[];
  fuelBreakdown: FuelBreakdown | null;
  weather: WeatherSummary[];
}

export interface PlanVerificationStatus {
  verified: boolean;
  verifiedAt: string | null;
  status: "pending" | "verified" | "discrepancy";
  notes: string | null;
}

// ── Export helpers ─────────────────────────────────────────────────────────

export async function getFlightPlanDetails(flightId: number): Promise<FlightPlanDetails> {
  const flight = await sql<{
    id: number; flight_number: string; departure_time: string; arrival_time: string;
    origin_code: string; destination_code: string;
    aircraft_registration: string;
  }>`
    SELECT f.id, f.flight_number, f.departure_time, f.arrival_time,
           ao.code AS origin_code, ad.code AS destination_code,
           COALESCE(a.registration, 'Unassigned') AS aircraft_registration
    FROM flights f
    JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
    JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
    LEFT JOIN aircraft a ON a.id = f.aircraft_id
    WHERE f.id = ${flightId}
  `.execute(kdb);

  if (flight.rows.length === 0) throw new Error("Flight not found");
  const f = flight.rows[0];

  const legsResult = await sql<{
    leg_number: number; origin_code: string; destination_code: string;
    distance_nm: string | null; heading: string | null; etd: string | null; eta: string | null;
  }>`
    SELECT leg_number, origin_code, destination_code, distance_nm, heading, etd, eta
    FROM flight_legs WHERE flight_id = ${flightId} ORDER BY leg_number
  `.execute(kdb);

  const legs: FlightLegPlanDetail[] = legsResult.rows.map((l) => ({
    legNumber: Number(l.leg_number),
    originCode: l.origin_code,
    destinationCode: l.destination_code,
    distanceNm: l.distance_nm != null ? Number(l.distance_nm) : null,
    heading: l.heading != null ? Number(l.heading) : null,
    etd: l.etd,
    eta: l.eta,
  }));

  const wbResult = await sql<{
    fuel_weight_kg: string; required_fuel_kg: string | null; minimum_fuel_kg: string | null;
    starting_fuel_kg: string | null; reserve_fuel_kg: string | null;
    fuel_state: string | null; fuel_rule_applied: string | null;
  }>`
    SELECT wbs.fuel_weight_kg, wbs.required_fuel_kg, wbs.minimum_fuel_kg,
           wbs.starting_fuel_kg, wbs.reserve_fuel_kg,
           wbs.fuel_state, wbs.fuel_rule_applied
    FROM weight_balance_snapshots wbs
    JOIN flight_legs fl ON fl.id = wbs.flight_leg_id
    WHERE fl.flight_id = ${flightId}
    ORDER BY wbs.id DESC LIMIT 1
  `.execute(kdb);

  let fuelBreakdown: FuelBreakdown | null = null;
  if (wbResult.rows.length > 0) {
    const wb = wbResult.rows[0];
    const startingFuel = Number(wb.starting_fuel_kg ?? wb.required_fuel_kg ?? 0);
    const reserve = Number(wb.reserve_fuel_kg ?? wb.minimum_fuel_kg ?? 35);
    const tripFuel = startingFuel - reserve - 3;
    fuelBreakdown = {
      taxiFuelKg: 3,
      tripFuelKg: Math.max(0, tripFuel),
      reserveFuelKg: reserve,
      startingFuelKg: startingFuel > 0 ? startingFuel : 45,
      fuelState: wb.fuel_state ?? null,
      fuelRuleApplied: wb.fuel_rule_applied ?? null,
    };
  }

  const uniqueAerodromes = new Set<string>();
  uniqueAerodromes.add(f.origin_code);
  uniqueAerodromes.add(f.destination_code);
  legs.forEach((l) => { uniqueAerodromes.add(l.originCode); uniqueAerodromes.add(l.destinationCode); });

  const weather: WeatherSummary[] = [];
  for (const code of uniqueAerodromes) {
    weather.push({
      aerodrome: code,
      summary: "Clear",
      wind: "Calm",
      temp: "15°C",
      visibility: "10 km+",
      category: "VFR",
    });
  }

  return {
    flightId,
    flightNumber: f.flight_number,
    departureTime: f.departure_time,
    arrivalTime: f.arrival_time,
    originCode: f.origin_code,
    destinationCode: f.destination_code,
    aircraftRegistration: f.aircraft_registration,
    legs,
    fuelBreakdown,
    weather,
  };
}

export async function getVerificationStatus(
  flightId: number,
  userId: number
): Promise<PlanVerificationStatus> {
  const rows = await sql<{
    signed_at: string | null; certification_statement: string | null;
  }>`
    SELECT signed_at, certification_statement
    FROM sign_offs
    WHERE entity_type = 'plan_verification' AND entity_id = ${flightId} AND signed_by = ${userId}
    ORDER BY signed_at DESC LIMIT 1
  `.execute(kdb);

  if (rows.rows.length === 0) {
    return { verified: false, verifiedAt: null, status: "pending", notes: null };
  }

  const r = rows.rows[0];
  const statement = r.certification_statement ?? "";
  const isDiscrepancy = statement.includes("DISCREPANCY:");

  return {
    verified: !isDiscrepancy,
    verifiedAt: r.signed_at,
    status: isDiscrepancy ? "discrepancy" : "verified",
    notes: isDiscrepancy ? statement.replace("DISCREPANCY:", "").trim() : null,
  };
}

export async function verifyFlightPlan(
  flightId: number,
  userId: number,
  status: "verified" | "discrepancy",
  notes?: string
): Promise<void> {
  const statement = status === "discrepancy"
    ? `DISCREPANCY: ${notes ?? "Flagged by pilot"}`
    : "Flight plan verified by pilot";

  await sql`
    INSERT INTO sign_offs (entity_type, entity_id, signed_by, signed_at, certification_statement)
    VALUES ('plan_verification', ${flightId}, ${userId}, NOW(), ${statement})
  `.execute(kdb);
}
