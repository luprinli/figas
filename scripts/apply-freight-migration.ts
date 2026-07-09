import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "node:fs";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:figas2024!@localhost:5432/figas";
const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL, { disposeExternalPool: true }) });

async function main() {
  const sql = fs.readFileSync("migrations/018-freight.sql", "utf-8");
  await prisma.$executeRawUnsafe(sql);
  console.log("Freight migration applied.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
