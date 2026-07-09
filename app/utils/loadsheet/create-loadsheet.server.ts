import { db } from "../db.server";
import { loadsheetRepository } from "./loadsheet-repository.server";
import { computeLoadsheetCalculations } from "./loadsheet-calculations.server";
import { DEFAULT_BN2_MTOW_KG } from "../constants";

const BN2_EMPTY_WT = 1627;

export async function createLoadsheetFromFlight(flightId: number): Promise<number | null> {
  const existing = await loadsheetRepository.findByFlightId(flightId);
  if (existing && existing.status !== "archived") return existing.id;

  const flight = await db.flights.findUnique({
    where: { id: flightId },
    select: { id: true, schedule_id: true, pilot_id: true, aircraft_id: true, flight_number: true, departure_time: true },
  });
  if (!flight) return null;

  const legs = await db.flight_legs.findMany({
    where: { flight_id: flightId },
    orderBy: { leg_number: "asc" },
    select: { id: true, leg_number: true, origin_code: true, destination_code: true, distance_nm: true, etd: true, eta: true },
  });

  // Query passengers that are explicitly assigned to a flight leg of this flight
  // (per-passenger).  Previously used `WHERE bl.flight_id = $1` which is booking-leg
  // level and can include passengers who were per-passenger unassigned or never
  // assigned to a specific leg.
  const passengerRows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT DISTINCT ON (bp.id)
            bp.id,
            blp.booking_leg_id,
            bl.origin_code,
            bl.destination_code,
            COALESCE(blp.clothed_weight_kg, 70)::numeric AS clothed_weight_kg,
            COALESCE(blp.baggage_weight_kg, 0)::numeric AS baggage_weight_kg,
            COALESCE(blp.freight_weight_kg, 0)::numeric AS freight_weight_kg
     FROM booking_leg_passengers blp
     JOIN flight_legs fl ON fl.id = blp.flight_leg_id
     JOIN booking_legs bl ON bl.id = blp.booking_leg_id
     JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
     WHERE fl.flight_id = $1
     ORDER BY bp.id, blp.id ASC`,
    flightId
  );

  // Build stop order map from flight legs to validate route order
  const stopOrderMap = new Map<string, number>();
  let order = 0;
  for (const l of legs) {
    if (l.origin_code && !stopOrderMap.has(l.origin_code)) {
      stopOrderMap.set(l.origin_code, order++);
    }
    if (l.destination_code && !stopOrderMap.has(l.destination_code)) {
      stopOrderMap.set(l.destination_code, order++);
    }
  }

  const routeMatchedRows = (passengerRows as Array<{
    id: number | bigint; booking_leg_id: number | bigint;
    origin_code: string; destination_code: string;
    clothed_weight_kg: number | bigint; baggage_weight_kg: number | bigint; freight_weight_kg: number | bigint;
  }>).filter((r) => {
    const originIdx = stopOrderMap.get(r.origin_code);
    const destIdx = stopOrderMap.get(r.destination_code);
    return originIdx != null && destIdx != null && originIdx < destIdx;
  });

  const passengers = routeMatchedRows.map((r) => ({
    id: Number(r.id),
    bookingLegId: Number(r.booking_leg_id),
    origin_code: r.origin_code,
    destination_code: r.destination_code,
    clothedWeightKg: Number(r.clothed_weight_kg) || 70,
    baggageWeightKg: Number(r.baggage_weight_kg) || 0,
    freightWeightKg: Number(r.freight_weight_kg) || 0,
  }));

  const aircraft = await db.aircraft.findUnique({
    where: { id: flight.aircraft_id ?? 0 },
    select: { empty_weight_kg: true, max_takeoff_weight_kg: true },
  });

  const emptyWt = aircraft ? Number(aircraft.empty_weight_kg) || BN2_EMPTY_WT : BN2_EMPTY_WT;
  const mtow = aircraft ? Number(aircraft.max_takeoff_weight_kg) || DEFAULT_BN2_MTOW_KG : DEFAULT_BN2_MTOW_KG;

  const calcResult = await computeLoadsheetCalculations({
    flightId,
    legs: legs.map((l) => ({
      id: l.id,
      leg_number: l.leg_number,
      origin_code: l.origin_code ?? "",
      destination_code: l.destination_code ?? "",
      distance_nm: l.distance_nm != null ? Number(l.distance_nm) : null,
    })),
    passengers,
    aircraft: {
      empty_weight_kg: emptyWt,
      max_takeoff_weight_kg: mtow,
      max_landing_weight_kg: mtow,
    },
    pilotWeightKg: 80,
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
    pilot_weight_kg: 80,
    total_pax: passengers.length,
  });

  for (const sa of calcResult.seatAssignments) {
    await loadsheetRepository.addPassenger({
      loadsheet_id: loadsheet.id,
      booking_passenger_id: sa.passengerId,
      booking_leg_id: sa.bookingLegId,
      seat_row: sa.seatRow ?? null,
      seat_side: sa.seatSide ?? null,
      clothed_weight_kg: sa.clothedWeightKg,
      baggage_weight_kg: sa.baggageWeightKg,
      freight_weight_kg: 0,
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
