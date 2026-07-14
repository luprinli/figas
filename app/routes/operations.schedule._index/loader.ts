import type { LoaderData } from "./shared";

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { generateCsrfTokenFromRequest } from "../../utils/csrf-check.server";
import { requirePermission, hasPermission } from "../../utils/permissions.server";
import { kdb } from "../../utils/db.server.kysely";
import { sql } from "kysely";
import { scheduleRepository } from "../../utils/repositories/schedule";
import { ScheduleStatus } from "../../utils/constants";
import { findManifestsByFlightId, findUnassignedByDate } from "../../utils/repositories/booking-leg-passenger";
import { convertBigInts } from "../../utils/bigint";
import { todayISO } from "../../utils/dates";
import { isNoFlyDay } from "../../utils/services/no-fly.service";
import type { FlightSummaryRow } from "../../utils/scheduling/build-flight-card-flight";
import type { FlightLegRow, PassengerManifestRow } from "../../utils/scheduling/build-stop-activities";
import type { UnassignedBookingRow } from "../../components/schedule/DraggableBookingItem";
import type { PilotOption, AircraftOption } from "../../components/schedule/FlightCard";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requirePermission(request, "schedule:create");
  const url = new URL(request.url);
  const selectedDate = url.searchParams.get("date") ?? todayISO();
  const schedule = await scheduleRepository.findByDate(selectedDate);
  const noFlyDay = await isNoFlyDay(selectedDate);

  // Generate CSRF token from session cookie for drag-and-drop fetcher submissions
  const csrfToken = generateCsrfTokenFromRequest(request);


  let flights: FlightSummaryRow[] = [];
  let flightLegs: FlightLegRow[] = [];
  let passengerManifests: PassengerManifestRow[] = [];
  let unassignedBookings: UnassignedBookingRow[] = [];

  if (schedule && schedule.status !== ScheduleStatus.CANCELLED && schedule.status !== ScheduleStatus.COMPLETED) {
    const flightsResult = await sql<Record<string, unknown>>`
      SELECT f.id, f.flight_number, f.departure_time, f.arrival_time, f.status,
              f.sort_order,
              f.duration_minutes,
              f.check_in_time,
              a.max_takeoff_weight_kg,
              NULL::numeric AS max_landing_weight_kg,
              a.empty_weight_kg AS basic_empty_weight_kg,
              NULL::numeric AS payload_kg,
              NULL::numeric AS fuel_kg,
              NULL::numeric AS crew_weight_kg,
              COALESCE(f.origin_code, ao.code) AS origin_code,
              COALESCE(f.destination_code, ad.code) AS destination_code,
              a.registration AS aircraft_registration, a.type AS aircraft_type, a.seat_count,
              p.name AS pilot_name, pa.status AS pilot_status,
              ROW_NUMBER() OVER (PARTITION BY f.aircraft_id ORDER BY f.departure_time, f.id) AS flight_ordinal
       FROM flights f
       LEFT JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
       LEFT JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
       LEFT JOIN aircraft a ON a.id = f.aircraft_id
       LEFT JOIN pilots p ON p.id = f.pilot_id
        LEFT JOIN pilot_assignments pa ON pa.flight_id = f.id AND pa.status = 'confirmed'
         WHERE f.schedule_id = ${schedule.id}
           AND EXISTS (
             SELECT 1 FROM booking_legs bl WHERE bl.flight_id = f.id LIMIT 1
           )
         ORDER BY f.departure_time, f.id
    `.execute(kdb);
    flights = convertBigInts(flightsResult.rows) as unknown as FlightSummaryRow[];

    const flightIds = flights.map((f) => f.id);
    if (flightIds.length > 0) {
      // flight_legs uses origin_code/destination_code as varchar directly (not FK)
      const legsResult = await sql<Record<string, unknown>>`
        SELECT fl.id, fl.flight_id, fl.leg_number AS leg_sequence, fl.etd AS departure_time, fl.eta AS arrival_time, fl.status,
                fl.origin_code, fl.destination_code, fl.distance_nm, fl.heading
         FROM flight_legs fl
         WHERE fl.flight_id = ANY(${flightIds}::int[])
         ORDER BY fl.flight_id, fl.leg_number
      `.execute(kdb);
      flightLegs = convertBigInts(legsResult.rows) as unknown as FlightLegRow[];

      const manifestsResult = await findManifestsByFlightId(flightIds);
      passengerManifests = convertBigInts(manifestsResult) as unknown as PassengerManifestRow[];
    }

  }

  const unassignedResult = await findUnassignedByDate(selectedDate);
  unassignedBookings = convertBigInts(unassignedResult) as unknown as UnassignedBookingRow[];

  const [canApprove, canPublish, canEdit, canAssignPilot, canAssignAircraft] = await Promise.all([
    hasPermission(Number(user.id), "schedule:approve"),
    hasPermission(Number(user.id), "schedule:publish"),
    hasPermission(Number(user.id), "schedule:update"),
    hasPermission(Number(user.id), "schedule:assign-pilot"),
    hasPermission(Number(user.id), "schedule:update"), // same permission as edit for aircraft assignment
  ]);

  // Load available pilots for the pilot assignment dropdown
  const pilots = await kdb.selectFrom("pilots")
    .select(["id", "name"])
    .where("is_active", "=", true)
    .orderBy("name", "asc")
    .execute();
  const availablePilots: PilotOption[] = pilots
    .filter((p) => p.name !== null)
    .map((p) => ({ id: p.id, name: p.name! }));

  // Load available aircraft for the aircraft assignment dropdown
  const aircraft = await kdb.selectFrom("aircraft")
    .select(["id", "registration", "type", "seat_count"])
    .where("is_active", "=", true)
    .orderBy("registration", "asc")
    .execute();
  const availableAircraft: AircraftOption[] = aircraft.map((a) => ({
    id: a.id,
    registration: a.registration,
    type: a.type ?? "",
    seat_count: a.seat_count,
  }));

  // Load aerodrome names for display
  const aerodromesResult = await sql<{ id: number; code: string; name: string }>`
    SELECT id, code, name FROM aerodromes WHERE is_active = true
  `.execute(kdb);
  const aerodromeRows = aerodromesResult.rows;
  const aerodromeNames: Record<string, string> = {};
  const aerodromes: { id: number; code: string; name: string }[] = [];
  for (const a of aerodromeRows) {
    aerodromeNames[a.code] = a.name;
    aerodromes.push({ id: a.id, code: a.code, name: a.name });
  }


  return json<LoaderData>({
    schedule, flights, flightLegs, passengerManifests, unassignedBookings, selectedDate,
    isNoFlyDay: noFlyDay,
    user: { name: user.name, email: user.email },
    canApprove, canPublish, canEdit, canAssignPilot,
    availablePilots,
    canAssignAircraft,
    availableAircraft,
    aerodromeNames,
    aerodromes,
    buildResult: null,
    csrfToken,
  });
}
