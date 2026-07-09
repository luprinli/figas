import { db } from "../db.server";

export interface FlightRow {
  id: number;
  flight_number: string;
  aircraft_id: number;
  origin_aerodrome_id: number;
  destination_aerodrome_id: number;
  departure_time: string;
  arrival_time: string;
  intermediate_stops: unknown;
  total_passenger_weight_kg: number | null;
  total_baggage_weight_kg: number | null;
  total_freight_weight_kg: number | null;
  total_fuel_weight_kg: number | null;
  status: string;
  pilot_id: number | null;
  pilot_approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlightSearchResult {
  id: number;
  flight_number: string;
  aircraft_id: number;
  origin_aerodrome_id: number;
  destination_aerodrome_id: number;
  departure_time: string;
  arrival_time: string;
  status: string;
  origin_code: string;
  origin_name: string;
  destination_code: string;
  destination_name: string;
  aircraft_registration: string;
  seat_count: number;
  available_seats: number;
}

export const flightRepository = {
  async findById(id: number): Promise<FlightSearchResult | null> {
    // Step 1: Fetch flight with related aerodromes and aircraft
    const flight = await db.flights.findUnique({
      where: { id },
      include: {
        origin_aerodrome: {
          select: { code: true, name: true },
        },
        destination_aerodrome: {
          select: { code: true, name: true },
        },
        aircraft: {
          select: { registration: true, seat_count: true },
        },
      },
    });

    if (!flight || !flight.origin_aerodrome || !flight.destination_aerodrome || !flight.aircraft) {
      return null;
    }

    // Step 2: Count seat assignments for this flight
    const seatsTaken = await db.seat_assignments.count({
      where: { flight_id: id },
    });

    const seatCount = flight.aircraft.seat_count;
    const availableSeats = seatCount - seatsTaken;

    return {
      id: flight.id,
      flight_number: flight.flight_number,
      aircraft_id: flight.aircraft_id ?? 0,
      origin_aerodrome_id: flight.origin_aerodrome_id ?? 0,
      destination_aerodrome_id: flight.destination_aerodrome_id ?? 0,
      departure_time: flight.departure_time.toISOString(),
      arrival_time: flight.arrival_time.toISOString(),
      status: flight.status,
      origin_code: flight.origin_aerodrome.code,
      origin_name: flight.origin_aerodrome.name,
      destination_code: flight.destination_aerodrome.code,
      destination_name: flight.destination_aerodrome.name,
      aircraft_registration: flight.aircraft.registration,
      seat_count: seatCount,
      available_seats: availableSeats,
    };
  },

  async findByFlightNumber(flightNumber: string): Promise<FlightSearchResult | null> {
    // Step 1: Fetch flight with related aerodromes and aircraft
    const flight = await db.flights.findUnique({
      where: { flight_number: flightNumber },
      include: {
        origin_aerodrome: {
          select: { code: true, name: true },
        },
        destination_aerodrome: {
          select: { code: true, name: true },
        },
        aircraft: {
          select: { registration: true, seat_count: true },
        },
      },
    });

    if (!flight || !flight.origin_aerodrome || !flight.destination_aerodrome || !flight.aircraft) {
      return null;
    }

    // Step 2: Count seat assignments for this flight
    const seatsTaken = await db.seat_assignments.count({
      where: { flight_id: flight.id },
    });

    const seatCount = flight.aircraft.seat_count;
    const availableSeats = seatCount - seatsTaken;

    return {
      id: flight.id,
      flight_number: flight.flight_number,
      aircraft_id: flight.aircraft_id ?? 0,
      origin_aerodrome_id: flight.origin_aerodrome_id ?? 0,
      destination_aerodrome_id: flight.destination_aerodrome_id ?? 0,
      departure_time: flight.departure_time.toISOString(),
      arrival_time: flight.arrival_time.toISOString(),
      status: flight.status,
      origin_code: flight.origin_aerodrome.code,
      origin_name: flight.origin_aerodrome.name,
      destination_code: flight.destination_aerodrome.code,
      destination_name: flight.destination_aerodrome.name,
      aircraft_registration: flight.aircraft.registration,
      seat_count: seatCount,
      available_seats: availableSeats,
    };
  },

  async assignPilot(flightId: number, pilotId: number): Promise<void> {
    await db.flights.update({
      where: { id: flightId },
      data: { pilot_id: pilotId, updated_at: new Date() },
    });
  },

  async assignAircraft(flightId: number, aircraftId: number): Promise<void> {
    await db.flights.update({
      where: { id: flightId },
      data: { aircraft_id: aircraftId, updated_at: new Date() },
    });
  },

  async approveByPilot(flightId: number, pilotId: number): Promise<void> {
    await db.flights.update({
      where: { id: flightId, pilot_id: pilotId },
      data: {
        pilot_approved_at: new Date(),
        status: "boarding",
        updated_at: new Date(),
      },
    });
  },

  async updateStatus(flightId: number, status: string): Promise<void> {
    await db.flights.update({
      where: { id: flightId },
      data: { status, updated_at: new Date() },
    });
  },

  async updateWeights(
    flightId: number,
    data: {
      total_passenger_weight_kg?: number;
      total_baggage_weight_kg?: number;
      total_freight_weight_kg?: number;
      total_fuel_weight_kg?: number;
    }
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.total_passenger_weight_kg !== undefined) {
      updateData.total_passenger_weight_kg = data.total_passenger_weight_kg;
    }
    if (data.total_baggage_weight_kg !== undefined) {
      updateData.total_baggage_weight_kg = data.total_baggage_weight_kg;
    }
    if (data.total_freight_weight_kg !== undefined) {
      updateData.total_freight_weight_kg = data.total_freight_weight_kg;
    }
    if (data.total_fuel_weight_kg !== undefined) {
      updateData.total_fuel_weight_kg = data.total_fuel_weight_kg;
    }
    if (Object.keys(updateData).length === 0) return;
    updateData.updated_at = new Date();
    await db.flights.update({
      where: { id: flightId },
      data: updateData,
    });
  },

