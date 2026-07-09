import { db } from "./db.server";

/**
 * Convert an airframe_hours string ("HHHH:MM") to decimal hours.
 * Examples: "1234:30" → 1234.5, "0:45" → 0.75, null → 0
 */
export function parseHoursString(s: string | null | undefined): number {
  if (!s) return 0;
  const parts = s.split(":");
  const h = parseInt(parts[0] ?? "0", 10) || 0;
  const m = parseInt(parts[1] ?? "0", 10) || 0;
  return h + m / 60;
}

/**
 * Convert decimal hours to airframe_hours string format ("HHHH:MM").
 * Examples: 1234.5 → "1234:30", 0.75 → "0:45"
 */
export function formatHoursString(decimal: number): string {
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * Compute actual flight minutes from ATD/ATA time strings.
 * Accepts "HHMM", "HH:MM", or ISO timestamp formats.
 * Returns 0 if either time is missing or unparseable.
 */
export function computeActualMinutes(atd: string | null, ata: string | null): number {
  if (!atd || !ata) return 0;

  const parseTime = (s: string): number => {
    // Try ISO format first
    const isoMs = Date.parse(s);
    if (!isNaN(isoMs)) {
      const d = new Date(s);
      return d.getUTCHours() * 60 + d.getUTCMinutes();
    }
    // Try "HHMM" or "HH:MM" format
    const cleaned = s.replace(":", "");
    if (cleaned.length === 4) {
      const h = parseInt(cleaned.slice(0, 2), 10);
      const m = parseInt(cleaned.slice(2), 10);
      if (!isNaN(h) && !isNaN(m)) return h * 60 + m;
    }
    return 0;
  };

  const atdMin = parseTime(atd);
  const ataMin = parseTime(ata);
  if (atdMin === 0 && ataMin === 0) return 0;

  let diff = ataMin - atdMin;
  if (diff < 0) diff += 24 * 60; // overnight
  return diff;
}

/**
 * Result of checking whether an aircraft has sufficient hours
 * remaining before its next maintenance check.
 */
export interface AirframeFeasibilityResult {
  feasible: boolean;
  plannedDurationHours: number;
  hoursUntil500Check: number;
  hoursUntil1000Check: number;
  hoursUntilNextCheck: number;
  bindingCheck: "500hr" | "1000hr" | "next" | null;
  remainingAfterFlight: number;
}

/**
 * Check if an aircraft can perform a planned flight without exceeding
 * its next maintenance window. Uses a 20% safety buffer.
 *
 * @param aircraftId - The aircraft to check
 * @param plannedDurationHours - Planned flight duration in decimal hours
 * @returns Feasibility result with binding constraint details
 */
export async function checkAirframeFeasibility(
  aircraftId: number,
  plannedDurationHours: number
): Promise<AirframeFeasibilityResult> {
  const record = await db.airframe_hours.findFirst({
    where: { aircraft_id: aircraftId },
    orderBy: { last_reading_date: "desc" },
  });

  const hours500 = parseHoursString(record?.hours_until_500_check);
  const hours1000 = parseHoursString(record?.hours_until_1000_check);
  const hoursNext = parseHoursString(record?.hours_until_next_check);

  // 20% safety buffer for unplanned delays, weather, holding patterns
  const BUFFER = 1.2;
  const requiredWithBuffer = plannedDurationHours * BUFFER;

  let feasible = true;
  let bindingCheck: AirframeFeasibilityResult["bindingCheck"] = null;
  let remainingAfterFlight = 0;

  // Check against each interval, preferring the most restrictive
  if (hours500 > 0 && requiredWithBuffer > hours500) {
    feasible = false;
    bindingCheck = "500hr";
    remainingAfterFlight = hours500;
  }
  if (hours1000 > 0 && requiredWithBuffer > hours1000) {
    feasible = false;
    bindingCheck = "1000hr";
    remainingAfterFlight = Math.min(remainingAfterFlight || hours1000, hours1000);
  }
  if (hoursNext > 0 && requiredWithBuffer > hoursNext) {
    feasible = false;
    bindingCheck = "next";
    remainingAfterFlight = Math.min(remainingAfterFlight || hoursNext, hoursNext);
  }

  return {
    feasible,
    plannedDurationHours,
    hoursUntil500Check: hours500,
    hoursUntil1000Check: hours1000,
    hoursUntilNextCheck: hoursNext,
    bindingCheck,
    remainingAfterFlight,
  };
}

/**
 * Update airframe_hours after a flight completes using ACTUAL ATD/ATA times.
 * Increments total_hours and decrements all remaining-hours-until-check fields.
 *
 * @param aircraftId - The aircraft that flew
 * @param actualFlightMinutes - Actual flight duration in minutes (from ATD-ATA)
 */
export async function updateAirframeHoursFromActual(
  aircraftId: number,
  actualFlightMinutes: number
): Promise<void> {
  if (actualFlightMinutes <= 0 || !aircraftId) return;

  const actualHours = actualFlightMinutes / 60;

  const record = await db.airframe_hours.findFirst({
    where: { aircraft_id: aircraftId },
    orderBy: { last_reading_date: "desc" },
  });
  if (!record) return;

  const newTotal = parseHoursString(record.total_hours) + actualHours;
  const newUntil500 = Math.max(0, parseHoursString(record.hours_until_500_check) - actualHours);
  const newUntil1000 = Math.max(0, parseHoursString(record.hours_until_1000_check) - actualHours);
  const newUntilNext = Math.max(0, parseHoursString(record.hours_until_next_check) - actualHours);

  await db.airframe_hours.update({
    where: { id: record.id },
    data: {
      total_hours: formatHoursString(newTotal),
      hours_until_500_check: formatHoursString(newUntil500),
      hours_until_1000_check: formatHoursString(newUntil1000),
      hours_until_next_check: formatHoursString(newUntilNext),
      updated_at: new Date(),
    },
  });
}

/**
 * Get the most restrictive remaining hours for an aircraft.
 * Used by flight validation to include hours constraints.
 *
 * @param aircraftId - The aircraft to query
 * @returns Minimum remaining hours across all check intervals, or Infinity if no record
 */
export async function getMinRemainingHours(aircraftId: number): Promise<number> {
  const record = await db.airframe_hours.findFirst({
    where: { aircraft_id: aircraftId },
    orderBy: { last_reading_date: "desc" },
  });
  if (!record) return Infinity;

  const checks = [
    parseHoursString(record.hours_until_500_check),
    parseHoursString(record.hours_until_1000_check),
    parseHoursString(record.hours_until_next_check),
  ].filter((h) => h > 0);

  return checks.length > 0 ? Math.min(...checks) : Infinity;
}
