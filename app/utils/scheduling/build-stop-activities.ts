import { buildOrderedStopSequence, filterManifestsByRoute } from "./route-utils";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FlightLegRow {
  id: number;
  flight_id: number;
  leg_sequence: number;
  origin_code: string;
  destination_code: string;
  distance_nm: number | null;
  heading: number | null;
  departure_time: string | null;
  arrival_time: string | null;
  status: string;
}

export interface PassengerManifestRow {
  id: number;
  booking_leg_id: number;
  flight_leg_id: number;
  passenger_name: string;
  body_weight_kg: number;
  baggage_weight_kg: number;
  freight_weight_kg: number;
  origin_code: string;
  destination_code: string;
}

export interface StopActivity {
  aerodrome_code: string;
  leg_sequence: number;
  arriving_passengers: PassengerManifestRow[];
  departing_passengers: PassengerManifestRow[];
  arrival_time: string | null;
  departure_time: string | null;
  distance_nm: number | null;
  heading: number | null;
}

// ── Builder ──────────────────────────────────────────────────────────────────

export function buildStopActivities(
  flightLegs: FlightLegRow[],
  passengerManifests: PassengerManifestRow[],
  flight: { id: number; origin_code: string; destination_code: string; departure_time: string | null; arrival_time: string | null }
): StopActivity[] {
  const legsForFlight = flightLegs.filter((l) => l.flight_id === flight.id);

  // Build the set of aerodrome codes that belong to this flight's route.
  const flightCodes = new Set<string>();
  flightCodes.add(flight.origin_code);
  flightCodes.add(flight.destination_code);
  for (const leg of legsForFlight) {
    flightCodes.add(leg.origin_code);
    flightCodes.add(leg.destination_code);
  }

  // Filter manifests to only passengers whose booking leg route codes match
  // this flight's route. We trust the caller (findManifestsByFlightId) has
  // already filtered by booking_legs.flight_id — the canonical source of truth.
  // flight_leg_id is optimisation metadata; it must NOT gatekeep passenger visibility.
  const flightManifests = passengerManifests.filter(
    (p) => flightCodes.has(p.origin_code) && flightCodes.has(p.destination_code)
  );

  // Build ordered stop sequence via shared utility (single source of truth).
  // This must match the sequence used by createLoadsheetFromFlight to prevent
  // passenger-count drift between the flight card and loadsheet.
  const orderedCodes = buildOrderedStopSequence(
    { origin_code: flight.origin_code, destination_code: flight.destination_code },
    legsForFlight,
  );

  const routeValidManifests = filterManifestsByRoute(flightManifests, orderedCodes);

  if (legsForFlight.length === 0) {
    return [
      {
        aerodrome_code: flight.origin_code, leg_sequence: 0,
        arriving_passengers: [], departing_passengers: routeValidManifests.filter((p) => p.origin_code === flight.origin_code),
        arrival_time: null, departure_time: flight.departure_time, distance_nm: null, heading: null,
      },
      {
        aerodrome_code: flight.destination_code, leg_sequence: 1,
        arriving_passengers: routeValidManifests.filter((p) => p.destination_code === flight.destination_code),
        departing_passengers: [], arrival_time: flight.arrival_time, departure_time: null, distance_nm: null, heading: null,
      },
    ];
  }

  return orderedCodes.map((code, index) => {
    // For the first occurrence of a code, match as origin; for the last
    // occurrence of a duplicate, match as destination.
    const isLast = orderedCodes.lastIndexOf(code) === index && orderedCodes.indexOf(code) !== index;
    const leg = isLast
      ? legsForFlight.find((l) => l.destination_code === code && l.leg_sequence > (orderedCodes.indexOf(code) + 1))
      : legsForFlight.find((l) => l.origin_code === code) ?? legsForFlight[index - 1];
    return {
      aerodrome_code: code,
      leg_sequence: leg?.leg_sequence ?? index,
      arriving_passengers: routeValidManifests.filter((p) => p.destination_code === code),
      departing_passengers: routeValidManifests.filter((p) => p.origin_code === code),
      arrival_time: index === 0 ? null : leg?.arrival_time ?? null,
      departure_time: index === orderedCodes.length - 1 ? null : leg?.departure_time ?? null,
      distance_nm: leg?.distance_nm ?? null,
      heading: leg?.heading ?? null,
    };
  });
}
