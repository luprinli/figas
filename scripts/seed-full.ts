/* eslint-disable @typescript-eslint/no-explicit-any */
import pg from "pg";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      resolve(salt + ":" + key.toString("hex"));
    });
  });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_DIR = path.resolve(process.cwd(), "data");

/** Aerodrome name → code mapping for fare matrix parsing */
const AERODROME_NAME_TO_CODE: Record<string, string> = {
  Albemarle: "ALB",
  "Beaver Island": "BVI",
  "Bleaker Island": "BKI",
  "Carcass Island": "CCI",
  Chartres: "CHR",
  Darwin: "DWN",
  "Douglas Station": "DGS",
  "Dunnose Head": "DNH",
  "Fox Bay": "FXB",
  "George Island": "GEI",
  "Hill Cove": "HLC",
  "Lively Island": "LYI",
  "Mount Pleasant": "MPA",
  "New Island": "NWI",
  "North Arm": "NHA",
  "Pebble Island": "PBI",
  "Goose Green": "PGR",
  "Port Edgar": "PHD",
  "Port Howard": "PHP",
  "Port San Carlos": "PSC",
  "Port Stephens": "PST",
  "Roy Cove": "RYC",
  Salvador: "SDR",
  "San Carlos": "SNC",
  "Saunders Island": "SDI",
  "Sea Lion Island": "SLI",
  "Shallow Harbour": "SHB",
  "Speedwell Island": "SPI",
  "Spring Point": "SPP",
  Stanley: "STY",
  "Walker Creak": "WKC",
  "Weddell Island": "WDI",
  "West Point Island": "WPI",
};

/** Codes that exist in the fare matrix but NOT in our aerodromes CSV – skip these */
const SKIP_FARE_CODES = new Set(["DNH", "SDR", "SNC", "WKC"]);

/** All valid aerodrome codes from the CSV */
const VALID_AERODROME_CODES = new Set([
  "ALB", "BVI", "BKI", "CCI", "CHR", "DGS", "DWN", "FBE", "FXB",
  "GEI", "HLC", "LYI", "MPA", "NWI", "NHA", "PBI", "PGR", "PHD",
  "PHP", "PSC", "PST", "RYC", "SDI", "SLI", "SHB", "SPI", "SPP",
  "STY", "WDI", "WPI",
]);

// ---------------------------------------------------------------------------
// CSV parsing helpers
// ---------------------------------------------------------------------------

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  });
}

function parseTSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line) => line.split("\t").map((cell) => cell.trim()));
}

// ---------------------------------------------------------------------------
// Clear tables
// ---------------------------------------------------------------------------

async function clearAllTables(): Promise<void> {
  const tables = [
    "payments",
    "booking_passengers",
    "booking_legs",
    "bookings",
    "flight_manifests",
    "notifications",
    "checkin_reminders",
    "seat_assignments",
    "flights",
    "fare_routes",
    "pilots",
    "airframe_hours",
    "aerodrome_distances",
    "aerodrome_headings",
    "fuel_rules",
    "aircraft",
    "aerodromes",
    "users",
    "organizations",
    "system_settings",
  ];

  for (const table of tables) {
    await pool.query(`DELETE FROM ${table}`);
    await pool
      .query(`ALTER SEQUENCE ${table}_id_seq RESTART WITH 1`)
      .catch(() => {
        // Some tables may not have a sequence
      });
  }
  console.log("  ✓ All tables cleared");
}

// ---------------------------------------------------------------------------
// Seed users
// ---------------------------------------------------------------------------

