import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true }) });
async function main() {
  const r = await p.$queryRawUnsafe(
    "SELECT COUNT(*)::int AS cnt, origin_code, destination_code FROM booking_legs WHERE origin_code = destination_code GROUP BY origin_code, destination_code"
  );
  console.log(JSON.stringify(r, null, 2));
  await p.$disconnect();
}
main();
