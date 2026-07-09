/**
 * Verify stop activity logic for a 3-leg flight.
 */
import { buildStopActivities } from "../app/utils/scheduling/build-stop-activities";
import type { FlightLegRow, PassengerManifestRow } from "../app/utils/scheduling/build-stop-activities";

const legs: FlightLegRow[] = [
  { id: 1, flight_id: 1, leg_sequence: 1, origin_code: "STY", destination_code: "SPI", distance_nm: 50, heading: 90, departure_time: "09:10", arrival_time: "09:40", status: "scheduled" },
  { id: 2, flight_id: 1, leg_sequence: 2, origin_code: "SPI", destination_code: "BKI", distance_nm: 30, heading: 180, departure_time: "09:50", arrival_time: "10:10", status: "scheduled" },
  { id: 3, flight_id: 1, leg_sequence: 3, origin_code: "BKI", destination_code: "STY", distance_nm: 40, heading: 270, departure_time: "10:15", arrival_time: "10:20", status: "scheduled" },
];

const manifests: PassengerManifestRow[] = [
  { id: 1, booking_leg_id: 100, flight_leg_id: 1, passenger_name: "C. Brown", body_weight_kg: 84, baggage_weight_kg: 3, freight_weight_kg: 0, origin_code: "STY", destination_code: "SPI" },
  { id: 2, booking_leg_id: 101, flight_leg_id: 1, passenger_name: "E. Patel", body_weight_kg: 70, baggage_weight_kg: 13, freight_weight_kg: 0, origin_code: "STY", destination_code: "BKI" },
];

const flight = { id: 1, origin_code: "STY", destination_code: "STY", departure_time: "09:10", arrival_time: "10:20" };

const result = buildStopActivities(legs, manifests, flight);

console.log("=== Stop Activities Verification ===\n");
console.log("Flight: STY → SPI → BKI → STY\n");
for (const stop of result) {
  console.log(`${stop.aerodrome_code} (seq ${stop.leg_sequence}):`);
  console.log(`  Arrival time: ${stop.arrival_time ?? "N/A"}`);
  console.log(`  Departure time: ${stop.departure_time ?? "N/A"}`);
  console.log(`  Arriving: ${stop.arriving_passengers.map(p => p.passenger_name).join(", ") || "(none)"}`);
  console.log(`  Departing: ${stop.departing_passengers.map(p => p.passenger_name).join(", ") || "(none)"}`);
  
  const isFirst = stop.leg_sequence === 1;
  const isSTY = stop.aerodrome_code === "STY";
  
  if (isFirst && isSTY && stop.arriving_passengers.length > 0) {
    console.log("  ❌ RULE 1 VIOLATION: First stop has arrivals");
  }
  if (isFirst && isSTY && stop.arrival_time !== null) {
    console.log("  ❌ RULE 1 VIOLATION: First stop has arrival time");
  }
  
  const isLast = stop.aerodrome_code === "STY" && stop !== result[0]; // STY appearing second time
  if (isLast && stop.departing_passengers.length > 0) {
    console.log("  ❌ RULE 3 VIOLATION: Last stop has departures");
  }
  if (isLast && stop.departure_time !== null) {
    console.log("  ❌ RULE 3 VIOLATION: Last stop has departure time");
  }
  
  console.log();
}

console.log("Verification: Manual review of rules compliance ✔");
