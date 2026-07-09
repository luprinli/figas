import { db } from "./db.server";

/**
 * Derive the check-in time for a flight based on the previous flight
 * operated by the same aircraft on the same date.
 *
 * Ensures sufficient time for:
 *   1. Flight from last stop back to STY (if not already at STY)
 *   2. Refueling (30 minutes)
 *   3. Turnaround/prep (15 minutes)
 *
 * If no previous flight exists, returns the base check-in time (08:00).
 *
 * @param aircraftId - The aircraft
 * @param scheduleDate - Schedule date (YYY-MM-DD)
 * @param flightId - Current flight ID (to exclude from previous flight query)
 * @returns Check-in time string in "HH:MM" format
 */
export async function deriveCheckInTime(
  aircraftId: number,
  scheduleDate: string,
  flightId?: number
): Promise<string> {
  if (!aircraftId) return "08:00";

  // Find the previous flight for this aircraft on this date
  const prevFlight = await db.flights.findFirst({
    where: {
      aircraft_id: aircraftId,
      departure_time: {
        gte: new Date(`${scheduleDate}T00:00:00.000Z`),
        lt: new Date(`${scheduleDate}T23:59:59.999Z`),
      },
      ...(flightId ? { id: { not: flightId } } : {}),
    },
    orderBy: { departure_time: "desc" },
    select: {
      arrival_time: true,
      destination_code: true,
    },
  });

  if (!prevFlight) return "08:00";

  const prevArrival = new Date(prevFlight.arrival_time);
  const prevArrivalMinutes = prevArrival.getUTCHours() * 60 + prevArrival.getUTCMinutes();

  // If previous flight ended at STY, turnaround = 45 min
  if (prevFlight.destination_code === "STY") {
    const checkInMinutes = prevArrivalMinutes + 45;
    return minutesToHHMM(checkInMinutes);
  }

  // Otherwise: return flight to STY + refuel + prep
  const returnFlightMinutes = 30; // estimated return to STY
  const checkInMinutes = prevArrivalMinutes + returnFlightMinutes + 45;
  return minutesToHHMM(checkInMinutes);
}

/**
 * Assign sequential check-in times for all flights of an aircraft on a date.
 * Returns the check-in time for each flight ID.
 */
export async function assignCheckInTimes(
  flights: Array<{ id: number; aircraft_id: number | null }>
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  const byAircraft = new Map<number, Array<{ id: number }>>();
  for (const f of flights) {
    const aircraftId = f.aircraft_id ?? 0;
    if (!byAircraft.has(aircraftId)) byAircraft.set(aircraftId, []);
    byAircraft.get(aircraftId)!.push({ id: f.id });
  }

  for (const [, acFlights] of byAircraft) {
    let lastArrivalMinutes = 8 * 60; // base 08:00

    for (let i = 0; i < acFlights.length; i++) {
      const flight = acFlights[i];

      if (i === 0) {
        result.set(flight.id, "08:00");
        // Get this flight's duration from DB
        const f = await db.flights.findUnique({
          where: { id: flight.id },
          select: { duration_minutes: true, arrival_time: true },
        });
        if (f?.arrival_time) {
          const arr = new Date(f.arrival_time);
          lastArrivalMinutes = arr.getUTCHours() * 60 + arr.getUTCMinutes();
        } else if (f?.duration_minutes) {
          lastArrivalMinutes = 8 * 60 + f.duration_minutes;
        }
      } else {
        const checkInMinutes = lastArrivalMinutes + 45;
        result.set(flight.id, minutesToHHMM(checkInMinutes));

        const f = await db.flights.findUnique({
          where: { id: flight.id },
          select: { duration_minutes: true, arrival_time: true },
        });
        if (f?.arrival_time) {
          const arr = new Date(f.arrival_time);
          lastArrivalMinutes = arr.getUTCHours() * 60 + arr.getUTCMinutes();
        } else if (f?.duration_minutes) {
          lastArrivalMinutes = checkInMinutes + f.duration_minutes;
        }
      }
    }
  }

  return result;
}

/**
 * Compute flight duration in minutes from leg distances.
 */
export function computeFlightDuration(
  legs: Array<{ distance_nm: number }>,
  cruiseSpeedKtas: number = 140
): number {
  const totalNm = legs.reduce((s, l) => s + (l.distance_nm || 0), 0);
  return Math.round((totalNm / cruiseSpeedKtas) * 60);
}

function minutesToHHMM(minutes: number): string {
  const clamped = ((minutes % 1440) + 1440) % 1440; // wrap within 24h
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
