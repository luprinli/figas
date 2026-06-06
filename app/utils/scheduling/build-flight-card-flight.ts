import type { FlightCardFlight, PilotOption, AircraftOption } from "../../components/schedule/FlightCard";
import { buildStopActivities } from "./build-stop-activities";
import type { FlightLegRow, PassengerManifestRow } from "./build-stop-activities";
import { formatCompactName } from "../format-compact-name";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FlightSummaryRow {
  id: number;
  flight_number: string;
  origin_code: string;
  destination_code: string;
  departure_time: string | null;
  arrival_time: string | null;
  status: string;
  aircraft_registration: string | null;
  aircraft_type: string | null;
  seat_count: number;
  pilot_name: string | null;
  pilot_status: string | null;
  sort_order: number;
  duration_minutes: number | null;
  check_in_time: string | null;
  operational_notes: string | null;
  flight_ordinal: number | null;
  max_takeoff_weight_kg: number | null;
  max_landing_weight_kg: number | null;
  basic_empty_weight_kg: number | null;
  payload_kg: number | null;
  fuel_kg: number | null;
  crew_weight_kg: number | null;
}

// ── Builder ──────────────────────────────────────────────────────────────────

export function buildFlightCardFlight(
  flight: FlightSummaryRow,
  flightLegs: FlightLegRow[],
  passengerManifests: PassengerManifestRow[],
  canAssignPilot: boolean,
  availablePilots: PilotOption[],
  scheduleId: number,
  canAssignAircraft: boolean = false,
  availableAircraft: AircraftOption[] = []
): FlightCardFlight {
  // Normalize weight fields from raw SQL (PostgreSQL DECIMAL columns arrive
  // as strings from $queryRawUnsafe). Without this, += and + operators
  // perform string concatenation instead of numeric addition.
  const normalizedManifests = passengerManifests.map((p) => ({
    ...p,
    body_weight_kg: Number(p.body_weight_kg) || 0,
    baggage_weight_kg: Number(p.baggage_weight_kg) || 0,
    freight_weight_kg: Number(p.freight_weight_kg ?? 0) || 0,
  }));

  const stopActivities = buildStopActivities(flightLegs, normalizedManifests, flight);

  // Compute weight totals from per-flight stop activities (deduplicated).
  // A through passenger appears in both departing_passengers of their origin stop
  // and arriving_passengers of their destination stop — count them only once.
  const seenIds = new Set<number>();
  let totalPassengerWeight = 0;
  let totalBaggageWeight = 0;
  for (const sa of stopActivities) {
    for (const p of sa.departing_passengers) {
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        totalPassengerWeight += p.body_weight_kg;
        totalBaggageWeight += p.baggage_weight_kg;
      }
    }
    for (const p of sa.arriving_passengers) {
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        totalPassengerWeight += p.body_weight_kg;
        totalBaggageWeight += p.baggage_weight_kg;
      }
    }
  }

  // Freight weight: only count manifests that belong to this flight's stops.
  const flightBookingLegIds = new Set<number>();
  for (const sa of stopActivities) {
    for (const p of sa.departing_passengers) flightBookingLegIds.add(p.booking_leg_id);
    for (const p of sa.arriving_passengers) flightBookingLegIds.add(p.booking_leg_id);
  }
  const totalFreightWeight = normalizedManifests
    .filter((p) => flightBookingLegIds.has(p.booking_leg_id))
    .reduce((s, p) => s + p.freight_weight_kg, 0);

  return {
    id: flight.id,
    flight_number: flight.flight_number,
    origin_code: flight.origin_code,
    destination_code: flight.destination_code,
    departure_time: flight.departure_time,
    arrival_time: flight.arrival_time,
    status: flight.status,
    aircraft_registration: flight.aircraft_registration,
    seat_count: flight.seat_count,
    total_passenger_weight_kg: totalPassengerWeight,
    total_baggage_weight_kg: totalBaggageWeight,
    total_freight_weight_kg: totalFreightWeight,
    schedule_id: scheduleId,
    canAssignPilot,
    availablePilots,
    canAssignAircraft,
    availableAircraft,
    flight_legs: flightLegs.filter((l) => l.flight_id === flight.id).map((l) => ({
      leg_sequence: l.leg_sequence, origin_code: l.origin_code, destination_code: l.destination_code,
      departure_time: l.departure_time, arrival_time: l.arrival_time, distance_nm: l.distance_nm, heading: l.heading,
    })),
    stop_manifests: stopActivities.map((sa) => ({
      aerodrome_code: sa.aerodrome_code, aerodrome_name: sa.aerodrome_code, leg_sequence: sa.leg_sequence,
      departing_passengers: sa.departing_passengers.map((p) => ({
        id: p.id, booking_leg_id: p.booking_leg_id, compact_name: formatCompactName(p.passenger_name),
        body_weight_kg: p.body_weight_kg, baggage_weight_kg: p.baggage_weight_kg,
        destination_code: p.destination_code,
      })),
      arriving_passengers: sa.arriving_passengers.map((p) => ({
        id: p.id, booking_leg_id: p.booking_leg_id, compact_name: formatCompactName(p.passenger_name),
        body_weight_kg: p.body_weight_kg, baggage_weight_kg: p.baggage_weight_kg,
        destination_code: p.destination_code,
      })),
      net_body_weight_change:
        sa.departing_passengers.reduce((s, p) => s + p.body_weight_kg, 0) -
        sa.arriving_passengers.reduce((s, p) => s + p.body_weight_kg, 0),
      net_baggage_weight_change:
        sa.departing_passengers.reduce((s, p) => s + p.baggage_weight_kg, 0) -
        sa.arriving_passengers.reduce((s, p) => s + p.baggage_weight_kg, 0),
    })),
    pilot_name: flight.pilot_name,
    pilot_status: flight.pilot_status,
    aircraft_type: flight.aircraft_type,
    duration_minutes: flight.duration_minutes,
    check_in_time: flight.check_in_time,
    flight_ordinal: flight.flight_ordinal,
    operational_notes: flight.operational_notes,
    max_takeoff_weight_kg: flight.max_takeoff_weight_kg ?? undefined,
    max_landing_weight_kg: flight.max_landing_weight_kg ?? undefined,
    empty_weight_kg: flight.basic_empty_weight_kg ?? undefined,
  };
}
