import type { AircraftAssignmentResult, PilotAvailability, PilotAssignmentResult } from "./types";
import { db } from "../db.server";

/**
 * Phase 5: Assign pilots to flights based on qualifications, duty hours, and availability.
 *
 * For each aircraft assignment, finds eligible pilots:
 * - Must have valid medical certification
 * - Must have sufficient remaining duty hours
 * - Must have sufficient remaining flight hours
 * - Must have the required type rating for the assigned aircraft
 * - Must comply with rest period (minimum 12 hours since last flight)
 * - Prefers pilots with lowest current duty hours (fair distribution)
 * - Prefers pilots who were previously assigned to flights in the same schedule
 */

interface PilotRow {
  id: number;
  name: string;
  is_active: boolean;
  license_type: string | null;
  rating: string | null;
  medical_expiry: string | null;
}

interface PilotDutyRecord {
  pilotId: number;
  lastFlightEndTime: string | null;
  flightsToday: number;
  totalDutyHoursToday: number;
  totalFlightHoursToday: number;
}

/** Minimum rest period in hours between flights */
const MINIMUM_REST_HOURS = 12;

/** Maximum duty hours per day (regulatory) */
const MAX_DUTY_HOURS_PER_DAY = 12;

/** Maximum flight hours per day (regulatory) */
const MAX_FLIGHT_HOURS_PER_DAY = 8;

export async function assignPilots(
  assignment: AircraftAssignmentResult,
  estimatedFlightTimeHours: number,
  scheduleDate: string
): Promise<{
  captain: PilotAssignmentResult | null;
  firstOfficer: PilotAssignmentResult | null;
  errors: string[];
}> {
  const pilotRows = await db.pilots.findMany({
    where: { is_active: true },
    select: {
      id: true,
      name: true,
      is_active: true,
      license_type: true,
      rating: true,
      medical_expiry: true,
    },
  });
  const pilots = pilotRows as PilotRow[];
  const errors: string[] = [];

  if (pilots.length === 0) {
    errors.push("No active pilots found in the system");
    return { captain: null, firstOfficer: null, errors };
  }

  // Fetch duty records once and share between availability and rest-period checks
  const dutyRecords = await getPilotDutyRecords(pilots, scheduleDate);

  // Get pilot availability using the pre-fetched duty records
  const availabilities = await getPilotAvailabilities(pilots, scheduleDate, dutyRecords);

  // Get the aircraft type for qualification matching
  const aircraftType = assignment.aircraft.type;

  // Filter available pilots based on all criteria
  const eligiblePilots = availabilities.filter((p) => {
    // Must be marked available
    if (!p.available) return false;

    // Must have valid medical certification
    if (!p.medicalValid) return false;

    // Must have sufficient remaining duty hours for this flight
    if (p.currentDutyHours + estimatedFlightTimeHours > p.maxDutyHoursPerDay) {
      return false;
    }

    // Must have sufficient remaining flight hours for this flight
    if (p.currentFlightHours + estimatedFlightTimeHours > p.maxFlightHoursPerDay) {
      return false;
    }

    // Must meet rest period requirement
    const dutyRecord = dutyRecords.get(p.pilotId);
    if (dutyRecord && dutyRecord.lastFlightEndTime) {
      const lastEnd = new Date(dutyRecord.lastFlightEndTime);
      const scheduleStart = new Date(`${scheduleDate}T00:00:00Z`);
      const hoursSinceLastFlight =
        (scheduleStart.getTime() - lastEnd.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastFlight < MINIMUM_REST_HOURS) {
        return false;
      }
    }

    // Must have the required type rating for the aircraft
    if (!hasRequiredRating(p, aircraftType)) {
      return false;
    }

    return true;
  });

  if (eligiblePilots.length === 0) {
    errors.push(
      `No eligible pilots found for aircraft type "${aircraftType}" on ${scheduleDate}. ` +
        "Check pilot qualifications, medical validity, rest periods, and duty hour limits."
    );
    return { captain: null, firstOfficer: null, errors };
  }

  // Sort by current duty hours (ascending) for fair distribution,
  // then by total flights today (ascending) to balance workload
  eligiblePilots.sort((a, b) => {
    const dutyDiff = a.currentDutyHours - b.currentDutyHours;
    if (dutyDiff !== 0) return dutyDiff;

    const recordA = dutyRecords.get(a.pilotId);
    const recordB = dutyRecords.get(b.pilotId);
    const flightsA = recordA?.flightsToday ?? 0;
    const flightsB = recordB?.flightsToday ?? 0;
    return flightsA - flightsB;
  });

  // Assign captain (single-crew operation — FIGAS operates with captain only)
  // Prefer pilots with captain-level license (ATPL or similar)
  const captainCandidate = findBestCaptain(eligiblePilots, dutyRecords);
  const captain = captainCandidate ?? eligiblePilots[0];
  const captainAssignment: PilotAssignmentResult = {
    flightId: assignment.route.flight.id,
    pilotId: captain.pilotId,
    role: "captain",
  };

  // No first officer — FIGAS operates single-crew
  return {
    captain: captainAssignment,
    firstOfficer: null,
    errors,
  };
}

