/**
 * Pluggable tour progress store.
 *
 * Currently backed by `localStorage`. Swap the `tourStore` export for a
 * server-backed implementation later without changing any call site.
 *
 * Completion is versioned: a "completed" tour at version 1 is no longer
 * "completed" at version 2 — returning users are re-offered exactly once
 * after a material content update.
 */

const STORAGE_KEY = "figas_tours_completed_v1";

type CompletionMap = Record<string, number>;

interface TourStore {
  getCompletion(pageKey: string): number | null;
  setCompletion(pageKey: string, version: number): void;
  reset(): void;
}

function readMap(): CompletionMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}"
    ) as CompletionMap;
  } catch {
    return {};
  }
}

function writeMap(map: CompletionMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode — non-fatal, tour just re-offers next session */
  }
}

export const localTourStore: TourStore = {
  getCompletion: (pageKey) => readMap()[pageKey] ?? null,
  setCompletion: (pageKey, version) => {
    const map = readMap();
    map[pageKey] = version;
    writeMap(map);
  },
  reset: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
};

export const tourStore: TourStore = localTourStore;

export function isTourCompleted(pageKey: string, version: number): boolean {
  const completedVersion = tourStore.getCompletion(pageKey);
  return completedVersion !== null && completedVersion >= version;
}

export function markTourCompleted(
  pageKey: string,
  version: number
): void {
  tourStore.setCompletion(pageKey, version);
}

export function resetAllTours(): void {
  tourStore.reset();
}
