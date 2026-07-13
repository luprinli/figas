import { describe, it, expect } from "vitest";

// Pure logic functions extracted for unit testing.
// These mirror the logic in app/utils/services/passenger-search.service.ts
// without requiring database access.

interface PassengerSearchResult {
  id: number;
  source: "registered" | "historic";
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  clothedWeightKg: number | null;
  residency: string | null;
  passengerUserId: number | null;
}

function dedupKey(r: PassengerSearchResult): string {
  return `${r.firstName.toLowerCase()}|${r.lastName.toLowerCase()}|${r.dateOfBirth ?? ""}`;
}

function dedupResults(results: PassengerSearchResult[]): PassengerSearchResult[] {
  const seen = new Map<string, PassengerSearchResult>();
  for (const r of results) {
    const key = dedupKey(r);
    const existing = seen.get(key);
    if (!existing || (r.source === "registered" && existing.source !== "registered")) {
      seen.set(key, r);
    }
  }
  return [...seen.values()];
}

function matchesQuery(r: PassengerSearchResult, query: string): boolean {
  const parts = query.toLowerCase().split(/\s+/);
  const fullName = `${r.firstName} ${r.lastName}`.toLowerCase();
  return parts.every((p) => fullName.includes(p) || r.email?.toLowerCase().includes(p) || false);
}

const makeResult = (overrides: Partial<PassengerSearchResult>): PassengerSearchResult => ({
  id: 1,
  source: "historic",
  firstName: "John",
  lastName: "Smith",
  email: "john@example.com",
  phone: null,
  dateOfBirth: "1990-01-01",
  clothedWeightKg: 70,
  residency: "Resident",
  passengerUserId: null,
  ...overrides,
});

describe("passenger-search pure functions", () => {
  describe("dedupKey", () => {
    it("creates a key from name and DOB", () => {
      const r = makeResult({ firstName: "John", lastName: "Smith", dateOfBirth: "1990-01-01" });
      expect(dedupKey(r)).toBe("john|smith|1990-01-01");
    });

    it("is case-insensitive for names", () => {
      const a = makeResult({ firstName: "JOHN", lastName: "SMITH", dateOfBirth: "1990-01-01" });
      const b = makeResult({ firstName: "john", lastName: "smith", dateOfBirth: "1990-01-01" });
      expect(dedupKey(a)).toBe(dedupKey(b));
    });

    it("handles missing DOB", () => {
      const r = makeResult({ dateOfBirth: null });
      expect(dedupKey(r)).toBe("john|smith|");
    });
  });

  describe("dedupResults", () => {
    it("returns empty for empty input", () => {
      expect(dedupResults([])).toEqual([]);
    });

    it("returns single result unchanged", () => {
      const r = makeResult({});
      expect(dedupResults([r])).toEqual([r]);
    });

    it("deduplicates by name+DOB — keeps first", () => {
      const a = makeResult({ id: 1, source: "historic" });
      const b = makeResult({ id: 2, source: "historic" });
      const deduped = dedupResults([a, b]);
      expect(deduped).toHaveLength(1);
      expect(deduped[0].id).toBe(1);
    });

    it("prioritizes registered over historic", () => {
      const a = makeResult({ id: 1, source: "historic" });
      const b = makeResult({ id: 2, source: "registered", passengerUserId: 42 });
      const deduped = dedupResults([a, b]);
      expect(deduped).toHaveLength(1);
      expect(deduped[0].source).toBe("registered");
      expect(deduped[0].passengerUserId).toBe(42);
    });

    it("preserves non-duplicate results", () => {
      const a = makeResult({ id: 1, firstName: "John" });
      const b = makeResult({ id: 2, firstName: "Jane", lastName: "Doe", dateOfBirth: "1992-05-10" });
      const deduped = dedupResults([a, b]);
      expect(deduped).toHaveLength(2);
    });

    it("different DOBs are not duplicates", () => {
      const a = makeResult({ id: 1, dateOfBirth: "1990-01-01" });
      const b = makeResult({ id: 2, dateOfBirth: "1991-06-15" });
      const deduped = dedupResults([a, b]);
      expect(deduped).toHaveLength(2);
    });
  });

  describe("matchesQuery", () => {
    it("matches by first name", () => {
      expect(matchesQuery(makeResult({ firstName: "John" }), "John")).toBe(true);
    });

    it("matches by last name", () => {
      expect(matchesQuery(makeResult({ lastName: "Smith" }), "Smith")).toBe(true);
    });

    it("matches by full name (two words)", () => {
      expect(matchesQuery(makeResult({ firstName: "John", lastName: "Smith" }), "John Smith")).toBe(true);
    });

    it("matches by partial name", () => {
      expect(matchesQuery(makeResult({ firstName: "John" }), "Jo")).toBe(true);
    });

    it("matches by email", () => {
      expect(matchesQuery(makeResult({ email: "john@example.com" }), "john@example.com")).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(matchesQuery(makeResult({ firstName: "John" }), "john")).toBe(true);
    });

    it("requires all query parts to match", () => {
      expect(matchesQuery(makeResult({ firstName: "John", lastName: "Smith" }), "John Doe")).toBe(false);
    });

    it("matches when query is empty", () => {
      expect(matchesQuery(makeResult({}), "")).toBe(true);
    });

    it("rejects non-matching query", () => {
      expect(matchesQuery(makeResult({ firstName: "John", email: "john@example.com" }), "XYZ")).toBe(false);
    });

    it("matches by all name parts in any order", () => {
      expect(matchesQuery(makeResult({ firstName: "John", lastName: "Smith" }), "Smith John")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles null email in matchesQuery", () => {
      expect(matchesQuery(makeResult({ email: null }), "nonexistent@test.com")).toBe(false);
    });

    it("handles empty names", () => {
      const r = makeResult({ firstName: "", lastName: "" });
      expect(dedupKey(r)).toBe("||1990-01-01");
    });

    it("handles multiple registered duplicates", () => {
      const a = makeResult({ id: 1, source: "registered", passengerUserId: 1 });
      const b = makeResult({ id: 2, source: "registered", passengerUserId: 2 });
      const deduped = dedupResults([a, b]);
      expect(deduped).toHaveLength(1);
      expect(deduped[0].id).toBe(1);
    });
  });
});