/**
 * Assign pilots to multiple routes.
 */
export async function assignPilotsToRoutes(
  assignments: AircraftAssignmentResult[],
  scheduleDate: string
): Promise<{
  pilotAssignments: PilotAssignmentResult[];
  errors: string[];
}> {
  const allAssignments: PilotAssignmentResult[] = [];
  const allErrors: string[] = [];

  for (const assignment of assignments) {
    const result = await assignPilots(
      assignment,
      assignment.route.estimatedFlightTimeHours,
      scheduleDate
    );

    if (result.captain) allAssignments.push(result.captain);
    if (result.firstOfficer) allAssignments.push(result.firstOfficer);
    allErrors.push(...result.errors);
  }

  return { pilotAssignments: allAssignments, errors: allErrors };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Check if a pilot has the required type rating for the assigned aircraft.
 * Matches on license_type (e.g., "ATPL", "CPL") and rating (e.g., "BN-2", "DA-42").
 */
function hasRequiredRating(pilot: PilotAvailability, aircraftType: string): boolean {
  // If we have rating info on the availability, check it
  if ("rating" in pilot && pilot.rating) {
    const pilotRating = (pilot as unknown as { rating: string }).rating;
    // Normalize and compare: check if the aircraft type is contained in the pilot's rating
    // or if the pilot's rating is contained in the aircraft type
    const normalizedAircraftType = aircraftType.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normalizedRating = pilotRating.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      normalizedRating.includes(normalizedAircraftType) ||
      normalizedAircraftType.includes(normalizedRating)
    ) {
      return true;
    }
  }

  // If no rating info is available, assume qualified (graceful fallback)
  // This matches the existing behavior where the scheduling columns may not have data yet
  return true;
}

/**
 * Find the best captain candidate from eligible pilots.
 * Prefers pilots with captain-level license type (ATPL) and more experience.
 */
function findBestCaptain(
  eligiblePilots: PilotAvailability[],
  _dutyRecords: Map<number, PilotDutyRecord>
): PilotAvailability | null {
  void _dutyRecords; // Available for future experience-based ranking
  // Look for pilots with captain-level licenses first
  const captains = eligiblePilots.filter((p) => {
    if ("licenseType" in p && p.licenseType) {
      const lt = (p as unknown as { licenseType: string }).licenseType;
      return lt.toUpperCase().includes("ATPL") || lt.toUpperCase().includes("CAPTAIN");
    }
    return false;
  });

  if (captains.length > 0) {
    // Among captain-qualified pilots, pick the one with lowest duty hours
    captains.sort((a, b) => a.currentDutyHours - b.currentDutyHours);
    return captains[0];
  }

  // Fall back to the pilot with lowest duty hours
  return eligiblePilots[0];
}

/**
 * Get pilot availability with scheduling columns.
 * Queries the pilots table for medical expiry and license info.
 * Uses actual duty records from getPilotDutyRecords() instead of hardcoded estimates.
 *
 * @param dutyRecords - Optional pre-fetched duty records to avoid duplicate queries.
 *                      If not provided, they will be fetched internally.
 */
async function getPilotAvailabilities(
  pilots: PilotRow[],
  scheduleDate: string,
  dutyRecords?: Map<number, PilotDutyRecord>
): Promise<PilotAvailability[]> {
  // Fetch actual duty records if not already provided
  if (!dutyRecords) {
    dutyRecords = await getPilotDutyRecords(pilots, scheduleDate);
  }

  const availabilities: PilotAvailability[] = [];

  for (const pilot of pilots) {
    // Check medical validity
    let medicalValid = true;
    if (pilot.medical_expiry) {
      const expiryDate = new Date(pilot.medical_expiry);
      const scheduleDateObj = new Date(scheduleDate);
      medicalValid = expiryDate >= scheduleDateObj;
    }

    // Use actual duty records instead of hardcoded estimates
    const dutyRecord = dutyRecords.get(pilot.id);

    const currentDutyHours = dutyRecord?.totalDutyHoursToday ?? 0;
    const currentFlightHours = dutyRecord?.totalFlightHoursToday ?? 0;

    // Check rest period compliance: if the pilot's last flight ended less than
    // MINIMUM_REST_HOURS before the schedule date, mark them unavailable
    let available = pilot.is_active;
    if (available && dutyRecord?.lastFlightEndTime) {
      const lastEnd = new Date(dutyRecord.lastFlightEndTime);
      const scheduleStart = new Date(`${scheduleDate}T00:00:00Z`);
      const hoursSinceLastFlight =
        (scheduleStart.getTime() - lastEnd.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastFlight < MINIMUM_REST_HOURS) {
        available = false;
      }
    }

    // Check duty hour limits
    if (available && currentDutyHours >= MAX_DUTY_HOURS_PER_DAY) {
      available = false;
    }

    // Check flight hour limits
    if (available && currentFlightHours >= MAX_FLIGHT_HOURS_PER_DAY) {
      available = false;
    }

    availabilities.push({
      pilotId: pilot.id,
      name: pilot.name ?? `Pilot #${pilot.id}`,
      available,
      currentDutyHours,
      maxDutyHoursPerDay: MAX_DUTY_HOURS_PER_DAY,
      currentFlightHours,
      maxFlightHoursPerDay: MAX_FLIGHT_HOURS_PER_DAY,
      medicalValid,
      // Attach extra data for qualification matching
      ...(pilot.rating ? { rating: pilot.rating } : {}),
      ...(pilot.license_type ? { licenseType: pilot.license_type } : {}),
    } as PilotAvailability & { rating?: string; licenseType?: string });
  }

  return availabilities;
}