  async deleteFlight(id: number): Promise<void> {
    await db.$transaction(async (tx) => {
      await tx.flight_legs.deleteMany({
        where: { flight_id: id },
      });
      await tx.flights.delete({
        where: { id },
      });
    });
  },

  /**
   * Find flights by schedule ID with full details (aerodrome, aircraft, pilot).
   */
  async findByScheduleId(scheduleId: number) {
    const flights = await db.flights.findMany({
      where: { schedule_id: scheduleId },
      include: {
        origin_aerodrome: true,
        destination_aerodrome: true,
        aircraft: true,
        pilot: true,
      },
      orderBy: [{ sort_order: { sort: "asc", nulls: "last" } }, { departure_time: "asc" }],
    });
    return flights.map((f) => ({
      ...f,
      origin_code: f.origin_aerodrome?.code ?? null,
      origin_name: f.origin_aerodrome?.name ?? null,
      destination_code: f.destination_aerodrome?.code ?? null,
      destination_name: f.destination_aerodrome?.name ?? null,
      aircraft_registration: f.aircraft?.registration ?? null,
      aircraft_type: f.aircraft?.type ?? null,
      seat_count: f.aircraft?.seat_count ?? null,
      pilot_name: f.pilot?.name ?? null,
    }));
  },
};

/**
 * Find a flight summary row by ID using the canonical shape expected by
 * the frontend.  Replaces 4 duplicated inline $queryRawUnsafe blocks in
 * schedule-handlers.server.ts.
 *
 * Accepts an optional Prisma transaction client for use inside tx blocks.
 */
export async function findSummaryById(
  flightId: number,
  client?: import("../../../generated/prisma/client").Prisma.TransactionClient
): Promise<Record<string, unknown> | null> {
  const executor = client ?? db;
  const rows = await executor.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT f.id, f.flight_number, f.departure_time, f.arrival_time, f.status,
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
            0 AS flight_ordinal
     FROM flights f
     LEFT JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
     LEFT JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
     LEFT JOIN aircraft a ON a.id = f.aircraft_id
     LEFT JOIN pilots p ON p.id = f.pilot_id
     LEFT JOIN pilot_assignments pa ON pa.flight_id = f.id AND pa.status = 'confirmed'
     WHERE f.id = $1`,
    flightId
  );
  return rows[0] ?? null;
}

export async function findLegsByFlightId(
  flightId: number,
  client?: import("../../../generated/prisma/client").Prisma.TransactionClient
): Promise<Record<string, unknown>[]> {
  const executor = client ?? db;
  return executor.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT fl.id, fl.flight_id, fl.leg_number AS leg_sequence, fl.etd AS departure_time, fl.eta AS arrival_time, fl.status,
            fl.origin_code, fl.destination_code, fl.distance_nm, fl.heading
     FROM flight_legs fl
     WHERE fl.flight_id = $1
     ORDER BY fl.leg_number`,
    flightId
  );
}
