import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "../utils/db.server";
import { sql } from "kysely";
import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { loadCSVDistanceMap } from "../utils/scheduling/distance-lookup";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requirePermission(request, Permission.FLIGHT_VIEW);

  const flightId = Number(params.flightId);
  if (!flightId) {
    return json({ error: "Flight ID required" }, { status: 400 });
  }

  const flightRows = await sql<{
    id: number;
    flight_number: string;
    origin_code: string;
    destination_code: string;
    aircraft_id: number | null;
    pilot_id: number | null;
    empty_weight_kg: number;
    mtow_kg: number;
    mlw_kg: number;
    registration: string | null;
    type: string | null;
    pilot_weight_kg: number;
  }>`
    SELECT f.id, f.flight_number,
        ao.code AS origin_code, ad.code AS destination_code,
        f.aircraft_id, f.pilot_id,
        COALESCE(a.empty_weight_kg, 1627) AS empty_weight_kg,
        COALESCE(a.max_takeoff_weight_kg, 2994) AS mtow_kg,
        COALESCE(a.max_takeoff_weight_kg, 2994) AS mlw_kg,
        a.registration, a.type,
        COALESCE(p.weight_kg, 80) AS pilot_weight_kg
     FROM flights f
     JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
     JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
     LEFT JOIN aircraft a ON a.id = f.aircraft_id
     LEFT JOIN pilots p ON p.id = f.pilot_id
     WHERE f.id = ${flightId}
  `.execute(db);
  const flights = flightRows.rows;

  if (flights.length === 0) {
    return json({ error: "Flight not found" }, { status: 404 });
  }

  const flight = flights[0];

  const legRows = await sql<{
    id: number;
    origin_code: string;
    destination_code: string;
    distance_nm: number | null;
    leg_sequence: number;
    freight_weight_kg: number | null;
  }>`
    SELECT fl.id, fl.origin_code, fl.destination_code,
        fl.distance_nm, fl.leg_number AS leg_sequence,
        COALESCE(SUM(blp.freight_weight_kg), 0) AS freight_weight_kg
     FROM flight_legs fl
     LEFT JOIN booking_leg_passengers blp ON blp.flight_leg_id = fl.id
     WHERE fl.flight_id = ${flightId}
     GROUP BY fl.id, fl.origin_code, fl.destination_code,
              fl.distance_nm, fl.leg_number
     ORDER BY fl.leg_number
  `.execute(db);
  const legs = legRows.rows;

  const passengerRows = await sql<{
    id: number;
    name: string;
    clothed_weight_kg: number;
    baggage_weight_kg: number;
    origin_code: string;
    destination_code: string;
    seat_number: string | null;
    seat_row: number | null;
    seat_side: string | null;
  }>`
    SELECT blp.id,
        CONCAT(bp.first_name, ' ', bp.last_name) AS name,
        COALESCE(blp.clothed_weight_kg, 70) AS clothed_weight_kg,
        COALESCE(blp.baggage_weight_kg, 0) AS baggage_weight_kg,
        bl.origin_code, bl.destination_code,
        blp.seat_number,
        ls.seat_row, ls.seat_side
     FROM booking_leg_passengers blp
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     LEFT JOIN loadsheets l ON l.flight_id = ${flightId}
     LEFT JOIN loadsheet_passengers ls
       ON ls.loadsheet_id = l.id AND ls.booking_passenger_id = blp.booking_passenger_id
     WHERE blp.flight_leg_id IS NOT NULL
       AND blp.booking_leg_id IN (
         SELECT bl.id FROM booking_legs bl WHERE bl.flight_id = ${flightId}
       )
     ORDER BY ls.seat_row NULLS LAST, ls.seat_side
  `.execute(db);
  const passengers = passengerRows.rows;

  const distanceMap = await loadCSVDistanceMap();
  const distanceRecord: Record<string, number> = {};
  if (distanceMap) {
    distanceMap.forEach((value, key) => {
      distanceRecord[key] = value;
    });
  }

  const snapshotRows = await sql<{
    starting_fuel_kg: number;
    reserve_fuel_kg: number;
    total_passenger_weight_kg: number;
    total_baggage_weight_kg: number;
    total_weight_kg: number;
  }>`
    SELECT wbs.starting_fuel_kg, wbs.reserve_fuel_kg,
        wbs.passenger_weight_kg AS total_passenger_weight_kg,
        wbs.baggage_weight_kg AS total_baggage_weight_kg,
        wbs.total_weight_kg
     FROM weight_balance_snapshots wbs
     JOIN flight_legs fl ON fl.id = wbs.flight_leg_id
     WHERE fl.flight_id = ${flightId}
     ORDER BY wbs.id DESC LIMIT 1
  `.execute(db);
  const existingSnapshot = snapshotRows.rows;

  const snapshotFuel =
    existingSnapshot.length > 0
      ? Number(existingSnapshot[0].starting_fuel_kg ?? 45)
      : 45;
  const snapshotReserve =
    existingSnapshot.length > 0
      ? Number(existingSnapshot[0].reserve_fuel_kg ?? 35)
      : 35;

  const startingFuelKg = snapshotFuel || 45;
  const reserveFuelKg = snapshotReserve || 35;

  return json({
    aircraft: {
      emptyWeightKg: Number(flight.empty_weight_kg),
      mtowKg: Number(flight.mtow_kg),
      mlwKg: Number(flight.mlw_kg),
      cruiseSpeedKtas: undefined,
    },
    legs: legs.map((l) => ({
      id: Number(l.id),
      originCode: l.origin_code,
      destinationCode: l.destination_code,
      distanceNm: l.distance_nm ? Number(l.distance_nm) : null,
      legSequence: l.leg_sequence,
      freightWeightKg: Number(l.freight_weight_kg ?? 0),
    })),
    passengers: passengers.map((p: { id: number; name: string; clothed_weight_kg: number; baggage_weight_kg: number; origin_code: string; destination_code: string; seat_row: number | null; seat_side: string | null }) => ({
      id: Number(p.id),
      name: p.name,
      clothedWeightKg: Number(p.clothed_weight_kg),
      baggageWeightKg: Number(p.baggage_weight_kg),
      originCode: p.origin_code,
      destinationCode: p.destination_code,
      seatRow: p.seat_row != null ? Number(p.seat_row) : null,
      seatSide: p.seat_side,
    })),
    pilotWeightKg: Number(flight.pilot_weight_kg),
    startingFuelKg,
    reserveFuelKg,
    distanceMap: distanceRecord,
    meta: {
      flightNumber: flight.flight_number,
      aircraftRegistration: flight.registration ?? "Unassigned",
      aircraftType: flight.type ?? "BN-2 Islander",
    },
  });
}
