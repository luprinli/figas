import { kdb } from "../app/utils/db.server";

async function main() {
  const dateStr = process.argv[2] || "2026-06-19";
  const schedule = await kdb.selectFrom("schedules")
    .selectAll()
    .where("schedule_date", ">=", dateStr)
    .where("schedule_date", "<", new Date(new Date(dateStr).getTime() + 86400000).toISOString())
    .orderBy("created_at desc")
    .limit(1)
    .executeTakeFirst();

  if (!schedule) {
    console.log(`No schedule found for ${dateStr}`);
    await kdb.destroy();
    return;
  }

  console.log(`Schedule: ${schedule.id} (${schedule.status})`);

  const flights = await kdb.selectFrom("flights")
    .select("id")
    .where("schedule_id", "=", schedule.id)
    .execute();

  if (flights.length === 0) {
    console.log("No flights to reset");
    await kdb.destroy();
    return;
  }

  const flightIds = flights.map((f) => f.id);

  const legs = await kdb.selectFrom("flight_legs")
    .select("id")
    .where("flight_id", "in", flightIds)
    .execute();

  const legIds = legs.map((l) => l.id);

  if (legIds.length > 0) {
    // Clear flight_leg_id on passengers
    await kdb.updateTable("booking_leg_passengers")
      .set({ flight_leg_id: null } as any)
      .where("flight_leg_id", "in", legIds)
      .execute();

    // Delete weight balance snapshots
    await kdb.deleteFrom("weight_balance_snapshots")
      .where("flight_leg_id", "in", legIds)
      .execute();
  }

  // Unassign booking legs
  await kdb.updateTable("booking_legs")
    .set({ flight_id: null, status: "pending" } as any)
    .where("flight_id", "in", flightIds)
    .execute();

  // Delete flight legs
  await kdb.deleteFrom("flight_legs")
    .where("flight_id", "in", flightIds)
    .execute();

  // Delete flights
  await kdb.deleteFrom("flights")
    .where("schedule_id", "=", schedule.id)
    .execute();

  // Reset schedule status
  await kdb.updateTable("schedules")
    .set({ status: "building" } as any)
    .where("id", "=", schedule.id)
    .execute();

  console.log(`Reset complete: ${flights.length} flights deleted, bookings restored to unassigned pool.`);

  await kdb.destroy();
}

main();