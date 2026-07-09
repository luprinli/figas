import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true }) });
async function m() {
  const arms = await p.$queryRawUnsafe<Array<Record<string, unknown>>>("SELECT registration, empty_weight_kg, empty_arm_m, crew_arm_m, passenger_arm_m, baggage_arm_m, freight_arm_m, fuel_arm_m, max_takeoff_weight_kg FROM aircraft WHERE is_active = true");
  for (const r of arms) console.log(JSON.stringify(r));
  await p.$disconnect();
}
m();
