import { db } from "../db.server";

export interface FareRouteRow {
  id: number;
  origin_code: string;
  destination_code: string;
  base_fare_gbp: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const fareRouteRepository = {
  async findByOriginDestination(originCode: string, destinationCode: string): Promise<FareRouteRow | null> {
    // Symmetric lookup: A→B or B→A
    const result = await db.fare_routes.findFirst({
      where: {
        is_active: true,
        OR: [
          { origin_code: originCode, destination_code: destinationCode },
          { origin_code: destinationCode, destination_code: originCode },
        ],
      },
    });
    return result as unknown as FareRouteRow | null;
  },

  async findByOrigin(originCode: string): Promise<FareRouteRow[]> {
    return db.fare_routes.findMany({
      where: { origin_code: originCode, is_active: true },
    }) as unknown as FareRouteRow[];
  },

  async findByDestination(destinationCode: string): Promise<FareRouteRow[]> {
    return db.fare_routes.findMany({
      where: { destination_code: destinationCode, is_active: true },
    }) as unknown as FareRouteRow[];
  },

  async findAll(): Promise<FareRouteRow[]> {
    return db.fare_routes.findMany({
      where: { is_active: true },
      orderBy: [{ origin_code: "asc" }, { destination_code: "asc" }],
    }) as unknown as FareRouteRow[];
  },

  async getBaseFare(originCode: string, destinationCode: string): Promise<number | null> {
    const route = await this.findByOriginDestination(originCode, destinationCode);
    return route ? Number(route.base_fare_gbp) : null;
  },
};
