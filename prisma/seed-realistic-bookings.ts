/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Seed Realistic Random Bookings for Next 6 Months
 *
 * Generates ~80-100 realistic bookings spread across the next 6 months,
 * properly populating ALL four tables:
 *   bookings, booking_legs, booking_passengers, booking_leg_passengers.
 *
 * Uses real data from the database: all 31 active aerodromes, real users
 * (customers, agents, staff), organizations, and existing fares/flights.
 *
 * Usage:
 *   # Dry run (report only, no writes):
 *   node --env-file .env --import tsx prisma/seed-realistic-bookings.ts
 *
 *   # Execute (writes to database):
 *   node --env-file .env --import tsx prisma/seed-realistic-bookings.ts --execute
 */

import { kdb } from "../app/utils/db.server";
import { isNoFlyDay } from "../app/utils/services/no-fly.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlightInfo {
  id: number;
  flight_number: string;
  departure_time: string;
  origin_code: string | undefined | null;
  destination_code: string | undefined | null;
}

interface UserInfo {
  id: number;
  name: string;
  role: string;
  email: string;
  is_active: boolean;
}

interface GeneratedPassenger {
  first_name: string;
  last_name: string;
  clothed_body_weight_kg: number;
  nationality: string;
  baggage_weight_kg: number;
  freight_weight_kg: number;
  seat_number: string | null;
}

interface GeneratedBookingLeg {
  origin_code: string;
  destination_code: string;
  leg_date: string;
  leg_sequence: number;
  flight_id: number | null;
}

interface GeneratedBooking {
  booking_reference: string;
  user_id: number;
  status: string;
  booking_source: string;
  organization_id: number | null;
  legs: GeneratedBookingLeg[];
  passengers: GeneratedPassenger[];
}

