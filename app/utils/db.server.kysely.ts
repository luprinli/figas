// Re-export from the canonical Kysely singleton.
// This file exists for backward compatibility during the phased migration;
// callers should migrate to importing { kdb } from "./db.server" directly.
export { kdb } from "./db.server";
