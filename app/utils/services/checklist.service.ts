import { kdb } from "../db.server.kysely";
import { sql } from "kysely";

export interface ChecklistItem {
  id: number;
  flightId: number;
  itemKey: string;
  itemLabel: string;
  checked: boolean;
  checkedBy: number | null;
  checkedAt: string | null;
}

const DEFAULT_CHECKLIST_ITEMS: Array<{ key: string; label: string; category: string }> = [
  { key: "external_visual", label: "External visual inspection", category: "Pre-Flight" },
  { key: "cockpit_documents", label: "Cockpit documents (AROW)", category: "Pre-Flight" },
  { key: "controls_check", label: "Flight controls free & correct", category: "Pre-Flight" },
  { key: "instruments_avionics", label: "Instruments & avionics check", category: "Pre-Flight" },
  { key: "fuel_quantity", label: "Fuel quantity verification", category: "Pre-Flight" },
  { key: "fuel_quality", label: "Fuel quality (drain & check)", category: "Pre-Flight" },
  { key: "oil_check", label: "Oil level check", category: "Pre-Flight" },
  { key: "pitot_static", label: "Pitot/static system check", category: "Pre-Flight" },
  { key: "fire_extinguisher", label: "Fire extinguisher present & charged", category: "Safety" },
  { key: "first_aid_kit", label: "First aid kit present", category: "Safety" },
  { key: "life_jackets", label: "Life jackets for all occupants", category: "Safety" },
  { key: "seatbelts_check", label: "Seat belts & harnesses check", category: "Safety" },
  { key: "emergency_exits", label: "Emergency exits operational", category: "Safety" },
  { key: "weather_review", label: "Weather briefing reviewed", category: "Briefing" },
  { key: "notams_review", label: "NOTAMs reviewed", category: "Briefing" },
  { key: "route_familiarity", label: "Route & alternates familiar", category: "Briefing" },
  { key: "weight_balance_ok", label: "Weight & balance within limits", category: "Briefing" },
  { key: "passenger_briefing", label: "Passenger safety briefing complete", category: "Operations" },
  { key: "cargo_secure", label: "Cargo & baggage secured", category: "Operations" },
  { key: "parking_brake", label: "Parking brake set", category: "Startup" },
];

export async function initializeChecklist(flightId: number): Promise<ChecklistItem[]> {
  try {
    const existing = await sql<{ item_key: string }>`
      SELECT item_key FROM pilot_checklists WHERE flight_id = ${flightId}
    `.execute(kdb);

    if (existing.rows.length > 0) {
      return loadChecklist(flightId);
    }

    for (const item of DEFAULT_CHECKLIST_ITEMS) {
      await sql`
        INSERT INTO pilot_checklists (flight_id, item_key, item_label)
        VALUES (${flightId}, ${item.key}, ${item.label})
        ON CONFLICT (flight_id, item_key) DO NOTHING
      `.execute(kdb);
    }

    return loadChecklist(flightId);
  } catch {
    return [];
  }
}

export async function loadChecklist(flightId: number): Promise<ChecklistItem[]> {
  try {
    const rows = await sql<{
      id: string; flight_id: string; item_key: string; item_label: string;
      checked: boolean; checked_by: string | null; checked_at: string | null;
    }>`
      SELECT id, flight_id, item_key, item_label, checked, checked_by, checked_at
      FROM pilot_checklists
      WHERE flight_id = ${flightId}
      ORDER BY id
    `.execute(kdb);

    return rows.rows.map((r) => ({
    id: Number(r.id),
    flightId: Number(r.flight_id),
    itemKey: r.item_key,
    itemLabel: r.item_label,
    checked: r.checked,
    checkedBy: r.checked_by != null ? Number(r.checked_by) : null,
    checkedAt: r.checked_at,
  }));
  } catch {
    return [];
  }
}

export async function toggleChecklistItem(
  flightId: number,
  itemKey: string,
  userId: number
): Promise<ChecklistItem | null> {
  try {
    const current = await sql<{ id: string; checked: boolean }>`
      SELECT id, checked FROM pilot_checklists
      WHERE flight_id = ${flightId} AND item_key = ${itemKey}
      LIMIT 1
    `.execute(kdb);

    if (current.rows.length === 0) return null;

  const newChecked = !current.rows[0].checked;

  await sql`
    UPDATE pilot_checklists
    SET checked = ${newChecked},
        checked_by = ${newChecked ? userId : null},
        checked_at = ${newChecked ? sql`NOW()` : null}
    WHERE flight_id = ${flightId} AND item_key = ${itemKey}
  `.execute(kdb);

  const rows = await sql<{
    id: string; flight_id: string; item_key: string; item_label: string;
    checked: boolean; checked_by: string | null; checked_at: string | null;
  }>`
    SELECT id, flight_id, item_key, item_label, checked, checked_by, checked_at
    FROM pilot_checklists
    WHERE flight_id = ${flightId} AND item_key = ${itemKey}
    LIMIT 1
  `.execute(kdb);

  if (rows.rows.length === 0) return null;
  const r = rows.rows[0];
  return {
    id: Number(r.id),
    flightId: Number(r.flight_id),
    itemKey: r.item_key,
    itemLabel: r.item_label,
    checked: r.checked,
    checkedBy: r.checked_by != null ? Number(r.checked_by) : null,
    checkedAt: r.checked_at,
  };
  } catch {
    return null;
  }
}

export interface ChecklistStats {
  total: number;
  checked: number;
  pct: number;
  byCategory: Array<{ category: string; total: number; checked: number; pct: number }>;
}

export function computeChecklistStats(items: ChecklistItem[]): ChecklistStats {
  const total = items.length;
  const checked = items.filter((i) => i.checked).length;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

  const categoryMap = new Map<string, { total: number; checked: number }>();
  for (const item of items) {
    const def = DEFAULT_CHECKLIST_ITEMS.find((d) => d.key === item.itemKey);
    const cat = def?.category ?? "Other";
    if (!categoryMap.has(cat)) categoryMap.set(cat, { total: 0, checked: 0 });
    const entry = categoryMap.get(cat)!;
    entry.total += 1;
    if (item.checked) entry.checked += 1;
  }

  const byCategory = Array.from(categoryMap.entries()).map(([category, stats]) => ({
    category,
    total: stats.total,
    checked: stats.checked,
    pct: stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0,
  }));

  return { total, checked, pct, byCategory };
}
