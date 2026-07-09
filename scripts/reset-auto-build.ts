import { db } from "../app/utils/db.server";

async function main() {
  const dateStr = process.argv[2] || "2026-06-19";
  const schedule = await db.schedules.findFirst({
    where: {
      schedule_date: {
        gte: new Date(dateStr),
        lt: new Date(new Date(dateStr).getTime() + 86400000),
      },
    },
    orderBy: { created_at: "desc" },
  });

  if (!schedule) {
    console.log(`No schedule found for ${dateStr}`);
    await db.$disconnect();
    return;
  }

  console.log(`Schedule: ${schedule.id} (${schedule.status})`);

  const flights = await db.flights.findMany({
    where: { schedule_id: schedule.id },
    select: { id: true },
  });

  if (flights.length === 0) {
    console.log("No flights to reset");
    await db.$disconnect();
    return;
  }

  // Clear flight_leg_id on passengers
  for (const f of flights) {
    const legs = await db.flight_legs.findMany({
      where: { flight_id: f.id },
      select: { id: true },
    });
    for (const leg of legs) {
      await db.$executeRawUnsafe(
        `UPDATE booking_leg_passengers SET flight_leg_id = NULL WHERE flight_leg_id = ${leg.id}`
      );
    }
    // Delete weight balance snapshots
    await db.weight_balance_snapshots.deleteMany({
      where: { flight_leg_id: { in: legs.map((l) => l.id) } },
    });
  }

  // Unassign booking legs
  await db.booking_legs.updateMany({
    where: { flight_id: { in: flights.map((f) => f.id) } },
    data: { flight_id: null, status: "pending" },
  });

  // Delete flight legs
  for (const f of flights) {
    await db.flight_legs.deleteMany({ where: { flight_id: f.id } });
  }

  // Delete flights
  await db.flights.deleteMany({ where: { schedule_id: schedule.id } });

  // Reset schedule status
  await db.schedules.update({
    where: { id: schedule.id },
    data: { status: "building" },
  });

  console.log(`Reset complete: ${flights.length} flights deleted, bookings restored to unassigned pool.`);

  await db.$disconnect();
}

main();
