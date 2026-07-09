/**
 * Test the weight-balance computation directly to find overflow source.
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const p = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true }) });

async function main() {
  // Get first active aircraft
  const aircraft = (await p.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT id, registration, empty_weight_kg, empty_arm_m, crew_arm_m, passenger_arm_m,
           baggage_arm_m, freight_arm_m, fuel_arm_m, max_takeoff_weight_kg
    FROM aircraft WHERE is_active = true LIMIT 1`))[0] as Record<string,unknown>;

  console.log("Aircraft:", aircraft.registration, "empty_wt:", aircraft.empty_weight_kg);
  console.log("Arms:", aircraft.empty_arm_m, aircraft.crew_arm_m, aircraft.passenger_arm_m,
    aircraft.baggage_arm_m, aircraft.freight_arm_m, aircraft.fuel_arm_m);

  // Get a flight with passengers
  const flight = (await p.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT f.id, COUNT(blp.id)::int as pax_count,
           COALESCE(SUM(COALESCE(blp.clothed_weight_kg, 70)), 0) as pax_wt,
           COALESCE(SUM(blp.baggage_weight_kg), 0) as bag_wt,
           COALESCE(SUM(COALESCE(blp.freight_weight_kg, 0)), 0) as freight_wt
    FROM flights f
    JOIN booking_legs bl ON bl.flight_id = f.id
    JOIN booking_leg_passengers blp ON blp.booking_leg_id = bl.id
    WHERE f.schedule_id IS NOT NULL
    GROUP BY f.id
    HAVING COUNT(blp.id) > 0
    LIMIT 1`))[0] as Record<string,unknown>;

  if (!flight) { console.log("No flight with passengers found"); await p.$disconnect(); return; }

  console.log("\nFlight ID:", flight.id, "passengers:", flight.pax_count);
  console.log("Passenger wt:", flight.pax_wt, "Baggage:", flight.bag_wt, "Freight:", flight.freight_wt);

  // Simulate the weight-balance computation
  const emptyWt = Number(aircraft.empty_weight_kg);
  const crewWt = 80;
  const paxWt = Number(flight.pax_wt);
  const bagWt = Number(flight.bag_wt);
  const freightWt = Number(flight.freight_wt);
  const fuelWt = 200;

  const emptyArm = (aircraft.empty_arm_m as number) ?? 2.5;
  const crewArm = (aircraft.crew_arm_m as number) ?? 2.0;
  const paxArm = (aircraft.passenger_arm_m as number) ?? 3.5;
  const bagArm = (aircraft.baggage_arm_m as number) ?? 4.5;
  const freightArm = (aircraft.freight_arm_m as number) ?? 4.0;
  const fuelArm = (aircraft.fuel_arm_m as number) ?? 3.0;

  const moment = emptyWt * emptyArm + crewWt * crewArm + paxWt * paxArm +
                 bagWt * bagArm + freightWt * freightArm + fuelWt * fuelArm;
  const rampWt = emptyWt + crewWt + paxWt + bagWt + freightWt + fuelWt;
  const cgPct = rampWt > 0 ? (moment / rampWt) * 100 : 0;
  const mtow = Number(aircraft.max_takeoff_weight_kg);
  const mtowPct = mtow > 0 ? (rampWt / mtow) * 100 : 0;

  console.log("\nComputed values:");
  console.log("  rampWeightKg:", rampWt.toFixed(2), "(Decimal(10,2):", rampWt < 1e8 ? "OK" : "OVERFLOW", ")");
  console.log("  totalMomentKgm:", moment.toFixed(2), "(Decimal(10,2):", moment < 1e8 ? "OK" : "OVERFLOW", ")");
  console.log("  cgPositionPct:", cgPct.toFixed(2), "(Decimal(10,2):", cgPct < 1e8 ? "OK" : "OVERFLOW", ")");
  console.log("  mtowUsedPct:", mtowPct.toFixed(2), "(Decimal(10,2):", mtowPct < 1e8 ? "OK" : "OVERFLOW", ")");
  console.log("  MTOW:", mtow);

  await p.$disconnect();
}
main();
