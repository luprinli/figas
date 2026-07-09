/**
 * Comprehensive Flight Path & Passenger Audit
 * 
 * Checks:
 * 1. STY start/end integrity for all flight legs
 * 2. Duplicate stops (consecutive same aerodrome)
 * 3. Duplicate passengers across stops
 * 4. Cross-reference against scheduling code for root causes
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true }) });

interface FlightInfo {
  id: number;
  flight_number: string;
  schedule_date: string;
  schedule_id: number;
  departure_time: string;
  aircraft_id: number | null;
}

interface LegInfo {
  id: number;
  flight_id: number;
  leg_number: number;
  origin_code: string;
  destination_code: string;
}

interface PaxInfo {
  blp_id: number;
  flight_leg_id: number;
  passenger_name: string;
  booking_ref: string;
}

interface Issue {
  flight_number: string;
  severity: "error" | "warning";
  category: string;
  detail: string;
  rootCause: string;
  resolution: string;
}

async function main() {
  const issues: Issue[] = [];

  console.log("═══════════════════════════════════════════════════");
  console.log("  FLIGHT PATH & PASSENGER AUDIT");
  console.log("═══════════════════════════════════════════════════\n");

  // ── Load all flights with their legs ──
  const flights = await p.$queryRawUnsafe<FlightInfo[]>(`
    SELECT f.id, f.flight_number, s.schedule_date::text AS schedule_date, f.schedule_id,
           f.departure_time::text, f.aircraft_id
    FROM flights f
    JOIN schedules s ON s.id = f.schedule_id
    ORDER BY s.schedule_date, f.flight_number`);

  console.log(`Total flights: ${flights.length}\n`);

  let styStartOk = 0;
  let styEndOk = 0;
  let totalWithIssues = 0;

  // ── Load all legs ──
  const allLegs = await p.$queryRawUnsafe<LegInfo[]>(`
    SELECT fl.id, fl.flight_id, fl.leg_number, fl.origin_code, fl.destination_code
    FROM flight_legs fl ORDER BY flight_id, leg_number`);

  // ── Load all leg passenger assignments ──
  const allPax = await p.$queryRawUnsafe<PaxInfo[]>(`
    SELECT blp.id AS blp_id, blp.flight_leg_id,
           bp.first_name || ' ' || bp.last_name AS passenger_name,
           b.booking_reference
    FROM booking_leg_passengers blp
    JOIN booking_passengers bp ON bp.id = blp.booking_passenger_id
    JOIN booking_legs bl ON bl.id = blp.booking_leg_id
    JOIN bookings b ON b.id = bl.booking_id
    WHERE blp.flight_leg_id IS NOT NULL
    ORDER BY blp.flight_leg_id, bp.id`);

  console.log(`Total flight legs: ${allLegs.length}`);
  console.log(`Total passenger assignments: ${allPax.length}\n`);

  // ── Check 1: STY start/end per flight ──
  console.log("── Check 1: STY Start/End Integrity ──\n");

  for (const flight of flights) {
    const legs = allLegs.filter(l => l.flight_id === flight.id).sort((a, b) => a.leg_number - b.leg_number);
    if (legs.length === 0) continue;

    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];

    const firstIsSTY = firstLeg.origin_code === "STY";
    const lastIsSTY = lastLeg.destination_code === "STY";

    if (!firstIsSTY) {
      issues.push({
        flight_number: flight.flight_number,
        severity: "error",
        category: "STY start missing",
         detail: `Leg 1 origin is "${firstLeg.origin_code}" (expected STY). Flight date: ${flight.schedule_date}`,
         rootCause: "createFlightLegs() uses cluster.origin for first leg, not STANLEY constant. If cluster.origin != STY, first leg starts at wrong aerodrome.",
         resolution: "Fix createFlightLegs() to always use STY for the first leg origin instead of cluster.origin. The nearest-neighbor route is already built from STY, so the leg origin should match.",
      });
      totalWithIssues++;
    } else {
      styStartOk++;
    }

    if (!lastIsSTY) {
      issues.push({
        flight_number: flight.flight_number,
        severity: "error",
        category: "STY end missing",
        detail: `Last leg (${legs.length}) destination is "${lastLeg.destination_code}" (expected STY). Flight date: ${flight.schedule_date}`,
        rootCause: "The last stop in buildRoute() is always STY, but if the route's last stop isn't STY due to nearest-neighbor edge case, the last leg won't end at STY.",
        resolution: "Verify that buildRoute() always appends the STY return stop. Check nearestNeighborOrder() doesn't include STY in the ordered list.",
      });
      totalWithIssues++;
    } else {
      styEndOk++;
    }

    if (firstIsSTY && lastIsSTY) {
      // Log only 3-letter flights to keep output concise
      const short = flight.flight_number.length <= 25;
      if (short && legs.length > 2) {
        console.log(`  ✅ ${flight.flight_number.padEnd(25)} (${flight.schedule_date}): ${legs.map(l => l.origin_code).join("→")}→${lastLeg.destination_code} [${legs.length} legs]`);
      }
    } else {
      console.log(`  ❌ ${flight.flight_number.padEnd(25)} (${flight.schedule_date}): ${legs.map(l => l.origin_code).join("→")}→${lastLeg.destination_code} [${legs.length} legs]`);
    }
  }

  console.log(`\nSummary: STY start OK: ${styStartOk}/${flights.length} | STY end OK: ${styEndOk}/${flights.length} | Issues: ${totalWithIssues}\n`);

  // ── Check 2: Duplicate consecutive stops ──
  console.log("── Check 2: Duplicate Stops (Same aerodrome consecutively) ──\n");
  let dupStopCount = 0;
  for (const flight of flights) {
    const legs = allLegs.filter(l => l.flight_id === flight.id).sort((a, b) => a.leg_number - b.leg_number);
    for (let i = 0; i < legs.length - 1; i++) {
      if (legs[i].destination_code === legs[i+1].origin_code) continue; // Normal transition
      if (legs[i].destination_code === legs[i+1].destination_code) {
        issues.push({
          flight_number: flight.flight_number,
          severity: "warning",
          category: "Duplicate stop",
          detail: `Leg ${i+1} ends at ${legs[i].destination_code} which equals leg ${i+2} destination. Possible duplicate aerodrome visit.`,
          rootCause: "Aerodrome appears twice in the route. The nearestNeighborOrder should prevent visiting the same aero twice, but the aerodromesToVisit set may include it twice from different booking legs with same code.",
          resolution: "Ensure aerodromesToVisit in buildRoute() de-duplicates by using a Set (already done). If duplicates appear in legs, the issue is in how the stops map to legs.",
        });
        dupStopCount++;
      }
    }
  }
  console.log(`   Duplicate stop flights: ${dupStopCount}\n`);

  // ── Check 3: Duplicate passengers across stops ──
  console.log("── Check 3: Duplicate Passenger Assignments ──\n");
  let dupPaxCount = 0;
  for (const flight of flights) {
    const flightPax = allPax.filter(p => {
      const leg = allLegs.find(l => l.id === p.flight_leg_id);
      return leg && leg.flight_id === flight.id;
    });

    // Check for same passenger assigned to multiple legs of the same flight
    const paxCountByLeg = new Map<number, Map<string, number>>();
    for (const px of flightPax) {
      if (!paxCountByLeg.has(px.flight_leg_id)) paxCountByLeg.set(px.flight_leg_id, new Map());
      const legMap = paxCountByLeg.get(px.flight_leg_id)!;
      legMap.set(px.passenger_name, (legMap.get(px.passenger_name) ?? 0) + 1);
    }

    // Check for passengers appearing on multiple legs
    const passengerLegCount = new Map<string, Set<number>>();
    for (const px of flightPax) {
      if (!passengerLegCount.has(px.passenger_name)) passengerLegCount.set(px.passenger_name, new Set());
      passengerLegCount.get(px.passenger_name)!.add(px.flight_leg_id);
    }

    for (const [name, legIds] of passengerLegCount) {
      if (legIds.size > 1) {
        const legNums = Array.from(legIds).map(id => allLegs.find(l => l.id === id)?.leg_number).filter(Boolean).join(", ");
        issues.push({
          flight_number: flight.flight_number,
          severity: "error",
          category: "Duplicate passenger",
          detail: `Passenger "${name}" assigned to ${legIds.size} different legs (legs ${legNums}) in flight ${flight.flight_number}. Each passenger should appear in exactly one leg per flight.`,
          rootCause: "handleAssignBooking assigns ALL booking_leg_passengers to ALL flight_legs when a booking is dropped on a flight. Multi-leg flights get duplicate passenger assignments because the same passengers are assigned to every leg.",
          resolution: "In handleAssignBooking, only assign passengers to the FIRST leg or the LEG that matches the booking's origin/destination. Do not duplicate across all flight legs.",
        });
        dupPaxCount++;
      }
    }
  }
  console.log(`   Flights with duplicate passengers: ${dupPaxCount}\n`);

  // ── Check 4: Unassigned bookings with non-STY origins ──
  console.log("── Check 4: Booking Origin Integrity ──\n");
  const nonStyBookings = await p.$queryRawUnsafe<Array<{bl_id:number;ref:string;orig:string;dest:string;date:string}>>(`
    SELECT bl.id AS bl_id, b.booking_reference AS ref, bl.origin_code AS orig,
           bl.destination_code AS dest, bl.leg_date::text AS date
    FROM booking_legs bl JOIN bookings b ON b.id = bl.booking_id
    WHERE bl.flight_id IS NULL AND bl.origin_code != 'STY'
      AND b.status NOT IN ('cancelled', 'completed')
    ORDER BY bl.leg_date, b.booking_reference`);

  console.log(`   Unassigned bookings with non-STY origin: ${nonStyBookings.length}`);
  if (nonStyBookings.length > 0) {
    for (const b of nonStyBookings.slice(0, 10)) {
      console.log(`     ${b.ref}: ${b.orig} → ${b.dest} (${b.date})`);
      issues.push({
        flight_number: b.ref,
        severity: "warning",
        category: "Non-STY origin",
      detail: `Booking ${b.ref} has origin "${b.orig}" (not STY). Bookings may have any origin — this is NOT an error. Flight paths always start from STY via createFlightLegs().`,
      rootCause: "Seed script generates bookings with varied origins (75% STY, 25% other aerodromes). This is correct behavior — bookings can originate from any aerodrome. The flight path constraint is enforced separately by createFlightLegs() which always uses STY for the first leg origin.",
      resolution: "No action needed. Bookings with non-STY origins are valid. The createFlightLegs() function (app/utils/scheduling/index.ts:287) always starts flight legs from STY regardless of booking origin. The cluster.origin is used for the cluster's internal grouping, not for flight leg construction.",
      });
    }
  }

  // ── Final catalog ──
  console.log("\n═══════════════════════════════════════════════");
  console.log(`  AUDIT COMPLETE — ${issues.length} issues found`);
  console.log("═══════════════════════════════════════════════\n");

  if (issues.length > 0) {
    console.log("DETAILED ISSUE CATALOG:\n");
    for (let i = 0; i < issues.length; i++) {
      const iss = issues[i];
      console.log(`#${i+1} [${iss.severity.toUpperCase()}] ${iss.category}: ${iss.flight_number}`);
      console.log(`   Detail: ${iss.detail}`);
      console.log(`   Root Cause: ${iss.rootCause}`);
      console.log(`   Resolution: ${iss.resolution}`);
      console.log();
    }
  }

  await p.$disconnect();
}
main().catch(err => { console.error("Fatal:", err); process.exit(1); });
