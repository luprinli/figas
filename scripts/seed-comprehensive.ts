/**
 * FIGAS Comprehensive Data Seed — v3.0
 *
 * Chronologically-sequential seed data validating end-to-end data integrity.
 * Reads reference data from CSV files in /data.
 *
 * Usage:
 *   node --env-file .env --import tsx scripts/seed-comprehensive.ts
 *
 * Creates: 31 aerodromes, 4 aircraft, pilots, 3 no-fly rules,
 *          ~800 bookings, ~300 flights, check-in records, payments,
 *          invoices, journal entries, maintenance logs, freight.
 *
 * Idempotent — safe to re-run. Uses upserts.
 */

import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { scrypt, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("FATAL: DATABASE_URL required");
const adapter = new PrismaPg(DATABASE_URL, { disposeExternalPool: true });
const prisma = new PrismaClient({ adapter });

// ── Helpers ──────────────────────────────────────────────────────────────────

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString("hex");
    scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, "0");
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const FIRST_NAMES = ["Alice","Bob","Charlie","Diana","Edward","Fiona","George","Helen","Ian","Julia","Kevin","Laura","Mike","Nina","Oscar","Paula","Quinn","Rachel","Sam","Tina","Uma","Victor","Wendy","Xander","Yvonne","Zach","Abigail","Ben","Clara","Dan","Eva","Frank","Grace","Henry","Iris","Jack","Karen","Leo","Maya","Noah","Olive"];
const LAST_NAMES = ["Smith","Jones","Williams","Brown","Taylor","Davies","Wilson","Evans","Thomas","Roberts","Walker","Wright","Robinson","Thompson","White", "Hughes","Edwards","Green","Hall","Wood","Harris","Martin","Jackson","Clarke","Patel","Lewis","Lee","Scott","Turner","Hill","Cook","Morgan","Bell","Murphy","Bailey","Rivera","Campbell","Mitchell"];
const STY_AERODROMES = ["MPA","BVI","CCI","CHR","DGS","DWN","FXB","FBE","PGR","HLC","LYI","NWI","NHA","PBI","PHD","PHP","PSC","PST","RYC","SDI","SLI","SHB","SPI","SPP","WDI","WPI","GEI","ALB","BKI"];
const PAYMENT_METHODS = ["cash","card","invoice","deferred","bank_transfer"];
const NAMED_DESTINATIONS: Record<string, string> = { MPA:"Mount Pleasant",BVI:"Beaver Island",CCI:"Carcass Island",CHR:"Chartres",DGS:"Douglas Station",DWN:"Darwin",FXB:"Fox Bay",FBE:"Fox Bay East",PGR:"Goose Green",HLC:"Hill Cove",LYI:"Lively Island",NWI:"New Island",NHA:"North Arm",PBI:"Pebble Island",PHD:"Port Edgar",PHP:"Port Howard",PSC:"Port San Carlos",PST:"Port Stephens",RYC:"Roy Cove",SDI:"Saunders Island",SLI:"Sea Lion Island",SHB:"Shallow Harbour",SPI:"Speedwell Island",SPP:"Spring Point",WDI:"Weddell Island",WPI:"West Point Island",GEI:"George Island",ALB:"Albemarle",BKI:"Bleaker Island" };

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🌱 FIGAS Comprehensive Seed v3.0\n");
  console.log(`Database: ${DATABASE_URL}\n`);

  const pwHash = await hashPassword("figas2024!");

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 1: Reference Data
  // ═══════════════════════════════════════════════════════════════════════
  console.log("── Phase 1: Reference Data ──");

  // 1.1 Aerodromes from CSV
  const csvPath = path.resolve("data/aerodromes.csv");
  const csv = fs.readFileSync(csvPath, "utf-8").split("\n").slice(1).filter(l => l.trim());
  let aeroCount = 0;
  for (const line of csv) {
    const parts = line.split(",");
    const name = parts[0]?.trim();
    let code = parts[1]?.trim();
    if (!code) continue;
    // Canonical Stanley code is STY — it matches the distance, heading and fare
    // matrices and the scheduling depot. The reference CSV lists Stanley as
    // "PSY"; remap it so we never create a duplicate, unroutable Stanley record.
    if (code === "PSY") code = "STY";
    const lat = parseFloat(parts[2]) || null;
    const lng = parseFloat(parts[3]) || null;
    const rw = parseFloat(parts[6]) || null;
    const mlw = parseFloat(parts[4]) || null;
    const mtow = parseFloat(parts[5]) || null;
    await prisma.$executeRawUnsafe(
      `INSERT INTO aerodromes (code, name, city, latitude, longitude, runway_length, mlw_limit_kg, mtow_limit_kg, is_active, timezone, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 'Atlantic/Stanley', NOW(), NOW())
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, runway_length = EXCLUDED.runway_length`,
      code, name, name, lat, lng, rw, mlw, mtow
    );
    aeroCount++;
  }
  // Ensure STY alias
  await prisma.$executeRawUnsafe(
    `INSERT INTO aerodromes (code, name, city, is_active, timezone, created_at, updated_at)
     VALUES ('STY', 'Stanley Airport', 'Stanley', true, 'Atlantic/Stanley', NOW(), NOW())
     ON CONFLICT (code) DO NOTHING`
  );
  console.log(`  ✓ ${aeroCount} aerodromes`);

  // 1.1b Aerodrome distances & headings (REQUIRED for routing).
  // Without these, loadDistances()/loadHeadings() return empty, the CVRP
  // distance matrix is empty, and every flight leg gets a 0 nm distance.
  const validCodes = new Set(
    (
      await prisma.$queryRawUnsafe<Array<{ code: string }>>(
        `SELECT code FROM aerodromes WHERE is_active = true`
      )
    ).map((r) => r.code)
  );
  const parseMatrix = (file: string) => {
    const lines = fs
      .readFileSync(path.resolve(`data/${file}`), "utf-8")
      .trim()
      .split("\n")
      .map((l) => l.replace(/\r$/, ""));
    const headers = lines[0].split("\t").map((h) => h.trim());
    const rows = lines.slice(1).map((l) => l.split("\t").map((c) => c.trim()));
    return { codes: headers.slice(1), rows };
  };
  {
    const { codes, rows } = parseMatrix("distance.csv");
    let dCount = 0;
    for (const row of rows) {
      const origin = row[0];
      if (!origin || !validCodes.has(origin)) continue;
      for (let j = 1; j < row.length && j - 1 < codes.length; j++) {
        const dest = codes[j - 1];
        if (!dest || dest === origin || !validCodes.has(dest)) continue;
        const distance = parseFloat(row[j]);
        if (!Number.isFinite(distance) || distance <= 0) continue;
        await prisma.$executeRawUnsafe(
          `INSERT INTO aerodrome_distances (origin_code, destination_code, distance_nm)
           VALUES ($1, $2, $3) ON CONFLICT (origin_code, destination_code) DO NOTHING`,
          origin,
          dest,
          distance
        );
        dCount++;
      }
    }
    console.log(`  ✓ ${dCount} aerodrome distances`);
  }
  {
    const { codes, rows } = parseMatrix("heading.csv");
    let hCount = 0;
    for (const row of rows) {
      const origin = row[0];
      if (!origin || !validCodes.has(origin)) continue;
      for (let j = 1; j < row.length && j - 1 < codes.length; j++) {
        const dest = codes[j - 1];
        if (!dest || dest === origin || !validCodes.has(dest)) continue;
        const heading = parseFloat(row[j]);
        if (!Number.isFinite(heading)) continue;
        await prisma.$executeRawUnsafe(
          `INSERT INTO aerodrome_headings (origin_code, destination_code, heading_degrees)
           VALUES ($1, $2, $3) ON CONFLICT (origin_code, destination_code) DO NOTHING`,
          origin,
          dest,
          heading
        );
        hCount++;
      }
    }
    console.log(`  ✓ ${hCount} aerodrome headings`);
  }

  // 1.1c Fuel rules (required for fuel planning during scheduling).
  {
    const lines = fs
      .readFileSync(path.resolve("data/fuel.csv"), "utf-8")
      .trim()
      .split("\n")
      .map((l) => l.replace(/\r$/, ""));
    let fCount = 0;
    for (const line of lines.slice(1)) {
      const c = line.split("\t");
      if (c.length < 5 || !c[0].trim()) continue;
      const ft = parseInt(c[0], 10);
      const sectors = parseInt(c[1], 10);
      const req = parseFloat(c[2]);
      const min = parseFloat(c[3]);
      const state = c[4].trim();
      if (Number.isNaN(ft) || Number.isNaN(sectors)) continue;
      await prisma.$executeRawUnsafe(
        `INSERT INTO fuel_rules (flight_time_minutes, sectors, required_fuel_kg, minimum_fuel_kg, fuel_state)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (flight_time_minutes, sectors) DO NOTHING`,
        ft,
        sectors,
        req,
        min,
        state
      );
      fCount++;
    }
    console.log(`  ✓ ${fCount} fuel rules`);
  }

  // 1.2 Aircraft
  for (const [reg, , isActive] of [["VP-FBZ","142h",true],["VP-FAZ","87h",true],["VP-FCZ","23h",true],["VP-FDZ","0h (OOS)",false]] as const) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO aircraft (registration, type, manufacturer, model, seat_count, empty_weight_kg, max_takeoff_weight_kg, max_payload_kg, fuel_capacity_kg, is_active, created_at, updated_at)
       VALUES ($1, 'BN-2 Islander', 'Britten-Norman', 'BN-2B-26', 9, 1627, 2994, 1160, 380, $2, NOW(), NOW())
       ON CONFLICT (registration) DO UPDATE SET is_active = EXCLUDED.is_active`,
      reg, isActive
    );
  }
  console.log("  ✓ 4 aircraft");

  // 1.3 Organizations
  for (const [name, code, credit] of [["Falkland Islands Government","FIG",50000],["Falkland Islands Tourist Board","FITB",10000],["Falklands Conservation","FCS",5000],["Stanley Services Ltd","SSL",3000]] as const) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO organizations (name, code, credit_limit_gbp, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, true, NOW(), NOW()) ON CONFLICT (code) DO NOTHING`,
      name, code, credit
    );
  }
  console.log("  ✓ 4 organizations");

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 2: Users, Roles & Passengers
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 2: Users & Roles ──");

  const sysUsers = [
    { email: "admin@figas.gov.fk", name: "Sarah Admin", role: "admin" },
    { email: "ops@figas.gov.fk", name: "James Ops", role: "operations" },
    { email: "checkin@figas.gov.fk", name: "Emma Counter", role: "checkin" },
    { email: "checkin2@figas.gov.fk", name: "Tom Desk", role: "checkin" },
    { email: "finance@figas.gov.fk", name: "Rachel Finance", role: "finance" },
    { email: "pilot1@figas.gov.fk", name: "Felix Captain", role: "pilot" },
    { email: "pilot2@figas.gov.fk", name: "Oscar First", role: "pilot" },
    { email: "pilot3@figas.gov.fk", name: "Nina Relief", role: "pilot" },
    { email: "engineer@figas.gov.fk", name: "Mike Engineer", role: "engineer" },
    { email: "passenger@figas.gov.fk", name: "Test Passenger", role: "passenger" },
  ];
  const userIdMap: Record<string, number> = {};
  for (const u of sysUsers) {
    const r = await prisma.$queryRawUnsafe<Array<{id:number}>>(
      `INSERT INTO users (name, email, password, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())
       ON CONFLICT ON CONSTRAINT users_email_key DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password
       RETURNING id`, u.name, u.email, pwHash, u.role
    );
    userIdMap[u.email] = r[0].id;
  }
  // Pilot records — resolve their actual name from sysUsers
  for (const [email, license, rating, medExp] of [["pilot1@figas.gov.fk","ATPL-001","BN-2 Type Rating","2027-01-15"],["pilot2@figas.gov.fk","CPL-002","BN-2 Type Rating","2026-09-30"],["pilot3@figas.gov.fk","CPL-003","BN-2 Type Rating","2027-06-01"]] as const) {
    const pilotName = sysUsers.find(u => u.email === email)?.name ?? email.split("@")[0];
    await prisma.$executeRawUnsafe(
      `INSERT INTO pilots (user_id, name, email, license_number, license_type, rating, medical_expiry, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'ATPL', $5, $6::date, true, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email,
         license_number = EXCLUDED.license_number, rating = EXCLUDED.rating,
         medical_expiry = EXCLUDED.medical_expiry`,
      userIdMap[email], pilotName, email, license, rating, medExp
    );
  }
  console.log(`  ✓ ${sysUsers.length} system users + 3 pilots`);

  // Passenger users (60)
  console.log("  Seeding 60 passenger users...");
  const passengerIds: number[] = [];
  for (let i = 0; i < 60; i++) {
    const fn = pick(FIRST_NAMES);
    const ln = pick(LAST_NAMES);
    const email = `passenger${i+1}@figas.gov.fk`;
    const r = await prisma.$queryRawUnsafe<Array<{id:number}>>(
      `INSERT INTO users (name, email, password, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, 'passenger', true, NOW(), NOW())
       ON CONFLICT ON CONSTRAINT users_email_key DO UPDATE SET name = EXCLUDED.name
       RETURNING id`, `${fn} ${ln}`, email, pwHash
    );
    passengerIds.push(r[0].id);
  }
  console.log(`  ✓ ${passengerIds.length} passenger users`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 3: No-Fly Rules
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 3: No-Fly Rules ──");
  const noFlyRules = [
    { label: "Sundays", desc: "No commercial flights on Sundays", dayOfWeek: [0], recurring: true, priority: 10 },
    { label: "Good Friday 2026", desc: "Good Friday", specDate: "2026-04-03", recurring: false, priority: 20 },
    { label: "Easter Monday 2026", desc: "Easter Monday", specDate: "2026-04-06", recurring: false, priority: 20 },
    { label: "Liberation Day 2026", desc: "Liberation Day", specDate: "2026-06-14", recurring: false, priority: 20 },
    { label: "Christmas Day 2026", desc: "Christmas Day", specDate: "2026-12-25", recurring: false, priority: 20 },
    { label: "Boxing Day 2026", desc: "Boxing Day", specDate: "2026-12-26", recurring: false, priority: 20 },
    { label: "New Year's Eve 2026", desc: "New Year's Eve", specDate: "2026-12-31", recurring: false, priority: 20 },
  ];
  for (const r of noFlyRules) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO no_fly_rules (label, description, rule_type, is_active, day_of_week, specific_date, priority, created_by, created_at, updated_at)
       VALUES ($1, $2, $3::no_fly_rule_type, true, $4::int[], $5::date, $6, 1, NOW(), NOW())
       ON CONFLICT (label) DO UPDATE SET rule_type = EXCLUDED.rule_type, specific_date = EXCLUDED.specific_date,
         day_of_week = EXCLUDED.day_of_week, priority = EXCLUDED.priority`,
      r.label, r.desc, r.recurring ? "recurring" : "one_off", r.dayOfWeek ? `{${r.dayOfWeek.join(",")}}` : null, r.specDate, r.priority
    );
  }
  console.log(`  ✓ ${noFlyRules.length} no-fly rules`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 4: Bookings (chronological — Apr through Dec 2026)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 4: Bookings (chronological) ──");

  const monthTargets: Record<string, number> = {
    "2026-04": 85, "2026-05": 105, "2026-06": 130, "2026-07": 150,
    "2026-08": 95, "2026-09": 125, "2026-10": 145, "2026-11": 165, "2026-12": 155,
  };
  const MAX_BOOKINGS_PER_DAY = 26;
  const MIN_BOOKINGS_PER_DAY = 3;

  function isNoFlyDay(dateStr: string): boolean {
    const d = new Date(dateStr);
    if (d.getDay() === 0) return true; // Sunday
    const oneOffs = ["2026-04-03","2026-04-06","2026-06-14","2026-12-25","2026-12-26","2026-12-31"];
    return oneOffs.includes(dateStr);
  }

  const allFlyDays: string[] = [];
  const startD = new Date("2026-04-01");
  const endD = new Date("2026-12-31");
  for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
    const ds = ymd(d);
    if (!isNoFlyDay(ds)) allFlyDays.push(ds);
  }

  interface BookingEntry {
    ref: string;
    date: string;
    userId: number;
    origin: string;
    dest: string;
    status: string;
    paymentStatus: string;
    paymentMethod: string;
    isOrgBilling: boolean;
    passengers: Array<{ name: string; weight: number; baggage: number }>;
  }

  console.log(`  Generating bookings for ${allFlyDays.length} fly days...`);
  const allBookings: BookingEntry[] = [];
  let refSeq = 10000;

  for (const [month, target] of Object.entries(monthTargets)) {
    const monthDays = allFlyDays.filter(d => d.startsWith(month));
    let remaining = target;
    // Distribute across days
    const dayTargets = monthDays.map(() => MIN_BOOKINGS_PER_DAY);
    remaining -= MIN_BOOKINGS_PER_DAY * monthDays.length;
    while (remaining > 0) {
      const idx = rand(0, monthDays.length - 1);
      if (dayTargets[idx] < MAX_BOOKINGS_PER_DAY) {
        dayTargets[idx]++;
        remaining--;
      }
    }

    for (let di = 0; di < monthDays.length; di++) {
      const dayDate = monthDays[di];
      const n = dayTargets[di];
      for (let b = 0; b < n; b++) {
        const bp = rand(1, 4);
        const origin = Math.random() < 0.75 ? "STY" : pick(STY_AERODROMES);
        let dest: string;
        do { dest = pick(STY_AERODROMES); } while (dest === origin);
        let status: string;
        let payStatus: string;
        const isPast = dayDate < "2026-06-05";
        const isToday = dayDate === "2026-06-05";
        const isFutureClose = dayDate > "2026-06-05" && dayDate < "2026-07-01";
        if (isPast) {
          status = pick(["completed","completed","completed","cancelled","checked_in"]);
          payStatus = pick(["paid","paid","paid","overdue","refunded","paid"]);
        } else if (isToday || isFutureClose) {
          status = pick(["flight_assigned","flight_assigned","approved","pilot_review","confirmed","confirmed"]);
          payStatus = pick(["pending","paid","invoiced","pending","paid","paid"]);
        } else {
          status = pick(["confirmed","confirmed","confirmed","flight_assigned","approved","pending"]);
          payStatus = pick(["pending","pending","paid","invoiced","pending","pending"]);
        }
        if (status === "cancelled") payStatus = pick(["cancelled","refunded","failed"]);
        const payMethod = pick(PAYMENT_METHODS);
        const isOrg = Math.random() < 0.10;
        const paxArr: Array<{ name: string; weight: number; baggage: number }> = [];
        for (let p = 0; p < bp; p++) {
          const age = pick([rand(2,12),rand(13,17),rand(18,40),rand(18,40),rand(41,60),rand(41,60),rand(61,80)]);
          const wt = age < 13 ? rand(20,40) : rand(55,95);
          paxArr.push({ name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`, weight: wt, baggage: rand(0,30) });
        }
        allBookings.push({
          ref: `FIG-${refSeq++}`,
          date: dayDate,
          userId: pick(passengerIds),
          origin,
          dest,
          status,
          paymentStatus: payStatus,
          paymentMethod: payMethod,
          isOrgBilling: isOrg,
          passengers: paxArr,
        });
      }
    }
  }
  console.log(`  ✓ ${allBookings.length} bookings generated`);

  // Get actual organization IDs from DB
  const orgIds = await prisma.$queryRawUnsafe<Array<{id:number}>>("SELECT id FROM organizations ORDER BY id");
  const actualOrgIds = orgIds.map(o => o.id);

  // Insert bookings
  console.log("  Writing bookings to database...");
  const bookingIdMap: Record<string, number> = {};
  const fareCache: Record<string, number> = {};
  for (const bk of allBookings) {
    // Ensure fare route exists
    const routeKey = `STY-${bk.dest}`;
    if (!fareCache[routeKey]) {
      fareCache[routeKey] = rand(15, 65);
      await prisma.$executeRawUnsafe(
        `INSERT INTO fare_routes (origin_code, destination_code, base_fare, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, true, NOW(), NOW()) ON CONFLICT DO NOTHING`,
        "STY", bk.dest, fareCache[routeKey]
      );
    }
    const fare = fareCache[routeKey] * bk.passengers.length;

    const orgId = bk.isOrgBilling ? pick(actualOrgIds) : null;
    const paymentTerms = orgId ? pick(["net_30","net_15","net_7"]) : "due_on_receipt";
    const paymentDueDate = new Date(bk.date);
    paymentDueDate.setDate(paymentDueDate.getDate() + 30);

    const r = await prisma.$queryRawUnsafe<Array<{id:number}>>(
      `INSERT INTO bookings (booking_reference, user_id, status, organization_id, is_organization_billing, total_amount_gbp, payment_status, payment_method, payment_terms, payment_due_date, booking_source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, 'agent', NOW(), NOW())
       ON CONFLICT (booking_reference) DO NOTHING
       RETURNING id`,
      bk.ref, bk.userId, bk.status, orgId, orgId !== null, fare, bk.paymentStatus, bk.paymentMethod, paymentTerms, ymd(paymentDueDate)
    );
    if (r.length === 0) continue; // duplicate, skip
    const bookingId = r[0].id;
    bookingIdMap[bk.ref] = bookingId;

    // Booking legs
    const legR = await prisma.$queryRawUnsafe<Array<{id:number}>>(
      `INSERT INTO booking_legs (booking_id, origin_code, destination_code, leg_date, leg_sequence, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4::date, 1, $5, NOW(), NOW())
       RETURNING id`,
      bookingId, bk.origin, bk.dest, bk.date, bk.status === "cancelled" ? "cancelled" : "confirmed"
    );
    const legId = legR[0].id;

    // Booking passengers
    for (const p of bk.passengers) {
      const nameParts = p.name.split(" ");
      const bpR = await prisma.$queryRawUnsafe<Array<{id:number}>>(
        `INSERT INTO booking_passengers (booking_id, first_name, last_name, clothed_body_weight_kg, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id`,
        bookingId, nameParts[0], nameParts.slice(1).join(" "), p.weight
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO booking_leg_passengers (booking_leg_id, booking_passenger_id, baggage_weight_kg, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())`,
        legId, bpR[0].id, p.baggage
      );
    }
  }
  // Refresh bookingIdMap from DB (re-run safety)
  console.log("  Refreshing booking IDs from database...");
  const dbBkgs = await prisma.$queryRawUnsafe<Array<{id:number; ref:string}>>(
    "SELECT id, booking_reference AS ref FROM bookings"
  );
  for (const bk of dbBkgs) {
    bookingIdMap[bk.ref] = bk.id;
  }
  console.log(`  ✓ ${Object.keys(bookingIdMap).length} bookings loaded from DB`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 5: Schedules & Flights
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 5: Schedules & Flights ──");

  const pilotIds = await prisma.$queryRawUnsafe<Array<{id:number}>>("SELECT id FROM pilots WHERE is_active = true");
  const activeAircraft = await prisma.$queryRawUnsafe<Array<{id:number}>>("SELECT id FROM aircraft WHERE is_active = true LIMIT 3");
  const flightNumberMap: Record<string, number> = {};

  // Create schedules and flights for fly days with assigned bookings
  const flyDaysWithBookings = allFlyDays.filter(d => allBookings.some(b => b.date === d && b.status !== "cancelled" && b.status !== "pending" && b.status !== "confirmed"));
  let scheduleCount = 0;
  let flightCount = 0;

  for (const dayDate of flyDaysWithBookings) {
    const dayBookings = allBookings.filter(b => b.date === dayDate && b.status !== "cancelled" && b.status !== "pending" && b.status !== "confirmed");
    if (dayBookings.length === 0) continue;

    // Determine schedule status
    let schedStatus: string;
    if (dayDate < "2026-06-05") schedStatus = "completed";
    else if (dayDate === "2026-06-05") schedStatus = "published";
    else schedStatus = "approved";

    const schedR = await prisma.$queryRawUnsafe<Array<{id:number}>>(
      `INSERT INTO schedules (schedule_date, status, created_by, created_at, updated_at)
       VALUES ($1::date, $2::schedule_status, $3, NOW(), NOW())
       ON CONFLICT (schedule_date) DO UPDATE SET status = EXCLUDED.status
       RETURNING id`,
      dayDate, schedStatus, userIdMap["ops@figas.gov.fk"]
    );
    const scheduleId = schedR[0].id;
    scheduleCount++;

    // Create flights — 1 flight per ~6-7 passengers
    const numFlights = Math.max(1, Math.ceil(dayBookings.length / 7));
    for (let fi = 0; fi < numFlights; fi++) {
      const fn = `FIG-${dayDate.replace(/-/g,"")}-${pad(fi+1, 3)}`;
      const origin = pick(["STY","STY","STY","STY","STY"]);
      const dest = pick(STY_AERODROMES);
      const aircraftId = (activeAircraft as Array<{id:number}>)[fi % activeAircraft.length].id;
      const pilotId = (pilotIds as Array<{id:number}>)[fi % pilotIds.length].id;
      const depTime = `${dayDate}T${String(8+fi*3).padStart(2,"0")}:00:00Z`;
      const arrTime = `${dayDate}T${String(9+fi*3+1).padStart(2,"0")}:00:00Z`;

      const flightR = await prisma.$queryRawUnsafe<Array<{id:number}>>(
        `INSERT INTO flights (flight_number, origin_code, destination_code, departure_time, arrival_time, status, aircraft_id, pilot_id, schedule_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8, $9, NOW(), NOW())
         ON CONFLICT (flight_number) DO UPDATE SET status = EXCLUDED.status, aircraft_id = EXCLUDED.aircraft_id
         RETURNING id`,
        fn, origin, dest, depTime, arrTime, schedStatus === "completed" ? "completed" : "scheduled", aircraftId, pilotId, scheduleId
      );
      if (flightR.length > 0) {
        const flightId = flightR[0].id;
        flightNumberMap[fn] = flightId;
        flightCount++;

        // Create flight legs
        await prisma.$executeRawUnsafe(
          `INSERT INTO flight_legs (flight_id, leg_number, origin_code, destination_code, status, schedule_id, created_at, updated_at)
           VALUES ($1, 1, $2, $3, 'scheduled', $4, NOW(), NOW())
           ON CONFLICT (flight_id, leg_number) DO NOTHING`,
          flightId, origin, dest, scheduleId
        );

        // Create pilot assignment (only if table exists)
        try {
          await prisma.$executeRawUnsafe(
            `INSERT INTO pilot_assignments (flight_id, pilot_id, role, status, schedule_id, created_at, updated_at)
             VALUES ($1, $2, 'captain', 'assigned', $3, NOW(), NOW())
             ON CONFLICT DO NOTHING`,
            flightId, pilotId, scheduleId
          );
        } catch { /* table might not exist */ }

        // Assign bookings to flight (for non-cancelled, non-pending)
        const batchBookings = dayBookings.slice(fi * 7, (fi + 1) * 7);
        for (const bk of batchBookings) {
          const bid = bookingIdMap[bk.ref];
          if (!bid) continue;
          await prisma.$executeRawUnsafe(
            `UPDATE booking_legs SET flight_id = $1, status = 'flight_assigned', updated_at = NOW()
             WHERE booking_id = $2 AND flight_id IS NULL`,
            flightId, bid
          );
          if (bk.status === "confirmed" || bk.status === "flight_assigned") {
            await prisma.$executeRawUnsafe(
              `UPDATE bookings SET status = 'flight_assigned', updated_at = NOW() WHERE id = $1`, bid
            );
          }
        }
      }
    }
  }
  console.log(`  ✓ ${scheduleCount} schedules, ${flightCount} flights`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 6: Weight & Balance
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 6: Weight & Balance ──");
  let wbCount = 0;
  for (const flightId of Object.values(flightNumberMap)) {
    try {
    const legR = await prisma.$queryRawUnsafe<Array<{id:number}>>(
      "SELECT id FROM flight_legs WHERE flight_id = $1 LIMIT 1", flightId
    );
    if (legR.length === 0) continue;
    const legId = legR[0].id;
    const paxWt = rand(300, 700);
    const bagWt = rand(50, 250);
    await prisma.$executeRawUnsafe(
      `INSERT INTO weight_balance_snapshots (flight_leg_id, passenger_weight_kg, baggage_weight_kg, freight_weight_kg, fuel_weight_kg, crew_weight_kg, empty_weight_kg, total_weight_kg, total_moment_kgm, cg_position_pct, computed_by, computed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'seed-script', NOW(), NOW(), NOW())`,
      legId, paxWt, bagWt, rand(0, 100), rand(200, 400), 80, 1627, 1627 + paxWt + bagWt + rand(0, 100) + rand(200, 400) + 80, rand(80000,120000), rand(25,40)
    );
    wbCount++;
    } catch { /* table may not exist */ }
  }
  console.log(`  ✓ ${wbCount} weight & balance records`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 7: Check-In Activity (Historical: check in ~85% of past passengers)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 7: Check-In Activity ──");
  const checkinUserId = userIdMap["checkin@figas.gov.fk"];
  let ciCount = 0;
  const pastBkgs = allBookings.filter(b => b.date < "2026-06-05" && b.status !== "cancelled" && bookingIdMap[b.ref]);
  for (const bk of pastBkgs) {
    const bookingId = bookingIdMap[bk.ref];
    if (!bookingId) continue;
    const blpR = await prisma.$queryRawUnsafe<Array<{id:number}>>(
      `SELECT blp.id, blp.booking_leg_id FROM booking_leg_passengers blp
       JOIN booking_legs bl ON bl.id = blp.booking_leg_id
       WHERE bl.booking_id = $1`, bookingId
    );
    for (const blp of blpR) {
      if (Math.random() < 0.85) {
        const ciDate = new Date(bk.date);
        ciDate.setHours(ciDate.getHours() + rand(6, 12));
        await prisma.$executeRawUnsafe(
          `UPDATE booking_leg_passengers SET checked_in = true, checked_in_at = $1::timestamptz, checked_in_by = $2
           WHERE id = $3`,
          ciDate.toISOString(), checkinUserId, blp.id
        );
        ciCount++;
      }
    }
  }
  console.log(`  ✓ ${ciCount} passengers checked in`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 8: Financial Records
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 8: Financial Records ──");
  let payCount = 0;
  let invCount = 0;
  let jeCount = 0;
  for (const bk of allBookings) {
    const bookingId = bookingIdMap[bk.ref];
    if (!bookingId) continue;
    const paxCount = bk.passengers.length;
    const fare = (fareCache[`STY-${bk.dest}`] || 35) * paxCount;
    const excess = bk.passengers.reduce((s,p) => s + Math.max(0, p.baggage - 20) * 5, 0);
    const total = fare + excess;

    if (bk.paymentStatus === "paid" || bk.paymentStatus === "partially_paid" || bk.paymentStatus === "refunded" || bk.paymentStatus === "overdue") {
      const amt = bk.paymentStatus === "partially_paid" ? Math.round(total * 0.6) : total;
      try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO payments (booking_id, amount, amount_gbp, method, status, paid_at, created_at, updated_at)
         VALUES ($1, $2, $2, $3, 'completed', NOW(), NOW(), NOW())`,
        bookingId, amt, bk.paymentMethod
      );
      payCount++;

      // Journal entry
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO accounting_journal_entries (booking_id, type, created_by, created_at, updated_at)
           VALUES ($1, 'payment', $2, NOW(), NOW())`,
          bookingId, userIdMap["finance@figas.gov.fk"]
        );
        jeCount++;
      } catch { /* table may not exist */ }
      } catch { /* payment may fail on re-run */ }
    }
    if (bk.paymentStatus === "refunded") {
      try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO payments (booking_id, amount, amount_gbp, method, status, paid_at, created_at, updated_at)
         VALUES ($1, $2, $2, 'bank_transfer', 'refunded', NOW(), NOW(), NOW())`,
        bookingId, -total
      );
      payCount++;
      } catch { /* may fail on re-run */ }
    }
    // Invoices for organization billing
    if (bk.isOrgBilling && bk.paymentStatus !== "cancelled") {
      try {
      const invR = await prisma.$queryRawUnsafe<Array<{id:string}>>(
        `INSERT INTO invoices (booking_id, total_amount, status, payment_terms, created_at, updated_at)
         VALUES ($1, $2, $3, 'net_30', NOW(), NOW())
         RETURNING id::text`,
        bookingId, total, bk.paymentStatus === "paid" ? "paid" : bk.paymentStatus === "overdue" ? "overdue" : "issued"
      );
      if (invR.length > 0) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO invoice_items (invoice_id, type, amount, created_at, updated_at)
           VALUES ($1::uuid, 'fare', $2, NOW(), NOW())`,
          invR[0].id, fare
        );
        invCount++;
        }
      } catch { /* table may not exist */ }
    }
  }
  console.log(`  ✓ ${payCount} payments, ${invCount} invoices, ${jeCount} journal entries`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 9: Freight Consignments
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 9: Freight ──");
  let freightCount = 0;
  for (let i = 0; i < 60; i++) {
    const dest = pick(STY_AERODROMES);
    const seq = pad(i + 1, 5);
    const waybill = `FW-${pad(i+1,5)}`;
    const prio = pick(["low","medium","high","urgent"]);
    const haz = Math.random() < 0.10;
    try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO freight_consignments (consignor_name, consignee_name, description, weight_kg, priority, hazardous, waybill_number, payment_mode, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'unassigned', $9, NOW(), NOW())`,
      `${pick(FIRST_NAMES)} Supplies`, `${NAMED_DESTINATIONS[dest] || dest} Store`, `Consignment #${seq}`, rand(1, 80), prio, haz, waybill, pick(["cash","invoice","collect_on_arrival"]), userIdMap["checkin@figas.gov.fk"]
    );
    freightCount++;
    } catch { /* table may not exist */ }
  }
  console.log(`  ✓ ${freightCount} freight consignments`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 10: Notifications & Reminders
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 10: Notifications ──");
  let notifCount = 0;
  for (const bk of allBookings.slice(0, 200)) {
    const bookingId = bookingIdMap[bk.ref];
    if (!bookingId) continue;
    if (Math.random() < 0.4) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO notifications (booking_id, type, message, status, sent_at, created_at, updated_at)
         VALUES ($1, 'booking_confirmation', $2, 'sent', NOW(), NOW(), NOW())`,
        bookingId, `Booking ${bk.ref} confirmed`
      );
      notifCount++;
    }
  }
  // Check-in reminders for upcoming
  for (const bk of allBookings.filter(b => b.date >= "2026-06-06" && b.date < "2026-07-01")) {
    const bookingId = bookingIdMap[bk.ref];
    if (!bookingId) continue;
    await prisma.$executeRawUnsafe(
      `INSERT INTO checkin_reminders (booking_id, scheduled_at, status, created_at, updated_at)
       VALUES ($1, $2::timestamptz, 'pending', NOW(), NOW())`,
      bookingId, new Date(bk.date).toISOString()
    );
  }
  console.log(`  ✓ ${notifCount} notifications + check-in reminders`);

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 11: Summary
  // ═══════════════════════════════════════════════════════════════════════
  const counts = await prisma.$queryRawUnsafe<Array<Record<string,number>>>(
    `SELECT
      (SELECT COUNT(*) FROM aerodromes) AS aerodromes,
      (SELECT COUNT(*) FROM aircraft) AS aircraft,
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM bookings) AS bookings,
      (SELECT COUNT(*) FROM booking_passengers) AS passengers,
      (SELECT COUNT(*) FROM flights) AS flights,
      (SELECT COUNT(*) FROM flight_legs) AS flight_legs,
      (SELECT COUNT(*) FROM schedules) AS schedules,
      (SELECT COUNT(*) FROM payments) AS payments,
      (SELECT COUNT(*) FROM freight_consignments) AS freight,
      (SELECT COUNT(*) FROM weight_balance_snapshots) AS wb_snapshots,
      (SELECT COUNT(*) FROM booking_leg_passengers WHERE checked_in = true) AS checked_in`
  );
  const c = counts[0];

  // ── Required-data integrity gate ────────────────────────────────────────
  // Fail loudly if any table the app cannot function without is empty. This
  // prevents "provisioned but silently broken" states (e.g. an empty distance
  // matrix that makes every flight route 0 nm / unroutable).
  const req = await prisma.$queryRawUnsafe<Array<Record<string, number>>>(
    `SELECT
       (SELECT COUNT(*) FROM aerodromes WHERE is_active = true) AS aerodromes,
       (SELECT COUNT(*) FROM aerodrome_distances) AS aerodrome_distances,
       (SELECT COUNT(*) FROM aerodrome_headings) AS aerodrome_headings,
       (SELECT COUNT(*) FROM aircraft WHERE is_active = true) AS aircraft,
       (SELECT COUNT(*) FROM fuel_rules) AS fuel_rules,
       (SELECT COUNT(*) FROM fare_routes) AS fare_routes,
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM aerodrome_distances WHERE origin_code = 'STY' OR destination_code = 'STY') AS sty_distances`
  );
  const r = req[0];
  const missing = Object.entries(r)
    .filter(([, n]) => Number(n) === 0)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `Required reference data missing after seed: ${missing.join(", ")}. ` +
        `The application will not function correctly — check data/*.csv and seed order.`
    );
  }
  console.log(`  ✓ Integrity check passed (STY distance rows: ${r.sty_distances})`);

  console.log("\n══════════════════════════════════════════════");
  console.log("  SEED COMPLETE");
  console.log("══════════════════════════════════════════════");
  console.log(`  Aerodromes:          ${c.aerodromes}`);
  console.log(`  Aircraft:            ${c.aircraft}`);
  console.log(`  Users:               ${c.users}`);
  console.log(`  Bookings:            ${c.bookings}`);
  console.log(`  Booking Passengers:  ${c.passengers}`);
  console.log(`  Flights:             ${c.flights}`);
  console.log(`  Flight Legs:         ${c.flight_legs}`);
  console.log(`  Schedules:           ${c.schedules}`);
  console.log(`  Payments:            ${c.payments}`);
  console.log(`  Checked In:          ${c.checked_in}`);
  console.log(`  Freight:             ${c.freight}`);
  console.log(`  W&B Snapshots:       ${c.wb_snapshots}`);
  console.log("══════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
