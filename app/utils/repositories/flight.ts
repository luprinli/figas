/* eslint-disable @typescript-eslint/no-explicit-any */
import { kdb } from "../db.server";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { DB } from "../../../generated/kysely/database";

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

async function buildFlightSearchResult(
  flightRow: Record<string, unknown>,
  flightId: number
): Promise<FlightSearchResult | null> {
  const originAerodrome = await kdb
    .selectFrom("aerodromes")
    .select(["code", "name"])
    .where("id", "=", Number(flightRow.origin_aerodrome_id ?? 0))
    .execute();

  const destAerodrome = await kdb
    .selectFrom("aerodromes")
    .select(["code", "name"])
    .where("id", "=", Number(flightRow.destination_aerodrome_id ?? 0))
    .execute();

  const aircraft = await kdb
    .selectFrom("aircraft")
    .select(["registration", "seat_count"])
    .where("id", "=", Number(flightRow.aircraft_id ?? 0))
    .execute();

  if (originAerodrome.length === 0 || destAerodrome.length === 0 || aircraft.length === 0) {
    return null;
  }

  const seatCountResult = await kdb
    .selectFrom("seat_assignments")
    .select(kdb.fn.countAll<number>().as("cnt"))
    .where("flight_id", "=", flightId)
    .execute();

  const seatsTaken = Number(seatCountResult[0]?.cnt ?? 0);
  const seatCount = aircraft[0].seat_count;

  return {
    id: Number(flightRow.id),
    flight_number: String(flightRow.flight_number ?? ""),
    aircraft_id: flightRow.aircraft_id != null ? Number(flightRow.aircraft_id) : 0,
    origin_aerodrome_id: flightRow.origin_aerodrome_id != null ? Number(flightRow.origin_aerodrome_id) : 0,
    destination_aerodrome_id: flightRow.destination_aerodrome_id != null ? Number(flightRow.destination_aerodrome_id) : 0,
    departure_time: String(flightRow.departure_time ?? ""),
    arrival_time: String(flightRow.arrival_time ?? ""),
    status: String(flightRow.status ?? ""),
    origin_code: String(originAerodrome[0].code ?? ""),
    origin_name: String(originAerodrome[0].name ?? ""),
    destination_code: String(destAerodrome[0].code ?? ""),
    destination_name: String(destAerodrome[0].name ?? ""),
    aircraft_registration: String(aircraft[0].registration ?? ""),
    seat_count: seatCount,
    available_seats: seatCount - seatsTaken,
  };
}

