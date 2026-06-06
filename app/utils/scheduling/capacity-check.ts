import { db } from "../db.server";

export async function getMaxSeatCapacity(): Promise<number> {
  const aircraft = await db.aircraft.findFirst({
    where: { is_active: true },
    orderBy: { seat_count: "desc" },
    select: { seat_count: true },
  });
  return aircraft?.seat_count ?? 9;
}

export async function splitOversizedBookingLeg(bookingLegId: number): Promise<number> {
  const maxSeats = await getMaxSeatCapacity();

  const passengerCount = await db.booking_leg_passengers.count({
    where: { booking_leg_id: bookingLegId },
  });

  if (passengerCount <= maxSeats) return 0;

  const bookingLeg = await db.booking_legs.findUnique({
    where: { id: bookingLegId },
    select: { booking_id: true, origin_code: true, destination_code: true, leg_date: true },
  });
  if (!bookingLeg) return 0;

  const passengers = await db.booking_leg_passengers.findMany({
    where: { booking_leg_id: bookingLegId },
    orderBy: { id: "asc" },
  });

  let created = 0;

  for (let i = maxSeats; i < passengers.length; i += maxSeats) {
    const group = passengers.slice(i, i + maxSeats);
    if (group.length === 0) break;

    const newLeg = await db.booking_legs.create({
      data: {
        booking_id: bookingLeg.booking_id,
        origin_code: bookingLeg.origin_code,
        destination_code: bookingLeg.destination_code,
        leg_date: bookingLeg.leg_date,
        status: "confirmed",
      },
    });

    for (const p of group) {
      await db.booking_leg_passengers.update({
        where: { id: p.id },
        data: { booking_leg_id: newLeg.id },
      });
    }
    created++;
  }

  return created;
}
