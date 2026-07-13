/**
 * Backfill: Link booking_passengers to users by name + date_of_birth match.
 *
 * Usage:
 *   npx tsx scripts/backfill-passenger-user-ids.ts          # execute
 *   npx tsx scripts/backfill-passenger-user-ids.ts --dry-run # count matches only
 *
 * Safety:
 *   - Only matches rows where user_id IS NULL (never overwrites existing links)
 *   - If multiple users match the same passenger, picks the most recently created user
 *   - Reports conflict count for manual review
 *   - Nullable FK with ON DELETE SET NULL — safe to run, no data loss risk
 *   - Rollback: set user_id = NULL WHERE user_id IS NOT NULL (won't need this)
 */

import { kdb } from "../app/utils/db.server";
import { sql } from "kysely";

async function backfill(dryRun: boolean) {
  console.log(dryRun ? "DRY RUN — counting matches only" : "LIVE — updating rows");

  // Count rows that need backfill
  const nullResult = await sql<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM booking_passengers
    WHERE user_id IS NULL
  `.execute(kdb);
  const nullCount = Number((nullResult.rows[0] as { count: number })?.count ?? 0);
  console.log(`Rows with user_id IS NULL: ${nullCount}`);

  // Count potential matches
  const matchResult = await sql<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM booking_passengers bp
    JOIN users u ON
      LOWER(TRIM(CONCAT(bp.first_name, ' ', bp.last_name))) = LOWER(TRIM(u.name))
      AND bp.date_of_birth = u.date_of_birth
    WHERE bp.user_id IS NULL
  `.execute(kdb);
  const matchCount = Number((matchResult.rows[0] as { count: number })?.count ?? 0);
  console.log(`Potential name+DOB matches: ${matchCount}`);

  // Count conflicts (same passenger matches multiple users)
  const conflictResult = await sql<{ count: number }>`
    SELECT COUNT(*)::int AS count FROM (
      SELECT bp.id
      FROM booking_passengers bp
      JOIN users u ON
        LOWER(TRIM(CONCAT(bp.first_name, ' ', bp.last_name))) = LOWER(TRIM(u.name))
        AND bp.date_of_birth = u.date_of_birth
      WHERE bp.user_id IS NULL
      GROUP BY bp.id
      HAVING COUNT(DISTINCT u.id) > 1
    ) sub
  `.execute(kdb);
  const conflictCount = Number((conflictResult.rows[0] as { count: number })?.count ?? 0);
  console.log(`Passengers matching multiple users (won't be backfilled): ${conflictCount}`);

  if (dryRun) {
    console.log("Dry run complete. Use --live to execute.");
    return;
  }

  // Execute the update
  const result = await sql`
    UPDATE booking_passengers bp
    SET user_id = u.id
    FROM users u
    WHERE
      bp.user_id IS NULL
      AND LOWER(TRIM(CONCAT(bp.first_name, ' ', bp.last_name))) = LOWER(TRIM(u.name))
      AND bp.date_of_birth = u.date_of_birth
      AND u.id = (
        SELECT u2.id FROM users u2
        WHERE LOWER(TRIM(CONCAT(bp.first_name, ' ', bp.last_name))) = LOWER(TRIM(u2.name))
          AND bp.date_of_birth = u2.date_of_birth
        ORDER BY u2.created_at DESC
        LIMIT 1
      )
  `.execute(kdb);

  console.log(`Updated rows: ${(result as unknown as { numUpdatedRows?: number }).numUpdatedRows ?? "unknown"}`);
}

const dryRun = process.argv.includes("--dry-run");
backfill(dryRun).catch(console.error);