export const flightRepository = {
  async findById(id: number): Promise<FlightSearchResult | null> {
    const rows = await kdb
      .selectFrom("flights")
      .selectAll()
      .where("id", "=", id)
      .execute();
    if (rows.length === 0) return null;
    return buildFlightSearchResult(rows[0] as unknown as Record<string, unknown>, id);
  },

  async findByFlightNumber(flightNumber: string): Promise<FlightSearchResult | null> {
    const rows = await kdb
      .selectFrom("flights")
      .selectAll()
      .where("flight_number", "=", flightNumber)
      .execute();
    if (rows.length === 0) return null;
    const flightId = Number(rows[0].id);
    return buildFlightSearchResult(rows[0] as unknown as Record<string, unknown>, flightId);
  },

  async assignPilot(flightId: number, pilotId: number): Promise<void> {
    const now = new Date().toISOString();
    await kdb
      .updateTable("flights")
      .set({ pilot_id: pilotId, updated_at: now } as any)
      .where("id", "=", flightId)
      .execute();
  },

  async assignAircraft(flightId: number, aircraftId: number): Promise<void> {
    const now = new Date().toISOString();
    await kdb
      .updateTable("flights")
      .set({ aircraft_id: aircraftId, updated_at: now } as any)
      .where("id", "=", flightId)
      .execute();
  },

  async approveByPilot(flightId: number, pilotId: number): Promise<void> {
    const now = new Date().toISOString();
    await kdb
      .updateTable("flights")
      .set({
        pilot_approved_at: now,
        status: "boarding",
        updated_at: now,
      } as any)
      .where("id", "=", flightId)
      .where("pilot_id", "=", pilotId)
      .execute();
  },

  async updateStatus(flightId: number, status: string): Promise<void> {
    const now = new Date().toISOString();
    await kdb
      .updateTable("flights")
      .set({ status, updated_at: now } as any)
      .where("id", "=", flightId)
      .execute();
  },

  async updateWeights(
    flightId: number,
    data: {
      total_passenger_weight_kg?: number;
      total_baggage_weight_kg?: number;
      total_freight_weight_kg?: number;
      total_fuel_weight_kg?: number;
    },
    client?: Kysely<DB>
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.total_passenger_weight_kg !== undefined) {
      updateData.total_passenger_weight_kg = String(data.total_passenger_weight_kg);
    }
    if (data.total_baggage_weight_kg !== undefined) {
      updateData.total_baggage_weight_kg = String(data.total_baggage_weight_kg);
    }
    if (data.total_freight_weight_kg !== undefined) {
      updateData.total_freight_weight_kg = String(data.total_freight_weight_kg);
    }
    if (data.total_fuel_weight_kg !== undefined) {
      updateData.total_fuel_weight_kg = String(data.total_fuel_weight_kg);
    }
    if (Object.keys(updateData).length === 0) return;
    updateData.updated_at = new Date().toISOString();
    await (client ?? kdb)
      .updateTable("flights")
      .set(updateData as any)
      .where("id", "=", flightId)
      .execute();
  },

  async deleteFlight(id: number): Promise<void> {
    await kdb.transaction().execute(async (tx) => {
      await tx
        .deleteFrom("flight_legs")
        .where("flight_id", "=", id)
        .execute();
      await tx
        .deleteFrom("flights")
        .where("id", "=", id)
        .execute();
    });
  },

  async findByScheduleId(scheduleId: number) {
    const flights = await kdb
      .selectFrom("flights as f")
      .leftJoin("aerodromes as ao", "ao.id", "f.origin_aerodrome_id")
      .leftJoin("aerodromes as ad", "ad.id", "f.destination_aerodrome_id")
      .leftJoin("aircraft as a", "a.id", "f.aircraft_id")
      .leftJoin("pilots as p", "p.id", "f.pilot_id")
      .select([
        "f.id",
        "f.flight_number",
        "f.origin_code",
        "f.destination_code",
        "f.origin_aerodrome_id",
        "f.destination_aerodrome_id",
        "f.aircraft_id",
        "f.pilot_id",
        "f.departure_time",
        "f.arrival_time",
        "f.status",
        "f.sort_order",
        "f.duration_minutes",
        "f.check_in_time",
        "f.available_seats",
        "f.base_fare",
        "f.intermediate_stops",
        "f.total_passenger_weight_kg",
        "f.total_baggage_weight_kg",
        "f.total_freight_weight_kg",
        "f.total_fuel_weight_kg",
        "f.fuel_weight",
        "f.freight_weight",
        "f.passenger_weight",
        "f.crew_weight",
        "f.baggage_weight",
        "f.pilot_approved_at",
        "f.schedule_id",
        "f.pax_weight_kg",
        "f.cargo_weight_kg",
        "f.zero_fuel_weight_kg",
        "f.fuel_required_l",
        "f.fuel_on_board_l",
        "f.created_by",
        "f.created_at",
        "f.updated_at",
        "ao.code as origin_code_join",
        "ao.name as origin_name_join",
        "ad.code as destination_code_join",
        "ad.name as destination_name_join",
        "a.registration as aircraft_registration",
        "a.type as aircraft_type",
        "a.seat_count",
        "p.name as pilot_name",
      ])
      .where("f.schedule_id", "=", scheduleId)
      .orderBy(sql`f.sort_order asc nulls last, f.departure_time asc`)
      .execute();

    return flights.map((f) => ({
      ...f,
      id: Number(f.id),
      flight_number: String(f.flight_number ?? ""),
      origin_code: (f.origin_code ?? f.origin_code_join ?? null) as string | null,
      origin_name: f.origin_name_join != null ? String(f.origin_name_join) : null,
      destination_code: (f.destination_code ?? f.destination_code_join ?? null) as string | null,
      destination_name: f.destination_name_join != null ? String(f.destination_name_join) : null,
      aircraft_registration: f.aircraft_registration != null ? String(f.aircraft_registration) : null,
      aircraft_type: f.aircraft_type != null ? String(f.aircraft_type) : null,
      seat_count: f.seat_count != null ? Number(f.seat_count) : null,
      pilot_name: f.pilot_name != null ? String(f.pilot_name) : null,
    }));
  },
};

export async function findSummaryById(
  flightId: number,
  client?: Kysely<DB>
): Promise<Record<string, unknown> | null> {
  const executor = client ?? kdb;
  const rows = await sql`
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
            0 AS flight_ordinal
     FROM flights f
     LEFT JOIN aerodromes ao ON ao.id = f.origin_aerodrome_id
     LEFT JOIN aerodromes ad ON ad.id = f.destination_aerodrome_id
     LEFT JOIN aircraft a ON a.id = f.aircraft_id
     LEFT JOIN pilots p ON p.id = f.pilot_id
     LEFT JOIN pilot_assignments pa ON pa.flight_id = f.id AND pa.status = 'confirmed'
     WHERE f.id = ${flightId}
  `.execute(executor);
  return (rows.rows[0] as unknown as Record<string, unknown>) ?? null;
}

export async function findLegsByFlightId(
  flightId: number,
  client?: Kysely<DB>
): Promise<Record<string, unknown>[]> {
  const executor = client ?? kdb;
  const rows = await sql`
    SELECT fl.id, fl.flight_id, fl.leg_number AS leg_sequence, fl.etd AS departure_time, fl.eta AS arrival_time, fl.status,
            fl.origin_code, fl.destination_code, fl.distance_nm, fl.heading
     FROM flight_legs fl
     WHERE fl.flight_id = ${flightId}
     ORDER BY fl.leg_number
  `.execute(executor);
  return rows.rows as unknown as Record<string, unknown>[];
}