interface SeedReport {
  dry_run: boolean;
  timestamp: string;
  date_range: { start: string; end: string };
  aerodrome_count: number;
  route_count: number;
  planned: {
    total_bookings: number;
    total_legs: number;
    total_passengers: number;
    total_leg_passengers: number;
    assigned_legs: number;
    unassigned_legs: number;
    multi_leg_bookings: number;
    round_trip_bookings: number;
    skipped_no_fly_days: number;
    customer_direct: number;
    travel_agent: number;
    ops_staff: number;
    org_bookings: number;
  };
  details: {
    booking_references: string[];
    sample_bookings: {
      ref: string;
      source: string;
      legs: number;
      passengers: number;
      leg_passengers: number;
      routes: string[];
      assigned: boolean;
    }[];
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Realistic first names */
const FIRST_NAMES = [
  "James", "Emma", "William", "Olivia", "Thomas", "Sophie", "Henry", "Amelia",
  "Alexander", "Isla", "Daniel", "Mia", "Samuel", "Charlotte", "Joseph", "Grace",
  "Benjamin", "Lily", "Jack", "Emily", "Harry", "Chloe", "Matthew", "Lucy",
  "David", "Alice", "Andrew", "Ella", "George", "Hannah", "Oscar", "Daisy",
];

/** Realistic last names */
const LAST_NAMES = [
  "MacLeod", "Bennett", "Short", "Binnie", "Blake", "Carroll", "Davies",
  "Elliot", "Ferguson", "Graham", "Harrison", "Irving", "Jones", "Knight",
  "Lambert", "McDonald", "Newman", "Owen", "Parker", "Quinn", "Robertson",
  "Sinclair", "Taylor", "Urquhart", "Vaughan", "Watson", "Young", "Armstrong",
  "Barrett", "Cooper", "Dawson", "Edwards", "Fletcher", "Gordon", "Hughes",
];

/** Nationality options */
const NATIONALITIES = [
  "Falkland Islander", "British", "British", "British",
  "Chilean", "Argentine", "Uruguayan", "Brazilian",
  "Australian", "New Zealander", "Canadian", "British",
];

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function dateStrToDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// Data generation helpers
// ---------------------------------------------------------------------------

function generatePassenger(): GeneratedPassenger {
  const first_name = randomPick(FIRST_NAMES);
  const last_name = randomPick(LAST_NAMES);
  const clothed_body_weight_kg = roundTo1(randomInt(40, 120));
  const nationality = randomPick(NATIONALITIES);
  const baggage_weight_kg = roundTo1(randomInt(5, 25));
  const hasFreight = Math.random() < 0.25;
  const freight_weight_kg = hasFreight ? roundTo1(randomInt(5, 30)) : 0;

  return {
    first_name,
    last_name,
    clothed_body_weight_kg,
    nationality,
    baggage_weight_kg,
    freight_weight_kg,
    seat_number: null,
  };
}

type BookingType = "single" | "round_trip" | "multi_leg";

function generateBookingLegs(
  routePairs: [string, string][],
  bookingDateStr: string,
  _existingFlights: FlightInfo[],
): { legs: GeneratedBookingLeg[]; bookingType: BookingType } {
  void _existingFlights;
  const rand = Math.random();

  function pickRoute(): [string, string] {
    return randomPick(routePairs);
  }

  if (rand < 0.55) {
    const [origin, destination] = pickRoute();
    return {
      legs: [
        { origin_code: origin, destination_code: destination, leg_date: bookingDateStr, leg_sequence: 1, flight_id: null },
      ],
      bookingType: "single",
    };
  }

  if (rand < 0.85) {
    const [origin, destination] = pickRoute();
    const returnDays = randomInt(2, 10);
    const returnDate = addDays(dateStrToDate(bookingDateStr), returnDays);

    return {
      legs: [
        { origin_code: origin, destination_code: destination, leg_date: bookingDateStr, leg_sequence: 1, flight_id: null },
        { origin_code: destination, destination_code: origin, leg_date: formatDate(returnDate), leg_sequence: 2, flight_id: null },
      ],
      bookingType: "round_trip",
    };
  }

  const legCount = randomInt(2, 3);
  const legs: GeneratedBookingLeg[] = [];
  let currentDate = dateStrToDate(bookingDateStr);

  let prevDest = "";
  for (let i = 0; i < legCount; i++) {
    const candidates = i === 0
      ? routePairs
      : routePairs.filter(([o]) => o === prevDest);

    const [origin, destination] = candidates.length > 0 ? randomPick(candidates) : pickRoute();

    legs.push({
      origin_code: origin,
      destination_code: destination,
      leg_date: formatDate(currentDate),
      leg_sequence: i + 1,
      flight_id: null,
    });
    prevDest = destination;
    currentDate = addDays(currentDate, randomInt(0, 2));
  }

  return { legs, bookingType: "multi_leg" };
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const dryRun = !execute;

  console.log(
    `\n${"=".repeat(70)}\n` +
    `  FIGAS Booking Seed Script (v2 — real DB data)\n` +
    `  Mode: ${dryRun ? "DRY RUN (no writes)" : "EXECUTE (will write to DB)"}\n` +
    `${"=".repeat(70)}\n`,
  );

  // ── 1. Fetch ALL reference data ─────────────────────────────────────────
  console.log("Fetching reference data from database...\n");

  const [aerodromes, existingFlights, users, organisations, faresRaw, existingBookings] =
    await Promise.all([
      kdb.selectFrom("aerodromes")
        .select(["code", "name", "city", "is_active"])
        .where("is_active", "=", true)
        .orderBy("code asc")
        .execute(),
      kdb.selectFrom("flights")
        .select(["id", "flight_number", "departure_time", "origin_code", "destination_code"])
        .orderBy("departure_time desc")
        .limit(500)
        .execute(),
      kdb.selectFrom("users")
        .select(["id", "name", "role", "email", "is_active"])
        .where("is_active", "=", true)
        .execute(),
      kdb.selectFrom("organizations")
        .select(["id", "name"])
        .where("is_active", "=", true)
        .execute(),
      kdb.selectFrom("fare_routes")
        .select(["origin_code", "destination_code", "base_fare_gbp"])
        .where("is_active", "=", true)
        .orderBy(["origin_code asc", "destination_code asc"])
        .execute(),
      kdb.selectFrom("bookings")
        .select("booking_reference")
        .orderBy("id desc")
        .limit(200)
        .execute(),
    ]);

  const activeCodes = aerodromes.map((a) => a.code);
  console.log(`  Active aerodromes: ${activeCodes.length} (${activeCodes.join(", ")})`);
  console.log(`  Existing flights: ${existingFlights.length}`);
  console.log(`  Active users: ${users.length}`);
  console.log(`  Organisations: ${organisations.length}`);
  console.log(`  Fares: ${faresRaw.length}`);
  console.log(`  Existing bookings (ref check): ${existingBookings.length}\n`);

  if (activeCodes.length < 2) {
    console.error("ERROR: Need at least 2 active aerodromes.");
    process.exit(1);
  }

  // ── 2. Classify users ──────────────────────────────────────────────────
  const customerUsers = users.filter(
    (u) => u.role === "passenger" || u.email.includes("@example.com")
  );
  const staffUsers = users.filter(
    (u) => u.email.includes("@figas.gov.fk") &&
    !["pilot"].includes(u.role) &&
    u.role !== "passenger"
  );

  console.log(`  Customer users (for self-service): ${customerUsers.length}`);
  console.log(`  Staff/agent users: ${staffUsers.length}\n`);

  if (staffUsers.length === 0) {
    console.log("  Note: No staff users found, all bookings will use customer users.\n");
  }

  // ── 3. Build route pairs from real fares data ───────────────────────────
  const fareSet = new Set<string>();
  for (const f of faresRaw) {
    if (f.origin_code !== f.destination_code) {
      fareSet.add(`${f.origin_code}|${f.destination_code}`);
    }
  }

  const routePairs: [string, string][] = [];
  for (const pair of fareSet) {
    const [o, d] = pair.split("|");
    if (activeCodes.includes(o) && activeCodes.includes(d)) {
      routePairs.push([o, d]);
    }
  }

  // Fill in missing pairs (aerodromes not in fares table) with bidirectional routes
  for (let i = 0; i < activeCodes.length; i++) {
    for (let j = i + 1; j < activeCodes.length; j++) {
      const o = activeCodes[i];
      const d = activeCodes[j];
      if (!fareSet.has(`${o}|${d}`)) {
        routePairs.push([o, d]);
      }
      if (!fareSet.has(`${d}|${o}`)) {
        routePairs.push([d, o]);
      }
    }
  }

  console.log(`  Route pairs available: ${routePairs.length}\n`);

  if (routePairs.length === 0) {
    console.error("ERROR: No valid routes found.");
    process.exit(1);
  }

  // ── 4. Compute date range ──────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = addDays(today, 1);
  const endDate = addDays(today, 183);

  console.log(`Date range: ${formatDate(startDate)} → ${formatDate(endDate)}\n`);

  // ── 5. Determine booking ref starting index ────────────────────────────
  const existingRefs = new Set(existingBookings.map((b) => b.booking_reference));

  // Find max FIG-##### index
  let maxFigIndex = 0;
  for (const ref of existingRefs) {
    const match = ref.match(/^FIG-(\d{5})$/);
    if (match) {
      maxFigIndex = Math.max(maxFigIndex, parseInt(match[1], 10));
    }
  }

  let refIndex = maxFigIndex + 1;

  // ── 6. Compute flyable days ────────────────────────────────────────────
  console.log("Computing flyable days (checking no-fly rules)...\n");

  const allDays: string[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    allDays.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }

  const flyableDays: string[] = [];
  let noFlyCount = 0;
  let checked = 0;

  for (const dateStr of allDays) {
    checked++;
    if (checked % 50 === 0) {
      console.log(`  Checking no-fly rules... ${checked}/${allDays.length}`);
    }
    const isNoFly = await isNoFlyDay(dateStr);
    if (isNoFly) {
      noFlyCount++;
    } else {
      flyableDays.push(dateStr);
    }
  }

  console.log(
    `\n  Total days in range: ${allDays.length}`,
  );
  console.log(`  No-fly days excluded: ${noFlyCount}`);
  console.log(`  Flyable days: ${flyableDays.length}\n`);

  if (flyableDays.length === 0) {
    console.error("ERROR: No flyable days in the 6-month range.");
    process.exit(1);
  }

  // ── 7. Index flights for assignment during generation ──────────────────
  const flightMap = new Map<string, FlightInfo[]>();
  for (const f of existingFlights) {
    if (f.origin_code) {
      const key = f.origin_code;
      if (!flightMap.has(key)) flightMap.set(key, []);
      flightMap.get(key)!.push(f);
    }
  }

  // ── 8. Generate bookings ───────────────────────────────────────────────
  console.log("Generating bookings...\n");

  const targetBookings = Math.min(100, Math.max(80, Math.floor(flyableDays.length * 0.55)));

  // Weight days: more bookings on weekdays
  const weightedDays: { date: string; weight: number }[] = flyableDays.map((d) => {
    const dayOfWeek = dateStrToDate(d).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    return { date: d, weight: isWeekend ? 2 : 5 };
  });
  const totalWeight = weightedDays.reduce((sum, d) => sum + d.weight, 0);

  const generatedBookings: GeneratedBooking[] = [];
  const usedReferences = new Set<string>();

  for (let i = 0; i < targetBookings; i++) {
    // Pick a weighted random date
    let remaining = Math.random() * totalWeight;
    let chosenDay = weightedDays[0].date;
    for (const wd of weightedDays) {
      remaining -= wd.weight;
      if (remaining <= 0) { chosenDay = wd.date; break; }
    }

    // Generate unique reference
    let bookingRef = `FIG-${String(refIndex).padStart(5, "0")}`;
    while (existingRefs.has(bookingRef) || usedReferences.has(bookingRef)) {
      refIndex++;
      bookingRef = `FIG-${String(refIndex).padStart(5, "0")}`;
    }
    usedReferences.add(bookingRef);
    refIndex++;

    // Determine booking source and user
    let user: UserInfo;
    let booking_source: string;
    let organization_id: number | null = null;

    const sourceRoll = Math.random();

    if (sourceRoll < 0.35 && customerUsers.length > 0) {
      user = randomPick(customerUsers);
      booking_source = "customer_direct";
    } else if (sourceRoll < 0.70 && staffUsers.length > 0) {
      user = randomPick(staffUsers);
      booking_source = "travel_agent";
      if (organisations.length > 0 && Math.random() < 0.3) {
        organization_id = randomPick(organisations).id;
      }
    } else {
      user = staffUsers.length > 0 ? randomPick(staffUsers) : randomPick(customerUsers);
      booking_source = "ops_staff";
      if (organisations.length > 0 && Math.random() < 0.4) {
        organization_id = randomPick(organisations).id;
      }
    }

    // Generate legs
    const { legs: rawLegs, bookingType } = generateBookingLegs(routePairs, chosenDay, existingFlights);

    // Try to assign ~25% of single-leg bookings to existing future flights
    const shouldAssign = bookingType === "single" && Math.random() < 0.25;

    const legs: GeneratedBookingLeg[] = rawLegs.map((leg) => {
      if (!shouldAssign) return leg;

      const candidates = flightMap.get(leg.origin_code);
      if (candidates && candidates.length > 0) {
        const legDate = dateStrToDate(leg.leg_date);
        const matchingFlight = candidates.find((f) => {
          if (f.destination_code !== leg.destination_code) return false;
          const flightDate = new Date(f.departure_time);
          const diffMs = Math.abs(flightDate.getTime() - legDate.getTime());
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          return diffDays <= 3;
        });
        if (matchingFlight) {
          return { ...leg, flight_id: matchingFlight.id };
        }
      }
      return leg;
    });

    // Generate 1-4 passengers (weighted toward 1-2)
    const passengerCountWeights = [0.4, 0.35, 0.15, 0.1];
    let passengerTarget = 1;
    const pRand = Math.random();
    let cumulative = 0;
    for (let j = 0; j < passengerCountWeights.length; j++) {
      cumulative += passengerCountWeights[j];
      if (pRand <= cumulative) { passengerTarget = j + 1; break; }
    }

    const passengers: GeneratedPassenger[] = [];
    for (let p = 0; p < passengerTarget; p++) {
      passengers.push(generatePassenger());
    }

    generatedBookings.push({
      booking_reference: bookingRef,
      user_id: user.id,
      status: "confirmed",
      booking_source,
      organization_id,
      legs,
      passengers,
    });
  }

  // ── 9. Compute statistics ──────────────────────────────────────────────
  const totalLegs = generatedBookings.reduce((s, b) => s + b.legs.length, 0);
  const totalPassengers = generatedBookings.reduce((s, b) => s + b.passengers.length, 0);
  const totalLegPassengers = generatedBookings.reduce(
    (s, b) => s + b.legs.length * b.passengers.length, 0,
  );
  const assignedLegs = generatedBookings.reduce(
    (s, b) => s + b.legs.filter((l) => l.flight_id !== null).length, 0,
  );
  const multiLegBookings = generatedBookings.filter((b) => b.legs.length > 1).length;
  const roundTripBookings = generatedBookings.filter(
    (b) =>
      b.legs.length === 2 &&
      b.legs[0].origin_code === b.legs[1].destination_code &&
      b.legs[0].destination_code === b.legs[1].origin_code,
  ).length;
  const customerDirect = generatedBookings.filter((b) => b.booking_source === "customer_direct").length;
  const travelAgent = generatedBookings.filter((b) => b.booking_source === "travel_agent").length;
  const opsStaff = generatedBookings.filter((b) => b.booking_source === "ops_staff").length;
  const orgBookings = generatedBookings.filter((b) => b.organization_id !== null).length;

  // Sample bookings for detail display
  const sampleBookings = generatedBookings.slice(0, 10).map((b) => ({
    ref: b.booking_reference,
    source: b.booking_source,
    legs: b.legs.length,
    passengers: b.passengers.length,
    leg_passengers: b.legs.length * b.passengers.length,
    routes: b.legs.map((l) => `${l.origin_code}→${l.destination_code}`),
    assigned: b.legs.some((l) => l.flight_id !== null),
  }));

  const report: SeedReport = {
    dry_run: dryRun,
    timestamp: new Date().toISOString(),
    date_range: { start: formatDate(startDate), end: formatDate(endDate) },
    aerodrome_count: activeCodes.length,
    route_count: routePairs.length,
    planned: {
      total_bookings: generatedBookings.length,
      total_legs: totalLegs,
      total_passengers: totalPassengers,
      total_leg_passengers: totalLegPassengers,
      assigned_legs: assignedLegs,
      unassigned_legs: totalLegs - assignedLegs,
      multi_leg_bookings: multiLegBookings,
      round_trip_bookings: roundTripBookings,
      skipped_no_fly_days: noFlyCount,
      customer_direct: customerDirect,
      travel_agent: travelAgent,
      ops_staff: opsStaff,
      org_bookings: orgBookings,
    },
    details: {
      booking_references: generatedBookings.map((b) => b.booking_reference),
      sample_bookings: sampleBookings,
    },
  };

  // ── 10. Print report ──────────────────────────────────────────────────
  console.log(JSON.stringify(report, null, 2));
  console.log();

  // ── 11. Execute if --execute flag ──────────────────────────────────────
  if (!execute) {
    console.log(
      `${"—".repeat(70)}\n` +
      `DRY RUN COMPLETE — No data was written.\n` +
      `Run with --execute to write these bookings to the database.\n` +
      `${"—".repeat(70)}\n`,
    );
    await kdb.destroy();
    return;
  }

  // ── EXECUTION MODE ─────────────────────────────────────────────────────
  console.log("Writing bookings to database...\n");

  let completedBookings = 0;
  let completedLegs = 0;
  let completedPassengers = 0;
  let completedLegPassengers = 0;

  for (const booking of generatedBookings) {
    try {
      await kdb.transaction().execute(async (tx) => {
        // 1. Create booking
        const createdBooking = (await tx.insertInto("bookings")
          .values({
            booking_reference: booking.booking_reference,
            user_id: booking.user_id,
            status: booking.status,
            booking_source: booking.booking_source,
            organization_id: booking.organization_id,
            total_amount: 0,
            total_amount_gbp: 0,
            payment_status: "pending",
            payment_terms: "due_on_receipt",
            created_by: booking.user_id,
          } as any)
          .returningAll()
          .execute())[0];

        // 2. Create booking legs
        const createdLegs: { id: number; leg_sequence: number }[] = [];
        for (const leg of booking.legs) {
          const createdLeg = (await tx.insertInto("booking_legs")
            .values({
              booking_id: createdBooking.id,
              flight_id: leg.flight_id,
              origin_code: leg.origin_code,
              destination_code: leg.destination_code,
              leg_date: dateStrToDate(leg.leg_date),
              leg_sequence: leg.leg_sequence,
              status: leg.flight_id ? "assigned" : "pending",
            } as any)
            .returningAll()
            .execute())[0];
          createdLegs.push({ id: createdLeg.id, leg_sequence: leg.leg_sequence });
        }

        // 3. Create booking passengers
        const createdPassengers: { id: number; index: number }[] = [];
        for (let pi = 0; pi < booking.passengers.length; pi++) {
          const passenger = booking.passengers[pi];
          const createdPassenger = (await tx.insertInto("booking_passengers")
            .values({
              booking_id: createdBooking.id,
              user_id: booking.user_id,
              first_name: passenger.first_name,
              last_name: passenger.last_name,
              clothed_body_weight_kg: passenger.clothed_body_weight_kg,
              nationality: passenger.nationality,
            } as any)
            .returningAll()
            .execute())[0];
          createdPassengers.push({ id: createdPassenger.id, index: pi });
        }

        // 4. Create booking_leg_passengers for ALL leg-passenger combinations
        for (const leg of createdLegs) {
          for (const pax of createdPassengers) {
            const p = booking.passengers[pax.index];
            await tx.insertInto("booking_leg_passengers")
              .values({
                booking_leg_id: leg.id,
                booking_passenger_id: pax.id,
                clothed_weight_kg: p.clothed_body_weight_kg,
                baggage_weight_kg: p.baggage_weight_kg,
                freight_weight_kg: p.freight_weight_kg,
                seat_number: null,
              } as any)
              .execute();
            completedLegPassengers++;
          }
        }

        completedBookings++;
        completedLegs += createdLegs.length;
        completedPassengers += createdPassengers.length;
      });

      if (completedBookings % 10 === 0) {
        console.log(
          `  Progress: ${completedBookings}/${generatedBookings.length} bookings... ` +
          `(${completedLegs} legs, ${completedPassengers} pax, ${completedLegPassengers} leg-pax links)`,
        );
      }
    } catch (err) {
      console.error(
        `  ERROR creating booking ${booking.booking_reference}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  console.log(
    `\n${"=".repeat(70)}\n` +
    `EXECUTION COMPLETE\n` +
    `${"=".repeat(70)}\n` +
    `  Bookings created: ${completedBookings}\n` +
    `  Legs created: ${completedLegs}\n` +
    `  Passengers created: ${completedPassengers}\n` +
    `  Leg-Passenger links created: ${completedLegPassengers}\n` +
    `  Sources: customer_direct=${customerDirect} travel_agent=${travelAgent} ops_staff=${opsStaff}\n` +
    `  Org bookings: ${orgBookings}\n` +
    `  Assigned legs: ${assignedLegs}\n` +
    `  Unassigned legs: ${completedLegs - assignedLegs}\n` +
    `${"=".repeat(70)}\n`,
  );

  await kdb.destroy();
}

main().catch((err) => {
  console.error(
    "FATAL: Seed script failed:",
    err instanceof Error ? err.message : String(err),
  );
  console.error(err);
  process.exit(1);
});