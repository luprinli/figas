import { kdb } from "../db.server.kysely";

export async function getMaxSeatCapacity(): Promise<number> {
  const aircraft = (await kdb.selectFrom("aircraft")
    .select("seat_count")
    .where("is_active", "=", true)
    .orderBy("seat_count", "desc")
    .limit(1)
    .execute())[0];
  return aircraft?.seat_count ?? 9;
}

export async function splitOversizedBookingLeg(bookingLegId: number): Promise<number> {
  const maxSeats = await getMaxSeatCapacity();

  const passengerCount = Number((await kdb.selectFrom("booking_leg_passengers")
    .select(kdb.fn.countAll().as("count"))
    .where("booking_leg_id", "=", bookingLegId)
    .execute())[0].count);

  if (passengerCount <= maxSeats) return 0;

  const bookingLeg = (await kdb.selectFrom("booking_legs")
    .select(["booking_id", "origin_code", "destination_code", "leg_date"])
    .where("id", "=", bookingLegId)
    .execute())[0] ?? null;
  if (!bookingLeg) return 0;

  const passengers = await kdb.selectFrom("booking_leg_passengers")
    .selectAll()
    .where("booking_leg_id", "=", bookingLegId)
    .orderBy("id", "asc")
    .execute();

  let created = 0;

  for (let i = maxSeats; i < passengers.length; i += maxSeats) {
    const group = passengers.slice(i, i + maxSeats);
    if (group.length === 0) break;

    const newLeg = (await kdb.insertInto("booking_legs").values({
      booking_id: bookingLeg.booking_id,
      origin_code: bookingLeg.origin_code,
      destination_code: bookingLeg.destination_code,
      leg_date: bookingLeg.leg_date,
      status: "confirmed",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).returningAll().execute())[0];

    for (const p of group) {
      await kdb.updateTable("booking_leg_passengers").set({
        booking_leg_id: newLeg.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).where("id", "=", p.id).execute();
    }
    created++;
  }

  return created;
}
