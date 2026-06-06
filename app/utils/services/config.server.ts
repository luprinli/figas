import { db } from "../db.server";

interface SettingRow {
  key: string;
  value: string;
  type: string;
  description: string;
}

let cache: Map<string, SettingRow> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadCache(): Promise<Map<string, SettingRow>> {
  if (cache && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cache;
  }
  const rows = await db.$queryRawUnsafe<SettingRow[]>(
    `SELECT key, value, type, description FROM system_settings`
  );
  cache = new Map(rows.map((r: SettingRow) => [r.key, r]));
  cacheTimestamp = Date.now();
  return cache;
}

export function invalidateCache(): void {
  cache = null;
  cacheTimestamp = 0;
}

export async function getSetting(key: string, fallback?: string): Promise<string> {
  try {
    const c = await loadCache();
    const row = c.get(key);
    return row?.value ?? fallback ?? "";
  } catch {
    return fallback ?? "";
  }
}

export async function getNumberSetting(key: string, fallback?: number): Promise<number> {
  const val = await getSetting(key);
  if (!val) return fallback ?? 0;
  const num = Number(val);
  return Number.isFinite(num) ? num : (fallback ?? 0);
}

export async function setSetting(key: string, value: string, type = "string", description = ""): Promise<void> {
  await db.$queryRawUnsafe(
    `INSERT INTO system_settings (key, value, type, description, updated_at)
 VALUES ($1, $2, $3, $4, NOW())
 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value, type, description]
  );
  invalidateCache();
}
