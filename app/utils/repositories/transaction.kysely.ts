import { kdb } from "../db.server.kysely";
import type { Kysely } from "kysely";
import type { DB } from "../../../generated/kysely/database";

export async function withTransaction<T>(
  fn: (trx: Kysely<DB>) => Promise<T>
): Promise<T> {
  return kdb.transaction().execute(async (trx) => {
    return fn(trx);
  });
}
