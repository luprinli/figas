import { db } from "../db.server";
import { FlightLegStatus } from "../../../generated/prisma/client";
import type { Prisma } from "../../../generated/prisma/client";

export interface FlightLegRow {
  id: number;
  flight_id: number;
  leg_sequence: number;
  origin_code: string;
  destination_code: string;
  departure_time: string | null;
  arrival_time: string | null;
  distance_nm: number | null;
  heading: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export const flightLegRepository = {
  async findById(id: number): Promise<FlightLegRow | null> {
    const leg = await db.flight_legs.findUnique({
      where: { id },
    });
    return (leg as unknown as FlightLegRow) ?? null;
  },

  async findByFlightId(flightId: number): Promise<FlightLegRow[]> {
    const legs = await db.flight_legs.findMany({
      where: { flight_id: flightId },
      orderBy: { leg_number: "asc" },
    });
    return legs as unknown as FlightLegRow[];
  },

  async findByScheduleId(scheduleId: number): Promise<FlightLegRow[]> {
    const legs = await db.flight_legs.findMany({
      where: { flight: { schedule_id: scheduleId } },
      orderBy: [{ flight_id: "asc" }, { leg_number: "asc" }],
    });
    return legs as unknown as FlightLegRow[];
  },

  async create(data: {
    flight_id: number;
    leg_sequence: number;
    origin_code: string;
    destination_code: string;
    departure_time?: string | null;
    arrival_time?: string | null;
    distance_nm?: number | null;
    heading?: number | null;
  }): Promise<FlightLegRow> {
    const leg = await db.flight_legs.create({
      data: {
        flight_id: data.flight_id,
        leg_number: data.leg_sequence,
        origin_code: data.origin_code,
        destination_code: data.destination_code,
        etd: data.departure_time ? new Date(data.departure_time) : null,
        eta: data.arrival_time ? new Date(data.arrival_time) : null,
        distance_nm: data.distance_nm ?? undefined,
        heading: data.heading ?? undefined,
      },
    });
    return leg as unknown as FlightLegRow;
  },

  async updateTimes(
    id: number,
    data: { departure_time?: string | null; arrival_time?: string | null }
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.departure_time !== undefined) {
      updateData.etd = data.departure_time ? new Date(data.departure_time) : null;
    }
    if (data.arrival_time !== undefined) {
      updateData.eta = data.arrival_time ? new Date(data.arrival_time) : null;
    }
    if (Object.keys(updateData).length === 0) return;
    await db.flight_legs.update({
      where: { id },
      data: updateData,
    });
  },

  async updateStatus(id: number, status: FlightLegStatus): Promise<void> {
    await db.flight_legs.update({
      where: { id },
      data: { status },
    });
  },

  async deleteByFlightId(flightId: number): Promise<void> {
    await db.flight_legs.deleteMany({
      where: { flight_id: flightId },
    });
  },

  async replaceFlightLegs(
    flightId: number,
    legs: { leg_sequence: number; origin_code: string; destination_code: string }[],
    client?: Prisma.TransactionClient
  ): Promise<FlightLegRow[]> {
    const exec = async (tx: Prisma.TransactionClient) => {
      await tx.flight_legs.deleteMany({
        where: { flight_id: flightId },
      });
      const inserted: FlightLegRow[] = [];
      for (const leg of legs) {
        const result = await tx.flight_legs.create({
          data: {
            flight_id: flightId,
            leg_number: leg.leg_sequence,
            origin_code: leg.origin_code,
            destination_code: leg.destination_code,
          },
        });
        inserted.push(result as unknown as FlightLegRow);
      }
      return inserted;
    };
    if (client) {
      return exec(client);
    }
    return db.$transaction(exec);
  },
};
