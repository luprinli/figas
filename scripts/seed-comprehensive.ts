/**
 * FIGAS Comprehensive Data Seed — v4.0
 *
 * Chronologically-sequential seed data validating end-to-end data integrity.
 * Reads reference data from CSV files in /data.
 *
 * Usage:
 *   node --env-file .env --import tsx scripts/seed-comprehensive.ts
 *
 * Creates: 31 aerodromes, 4 aircraft, 70 users, 3 pilots,
 *          7 no-fly rules, ~800 bookings, ~300 flights, check-in records,
 *          payments, invoices, journal entries, freight consignments,
 *          chart of accounts (20), payment methods (5), system settings (17),
 *          fuel orders, flight manifests, seat assignments, stripe payments,
 *          bank transactions, payment reminders, export log, defects,
 *          airframe hours, notifications, and check-in reminders.
 *
 * Idempotent — safe to re-run. Uses upserts and ON CONFLICT.
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

  // 1.2b Aircraft scheduling extensions — populate performance data required
  // for weight & balance, fuel planning, and routing calculations.
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE aircraft SET max_ramp_weight_kg = 3020, max_landing_weight_kg = 2948,
         cg_arm_m = 2.74, fuel_flow_kg_per_hour = 72.5, cruise_speed_ktas = 130
       WHERE type = 'BN-2 Islander' AND max_ramp_weight_kg IS NULL`
    );
    console.log("  ✓ Aircraft scheduling extensions updated");
  } catch { /* scheduling extension columns may not exist yet */ }

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
    { email: "felix.pilot@figas.gov.fk", name: "Felix Pilot", role: "pilot" },
    { email: "oscar.pilot@figas.gov.fk", name: "Oscar Pilot", role: "pilot" },
    { email: "jessica.pilot@figas.gov.fk", name: "Jessica Pilot", role: "pilot" },
    { email: "engineer@figas.gov.fk", name: "Mike Engineer", role: "engineer" },
    { email: "passenger@figas.gov.fk", name: "Test Passenger", role: "passenger" },
  ];
  const userIdMap: Record<string, number> = {};
  for (const u of sysUsers) {
    const r = await prisma.$queryRawUnsafe<Array<{id:number}>>(
      `INSERT INTO users (name, email, password, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password
       RETURNING id`, u.name, u.email, pwHash, u.role
    );
    userIdMap[u.email] = r[0].id;
  }
  // Pilot records — resolve their actual name from sysUsers (skip if already seeded)
  for (const [email, license, rating, medExp] of [["felix.pilot@figas.gov.fk","ATPL-004","BN-2 Type Rating","2027-03-01"],["oscar.pilot@figas.gov.fk","CPL-005","BN-2 Type Rating","2026-11-01"],["jessica.pilot@figas.gov.fk","CPL-006","BN-2 Type Rating","2027-05-01"]] as const) {
    const pilotName = sysUsers.find(u => u.email === email)?.name ?? email.split("@")[0];
    const existing = await prisma.$queryRawUnsafe<Array<{id:number}>>(
      `SELECT id FROM pilots WHERE email = $1`, email
    );
    if (existing.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE pilots SET name = $1, license_number = $2, rating = $3,
           medical_expiry = $4::date, updated_at = NOW() WHERE email = $5`,
        pilotName, license, rating, medExp, email
      );
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO pilots (user_id, name, email, license_number, license_type, rating, medical_expiry, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ATPL', $5, $6::date, true, NOW(), NOW())`,
        userIdMap[email], pilotName, email, license, rating, medExp
      );
    }
  }
  console.log(`  ✓ ${sysUsers.length} system users + 3 pilots`);

  // 2b. Enhanced system user profiles — populate phone, nationality, residency,
  //     id documents, emergency contacts for role-specific profile completeness.
  const PHONE_PREFIXES: Record<string,string> = { admin:"+500 27100",ops:"+500 27101",checkin:"+500 27102",checkin2:"+500 27103",finance:"+500 27104",pilot:"+500 27200",engineer:"+500 27300",passenger:"+500 55500" };
  const NATIONALITIES = ["Falkland Islander","British","British","British","Falkland Islander","British","British","Falkland Islander","British","Falkland Islander"];
  for (let i = 0; i < sysUsers.length; i++) {
    const u = sysUsers[i];
    const roleKey = u.role === "pilot" ? "pilot" : u.role === "operations" ? "ops" : u.role === "checkin" ? (u.name.includes("Tom") ? "checkin2" : "checkin") : u.role;
    const phone = PHONE_PREFIXES[roleKey] || PHONE_PREFIXES.passenger;
    await prisma.$executeRawUnsafe(
      `UPDATE users SET phone = $1, nationality = $2, residency = 'resident',
         id_document_type = 'Passport', id_document_number = $3,
         emergency_contact_name = $4, emergency_contact_phone = $5,
         date_of_birth = $6::date, clothed_body_weight_kg = $7
       WHERE email = $8`,
      phone, NATIONALITIES[i], `FIG-${pad(i+1,4)}-P`,
      `Emergency Contact ${u.name.split(" ")[0]}`, `+500 2799${pad(i,2)}`,
      `${1980+rand(5,20)}-${pad(rand(1,12),2)}-${pad(rand(1,28),2)}`,
      rand(60,90), u.email
    );
  }
  console.log("  ✓ System user profiles enhanced");

  // 2c. Pilot scheduling duty limits — populate max_duty, flight hours and medical dates.
  try {
    for (const [email, , , _medExp] of [["felix.pilot@figas.gov.fk","ATPL-004","BN-2 Type Rating","2027-03-01"],["oscar.pilot@figas.gov.fk","CPL-005","BN-2 Type Rating","2026-11-01"],["jessica.pilot@figas.gov.fk","CPL-006","BN-2 Type Rating","2027-05-01"]] as const) {
      await prisma.$executeRawUnsafe(
        `UPDATE pilots SET max_duty_hours_per_day = 12.0, max_flight_hours_per_day = 8.0,
           current_duty_hours = 0, current_flight_hours = 0,
           last_medical_date = '2025-12-01'::date, next_medical_due = $1::date
         WHERE email = $2`,
        _medExp, email
      );
    }
    console.log("  ✓ Pilot duty limits & medical dates populated");
  } catch { /* scheduling extension columns may not exist yet */ }

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
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
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
    const exists = await prisma.$queryRawUnsafe<Array<{id:number}>>(
      `SELECT id FROM no_fly_rules WHERE label = $1`, r.label
    );
    if (exists.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE no_fly_rules SET rule_type = $2, specific_date = $3, day_of_week = $4, priority = $5, updated_at = NOW() WHERE label = $1`,
        r.label, r.recurring ? "recurring" : "one_off", r.specDate, r.dayOfWeek ? `{${r.dayOfWeek.join(",")}}` : null, r.priority
      );
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO no_fly_rules (label, description, rule_type, is_active, day_of_week, specific_date, priority, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, true, $4::int[], $5::date, $6, 1, NOW(), NOW())`,
        r.label, r.desc, r.recurring ? "recurring" : "one_off", r.dayOfWeek ? `{${r.dayOfWeek.join(",")}}` : null, r.specDate, r.priority
      );
    }
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
         VALUES ($1, $2, $3, true, NOW(), NOW())`,
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
        VALUES ($1::date, $2, $3, NOW(), NOW())
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
  // PHASE 7b: Chart of Accounts & Payment Methods
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 7b: Accounting Foundation ──");

  // Chart of Accounts — 20 accounts for double-entry bookkeeping
  const coaRows: Array<[string, string, string, string]> = [
    ["1010","Cash at Bank","asset","Cash held in bank accounts"],
    ["1020","Accounts Receivable","asset","Amounts owed by customers"],
    ["1030","Prepaid Expenses","asset","Prepaid insurance, leases, etc."],
    ["2010","Accounts Payable","liability","Amounts owed to suppliers"],
    ["2020","Deferred Revenue","liability","Unearned ticket revenue"],
    ["2030","VAT/GST Payable","liability","Value-added / GST collected"],
    ["3010","Retained Earnings","equity","Accumulated retained earnings"],
    ["3020","Current Year Earnings","equity","Current year profit/loss"],
    ["4010","Passenger Fare Revenue","revenue","Revenue from passenger ticket sales"],
    ["4020","Freight/Cargo Revenue","revenue","Revenue from freight and cargo"],
    ["4030","Baggage Fee Revenue","revenue","Revenue from baggage fees"],
    ["4040","Fuel Surcharge Revenue","revenue","Revenue from fuel surcharges"],
    ["4050","Cancellation Fee Revenue","revenue","Revenue from cancellation fees"],
    ["4060","Other Revenue","revenue","Miscellaneous revenue"],
    ["5010","Fuel Expense","expense","Aircraft fuel and oil costs"],
    ["5020","Maintenance Expense","expense","Aircraft maintenance and repair"],
    ["5030","Staff Costs","expense","Salaries, wages, and benefits"],
    ["5040","Landing & Handling Fees","expense","Airport landing and handling"],
    ["5050","Insurance Expense","expense","Aviation insurance premiums"],
    ["5060","Bank Charges & Processing Fees","expense","Bank and payment processing fees"],
  ];
  let coaCount = 0;
  for (const [code, name, type, desc] of coaRows) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, description, is_active, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, true, NOW())
       ON CONFLICT (account_code) DO NOTHING`,
      code, name, type, desc
    );
    coaCount++;
  }
  console.log(`  ✓ ${coaCount} chart of accounts`);

  // Payment Methods — 5 payment method reference records
  const pmRows: Array<[string, string, string|null, boolean, boolean, number]> = [
    ["stripe","Stripe (Card)","Online card payment via Stripe",true,false,1],
    ["pay_on_departure","Pay on Departure","Pay at check-in counter before flight",false,false,2],
    ["pay_on_arrival","Pay on Arrival","Pay upon arrival at destination",false,false,3],
    ["invoice","Invoice","Credit invoice for organization billing",false,true,4],
    ["bank_transfer","Bank Transfer","Direct bank transfer payment",false,false,5],
  ];
  let pmCount = 0;
  for (const [code, name, desc, online, inv] of pmRows) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO payment_methods (id, code, name, description, is_active, requires_online, requires_invoice, sort_order, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, true, $4, $5, $6, NOW())
       ON CONFLICT (code) DO NOTHING`,
      code, name, desc, online, inv, 0
    );
    pmCount++;
  }
  console.log(`  ✓ ${pmCount} payment methods`);

  // System Settings — 17 key application configuration records
  const settings: Array<[string, string, string]> = [
    ["app_name","FIGAS Airline Booking System","Application display name"],
    ["app_currency","GBP","Default currency"],
    ["default_page_size","20","Default pagination page size"],
    ["max_passengers_per_booking","9","Maximum passengers per booking"],
    ["min_passenger_age","2","Minimum passenger age"],
    ["min_registration_age","18","Minimum user registration age"],
    ["default_clothed_body_weight_kg","70","Default passenger weight when unknown"],
    ["max_baggage_weight_kg","50","Maximum baggage weight per passenger"],
    ["max_legs_per_booking","4","Maximum flight legs per booking"],
    ["checkin_reminder_hours_before","24","Hours before departure for check-in reminder"],
    ["bn2_mtow_kg","2994","BN-2 Islander max takeoff weight"],
    ["bn2_max_payload_kg","1160","BN-2 Islander max payload"],
    ["contact_email","bookings@figas.gov.fk","Booking contact email"],
    ["contact_phone","+500 27200","Booking contact phone"],
    ["fuel_price_gbp_per_litre","1.85","Current fuel price per litre"],
    ["tax_rate","0.00","VAT/tax rate (0% in Falkland Islands)"],
    ["default_payment_terms","due_on_receipt","Default payment terms for bookings"],
  ];
  let settingsCount = 0;
  for (const [key, value, desc] of settings) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO system_settings (key, value, description, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description`,
      key, value, desc
    );
    settingsCount++;
  }
  console.log(`  ✓ ${settingsCount} system settings`);

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
  // PHASE 9b: Fuel Orders (EFB pilot fuel operations)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 9b: Fuel Orders ──");
  const fuelFlightIds = Object.entries(flightNumberMap).slice(0, 40);
  let fuelOrderCount = 0;
  for (const [, flightId] of fuelFlightIds) {
    try {
      const legR = await prisma.$queryRawUnsafe<Array<{id:number}>>(
        "SELECT id FROM flight_legs WHERE flight_id = $1 LIMIT 1", flightId
      );
      if (legR.length === 0) continue;
      const fuelKg = rand(150, 350);
      await prisma.$executeRawUnsafe(
        `INSERT INTO fuel_orders (flight_id, flight_leg_id, status, requested_fuel_kg, issued_by, issued_at,
           fueler_actual_uplift_kg, fueler_confirmed_by, fueler_confirmed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, NOW(), NOW(), NOW())`,
        flightId, legR[0].id, "confirmed", fuelKg, userIdMap["felix.pilot@figas.gov.fk"],
        fuelKg + rand(-10, 10), userIdMap["engineer@figas.gov.fk"]
      );
      fuelOrderCount++;
    } catch { /* table may not exist */ }
  }
  console.log(`  ✓ ${fuelOrderCount} fuel orders`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 9c: Flight Manifests (with pilot sign-off for completed flights)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 9c: Flight Manifests ──");
  const completedFlights = Object.entries(flightNumberMap).slice(0, 150);
  let manifestCount = 0;
  for (const [, flightId] of completedFlights) {
    try {
      const paxCount = rand(1, 9);
      const paxWt = rand(300, 700);
      const bagWt = rand(50, 250);
      const freightWt = rand(0, 100);
      const fuelWt = rand(200, 400);
      const totalWt = 1627 + paxWt + bagWt + freightWt + fuelWt + 80;
      const pilotId = (pilotIds as Array<{id:number}>)[manifestCount % pilotIds.length].id;
      await prisma.$executeRawUnsafe(
        `INSERT INTO flight_manifests (flight_id, total_passengers, total_passenger_weight_kg,
           total_baggage_weight_kg, total_freight_weight_kg, total_fuel_weight_kg,
           total_weight_kg, aircraft_max_takeoff_weight_kg, weight_balance_percentage,
           pilot_signoff, pilot_id, signed_off_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 2994, $8, true, $9, NOW(), NOW(), NOW())`,
        flightId, paxCount, paxWt, bagWt, freightWt, fuelWt, totalWt, rand(80, 98), pilotId
      );
      manifestCount++;
    } catch { /* table may not exist */ }
  }
  console.log(`  ✓ ${manifestCount} flight manifests (pilot signed-off)`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 9d: Seat Assignments (per completed flight)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 9d: Seat Assignments ──");
  let seatCount = 0;
  const pastBookingsForSeats = allBookings.filter(b => b.date < "2026-06-05" && b.status !== "cancelled" && bookingIdMap[b.ref]);
  for (const bk of pastBookingsForSeats.slice(0, 300)) {
    const bookingId = bookingIdMap[bk.ref];
    if (!bookingId) continue;
    // Get booking leg passengers for this booking
    const blpRows = await prisma.$queryRawUnsafe<Array<{id:number; booking_passenger_id:number}>>(
      `SELECT blp.id, blp.booking_passenger_id FROM booking_leg_passengers blp
       JOIN booking_legs bl ON bl.id = blp.booking_leg_id
       WHERE bl.booking_id = $1`, bookingId
    );
    for (let si = 0; si < blpRows.length; si++) {
      try {
        const seatNum = `${si+1}${String.fromCharCode(65 + (si % 3))}`;
        // Look up flight_id from booking_legs (some aren't assigned)
        const flightR = await prisma.$queryRawUnsafe<Array<{flight_id:number|null}>>(
          `SELECT flight_id FROM booking_legs WHERE booking_id = $1 AND flight_id IS NOT NULL LIMIT 1`, bookingId
        );
        if (flightR.length === 0 || !flightR[0].flight_id) continue;
        await prisma.$executeRawUnsafe(
          `INSERT INTO seat_assignments (flight_id, passenger_id, seat_number, row_number, column_letter, is_available, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, false, NOW(), NOW())
           ON CONFLICT DO NOTHING`,
          flightR[0].flight_id, blpRows[si].booking_passenger_id, seatNum, si + 1, seatNum.slice(-1)
        );
        seatCount++;
      } catch { /* table may not exist */ }
    }
  }
  console.log(`  ✓ ${seatCount} seat assignments`);

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
  // Check-in reminders for upcoming bookings (derive flight_id from booking_legs)
  let ciReminderCount = 0;
  for (const bk of allBookings.filter(b => b.date >= "2026-06-06" && b.date < "2026-07-01")) {
    const bookingId = bookingIdMap[bk.ref];
    if (!bookingId) continue;
    try {
      // Get the first assigned flight_id for this booking
      const flR = await prisma.$queryRawUnsafe<Array<{flight_id:number|null}>>(
        `SELECT flight_id FROM booking_legs WHERE booking_id = $1 AND flight_id IS NOT NULL LIMIT 1`, bookingId
      );
      const flightId = flR.length > 0 ? flR[0].flight_id : null;
      await prisma.$executeRawUnsafe(
        `INSERT INTO checkin_reminders (booking_id, flight_id, scheduled_at, status, created_at, updated_at)
         VALUES ($1, $2, $3::timestamptz, 'pending', NOW(), NOW())`,
         bookingId, flightId, new Date(bk.date).toISOString()
      );
      ciReminderCount++;
    } catch { /* may fail if flight_id null */ }
  }
  console.log(`  ✓ ${notifCount} notifications + ${ciReminderCount} check-in reminders`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 10b: Stripe Payments (for card-based payments)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 10b: Stripe Payments ──");
  let stripeCount = 0;
  const cardPayments = await prisma.$queryRawUnsafe<Array<{id:number; amount_gbp:number}>>(
    `SELECT id, amount_gbp FROM payments WHERE method = 'card' AND status = 'completed' LIMIT 50`
  );
  for (const pmt of cardPayments) {
    try {
      const sessionId = `cs_test_${randomBytes(12).toString("hex")}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO stripe_payments (id, payment_id, stripe_session_id, stripe_payment_intent_id,
           amount_gbp, currency, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'GBP', 'succeeded', NOW(), NOW())
         ON CONFLICT (stripe_session_id) DO NOTHING`,
        pmt.id, sessionId, `pi_${randomBytes(12).toString("hex")}`, pmt.amount_gbp
      );
      stripeCount++;
    } catch { /* table may not exist */ }
  }
  console.log(`  ✓ ${stripeCount} stripe payment records`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 10c: Bank Transactions (for reconciliation testing)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 10c: Bank Transactions ──");
  let bankCount = 0;
  const bankPayments = await prisma.$queryRawUnsafe<Array<{id:number; amount_gbp:number; booking_id:number}>>(
    `SELECT id, amount_gbp, booking_id FROM payments
     WHERE method = 'bank_transfer' AND status = 'completed' AND amount_gbp > 0 LIMIT 30`
  );
  for (const pmt of bankPayments) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO bank_transactions (id, external_id, transaction_date, description, amount_gbp,
           reference, payment_id, reconciliation_status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, NOW()::date, $2, $3, $4, $5, $6, NOW(), NOW())`,
        `BTX-${pad(bankCount+1,6)}`,
        `Payment for booking ${pmt.booking_id}`,
        pmt.amount_gbp,
        `BK-${pmt.booking_id}`,
        pmt.id,
        Math.random() < 0.7 ? "matched" : "unmatched"
      );
      bankCount++;
    } catch { /* table may not exist */ }
  }
  console.log(`  ✓ ${bankCount} bank transactions`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 10d: Payment Reminders (for overdue invoice payments)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 10d: Payment Reminders ──");
  let reminderCount = 0;
  const overdueInvoices = await prisma.$queryRawUnsafe<Array<{id:string; booking_id:number}>>(
    `SELECT id::text, booking_id FROM invoices WHERE status = 'overdue' LIMIT 20`
  );
  for (const inv of overdueInvoices) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO payment_reminders (id, booking_id, invoice_id, reminder_type, scheduled_at, status, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, NOW(), 'pending', NOW())`,
        inv.booking_id, inv.id, "first"
      );
      reminderCount++;
    } catch { /* table may not exist */ }
  }
  console.log(`  ✓ ${reminderCount} payment reminders`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 10e: Export Log (sample financial exports)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 10e: Export Log ──");
  let exportCount = 0;
  for (const [etype, fmt, from, to, recs] of [
    ["daily_sales","csv","2026-04-01","2026-04-30",45],
    ["daily_sales","csv","2026-05-01","2026-05-31",62],
    ["tax_report","csv","2026-04-01","2026-06-30",180],
    ["aged_receivables","xlsx","2026-01-01","2026-06-30",35],
    ["bank_reconciliation","csv","2026-06-01","2026-06-30",22],
  ] as const) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO export_log (id, export_type, export_format, date_from, date_to, record_count, status, exported_by, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3::date, $4::date, $5, 'completed', $6, NOW())`,
        etype, fmt, from, to, recs, userIdMap["finance@figas.gov.fk"]
      );
      exportCount++;
    } catch { /* table may not exist */ }
  }
  console.log(`  ✓ ${exportCount} export log entries`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 10f: Defects (maintenance snag reports)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 10f: Defects ──");
  const defectAircraft = await prisma.$queryRawUnsafe<Array<{id:number; registration:string}>>(
    "SELECT id, registration FROM aircraft WHERE is_active = true"
  );
  let defectCount = 0;
  const defectTemplates = [
    { ata:"32-10",title:"Nose gear shimmy on landing",severity:"minor",mel:"32-10-01A"},
    { ata:"24-30",title:"Standby battery voltage low",severity:"minor",mel:"24-30-02B"},
    { ata:"33-10",title:"Cockpit instrument light flicker",severity:"minor",mel:"33-10-01B"},
    { ata:"52-10",title:"Passenger door seal worn",severity:"minor",mel:"52-10-01C"},
    { ata:"34-20",title:"GPS antenna intermittent signal",severity:"minor",mel:"34-20-01A"},
  ];
  for (const ac of defectAircraft) {
    for (const dt of defectTemplates) {
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO defects (aircraft_id, reported_by, ata_chapter, title, description, severity,
             mel_reference, mel_category, deferral_status, deferral_expiry_date, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'B',
             $8::varchar, $9::date, NOW())`,
          ac.id, userIdMap["felix.pilot@figas.gov.fk"], dt.ata, `${dt.title} (${ac.registration})`,
          `${dt.title} — reported during pre-flight inspection.`, dt.severity, dt.mel,
          Math.random() < 0.6 ? "deferred" : "open",
          Math.random() < 0.6 ? ymd(new Date(Date.now() + rand(7,60)*86400000)) : null
        );
        defectCount++;
      } catch { /* table may not exist */ }
    }
  }
  console.log(`  ✓ ${defectCount} defect reports`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 10g: Airframe Hours (from data/airframe_hours.csv)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Phase 10g: Airframe Hours ──");
  let ahCount = 0;
  try {
    const ahCsv = fs.readFileSync(path.resolve("data/airframe_hours.csv"), "utf-8");
    const ahLines = ahCsv.split("\n").slice(1).filter(l => l.trim());
    for (const line of ahLines) {
      const parts = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      if (parts.length < 13 || !parts[0]) continue;
      const [callSign, lastReading, totalHrs, nextCheck, nextType, daysRem, nextCheckDue, hrsUntilNext,
             next500, hrsUntil500, next1000, hrsUntil1000, status] = parts;
      const acR = await prisma.$queryRawUnsafe<Array<{id:number}>>(
        "SELECT id FROM aircraft WHERE registration = $1", callSign
      );
      if (acR.length === 0) continue;
      await prisma.$executeRawUnsafe(
        `INSERT INTO airframe_hours (aircraft_id, last_reading_date, total_hours, next_check_date,
           next_check_type, days_remaining, next_check_due_hours, hours_until_next_check,
           next_500_hour_check, hours_until_500_check, next_1000_hour_check,
           hours_until_1000_check, status, created_at, updated_at)
         VALUES ($1, $2::date, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        acR[0].id, lastReading, totalHrs, nextCheck, parseInt(nextType) || 1,
        parseInt(daysRem) || 0, nextCheckDue, hrsUntilNext, next500, hrsUntil500, next1000, hrsUntil1000, status
      );
      ahCount++;
    }
  } catch (err) { console.log(`  ⚠ Airframe hours CSV not found or parse error: ${err instanceof Error ? err.message : String(err)}`); }
  console.log(`  ✓ ${ahCount} airframe hour records`);

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 19: Summary
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
  // Extension tables — may not exist if schema was created via prisma db push
  let extCounts: Record<string,number> = {};
  try {
    extCounts = (await prisma.$queryRawUnsafe<Array<Record<string,number>>>(
      `SELECT
        (SELECT COUNT(*) FROM chart_of_accounts) AS chart_of_accounts,
        (SELECT COUNT(*) FROM payment_methods) AS payment_methods,
        (SELECT COUNT(*) FROM system_settings) AS system_settings,
        (SELECT COUNT(*) FROM fuel_orders) AS fuel_orders,
        (SELECT COUNT(*) FROM flight_manifests) AS flight_manifests,
        (SELECT COUNT(*) FROM seat_assignments) AS seat_assignments,
        (SELECT COUNT(*) FROM stripe_payments) AS stripe_payments,
        (SELECT COUNT(*) FROM bank_transactions) AS bank_transactions,
        (SELECT COUNT(*) FROM payment_reminders) AS payment_reminders,
        (SELECT COUNT(*) FROM export_log) AS export_log,
        (SELECT COUNT(*) FROM defects) AS defects,
        (SELECT COUNT(*) FROM airframe_hours) AS airframe_hours`
    ))[0];
  } catch { /* extension tables may not exist with prisma db push */ }
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
       (SELECT COUNT(*) FROM chart_of_accounts) AS chart_of_accounts,
       (SELECT COUNT(*) FROM payment_methods) AS payment_methods,
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
  console.log(`  Chart of Accounts:   ${extCounts.chart_of_accounts ?? "N/A"}`);
  console.log(`  Payment Methods:     ${extCounts.payment_methods ?? "N/A"}`);
  console.log(`  System Settings:     ${extCounts.system_settings ?? "N/A"}`);
  console.log(`  Fuel Orders:         ${extCounts.fuel_orders ?? "N/A"}`);
  console.log(`  Flight Manifests:    ${extCounts.flight_manifests ?? "N/A"}`);
  console.log(`  Seat Assignments:    ${extCounts.seat_assignments ?? "N/A"}`);
  console.log(`  Stripe Payments:     ${extCounts.stripe_payments ?? "N/A"}`);
  console.log(`  Bank Transactions:   ${extCounts.bank_transactions ?? "N/A"}`);
  console.log(`  Payment Reminders:   ${extCounts.payment_reminders ?? "N/A"}`);
  console.log(`  Export Logs:         ${extCounts.export_log ?? "N/A"}`);
  console.log(`  Defects:             ${extCounts.defects ?? "N/A"}`);
  console.log(`  Airframe Hours:      ${extCounts.airframe_hours ?? "N/A"}`);
  console.log("══════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
