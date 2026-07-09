import type { ReferenceData, Itinerary, ItineraryLeg } from "./types.js";
import { randomInt, addDays, toISODate } from "./date-utils.js";

// ---------------------------------------------------------------------------
// Weighted itinerary type selection
// ---------------------------------------------------------------------------

export type ItineraryType = "one-way" | "round-trip" | "multi-stop";

/**
 * Pick itinerary type with weighted distribution:
 * - One-way: 40%
 * - Round-trip: 35%
 * - Multi-stop: 25%
 */
export function pickItineraryType(): ItineraryType {
  const r = Math.random();
  if (r < 0.4) return "one-way";
  if (r < 0.75) return "round-trip";
  return "multi-stop";
}

// ---------------------------------------------------------------------------
// Route selection
// ---------------------------------------------------------------------------

/**
 * Pick a random origin→destination pair from valid fare routes.
 *
 * If `biasCode` is provided, 60% of the time the route will involve that
 * code as either origin or destination.
 */
function pickRoute(
  refData: ReferenceData,
  biasCode: string | null,
  biasPct: number
): { origin: string; destination: string } {
  const validRoutes = refData.fareRoutes.filter(
    (r) => r.origin_code !== r.destination_code
  );

  // If bias is requested, try to find a route involving the bias code
  if (biasCode && Math.random() * 100 < biasPct) {
    const biasedRoutes = validRoutes.filter(
      (r) => r.origin_code === biasCode || r.destination_code === biasCode
    );
    if (biasedRoutes.length > 0) {
      const route = biasedRoutes[randomInt(0, biasedRoutes.length - 1)];
      return {
        origin: route.origin_code,
        destination: route.destination_code,
      };
    }
  }

  // Fall back to any valid route
  const route = validRoutes[randomInt(0, validRoutes.length - 1)];
  return {
    origin: route.origin_code,
    destination: route.destination_code,
  };
}

/**
 * Find a valid destination from a given origin.
 */
function findDestination(
  origin: string,
  fareRoutes: ReferenceData["fareRoutes"],
  exclude: Set<string> = new Set()
): string | null {
  const candidates = fareRoutes
    .filter((r) => r.origin_code === origin && !exclude.has(r.destination_code))
    .map((r) => r.destination_code);

  if (candidates.length === 0) return null;
  return candidates[randomInt(0, candidates.length - 1)];
}

// ---------------------------------------------------------------------------
// Build itineraries
// ---------------------------------------------------------------------------

/**
 * Build a single-leg itinerary (one-way).
 */
function buildOneWay(
  refData: ReferenceData,
  dateStr: string
): ItineraryLeg[] {
  const route = pickRoute(refData, "STY", 60);
  return [
    {
      origin: route.origin,
      destination: route.destination,
      leg_date: dateStr,
      flight_id: null,
    },
  ];
}

/**
 * Build a two-leg itinerary (round-trip).
 * Outbound on the booking date, return 1–14 days later.
 */
function buildRoundTrip(
  refData: ReferenceData,
  dateStr: string
): ItineraryLeg[] {
  const route = pickRoute(refData, "STY", 60);
  const stayDays = randomInt(1, 14);
  const returnDate = toISODate(addDays(new Date(dateStr + "T00:00:00"), stayDays));

  return [
    {
      origin: route.origin,
      destination: route.destination,
      leg_date: dateStr,
      flight_id: null,
    },
    {
      origin: route.destination,
      destination: route.origin,
      leg_date: returnDate,
      flight_id: null,
    },
  ];
}

/**
 * Build a multi-stop itinerary (3–4 legs).
 * Chains routes where destination of one leg is origin of the next.
 * Each subsequent leg is 0–3 days after the previous.
 */
function buildMultiStop(
  refData: ReferenceData,
  dateStr: string
): ItineraryLeg[] {
  const numLegs = randomInt(3, 4);
  const legs: ItineraryLeg[] = [];
  const baseDate = new Date(dateStr + "T00:00:00");

  // Pick the first route
  const firstRoute = pickRoute(refData, "STY", 60);
  let currentOrigin = firstRoute.origin;
  let currentDest = firstRoute.destination;
  let offset = 0;

  legs.push({
    origin: currentOrigin,
    destination: currentDest,
    leg_date: toISODate(addDays(baseDate, offset)),
    flight_id: null,
  });

  const usedDestinations = new Set<string>([currentOrigin, currentDest]);

  for (let i = 1; i < numLegs; i++) {
    currentOrigin = currentDest;
    const nextDest = findDestination(
      currentOrigin,
      refData.fareRoutes,
      usedDestinations
    );

    if (!nextDest) break; // no valid continuation, stop here

    offset += randomInt(0, 3);
    currentDest = nextDest;
    usedDestinations.add(currentDest);

    legs.push({
      origin: currentOrigin,
      destination: currentDest,
      leg_date: toISODate(addDays(baseDate, offset)),
      flight_id: null,
    });
  }

  return legs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a complete itinerary for a booking.
 *
 * @param refData  Reference data (aerodromes, fare routes)
 * @param dateStr  The booking date (YYYY-MM-DD)
 * @param bookingIndex  Sequential index for deterministic variation
 * @returns An Itinerary object
 */
export function buildItinerary(
  refData: ReferenceData,
  dateStr: string,
  _bookingIndex: number
): Itinerary {
  void _bookingIndex; // reserved for future use (deterministic variation)
  const type = pickItineraryType();

  let legs: ItineraryLeg[];

  switch (type) {
    case "one-way":
      legs = buildOneWay(refData, dateStr);
      break;
    case "round-trip":
      legs = buildRoundTrip(refData, dateStr);
      break;
    case "multi-stop":
      legs = buildMultiStop(refData, dateStr);
      break;
  }

  return { legs, type };
}
