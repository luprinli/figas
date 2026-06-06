const DISTANCE_CSV_PATH = "data/distance.csv";

let cachedDistanceMap: Map<string, number> | null = null;

export function parseDistanceCSV(csvContent: string): Map<string, number> {
  const lines = csvContent.trim().split("\n");
  const headers = lines[0].split("\t").map((h) => h.trim()).filter(Boolean);
  const map = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const origin = cells[0]?.trim();
    if (!origin) continue;

    for (let j = 1; j < cells.length; j++) {
      const dest = headers[j - 1];
      const val = parseInt(cells[j], 10);
      if (dest && !isNaN(val) && val > 0) {
        map.set(`${origin}→${dest}`, val);
        map.set(`${dest}→${origin}`, val);
      }
    }
  }

  return map;
}

export async function loadDistanceCSV(): Promise<Map<string, number>> {
  if (cachedDistanceMap) return cachedDistanceMap;
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const csvPath = path.resolve(process.cwd(), DISTANCE_CSV_PATH);
  const content = await fs.readFile(csvPath, "utf-8");
  cachedDistanceMap = parseDistanceCSV(content);
  return cachedDistanceMap;
}

export function getCachedDistanceMap(): Map<string, number> | null {
  return cachedDistanceMap;
}

export function clearDistanceCache(): void {
  cachedDistanceMap = null;
}