async function seedUsers(): Promise<void> {
  const password = await hashPassword("figas2024!");

  const users = [
    {
      name: "Admin User",
      email: "admin@figas.gov.fk",
      role: "admin",
      is_active: true,
      date_of_birth: "1985-01-15",
      residency_status: "resident",
      clothed_body_weight_kg: 80,
    },
    {
      name: "Operations User",
      email: "ops@figas.gov.fk",
      role: "operations",
      is_active: true,
      date_of_birth: "1992-11-05",
      residency_status: "resident",
      clothed_body_weight_kg: 70,
    },
    {
      name: "Engineer User",
      email: "engineer@figas.gov.fk",
      role: "engineer",
      is_active: true,
      date_of_birth: "1987-09-12",
      residency_status: "resident",
      clothed_body_weight_kg: 85,
    },
    {
      name: "Passenger User",
      email: "passenger@figas.gov.fk",
      role: "passenger",
      is_active: true,
      date_of_birth: "1995-04-22",
      residency_status: "resident",
      clothed_body_weight_kg: 75,
    },
    {
      name: "Checkin User",
      email: "checkin@figas.gov.fk",
      role: "checkin",
      is_active: true,
      date_of_birth: "1993-07-18",
      residency_status: "resident",
      clothed_body_weight_kg: 65,
    },
    {
      name: "Finance Officer",
      email: "finance@figas.gov.fk",
      role: "finance",
      is_active: true,
      date_of_birth: "1989-03-22",
      residency_status: "resident",
      clothed_body_weight_kg: 72,
    },
  ];

  for (const u of users) {
    await pool.query(
      `INSERT INTO users (name, email, password, role, is_active, date_of_birth, residency_status, clothed_body_weight_kg)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        u.name,
        u.email,
        password,
        u.role,
        u.is_active,
        u.date_of_birth,
        u.residency_status,
        u.clothed_body_weight_kg,
      ]
    );
  }

  console.log(`  ✓ ${users.length} system users seeded`);
}

// ---------------------------------------------------------------------------
// Seed aerodromes from CSV
// ---------------------------------------------------------------------------

async function seedAerodromes(): Promise<void> {
  const raw = fs.readFileSync(path.join(DATA_DIR, "aerodromes.csv"), "utf-8");
  const rows = parseCSV(raw);
  const dataRows = rows.slice(1);

  let count = 0;
  for (const row of dataRows) {
    const name = row[0];
    const code = row[1];
    const latStr = row[2];
    const lngStr = row[3];
    const runway1Dir = row[6] || null;
    const runway1Len = row[7] ? parseFloat(row[7]) : null;
    const runway2Len = row[10] ? parseFloat(row[10]) : null;
    const runway3Len = row[13] ? parseFloat(row[13]) : null;

    // Use the longest runway length
    const runwayLength = Math.max(
      runway1Len || 0,
      runway2Len || 0,
      runway3Len || 0
    ) || null;

    // Derive city from name
    let city: string | null = name;
    if (name.includes("Stanley")) {
      city = "Stanley";
    } else if (name.includes("Mount Pleasant")) {
      city = "Mount Pleasant";
    } else if (name === "Douglas Station") {
      city = "Douglas Station";
    } else if (name === "Darwin") {
      city = "Darwin";
    }

    // Parse lat/lng – DGS and DWN have empty lat/lng
    const latitude = latStr ? parseFloat(latStr) : null;
    const longitude = lngStr ? parseFloat(lngStr) : null;

    await pool.query(
      `INSERT INTO aerodromes (code, name, city, latitude, longitude, runway_length, runway_type, timezone, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (code) DO NOTHING`,
      [
        code,
        name,
        city,
        latitude,
        longitude,
        runwayLength,
        runway1Dir,
        "Atlantic/Stanley",
        true,
      ]
    );
    count++;
  }

  // Also add STY (Stanley) which is used in the fare matrix and FlightList.csv
  // which is coded as STY in the aerodromes CSV
  await pool.query(
    `INSERT INTO aerodromes (code, name, city, latitude, longitude, timezone, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (code) DO NOTHING`,
    ["STY", "Stanley", "Stanley", -51.685, -57.777, "Atlantic/Stanley", true]
  );
  console.log(`  ✓ ${count + 1} aerodromes seeded (incl. STY alias for Stanley)`);
}

// ---------------------------------------------------------------------------
// Seed aircraft from CSV
// ---------------------------------------------------------------------------

async function seedAircraft(): Promise<void> {
  const raw = fs.readFileSync(path.join(DATA_DIR, "aircraft.csv"), "utf-8");
  const rows = parseCSV(raw);
  const dataRows = rows.slice(1); // Skip header

  let count = 0;
  for (const row of dataRows) {
    const registration = row[0];
    const emptyWeight = parseFloat(row[1]);
    const maxFuel = parseFloat(row[2]);
    const seats = parseInt(row[3], 10);

    await pool.query(
      `INSERT INTO aircraft (registration, type, manufacturer, model, year, seat_count, empty_weight_kg, max_takeoff_weight_kg, max_payload_kg, fuel_capacity_kg, max_freight_weight, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (registration) DO NOTHING`,
      [
        registration,
        "BN-2 Islander",
        "Britten-Norman",
        "BN-2B-26",
        2020,
        seats,
        emptyWeight,
        2994, // standard MTOW
        emptyWeight, // stored as max_payload_kg but actually empty weight per spec
        maxFuel,
        500,
        true,
      ]
    );
    count++;
  }

  console.log(`  ✓ ${count} aircraft seeded`);
}

// ---------------------------------------------------------------------------
// Seed pilots from CSV (also creates user accounts for each pilot)
// ---------------------------------------------------------------------------

async function seedPilots(): Promise<void> {
  const raw = fs.readFileSync(path.join(DATA_DIR, "pilots.csv"), "utf-8");
  const rows = parseCSV(raw);
  const dataRows = rows.slice(1).filter((r) => r[0] && r[0].trim().length > 0);

  const password = await hashPassword("figas2024!");

  let count = 0;
  for (const row of dataRows) {
    const name = row[0].trim();
    const weight = parseFloat(row[1]);
    const license = row[2].trim();
    const status = row[3].trim();
    const isActive = status.toLowerCase() === "active";

    const email = `${name.toLowerCase()}.pilot@figas.gov.fk`;

    // Create user account
    const userResult = await pool.query(
      `INSERT INTO users (name, email, password, role, is_active, clothed_body_weight_kg, date_of_birth)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [name, email, password, "pilot", isActive, weight, "1990-01-01"]
    );
    const userId = userResult.rows[0].id;

    // Create pilot record
    await pool.query(
      `INSERT INTO pilots (user_id, name, email, license_number, license_type, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, name, email, license, license, isActive]
    );
    count++;
  }

  console.log(`  ✓ ${count} pilots seeded (with user accounts)`);
}

// ---------------------------------------------------------------------------
// Seed fare routes from MATRIX FARES.txt
// ---------------------------------------------------------------------------

async function seedFareRoutes(): Promise<void> {
  const raw = fs.readFileSync(
    path.join(DATA_DIR, "MATRIX FARES.txt"),
    "utf-8"
  );

  // The file is a single line with format:
  // "MATRIX FARES <code> <code> ... <name> <price> <price> ... <name> <price> ..."
  const line = raw.trim();
  if (!line) {
    console.log("  ⚠ Fare matrix file is empty");
    return;
  }

  // Split by whitespace
  const parts = line.split(/\s+/);

  // First two parts are "MATRIX" and "FARES"
  // Next 32 parts are the destination codes (ALB BVI BKI ... WPI)
  // Then alternating: name (may be multi-word) followed by 32 prices
  let idx = 2; // Skip "MATRIX" and "FARES"

  // Read destination codes (32 codes)
  const fareCodes: string[] = [];
  while (idx < parts.length) {
    const part = parts[idx];
    // Check if this part looks like a code (3 uppercase letters) or a name start
    if (/^[A-Z]{3}$/.test(part) && !AERODROME_NAME_TO_CODE[part]) {
      fareCodes.push(part);
      idx++;
    } else {
      break;
    }
  }

  if (fareCodes.length === 0) {
    console.log("  ⚠ No destination codes found in fare matrix");
    return;
  }

  let routeCount = 0;

  // Now parse name + price groups
  while (idx < parts.length) {
    // Read the aerodrome name (may be multiple words)
    let originName = "";
    let originCode: string | null = null;

    // Try to match known aerodrome names starting from current position
    const remaining = parts.slice(idx).join(" ");
    for (const [name, code] of Object.entries(AERODROME_NAME_TO_CODE)) {
      if (remaining.startsWith(name)) {
        originCode = code;
        originName = name;
        break;
      }
    }

    if (!originCode) {
      // Skip unknown entries
      idx++;
      continue;
    }

    if (SKIP_FARE_CODES.has(originCode) || !VALID_AERODROME_CODES.has(originCode)) {
      // Skip this origin but advance past name + prices
      idx += originName.split(/\s+/).length + fareCodes.length;
      continue;
    }

    // Advance past the name parts
    const nameParts = originName.split(/\s+/);
    idx += nameParts.length;

    // Read the prices for this origin
    for (let j = 0; j < fareCodes.length && idx + j < parts.length; j++) {
      const destCode = fareCodes[j];
      if (SKIP_FARE_CODES.has(destCode)) continue;
      if (!VALID_AERODROME_CODES.has(destCode)) continue;

      const priceStr = parts[idx + j];
      if (!priceStr) continue;

      // Parse "£89.80" → 89.80
      const price = parseFloat(priceStr.replace(/[£,]/g, ""));
      if (isNaN(price)) continue;

      await pool.query(
        `INSERT INTO fare_routes (origin_code, destination_code, base_fare, base_fare_gbp, currency)
         VALUES ($1, $2, $3, $3, 'GBP')
         ON CONFLICT DO NOTHING`,
        [originCode, destCode, price]
      );
      routeCount++;
    }

    // Advance past the prices
    idx += fareCodes.length;
  }

  console.log(`  ✓ ${routeCount} fare routes seeded`);
}

// ---------------------------------------------------------------------------
// Seed fuel rules from fuel.csv
// ---------------------------------------------------------------------------

async function seedFuelRules(): Promise<void> {
  const raw = fs.readFileSync(path.join(DATA_DIR, "fuel.csv"), "utf-8");
  // Fuel CSV is tab-separated
  const rows = parseTSV(raw);
  const dataRows = rows.slice(1).filter((r) => r.length >= 5 && r[0].length > 0);

  let count = 0;
  for (const row of dataRows) {
    const flightTimeMinutes = parseInt(row[0], 10);
    const sectors = parseInt(row[1], 10);
    const requiredFuel = parseFloat(row[2]);
    const minimumFuel = parseFloat(row[3]);
    const fuelState = row[4].trim();

    if (isNaN(flightTimeMinutes) || isNaN(sectors)) continue;

    await pool.query(
      `INSERT INTO fuel_rules (flight_time_minutes, sectors, required_fuel_kg, minimum_fuel_kg, fuel_state)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (flight_time_minutes, sectors) DO NOTHING`,
      [flightTimeMinutes, sectors, requiredFuel, minimumFuel, fuelState]
    );
    count++;
  }

  console.log(`  ✓ ${count} fuel rules seeded`);
}

// ---------------------------------------------------------------------------
// Seed aerodrome distances from distance.csv
// ---------------------------------------------------------------------------

async function seedDistances(): Promise<void> {
  const raw = fs.readFileSync(path.join(DATA_DIR, "distance.csv"), "utf-8");
  const rows = parseTSV(raw);

  if (rows.length < 2) {
    console.log("  ⚠ Distance matrix has insufficient data");
    return;
  }

  // First row contains the column headers (codes), first cell is empty
  const codes = rows[0].slice(1); // Skip empty first cell

  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const originCode = row[0];
    if (!originCode || !VALID_AERODROME_CODES.has(originCode)) continue;

    for (let j = 1; j < row.length && j - 1 < codes.length; j++) {
      const destCode = codes[j - 1];
      if (!destCode || !VALID_AERODROME_CODES.has(destCode)) continue;
      if (originCode === destCode) continue;

      const distStr = row[j];
      if (!distStr || distStr.length === 0) continue;

      const distance = parseFloat(distStr);
      if (isNaN(distance)) continue;

      await pool.query(
        `INSERT INTO aerodrome_distances (origin_code, destination_code, distance_nm)
         VALUES ($1, $2, $3)
         ON CONFLICT (origin_code, destination_code) DO NOTHING`,
        [originCode, destCode, distance]
      );
      count++;
    }
  }

  console.log(`  ✓ ${count} aerodrome distances seeded`);
}

// ---------------------------------------------------------------------------
// Seed aerodrome headings from heading.csv
// ---------------------------------------------------------------------------

async function seedHeadings(): Promise<void> {
  const raw = fs.readFileSync(path.join(DATA_DIR, "heading.csv"), "utf-8");
  const rows = parseTSV(raw);

  if (rows.length < 2) {
    console.log("  ⚠ Heading matrix has insufficient data");
    return;
  }

  // First row contains the column headers (codes), first cell is empty
  const codes = rows[0].slice(1);

  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const originCode = row[0];
    if (!originCode || !VALID_AERODROME_CODES.has(originCode)) continue;

    for (let j = 1; j < row.length && j - 1 < codes.length; j++) {
      const destCode = codes[j - 1];
      if (!destCode || !VALID_AERODROME_CODES.has(destCode)) continue;
      if (originCode === destCode) continue;

      const headingStr = row[j];
      if (!headingStr || headingStr.length === 0) continue;

      const heading = parseFloat(headingStr);
      if (isNaN(heading)) continue;

      await pool.query(
        `INSERT INTO aerodrome_headings (origin_code, destination_code, heading_degrees)
         VALUES ($1, $2, $3)
         ON CONFLICT (origin_code, destination_code) DO NOTHING`,
        [originCode, destCode, heading]
      );
      count++;
    }
  }

  console.log(`  ✓ ${count} aerodrome headings seeded`);
}

// ---------------------------------------------------------------------------
// Seed airframe hours from airframe_hours.csv
// ---------------------------------------------------------------------------

async function seedAirframeHours(): Promise<void> {
  const raw = fs.readFileSync(
    path.join(DATA_DIR, "airframe_hours.csv"),
    "utf-8"
  );
  const rows = parseCSV(raw);
  const dataRows = rows.slice(1).filter((r) => r[0] && r[0].trim().length > 0);

  let count = 0;
  for (const row of dataRows) {
    const callSign = row[0].trim();
    const lastReadingDate = row[1].trim();
    const totalHours = row[2].trim();
    const nextCheckDate = row[3].trim();
    const nextCheckType = parseInt(row[4], 10);
    const daysRemaining = parseInt(row[5], 10);
    const nextCheckDueHours = row[6].trim();
    const hoursUntilNextCheck = row[7].trim();
    const next500HourCheck = row[8].trim();
    const hoursUntil500Check = row[9].trim();
    const next1000HourCheck = row[10].trim();
    const hoursUntil1000Check = row[11].trim();
    const status = row[12].trim();

    // Look up aircraft_id by registration (call_sign)
    const aircraftResult = await pool.query(
      `SELECT id FROM aircraft WHERE registration = $1`,
      [callSign]
    );

    if (aircraftResult.rows.length === 0) {
      console.log(`  ⚠ Aircraft not found for call sign: ${callSign}`);
      continue;
    }

    const aircraftId = aircraftResult.rows[0].id;

    await pool.query(
      `INSERT INTO airframe_hours (aircraft_id, last_reading_date, total_hours, next_check_date, next_check_type, days_remaining, next_check_due_hours, hours_until_next_check, next_500_hour_check, hours_until_500_check, next_1000_hour_check, hours_until_1000_check, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        aircraftId,
        lastReadingDate,
        totalHours,
        nextCheckDate,
        nextCheckType,
        daysRemaining,
        nextCheckDueHours,
        hoursUntilNextCheck,
        next500HourCheck,
        hoursUntil500Check,
        next1000HourCheck,
        hoursUntil1000Check,
        status,
      ]
    );
    count++;
  }

  console.log(`  ✓ ${count} airframe hour records seeded`);
}

// ---------------------------------------------------------------------------
// Seed system settings
// ---------------------------------------------------------------------------

async function seedSystemSettings(): Promise<void> {
  const settings: Array<{ key: string; value: string; description: string }> = [
    {
      key: "app_name",
      value: "FIGAS Airline Booking System",
      description: "Application display name",
    },
    { key: "app_currency", value: "GBP", description: "Default currency" },
    {
      key: "default_page_size",
      value: "20",
      description: "Default pagination page size",
    },
    {
      key: "max_passengers_per_booking",
      value: "9",
      description: "Maximum passengers per booking",
    },
    {
      key: "min_passenger_age",
      value: "2",
      description: "Minimum passenger age",
    },
    {
      key: "min_registration_age",
      value: "18",
      description: "Minimum user registration age",
    },
    {
      key: "default_clothed_body_weight_kg",
      value: "70",
      description: "Default passenger weight when unknown",
    },
    {
      key: "max_baggage_weight_kg",
      value: "50",
      description: "Maximum baggage weight per passenger",
    },
    {
      key: "max_legs_per_booking",
      value: "4",
      description: "Maximum flight legs per booking",
    },
    {
      key: "checkin_reminder_hours_before",
      value: "24",
      description: "Hours before departure to send check-in reminder",
    },
    {
      key: "bn2_mtow_kg",
      value: "2994",
      description: "BN-2 Islander max takeoff weight",
    },
    {
      key: "bn2_max_payload_kg",
      value: "1160",
      description: "BN-2 Islander max payload",
    },
    {
      key: "contact_email",
      value: "bookings@figas.gov.fk",
      description: "Booking contact email",
    },
    {
      key: "contact_phone",
      value: "+500 27200",
      description: "Booking contact phone",
    },
  ];

  for (const s of settings) {
    await pool.query(
      `INSERT INTO system_settings (key, value, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, description = $3, updated_at = NOW()`,
      [s.key, s.value, s.description]
    );
  }

  console.log(`  ✓ ${settings.length} system settings seeded`);
}

// ---------------------------------------------------------------------------
// Seed organizations
// ---------------------------------------------------------------------------

async function seedOrganizations(): Promise<void> {
  const orgs = [
    {
      name: "Falkland Islands Government",
      code: "FIG",
      contact_email: "admin@fig.gov.fk",
      contact_phone: "+500 27000",
      is_active: true,
    },
    {
      name: "Falkland Islands Tourist Board",
      code: "FITB",
      contact_email: "info@touristboard.gov.fk",
      contact_phone: "+500 22215",
      is_active: true,
    },
  ];

  for (const o of orgs) {
    await pool.query(
      `INSERT INTO organizations (name, code, contact_email, contact_phone, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO NOTHING`,
      [o.name, o.code, o.contact_email, o.contact_phone, o.is_active]
    );
  }

  console.log(`  ✓ ${orgs.length} organizations seeded`);
}

// ---------------------------------------------------------------------------
// Seed sample passengers (created by operations user)
// ---------------------------------------------------------------------------

async function seedPassengers(): Promise<void> {
  // Get the operations user ID
  const opsResult = await pool.query(
    `SELECT id FROM users WHERE email = 'ops@figas.gov.fk'`
  );
  if (opsResult.rows.length === 0) {
    console.log("  ⚠ Operations user not found, skipping passenger seeding");
    return;
  }
  const opsUserId = opsResult.rows[0].id;

  // Create a sample booking for the operations user to attach passengers to
  const bookingResult = await pool.query(
    `INSERT INTO bookings (booking_reference, user_id, status, total_amount, payment_status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    ["SEED-ADMIN-001", opsUserId, "confirmed", 0, "pending"]
  );
  const bookingId = bookingResult.rows[0].id;

  const passengers = [
    {
      salutation: "Mr",
      first_name: "John",
      last_name: "Smith",
      date_of_birth: "1985-03-15",
      clothed_body_weight_kg: 82,
      phone: "+500 12345",
      email: "john.smith@example.com",
    },
    {
      salutation: "Mrs",
      first_name: "Sarah",
      last_name: "Johnson",
      date_of_birth: "1990-07-22",
      clothed_body_weight_kg: 65,
      phone: "+500 12346",
      email: "sarah.johnson@example.com",
    },
    {
      salutation: "Dr",
      first_name: "Michael",
      last_name: "Brown",
      date_of_birth: "1978-11-08",
      clothed_body_weight_kg: 78,
      phone: "+500 12347",
      email: "michael.brown@example.com",
    },
    {
      salutation: "Ms",
      first_name: "Emily",
      last_name: "Davis",
      date_of_birth: "1995-05-30",
      clothed_body_weight_kg: 60,
      phone: "+500 12348",
      email: "emily.davis@example.com",
    },
    {
      salutation: "Mr",
      first_name: "James",
      last_name: "Wilson",
      date_of_birth: "1982-09-12",
      clothed_body_weight_kg: 90,
      phone: "+500 12349",
      email: "james.wilson@example.com",
    },
    {
      salutation: "Miss",
      first_name: "Emma",
      last_name: "Taylor",
      date_of_birth: "2000-01-25",
      clothed_body_weight_kg: 55,
      phone: "+500 12350",
      email: "emma.taylor@example.com",
    },
    {
      salutation: "Mr",
      first_name: "David",
      last_name: "Anderson",
      date_of_birth: "1975-06-18",
      clothed_body_weight_kg: 85,
      phone: "+500 12351",
      email: "david.anderson@example.com",
    },
    {
      salutation: "Mrs",
      first_name: "Lisa",
      last_name: "Thomas",
      date_of_birth: "1988-12-03",
      clothed_body_weight_kg: 70,
      phone: "+500 12352",
      email: "lisa.thomas@example.com",
    },
  ];

  for (const p of passengers) {
    await pool.query(
      `INSERT INTO booking_passengers (booking_id, salutation, first_name, last_name, date_of_birth, clothed_body_weight_kg, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        bookingId,
        p.salutation,
        p.first_name,
        p.last_name,
        p.date_of_birth,
        p.clothed_body_weight_kg,
        p.phone,
        p.email,
      ]
    );
  }

  console.log(`  ✓ ${passengers.length} sample passengers seeded`);
}

// ---------------------------------------------------------------------------
// Seed bookings from FlightList.csv
// ---------------------------------------------------------------------------

interface FlightListRow {
  flightDate: string;
  ticketNumber: string;
  from: string;
  to: string;
  fullName: string;
  type: string;
  passengerWeightKg: number | null;
  baggageWeightKg: number | null;
  contact: string | null;
  passengerAge: number | null;
  bookingRef: string;
  sectorRemarks: string;
  paymentRemarks: string;
  lateBooking: string;
}

function parseFlightListCSV(text: string): FlightListRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const rows: FlightListRow[] = [];

  // Skip header (line 0), start from line 1
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());

    // Skip empty rows (row 68)
    if (result.length < 2 || (result[0].length === 0 && result[1].length === 0)) {
      continue;
    }

    // Ensure we have enough columns; pad with empty strings if needed
    while (result.length < 15) {
      result.push("");
    }

    const flightDate = result[0];
    const ticketNumber = result[1];
    const from = result[2];
    const to = result[3];
    const fullName = result[4];
    const type = result[5];
    const passengerWeightKg = result[6] ? parseFloat(result[6]) : null;
    const baggageWeightKg = result[7] ? parseFloat(result[7]) : null;
    const contact = result[8] || null;
    const passengerAge = result[9] ? parseInt(result[9], 10) : null;
    const bookingRef = result[10];
    const sectorRemarks = result[11] || "";
    // Column 12 (index 12) is an empty column, skip it
    const paymentRemarks = result[13] || "";
    const lateBooking = result[14] || "No";

    rows.push({
      flightDate,
      ticketNumber,
      from,
      to,
      fullName,
      type,
      passengerWeightKg,
      baggageWeightKg,
      contact,
      passengerAge,
      bookingRef,
      sectorRemarks,
      paymentRemarks,
      lateBooking,
    });
  }

  return rows;
}

