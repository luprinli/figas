import { kdb } from "../db.server.kysely";
import { sql } from "kysely";
import { readFileSync } from "fs";
import { resolve } from "path";

export async function importFareMatrix(): Promise<number> {
  const csvPath = resolve(process.cwd(), "data", "MATRIX_FARES.csv");
  const raw = readFileSync(csvPath, "utf-8");
  const cells = raw.split(/\s+/).filter(Boolean);

  // Collect 31 aerodrome codes (3-letter uppercase, skip "MATRIX"/"FARES")
  const aerodromes: string[] = [];
  let idx = 0;
  while (idx < cells.length && aerodromes.length < 31) {
    if (/^[A-Z]{3}$/.test(cells[idx])) {
      aerodromes.push(cells[idx]);
    }
    idx++;
  }

  let count = 0;
  const n = aerodromes.length;

  // For each aerodrome: find its code in the cells, then read n prices after it
  for (const origin of aerodromes) {
    // Scan forward to find the origin code
    let pos = 0;
    while (pos < cells.length && cells[pos] !== origin) pos++;
    if (pos >= cells.length) continue;

    pos++; // past the code

    // Read n prices
    let destIdx = 0;
    let pricesRead = 0;
    while (pos < cells.length && pricesRead < n) {
      const rawPrice = cells[pos].replace("£", "");
      const amount = parseFloat(rawPrice);
      if (!isNaN(amount) && amount > 0 && destIdx < n) {
        const dest = aerodromes[destIdx];
        await sql`
          INSERT INTO fare_matrix (origin_code, destination_code, fare_amount_gbp)
          VALUES (${origin}, ${dest}, ${amount})
          ON CONFLICT (origin_code, destination_code) DO UPDATE SET fare_amount_gbp = ${amount}, updated_at = NOW()
        `.execute(kdb);
        count++;
        destIdx++;
        pricesRead++;
      }
      pos++;
    }
  }

  return count;
}
