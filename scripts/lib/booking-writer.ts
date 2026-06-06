import { Pool } from "pg";
import type {
  ReferenceData,
  ItineraryLeg,
  PassengerProfile,
} from "./types.js";
import { randomInt } from "./date-utils.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a random alphanumeric string of given length (uppercase).
 */
function randomRef(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[randomInt(0, chars.length - 1)];
  }
  return result;
}

/**
 * Pick a random element from an array.
 */
function pickRandom<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

/**
 * Weighted random pick from items with associated probabilities.
 */
function pickWeighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ---------------------------------------------------------------------------
// Booking reference tracking (global set to avoid duplicates)
// ---------------------------------------------------------------------------

const usedReferences = new Set<string>();

function generateBookingReference(): string {
  let ref: string;
  do {
    ref = `FIG-${randomRef(6)}`;
  } while (usedReferences.has(ref));
  usedReferences.add(ref);
  return ref;
}

// ---------------------------------------------------------------------------
// Seat number assignment
// ---------------------------------------------------------------------------

function generateSeatNumber(passengerIndex: number): string {
  const row = Math.floor(passengerIndex / 2) + 1;
  const col = passengerIndex % 2 === 0 ? "A" : "B";
  return `${row}${col}`;
}

// ---------------------------------------------------------------------------
// Write a single booking
// ---------------------------------------------------------------------------

export async function writeBooking(
  pool: Pool,
  booking: {
    legs: ItineraryLeg[];
    passengers: PassengerProfile[];
    refData: ReferenceData;
  }
): Promise<{ bookingId: number }> {
  const { legs, passengers, refData } = booking;

  // --- Pick metadata ---
  const user = pickRandom(refData.users);
  const operationsUser =
    refData.users.find((u) => u.role === "operations" || u.role === "admin") ??
    user;

  const reference = generateBookingReference();
  const bookingSource = pickWeighted(
    ["customer_direct", "agent", "online"],
    [0.4, 0.35, 0.25]
  );
  const paymentStatus = pickWeighted(
    ["paid", "pending", "confirmed"],
    [0.6, 0.25, 0.15]
  );

  // Organization: 80% linked to a random org, 20% individual
  const hasOrganization = Math.random() < 0.8;
  const organizationId =
    hasOrganization && refData.organizations.length > 0
      ? pickRandom(refData.organizations).id
      : null;

  // Booking status: weighted random
  const status = pickWeighted(
    ["confirmed", "pending", "completed", "cancelled", "no-show"],
    [0.6, 0.15, 0.1, 0.1, 0.05]
  );

  // Calculate total fare
  const totalFare = legs.reduce((sum, leg) => {
    const fare = refData.fareRoutes.find(
      (f) =>
        f.origin_code === leg.origin && f.destination_code === leg.destination
    );
    return sum + (fare?.base_fare ?? 0);
  }, 0);

  // Payment method
  const paymentMethod = pickWeighted(
    ["stripe", "invoice", "pay_on_departure"],
    [0.4, 0.3, 0.3]
  );

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Insert booking
    const bookingRes = await client.query(
      `INSERT INTO bookings (
        booking_reference, user_id, status, organization_id,
        is_organization_billing, total_amount, total_amount_gbp,
        payment_status, payment_method, booking_source, created_by,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING id`,
      [
        reference,
        user.id,
        status,
        organizationId,
        organizationId !== null,
        totalFare,
        totalFare,
        paymentStatus,
        paymentMethod,
        bookingSource,
        operationsUser.id,
      ]
    );
    const bookingId = bookingRes.rows[0].id;

    // 2. Validate legs before inserting
    for (const leg of legs) {
      if (leg.origin === leg.destination) {
        throw new Error(
          `Invalid leg: origin and destination are both "${leg.origin}". Each leg must have different origin and destination.`
        );
      }
    }

    // 3. Insert legs
    const legIds: number[] = [];
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const legRes = await client.query(
        `INSERT INTO booking_legs (
          booking_id, origin_code, destination_code, leg_date,
          departure_date, leg_sequence, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id`,
        [bookingId, leg.origin, leg.destination, leg.leg_date, leg.leg_date, i + 1, "confirmed"]
      );
      legIds.push(legRes.rows[0].id);
    }

    // 3. Insert passengers
    const passengerIds: number[] = [];
    for (const p of passengers) {
      const email = `${p.first_name.toLowerCase()}.${p.last_name.toLowerCase()}@example.com`;
      const pRes = await client.query(
        `INSERT INTO booking_passengers (
          booking_id, first_name, last_name, email, phone,
          date_of_birth, clothed_weight_kg, special_requirements,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING id`,
        [
          bookingId,
          p.first_name,
          p.last_name,
          email,
          null,
          p.date_of_birth,
          p.weight_kg,
          null, // special_requirements — not used in current schema
        ]
      );
      passengerIds.push(pRes.rows[0].id);
    }

    // 4. Link passengers to legs (booking_leg_passengers)
    for (const legId of legIds) {
      for (let i = 0; i < passengerIds.length; i++) {
        const passenger = passengers[i];
        const seatNumber = generateSeatNumber(i);
        await client.query(
          `INSERT INTO booking_leg_passengers (
            booking_leg_id, booking_passenger_id,
            baggage_weight_kg, freight_weight_kg, freight_description,
            seat_number, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [
            legId,
            passengerIds[i],
            passenger.baggage_kg,
            passenger.freight_kg,
            passenger.freight_description,
            seatNumber,
          ]
        );
      }
    }

    // 5. Insert payment
    const isPaid = paymentStatus === "paid";
    await client.query(
      `INSERT INTO payments (
        booking_id, amount, amount_gbp, payment_method, payment_status, paid_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [
        bookingId,
        totalFare,
        totalFare,
        paymentMethod,
        isPaid ? "completed" : "pending",
        isPaid ? new Date().toISOString() : null,
      ]
    );

    await client.query("COMMIT");
    return { bookingId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
