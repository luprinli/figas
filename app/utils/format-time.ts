/**
 * Formats an ISO date string to HH:MM (24-hour) in en-GB locale.
 * Returns null for null/empty input or invalid dates.
 */
export function formatTimeHM(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

/**
 * Formats a value to HHMM compact time string (24-hour, no colon).
 * Handles Date objects, ISO datetime strings, and plain time strings (HH:MM or HH:MM:SS).
 * Returns null for null/empty input or invalid values.
 */
export function formatTime(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    const h = String(value.getUTCHours()).padStart(2, "0");
    const m = String(value.getUTCMinutes()).padStart(2, "0");
    return `${h}${m}`;
  }
  if (typeof value === "string") {
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(value.trim())) {
      const parts = value.split(":");
      return `${parts[0].padStart(2, "0")}${parts[1]}`;
    }
    const cleaned = value.replace(/^1970-01-01T/, "").replace(/\.000Z$/, "").replace(/:\d{2}\.\d{3}Z$/, "").substring(0, 5);
    return cleaned?.replace(":", "") || null;
  }
  return null;
}

/**
 * Formats a plain time string (HH:MM:SS or HH:MM) to HH:MM display format.
 * Returns an em-dash for null/empty input.
 */
export function formatSimpleTime(timeStr: string | null): string {
  if (!timeStr) return "\u2014";
  const parts = timeStr.split(":");
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, "0")}:${parts[1]}`;
  }
  return timeStr;
}
