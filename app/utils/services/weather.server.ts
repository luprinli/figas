interface WeatherReport {
  aerodrome: string;
  metar: string;
  ceiling: number | null;
  visibility: number | null;
  windDir: number | null;
  windSpeed: number | null;
  temperature: number | null;
  dewpoint: number | null;
  altimeter: number | null;
  flightCategory: "VFR" | "MVFR" | "IFR" | "LIFR" | "UNKNOWN";
}

interface TAFReport {
  aerodrome: string;
  raw: string;
  forecastPeriods: Array<{
    startTime: string;
    endTime: string;
    windDir: number | null;
    windSpeed: number | null;
    visibility: number | null;
    ceiling: number | null;
    flightCategory: "VFR" | "MVFR" | "IFR" | "LIFR" | "UNKNOWN";
  }>;
}

const CACHE = new Map<string, { data: WeatherReport; timestamp: number }>();
const TTL_MS = 30 * 60 * 1000;

function parseFlightCategory(ceiling: number | null, visibility: number | null): WeatherReport["flightCategory"] {
  if (ceiling === null && visibility === null) return "UNKNOWN";
  const ceil = ceiling ?? Infinity;
  const vis = visibility ?? Infinity;
  if (ceil >= 3000 && vis >= 8) return "VFR";
  if (ceil >= 1000 && vis >= 5) return "MVFR";
  if (ceil >= 500 && vis >= 1.6) return "IFR";
  return "LIFR";
}

export async function fetchMetar(aerodromeCode: string): Promise<WeatherReport> {
  const cached = CACHE.get(aerodromeCode);
  if (cached && Date.now() - cached.timestamp < TTL_MS) {
    return cached.data;
  }

  try {
    const url = `https://aviationweather.gov/api/data/metar?ids=${aerodromeCode}&format=json`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });

    if (!response.ok) {
      const fallback: WeatherReport = {
        aerodrome: aerodromeCode,
        metar: "Weather data unavailable",
        ceiling: null, visibility: null, windDir: null, windSpeed: null,
        temperature: null, dewpoint: null, altimeter: null,
        flightCategory: "UNKNOWN",
      };
      return fallback;
    }

    const data = await response.json();
    const raw = Array.isArray(data) && data.length > 0 ? data[0] : null;

    const ceiling = raw?.clouds?.reduce((min: number, c: { base?: number }) =>
      c.base && c.base < min ? c.base : min, Infinity) ?? null;

    const report: WeatherReport = {
      aerodrome: aerodromeCode,
      metar: raw?.rawOb ?? "No METAR available",
      ceiling: ceiling === Infinity ? null : Math.round((ceiling ?? 0) * 0.3048),
      visibility: raw?.visib ? Math.round(raw.visib * 1609.34) : null,
      windDir: raw?.wdir ?? null,
      windSpeed: raw?.wspd ?? null,
      temperature: raw?.temp ?? null,
      dewpoint: raw?.dwpt ?? null,
      altimeter: raw?.altim ? Math.round(raw.altim * 33.8639) : null,
      flightCategory: parseFlightCategory(
        ceiling === Infinity ? null : Math.round((ceiling ?? 0) * 0.3048),
        raw?.visib ? Math.round(raw.visib * 1609.34) : null
      ),
    };

    CACHE.set(aerodromeCode, { data: report, timestamp: Date.now() });
    return report;
  } catch {
    return {
      aerodrome: aerodromeCode,
      metar: "Failed to fetch weather",
      ceiling: null, visibility: null, windDir: null, windSpeed: null,
      temperature: null, dewpoint: null, altimeter: null,
      flightCategory: "UNKNOWN",
    };
  }
}

export async function fetchTaf(aerodromeCode: string): Promise<TAFReport> {
  try {
    const url = `https://aviationweather.gov/api/data/taf?ids=${aerodromeCode}&format=json`;
    const response = await fetch(url);
    if (!response.ok) {
      return { aerodrome: aerodromeCode, raw: "TAF unavailable", forecastPeriods: [] };
    }
    const data = await response.json();
    const raw = Array.isArray(data) && data.length > 0 ? data[0] : null;

    return {
      aerodrome: aerodromeCode,
      raw: raw?.rawOb ?? "TAF unavailable",
      forecastPeriods: [],
    };
  } catch {
    return { aerodrome: aerodromeCode, raw: "TAF unavailable", forecastPeriods: [] };
  }
}

export function getFlightCategoryColor(category: WeatherReport["flightCategory"]): string {
  switch (category) {
    case "VFR": return "text-emerald-600";
    case "MVFR": return "text-amber-600";
    case "IFR": return "text-red-600";
    case "LIFR": return "text-fuchsia-600";
    default: return "text-slate-500";
  }
}
