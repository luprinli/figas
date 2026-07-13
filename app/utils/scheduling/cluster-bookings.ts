import { kdb } from "../db.server.kysely";
import { sql } from "kysely";
import type { BookingLegRow } from "../repositories/booking-leg";
import { bookingLegRepository } from "../repositories/booking-leg";
import type { ClusterResult } from "./types";

/**
 * Phase 1: Cluster unassigned booking legs by date, origin, and destination.
 * Groups legs that share the same date, origin, and destination into clusters
 * that can be served by a single sortie flight.
 */
export async function clusterBookings(): Promise<ClusterResult[]> {
  const unassignedLegs = await bookingLegRepository.findUnassignedLegs();

  if (unassignedLegs.length === 0) return [];

  // Group by date + origin + destination
  const groups = new Map<string, BookingLegRow[]>();

  for (const leg of unassignedLegs) {
    const dateStr = typeof leg.leg_date === "string"
      ? leg.leg_date.split("T")[0]
      : new Date(leg.leg_date).toISOString().split("T")[0];
    const key = `${dateStr}|${leg.origin_code}|${leg.destination_code}`;
    const existing = groups.get(key) ?? [];
    existing.push(leg);
    groups.set(key, existing);
  }

  // Batch-fetch UNASSIGNED passenger counts for ALL legs in a single query.
  // Only counts passengers where flight_leg_id IS NULL (unassigned to any flight leg).
  // This aligns with the per-passenger assignment model and ensures the auto-build
  // passenger count matches what the UI displays as unassigned.
  const legIds = unassignedLegs.map((l) => l.id);
  const countRows = legIds.length > 0
    ? (await sql<{ booking_leg_id: number; count: number }>`
        SELECT booking_leg_id, COUNT(*)::int AS count
        FROM booking_leg_passengers
        WHERE booking_leg_id = ANY(${legIds})
          AND flight_leg_id IS NULL
        GROUP BY booking_leg_id
      `.execute(kdb)).rows
    : [];
  const passengerCountMap = new Map<number, number>(
    countRows.map((r) => [r.booking_leg_id, r.count])
  );

  const clusters: ClusterResult[] = [];

  for (const [key, legs] of groups.entries()) {
    const [date, origin, destination] = key.split("|");

    // Sum passenger counts from the pre-fetched map
    let passengerCount = 0;
    for (const leg of legs) {
      passengerCount += passengerCountMap.get(leg.id) ?? 0;
    }

    clusters.push({
      date,
      legs,
      origin,
      destination,
      passengerCount,
    });
  }

  // Sort clusters by date, then by origin
  clusters.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.origin.localeCompare(b.origin);
  });

  return clusters;
}

/**
 * Split a cluster that exceeds aircraft capacity into multiple sub-clusters.
 * Uses greedy bin-packing: largest passenger groups first.
 */
export function splitOversizedCluster(
  cluster: ClusterResult,
  maxSeats: number,
  passengerCountMap: Map<number, number>
): ClusterResult[] {
  if (cluster.passengerCount <= maxSeats) return [cluster];

  const sorted = [...cluster.legs].sort(
    (a, b) => (passengerCountMap.get(b.id) ?? 0) - (passengerCountMap.get(a.id) ?? 0)
  );

  const results: ClusterResult[] = [];
  let current: BookingLegRow[] = [];
  let currentCount = 0;

  for (const leg of sorted) {
    const count = passengerCountMap.get(leg.id) ?? 0;
    if (currentCount + count > maxSeats && current.length > 0) {
      results.push({ ...cluster, legs: current, passengerCount: currentCount });
      current = [];
      currentCount = 0;
    }
    current.push(leg);
    currentCount += count;
  }

  if (current.length > 0) {
    results.push({ ...cluster, legs: current, passengerCount: currentCount });
  }

  return results;
}

/**
 * Get unassigned legs for a specific date.
 */
export async function clusterBookingsByDate(date: string): Promise<ClusterResult[]> {
  const allClusters = await clusterBookings();
  const normalized = date.split("T")[0];
  return allClusters.filter((c) => c.date === normalized);
}
