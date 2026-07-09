import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!, { disposeExternalPool: true });
const p = new PrismaClient({ adapter });

async function main() {
  console.log("Current date: 2026-06-06\n");

  const pastSch = await p.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int as cnt FROM schedules WHERE schedule_date < '2026-06-06'"
  );
  const futureSch = await p.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int as cnt FROM schedules WHERE schedule_date >= '2026-06-06'"
  );
  const pastFl = await p.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int as cnt FROM flights f JOIN schedules s ON s.id = f.schedule_id WHERE s.schedule_date < '2026-06-06'"
  );
  const futureFl = await p.$queryRawUnsafe<Array<{cnt:number}>>(
    "SELECT COUNT(*)::int as cnt FROM flights f JOIN schedules s ON s.id = f.schedule_id WHERE s.schedule_date >= '2026-06-06'"
  );
  console.log("Past schedules:", pastSch[0].cnt, "| Future schedules:", futureSch[0].cnt);
  console.log("Past flights:", pastFl[0].cnt, "| Future flights:", futureFl[0].cnt);

  const samples = await p.$queryRawUnsafe<Array<{fn:string;orig:string;dest:string;dep:string}>>(
    "SELECT flight_number as fn, origin_code as orig, destination_code as dest, departure_time::date::text as dep FROM flights LIMIT 15"
  );
  console.log("\nSample flights:");
  for (const f of samples) console.log(" ", f.fn, f.orig, "->", f.dest, f.dep);

  await p.$disconnect();
}
main();