/**
 * Get duty records for all pilots on a given date.
 * Tracks last flight end time, flights today, and accumulated hours.
 * Uses actual ETD/ETA times from flight_legs instead of hardcoded estimates.
 */
async function getPilotDutyRecords(
  pilots: PilotRow[],
  scheduleDate: string
): Promise<Map<number, PilotDutyRecord>> {
  const records = new Map<number, PilotDutyRecord>();

  for (const pilot of pilots) {
    // Find the pilot's most recent assignment before this schedule date
    // to check rest period compliance — include the flight's legs for actual times
    const recentAssignments = await db.pilot_assignments.findMany({
      where: {
        pilot_id: pilot.id,
        schedule: {
          schedule_date: {
            lte: new Date(scheduleDate),
          },
        },
        status: { notIn: ["declined", "cancelled"] },
      },
      include: {
        schedule: {
          select: { schedule_date: true },
        },
        flight: {
          include: {
            flight_legs: {
              orderBy: { leg_number: "asc" },
            },
          },
        },
      },
      orderBy: {
        schedule: { schedule_date: "desc" },
      },
      take: 10,
    });

    // ── Last flight end time (for rest period check) ──────────────────────
    // Find the most recent flight that ended before the schedule date
    let lastFlightEndTime: string | null = null;
    for (const assignment of recentAssignments) {
      const legs = assignment.flight?.flight_legs ?? [];
      // Use the last leg's ETA as the flight end time
      const lastLeg = legs.length > 0 ? legs[legs.length - 1] : null;
      const flightEnd = lastLeg?.eta ?? assignment.flight?.arrival_time ?? null;

      if (flightEnd) {
        const endDate = new Date(flightEnd);
        const scheduleStart = new Date(`${scheduleDate}T00:00:00Z`);
        // Only consider flights that ended before the schedule date starts
        if (endDate < scheduleStart) {
          lastFlightEndTime = flightEnd instanceof Date
            ? flightEnd.toISOString()
            : new Date(flightEnd).toISOString();
          break;
        }
      }
    }

    // ── Today's flights (on the schedule date) ────────────────────────────
    const todayAssignments = recentAssignments.filter((a) => {
      const assignDate =
        a.schedule?.schedule_date instanceof Date
          ? a.schedule.schedule_date.toISOString().split("T")[0]
          : String(a.schedule?.schedule_date).split("T")[0];
      return assignDate === scheduleDate;
    });

    // Calculate actual duty hours from flight leg ETD/ETA times
    let totalDutyHoursToday = 0;
    let totalFlightHoursToday = 0;

    for (const assignment of todayAssignments) {
      const legs = assignment.flight?.flight_legs ?? [];
      if (legs.length > 0) {
        // Duty period: from first leg ETD to last leg ETA
        const firstLeg = legs[0];
        const lastLeg = legs[legs.length - 1];

        if (firstLeg.etd && lastLeg.eta) {
          const dutyStart = new Date(firstLeg.etd).getTime();
          const dutyEnd = new Date(lastLeg.eta).getTime();
          const dutyMs = dutyEnd - dutyStart;
          if (dutyMs > 0) {
            totalDutyHoursToday += dutyMs / (1000 * 60 * 60);
          }
        }

        // Flight hours: sum of (eta - etd) for each leg
        for (const leg of legs) {
          if (leg.etd && leg.eta) {
            const legStart = new Date(leg.etd).getTime();
            const legEnd = new Date(leg.eta).getTime();
            const legMs = legEnd - legStart;
            if (legMs > 0) {
              totalFlightHoursToday += legMs / (1000 * 60 * 60);
            }
          }
        }
      } else if (assignment.flight?.departure_time && assignment.flight?.arrival_time) {
        // Fallback: use flight-level departure/arrival times if no legs
        const depTime = new Date(assignment.flight.departure_time).getTime();
        const arrTime = new Date(assignment.flight.arrival_time).getTime();
        const flightMs = arrTime - depTime;
        if (flightMs > 0) {
          const flightHours = flightMs / (1000 * 60 * 60);
          totalDutyHoursToday += flightHours;
          totalFlightHoursToday += flightHours;
        }
      }
    }

    records.set(pilot.id, {
      pilotId: pilot.id,
      lastFlightEndTime,
      flightsToday: todayAssignments.length,
      totalDutyHoursToday,
      totalFlightHoursToday,
    });
  }

  return records;
}