/** Extract the numeric reference from a Booking Ref string like "Women in Wildlife (49727)" → "49727" */
function extractBookingReference(bookingRef: string): string {
  const match = bookingRef.match(/\((\d+)\)$/);
  if (match) {
    return match[1];
  }
  // If no parentheses, use the whole string (sanitized)
  return bookingRef.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/** Parse a full name like "Ms Donna Bourdon" → { salutation: "Ms", first: "Donna", last: "Bourdon" } */
function parseFullName(fullName: string): { salutation: string; first: string; last: string } {
  const salutations = ["Miss.", "Miss", "Ms", "Mrs", "Mr", "Doctor", "Dr"];
  let salutation = "";
  let namePart = fullName.trim();

  for (const sal of salutations) {
    if (namePart.startsWith(sal + " ") || namePart.startsWith(sal + ".")) {
      salutation = sal;
      namePart = namePart.slice(sal.length).replace(/^[.\s]+/, "").trim();
      break;
    }
  }

  // Handle "Doctor" → "Dr" for consistency
  if (salutation === "Doctor") salutation = "Dr";

  const parts = namePart.split(/\s+/);
  if (parts.length === 0) {
    return { salutation: "", first: fullName, last: "" };
  }

  const first = parts[0];
  const last = parts.slice(1).join(" ");

  return { salutation, first, last };
}

/** Generate email from name */
function generateEmail(first: string, last: string): string {
  const emailFirst = first.toLowerCase().replace(/[^a-z]/g, "");
  const emailLast = last.toLowerCase().replace(/[^a-z]/g, "");
  return `${emailFirst}.${emailLast}@example.com`;
}

/** Map Type: to nationality */
function mapNationality(type: string): string {
  const t = type.trim().toLowerCase();
  if (t === "tourist") return "Unknown";
  if (t === "stanley resident") return "Falkland Islands";
  if (t === "camp resident") return "Falkland Islands";
  if (t === "temporary resident") return "Falkland Islands";
  if (t === "medical") return "Falkland Islands";
  if (t === "military") return "British Forces";
  return "Unknown";
}

/** Map Type: to residency_status */
function mapResidencyStatus(type: string): string {
  const t = type.trim().toLowerCase();
  if (t === "tourist") return "tourist";
  if (t === "stanley resident") return "resident";
  if (t === "camp resident") return "resident";
  if (t === "temporary resident") return "temporary";
  if (t === "medical") return "resident";
  if (t === "military") return "military";
  return "tourist";
}

/** Calculate approximate date of birth from age and reference date */
function approximateDateOfBirth(age: number | null, referenceDate: string): string {
  if (age === null) return "1980-01-01";
  // Parse the flight date (DD/MM/YYYY or D/M/YYYY)
  const parts = referenceDate.split("/");
  if (parts.length !== 3) return "1980-01-01";
  const refYear = parseInt(parts[2], 10);
  const refMonth = parseInt(parts[1], 10);
  const refDay = parseInt(parts[0], 10);
  const birthYear = refYear - age;
  // Use July 1 as approximate birth date (mid-year)
  return `${birthYear}-${String(refMonth).padStart(2, "0")}-${String(refDay).padStart(2, "0")}`;
}

/** Parse payment remarks to extract amount, method, and determine payment status */
function parsePaymentRemarks(
  remarks: string
): {
  amount: number;
  method: string;
  paymentStatus: string;
} {
  let amount = 0;
  let method = "invoice";
  let paymentStatus = "pending";

  // Extract amount from (£XXX.XX) or (£XXX)
  const amountMatch = remarks.match(/\([£€$]?([\d,]+\.?\d*)\)/);
  if (amountMatch) {
    amount = parseFloat(amountMatch[1].replace(/,/g, ""));
  }

  const lower = remarks.toLowerCase();

  if (lower.includes("fih")) {
    method = "invoice";
    paymentStatus = "pending";
  } else if (lower.includes("invoice")) {
    method = "invoice";
    paymentStatus = "paid";
  } else if (lower.includes("paid by visa")) {
    method = "credit_card";
    paymentStatus = "paid";
  } else if (lower.includes("paid by cash")) {
    method = "cash";
    paymentStatus = "paid";
  } else if (lower.includes("paid by scb transfer")) {
    method = "bank_transfer";
    paymentStatus = "paid";
  } else if (lower.includes("paid")) {
    method = "bank_transfer";
    paymentStatus = "paid";
  }

  return { amount, method, paymentStatus };
}

/** Parse a date string like "101124" (DDMMYY) or "09/11" (DD/MM) or "09.11.24" (DD.MM.YY) into YYYY-MM-DD */
function parseSectorDate(dateStr: string, defaultYear: number): string {
  // Try DD/MM format (e.g., "09/11")
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10);
    return `${defaultYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Try DD.MM.YY or DD.MM.YYYY format (e.g., "09.11.24" or "09.11.2024")
  const dotMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (dotMatch) {
    const day = parseInt(dotMatch[1], 10);
    const month = parseInt(dotMatch[2], 10);
    let year = parseInt(dotMatch[3], 10);
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Try DDMMYY format (e.g., "101124" → 10/11/24)
  const dmyMatch = dateStr.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Try DD/MM/YYYY format
  const fullSlashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fullSlashMatch) {
    const day = parseInt(fullSlashMatch[1], 10);
    const month = parseInt(fullSlashMatch[2], 10);
    const year = parseInt(fullSlashMatch[3], 10);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Try DD/MM/YY format
  const shortSlashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (shortSlashMatch) {
    const day = parseInt(shortSlashMatch[1], 10);
    const month = parseInt(shortSlashMatch[2], 10);
    let year = parseInt(shortSlashMatch[3], 10);
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Fallback: use the default year and today
  return `${defaultYear}-01-01`;
}

/** Parse sector remarks to extract booking legs */
function parseSectorRemarks(
  remarks: string,
  from: string,
  to: string,
  flightDate: string
): Array<{ origin: string; destination: string; date: string }> {
  if (from === to) {
    console.warn(`Skipping leg with identical origin/destination: ${from} → ${to}`);
    return [];
  }
  const legs: Array<{ origin: string; destination: string; date: string }> = [];

  // Parse flight date to get the year
  const dateParts = flightDate.split("/");
  const defaultYear = dateParts.length === 3 ? parseInt(dateParts[2], 10) : 2024;

  const trimmed = remarks.trim();

  // Empty remarks → single leg from→to on flightDate
  if (!trimmed) {
    legs.push({
      origin: from,
      destination: to,
      date: `${defaultYear}-${String(parseInt(dateParts[1], 10)).padStart(2, "0")}-${String(parseInt(dateParts[0], 10)).padStart(2, "0")}`,
    });
    return legs;
  }

  // "One Way" → single leg
  if (trimmed.toLowerCase() === "one way") {
    legs.push({
      origin: from,
      destination: to,
      date: `${defaultYear}-${String(parseInt(dateParts[1], 10)).padStart(2, "0")}-${String(parseInt(dateParts[0], 10)).padStart(2, "0")}`,
    });
    return legs;
  }

  // Parse "rtn 101124. STY-SLI 111124, RTN 141124"
  // This means: outbound STY→SLI on 11/11, return SLI→STY on 14/11
  const rtnMatch = trimmed.match(/^rtn\s+(\S+)\s*\.?\s*(.+)/i);
  if (rtnMatch) {
    // The first part after "rtn" is the return date
    const returnDateStr = rtnMatch[1];
    const rest = rtnMatch[2];

    // Parse the outbound leg(s) from the rest
    // e.g., "STY-SLI 111124, RTN 141124"
    const legPattern = /([A-Z]{3})-([A-Z]{3})\s+(\S+)/g;
    let legMatch: RegExpExecArray | null;

    while ((legMatch = legPattern.exec(rest)) !== null) {
      const origin = legMatch[1];
      const destination = legMatch[2];
      const dateStr = legMatch[3];

      // Check if this is a return leg (preceded by "RTN" or "rtn")
      const beforeMatch = rest.slice(0, legMatch.index);
      const isReturn = /rtn\s*$/i.test(beforeMatch.trim());

      if (isReturn) {
        // Return leg: reverse the direction
        legs.push({
          origin: destination,
          destination: origin,
          date: parseSectorDate(dateStr, defaultYear),
        });
      } else {
        legs.push({
          origin,
          destination,
          date: parseSectorDate(dateStr, defaultYear),
        });
      }
    }

    // If no legs parsed from the rest, use the return date for a return leg
    if (legs.length === 0) {
      // Outbound: from→to on flightDate
      legs.push({
        origin: from,
        destination: to,
        date: `${defaultYear}-${String(parseInt(dateParts[1], 10)).padStart(2, "0")}-${String(parseInt(dateParts[0], 10)).padStart(2, "0")}`,
      });
      // Return: to→from on return date
      legs.push({
        origin: to,
        destination: from,
        date: parseSectorDate(returnDateStr, defaultYear),
      });
    }

    return legs;
  }

  // Parse "am if possible, rtn 091124" → outbound on flightDate, return on 09/11
  const simpleRtnMatch = trimmed.match(/rtn\s+(\S+)/i);
  if (simpleRtnMatch && !trimmed.includes("-")) {
    const returnDateStr = simpleRtnMatch[1];
    legs.push({
      origin: from,
      destination: to,
      date: `${defaultYear}-${String(parseInt(dateParts[1], 10)).padStart(2, "0")}-${String(parseInt(dateParts[0], 10)).padStart(2, "0")}`,
    });
    legs.push({
      origin: to,
      destination: from,
      date: parseSectorDate(returnDateStr, defaultYear),
    });
    return legs;
  }

  // Parse "SDI-PBI 091124, PBI-STY 111124" → multi-leg
  const multiLegPattern = /([A-Z]{3})-([A-Z]{3})\s+(\S+)/g;
  let multiMatch: RegExpExecArray | null;
  let hasMultiLegs = false;

  while ((multiMatch = multiLegPattern.exec(trimmed)) !== null) {
    hasMultiLegs = true;
    legs.push({
      origin: multiMatch[1],
      destination: multiMatch[2],
      date: parseSectorDate(multiMatch[3], defaultYear),
    });
  }

  if (hasMultiLegs) return legs;

  // Parse "SLI 09/11 STY 11/11" → SLI→STY on 11/11 with stop at SLI on 09/11
  // This means the passenger goes to SLI on 09/11, then STY on 11/11
  const stopPattern = /([A-Z]{3})\s+(\S+)\s+([A-Z]{3})\s+(\S+)/;
  const stopMatch = trimmed.match(stopPattern);
  if (stopMatch) {
    const stopCode = stopMatch[1];
    const stopDate = stopMatch[2];
    const destCode = stopMatch[3];
    const destDate = stopMatch[4];

    // First leg: from→stop on stopDate
    legs.push({
      origin: from,
      destination: stopCode,
      date: parseSectorDate(stopDate, defaultYear),
    });
    // Second leg: stop→dest on destDate
    legs.push({
      origin: stopCode,
      destination: destCode,
      date: parseSectorDate(destDate, defaultYear),
    });
    return legs;
  }

  // Parse "Rtn 09.11.24" or "Rtn 17.11.24" or "Rtn 09/11" → return trip
  const rtnDateMatch = trimmed.match(/rtn\s+(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)/i);
  if (rtnDateMatch) {
    const returnDateStr = rtnDateMatch[1];
    legs.push({
      origin: from,
      destination: to,
      date: `${defaultYear}-${String(parseInt(dateParts[1], 10)).padStart(2, "0")}-${String(parseInt(dateParts[0], 10)).padStart(2, "0")}`,
    });
    legs.push({
      origin: to,
      destination: from,
      date: parseSectorDate(returnDateStr, defaultYear),
    });
    return legs;
  }

  // Parse "MPA 09/11" → stopover at MPA on 09/11, then continue to destination
  const stopoverMatch = trimmed.match(/([A-Z]{3})\s+(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)/);
  if (stopoverMatch) {
    const stopCode = stopoverMatch[1];
    const stopDateStr = stopoverMatch[2];
    // First leg: from→stop on stopDate
    legs.push({
      origin: from,
      destination: stopCode,
      date: parseSectorDate(stopDateStr, defaultYear),
    });
    // Second leg: stop→to on flightDate (or next day)
    legs.push({
      origin: stopCode,
      destination: to,
      date: `${defaultYear}-${String(parseInt(dateParts[1], 10)).padStart(2, "0")}-${String(parseInt(dateParts[0], 10)).padStart(2, "0")}`,
    });
    return legs;
  }

  // Fallback: single leg
  legs.push({
    origin: from,
    destination: to,
    date: `${defaultYear}-${String(parseInt(dateParts[1], 10)).padStart(2, "0")}-${String(parseInt(dateParts[0], 10)).padStart(2, "0")}`,
  });

  return legs;
}

/** Parse a flight date like "7/11/2024" into YYYY-MM-DD */
function parseFlightDate(dateStr: string): string {
  const parts = dateStr.split("/");
  if (parts.length !== 3) return "2024-11-07";
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function seedBookingsFromFlightList(): Promise<void> {
  // Fetch no-fly dates to skip bookings on blocked days
  const noFlyResult = await pool.query(
    `SELECT specific_date as no_fly_date FROM no_fly_rules WHERE specific_date IS NOT NULL AND specific_date >= CURRENT_DATE AND is_active = true`,
  );
  const noFlyDates = new Set(noFlyResult.rows.map((r) => r.no_fly_date.toISOString().split("T")[0]));

  const raw = fs.readFileSync(
    path.join(DATA_DIR, "FlightList.csv"),
    "utf-8"
  );
  const rows = parseFlightListCSV(raw);

  if (rows.length === 0) {
    console.log("  ⚠ No rows found in FlightList.csv");
    return;
  }

  // Group rows by booking reference
  const groups = new Map<string, FlightListRow[]>();
  for (const row of rows) {
    const ref = extractBookingReference(row.bookingRef);
    if (!groups.has(ref)) {
      groups.set(ref, []);
    }
    groups.get(ref)!.push(row);
  }

  // Filter out bookings on no-fly dates
  let skippedCount = 0;
  for (const [ref, groupRows] of groups) {
    const flightDate = groupRows[0].flightDate.split("T")[0];
    if (noFlyDates.has(flightDate)) {
      groups.delete(ref);
      skippedCount++;
    }
  }

  console.log(`  📋 ${rows.length} passenger rows in ${groups.size} booking groups` + (skippedCount > 0 ? ` (${skippedCount} skipped — no-fly dates)` : ""));

  // Get the passenger user (id=7 from seed) or create one
  let passengerUserId: number;
  const userResult = await pool.query(
    `SELECT id FROM users WHERE email = 'passenger@figas.gov.fk'`
  );
  if (userResult.rows.length > 0) {
    passengerUserId = userResult.rows[0].id;
  } else {
    // Create a generic passenger user
    const password = await hashPassword("figas2024!");
    const newUser = await pool.query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ["Passenger User", "passenger@figas.gov.fk", password, "passenger", true]
    );
    passengerUserId = newUser.rows[0].id;
  }

  // Track created users per passenger name to reuse
  const userCache = new Map<string, number>();
  userCache.set("passenger@figas.gov.fk", passengerUserId);

  let bookingCount = 0;
  let passengerCount = 0;
  let legCount = 0;
  let paymentCount = 0;

  for (const [ref, group] of groups) {
    const firstRow = group[0];
    const flightDate = parseFlightDate(firstRow.flightDate);
    const paymentInfo = parsePaymentRemarks(firstRow.paymentRemarks);

    // Determine user for this booking
    let userId = passengerUserId;

    // If the group has a single passenger, try to create a dedicated user
    if (group.length === 1) {
      const row = group[0];
      const { first, last } = parseFullName(row.fullName);
      const email = generateEmail(first, last);

      if (!userCache.has(email)) {
        const password = await hashPassword("figas2024!");
        try {
          const newUser = await pool.query(
            `INSERT INTO users (name, email, password, role, is_active, clothed_body_weight_kg)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              row.fullName.trim(),
              email,
              password,
              "passenger",
              true,
              row.passengerWeightKg ?? 70,
            ]
          );
          userCache.set(email, newUser.rows[0].id);
        } catch {
          // Email conflict, use passenger user
          userCache.set(email, passengerUserId);
        }
      }
      userId = userCache.get(email)!;
    }

    // Create the booking
    const bookingResult = await pool.query(
      `INSERT INTO bookings (booking_reference, user_id, status, total_amount, total_amount_gbp, payment_status, booking_source, is_organization_billing, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        ref,
        userId,
        "confirmed",
        paymentInfo.amount,
        paymentInfo.amount, // total_amount_gbp same as amount (GBP)
        paymentInfo.paymentStatus,
        "seed", // booking_source
        false, // is_organization_billing
        flightDate,
        flightDate,
      ]
    );
    const bookingId = bookingResult.rows[0].id;

    // Create passengers for each row in the group
    for (const row of group) {
      const { salutation, first, last } = parseFullName(row.fullName);
      const email = generateEmail(first, last);
      const dob = approximateDateOfBirth(row.passengerAge, row.flightDate);
      const nationality = mapNationality(row.type);
      const residencyStatus = mapResidencyStatus(row.type);

      await pool.query(
        `INSERT INTO booking_passengers (booking_id, salutation, first_name, last_name, email, phone, date_of_birth, nationality, clothed_body_weight_kg, residency_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          bookingId,
          salutation,
          first,
          last,
          email,
          row.contact,
          dob,
          nationality,
          row.passengerWeightKg ?? 70,
          residencyStatus,
        ]
      );
      passengerCount++;
    }

    // Create booking legs from sector remarks
    const legs = parseSectorRemarks(
      firstRow.sectorRemarks,
      firstRow.from,
      firstRow.to,
      firstRow.flightDate
    );

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      await pool.query(
        `INSERT INTO booking_legs (booking_id, origin_code, destination_code, leg_date, leg_sequence, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [bookingId, leg.origin, leg.destination, leg.date, i + 1, "confirmed"]
      );
      legCount++;
    }

    // Create payment record
    const paymentDate = flightDate;
    const paymentMethod = paymentInfo.method;
    await pool.query(
      `INSERT INTO payments (booking_id, amount, amount_gbp, method, payment_method, status, transaction_reference, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        bookingId,
        paymentInfo.amount,
        paymentInfo.amount, // amount_gbp same as amount (GBP)
        paymentMethod,
        paymentMethod, // payment_method same as method
        paymentInfo.paymentStatus === "paid" ? "completed" : "pending",
        firstRow.ticketNumber,
        paymentInfo.paymentStatus === "paid" ? paymentDate : null,
      ]
    );
    paymentCount++;

    bookingCount++;
  }

  console.log(`  ✓ ${bookingCount} bookings seeded from FlightList.csv`);
  console.log(`  ✓ ${passengerCount} passengers seeded`);
  console.log(`  ✓ ${legCount} booking legs seeded`);
  console.log(`  ✓ ${paymentCount} payments seeded`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("\n🌱 FIGAS Database Seeder\n");

  const isForce = process.argv.includes("--force");
  if (!isForce) {
    console.error("⚠️  WARNING: This script DELETES ALL existing data before seeding.");
    console.error("    Use --force flag to confirm execution: npm run seed:full -- --force\n");
    process.exit(1);
  }

  try {
    console.log("Clearing existing data...");
    await clearAllTables();

    console.log("\nSeeding users...");
    await seedUsers();

    console.log("Seeding aerodromes...");
    await seedAerodromes();

    console.log("Seeding aircraft...");
    await seedAircraft();

    console.log("Seeding pilots...");
    await seedPilots();

    console.log("Seeding fare routes...");
    await seedFareRoutes();

    console.log("Seeding fuel rules...");
    await seedFuelRules();

    console.log("Seeding aerodrome distances...");
    await seedDistances();

    console.log("Seeding aerodrome headings...");
    await seedHeadings();

    console.log("Seeding airframe hours...");
    await seedAirframeHours();

    console.log("Seeding organizations...");
    await seedOrganizations();

    console.log("Seeding sample passengers...");
    await seedPassengers();

    console.log("Seeding bookings from FlightList...");
    await seedBookingsFromFlightList();

    console.log("Seeding system settings...");
    await seedSystemSettings();

    console.log("\n✅ Database seeded successfully!\n");
  } catch (err) {
    console.error("\n❌ Seed failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
