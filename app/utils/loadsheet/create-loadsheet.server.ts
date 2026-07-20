import { kdb } from "../db.server.kysely";
import { loadsheetRepository } from "./loadsheet-repository.server";
import { computeLoadsheetCalculations } from "./loadsheet-calculations.server";
import { findManifestsByFlightId } from "../repositories/booking-leg-passenger";
import { buildOrderedStopSequence, filterManifestsByRoute } from "../scheduling/route-utils";
import {
  DEFAULT_BN2_MTOW_KG,
  DEFAULT_BN2_EMPTY_WEIGHT_KG,
  DEFAULT_PILOT_WEIGHT_KG,
} from "../constants";

export async function createLoadsheetFromFlight(flightId: number): Promise<number | null> {
  const existing = await loadsheetRepository.findByFlightId(flightId);
  if (existing && existing.status !== "archived") return existing.id;

  const flight = (await kdb.selectFrom("flights")
    .select(["id", "schedule_id", "pilot_id", "aircraft_id", "flight_number", "departure_time", "origin_code", "destination_code"])
    .where("id", "=", flightId)
    .execute())[0] ?? null;
  if (!flight) return null;

  const legs = await kdb.selectFrom("flight_legs")
    .select(["id", "leg_number", "origin_code", "destination_code", "distance_nm", "etd", "eta"])
    .where("flight_id", "=", flightId)
    .orderBy("leg_number", "asc")
    .execute();

  // Query passengers via canonical source of truth (findManifestsByFlightId).
  // This is the same function used by the schedule loader and flight card,
  // guaranteeing flight-loadsheet passenger consistency.
  const manifestRows = await findManifestsByFlightId([flightId]);

  // Build ordered stop list via shared utility (single source of truth).
  // Must match buildStopActivities' orderedCodes to prevent passenger-count
  // drift between the flight card and loadsheet.
  const routeStops = buildOrderedStopSequence(
    { origin_code: flight.origin_code, destination_code: flight.destination_code },
    legs,
  );

  const routeMatchedRows = filterManifestsByRoute(manifestRows, routeStops);

  const passengers = routeMatchedRows.map((r) => ({
    id: r.id,
    booking_passenger_id: r.booking_passenger_id,
    bookingLegId: r.booking_leg_id,
    origin_code: r.origin_code,
    destination_code: r.destination_code,
    clothedWeightKg: r.body_weight_kg != null ? Number(r.body_weight_kg) : 70,
    baggageWeightKg: r.baggage_weight_kg != null ? Number(r.baggage_weight_kg) : 0,
    freightWeightKg: r.freight_weight_kg != null ? Number(r.freight_weight_kg) : 0,
  }));

  const aircraft = (await kdb.selectFrom("aircraft")
    .select(["empty_weight_kg", "max_takeoff_weight_kg"])
    .where("id", "=", flight.aircraft_id ?? 0)
    .execute())[0] ?? null;

  const emptyWt = aircraft ? Number(aircraft.empty_weight_kg) || DEFAULT_BN2_EMPTY_WEIGHT_KG : DEFAULT_BN2_EMPTY_WEIGHT_KG;

  // Pilot weight: read from assigned pilot in pilots table, fall back to global default.
  let pilotWeightKg = DEFAULT_PILOT_WEIGHT_KG;
  if (flight.pilot_id) {
    const pilotRow = (await kdb.selectFrom("pilots")
      .select(["weight_kg"])
      .where("id", "=", flight.pilot_id)
      .execute())[0] ?? null;
    if (pilotRow) {
      pilotWeightKg = Number(pilotRow.weight_kg) || DEFAULT_PILOT_WEIGHT_KG;
    }
  }
  const mtow = aircraft ? Number(aircraft.max_takeoff_weight_kg) || DEFAULT_BN2_MTOW_KG : DEFAULT_BN2_MTOW_KG;

  const calcResult = await computeLoadsheetCalculations({
    flightId,
    legs: legs.map((l) => ({
      id: l.id,
      leg_number: l.leg_number,
      origin_code: l.origin_code ?? "",
      destination_code: l.destination_code ?? "",
      distance_nm: l.distance_nm != null ? Number(l.distance_nm) : null,
      etd: l.etd,
      eta: l.eta,
    })),
    passengers,
    aircraft: {
      empty_weight_kg: emptyWt,
      max_takeoff_weight_kg: mtow,
      max_landing_weight_kg: mtow,
    },
    pilotWeightKg,
    date: flight.departure_time
      ? new Date(flight.departure_time).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
  });

  const loadsheet = await loadsheetRepository.create({
    flight_id: flightId,
    schedule_id: flight.schedule_id,
    pilot_id: flight.pilot_id,
    aircraft_id: flight.aircraft_id,
    empty_weight_kg: emptyWt,
    pilot_weight_kg: pilotWeightKg,
    total_pax: passengers.length,
  });

  for (const sa of calcResult.seatAssignments) {
    await loadsheetRepository.addPassenger({
      loadsheet_id: loadsheet.id,
      booking_passenger_id: sa.bookingPassengerId,
      booking_leg_id: sa.bookingLegId,
      seat_row: sa.seatRow ?? null,
      seat_side: sa.seatSide ?? null,
      clothed_weight_kg: sa.clothedWeightKg,
      baggage_weight_kg: sa.baggageWeightKg,
      freight_weight_kg: sa.freightWeightKg,
    });
  }

  for (const sector of calcResult.sectors) {
    const leg = legs.find((l) => l.leg_number === sector.legSequence);
    if (!leg) continue;
    await loadsheetRepository.addSector({
      loadsheet_id: loadsheet.id,
      flight_leg_id: leg.id,
      leg_sequence: sector.legSequence,
      origin_code: sector.originCode,
      destination_code: sector.destinationCode,
      distance_nm: sector.distanceNm,
      planned_time_min: sector.plannedTimeMin,
      etd: sector.etd,
      eta: sector.eta,
      fuel_on_board_kg: sector.fuelOnBoardKg,
      fuel_burn_kg: sector.fuelBurnKg,
      fuel_remaining_kg: sector.fuelRemainingKg,
      takeoff_weight_kg: sector.takeoffWeightKg,
      landing_weight_kg: sector.landingWeightKg,
      cog_position_mm: sector.cogMm,
      cog_status: sector.cogStatus,
      tow_status: sector.towStatus,
      notes: [sector.towReason, sector.cogReason].filter(Boolean).join("; ") || null,
    });
  }

  await loadsheetRepository.logAudit({
    loadsheet_id: loadsheet.id,
    action: "created",
  });

  return loadsheet.id;
}
