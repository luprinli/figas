import { describe, it, expect } from "vitest";
import { BookingStatus } from "../../../app/utils/constants";

const VALID_TRANSITIONS: Record<string, string[]> = {
  [BookingStatus.PENDING]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.PASSENGERS_ADDED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.WEIGHT_DECLARED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.FREIGHT_DECLARED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.FLIGHT_ASSIGNED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.PILOT_REVIEW]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.APPROVED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.CANCELLED]: [],
};

describe("VALID_TRANSITIONS", () => {
  describe("PENDING", () => {
    const allowed = VALID_TRANSITIONS[BookingStatus.PENDING];

    it("can transition to COMPLETED and CANCELLED", () => {
      expect(allowed).toContain(BookingStatus.COMPLETED);
      expect(allowed).toContain(BookingStatus.CANCELLED);
    });

    it("cannot transition to PENDING (self)", () => {
      expect(allowed).not.toContain(BookingStatus.PENDING);
    });

    it("cannot transition to PASSENGERS_ADDED", () => {
      expect(allowed).not.toContain(BookingStatus.PASSENGERS_ADDED);
    });

    it("cannot transition to WEIGHT_DECLARED", () => {
      expect(allowed).not.toContain(BookingStatus.WEIGHT_DECLARED);
    });

    it("cannot transition to FREIGHT_DECLARED", () => {
      expect(allowed).not.toContain(BookingStatus.FREIGHT_DECLARED);
    });

    it("cannot transition to FLIGHT_ASSIGNED", () => {
      expect(allowed).not.toContain(BookingStatus.FLIGHT_ASSIGNED);
    });

    it("cannot transition to PILOT_REVIEW", () => {
      expect(allowed).not.toContain(BookingStatus.PILOT_REVIEW);
    });

    it("cannot transition to APPROVED", () => {
      expect(allowed).not.toContain(BookingStatus.APPROVED);
    });
  });

  describe("PASSENGERS_ADDED", () => {
    const allowed = VALID_TRANSITIONS[BookingStatus.PASSENGERS_ADDED];

    it("can transition to COMPLETED and CANCELLED", () => {
      expect(allowed).toContain(BookingStatus.COMPLETED);
      expect(allowed).toContain(BookingStatus.CANCELLED);
    });

    it("cannot transition to PENDING", () => {
      expect(allowed).not.toContain(BookingStatus.PENDING);
    });

    it("cannot transition to PASSENGERS_ADDED (self)", () => {
      expect(allowed).not.toContain(BookingStatus.PASSENGERS_ADDED);
    });
  });

  describe("WEIGHT_DECLARED", () => {
    const allowed = VALID_TRANSITIONS[BookingStatus.WEIGHT_DECLARED];

    it("can transition to COMPLETED and CANCELLED", () => {
      expect(allowed).toContain(BookingStatus.COMPLETED);
      expect(allowed).toContain(BookingStatus.CANCELLED);
    });

    it("cannot transition to PENDING", () => {
      expect(allowed).not.toContain(BookingStatus.PENDING);
    });
  });

  describe("FLIGHT_ASSIGNED", () => {
    const allowed = VALID_TRANSITIONS[BookingStatus.FLIGHT_ASSIGNED];

    it("can transition to COMPLETED and CANCELLED", () => {
      expect(allowed).toContain(BookingStatus.COMPLETED);
      expect(allowed).toContain(BookingStatus.CANCELLED);
    });

    it("cannot transition to PENDING", () => {
      expect(allowed).not.toContain(BookingStatus.PENDING);
    });
  });

  describe("COMPLETED (terminal)", () => {
    it("has no valid transitions", () => {
      expect(VALID_TRANSITIONS[BookingStatus.COMPLETED]).toEqual([]);
    });

    it("cannot transition to any status", () => {
      const allStatuses = Object.values(BookingStatus);
      for (const status of allStatuses) {
        expect(VALID_TRANSITIONS[BookingStatus.COMPLETED]).not.toContain(status);
      }
    });
  });

  describe("CANCELLED (terminal)", () => {
    it("has no valid transitions", () => {
      expect(VALID_TRANSITIONS[BookingStatus.CANCELLED]).toEqual([]);
    });

    it("cannot transition to any status", () => {
      const allStatuses = Object.values(BookingStatus);
      for (const status of allStatuses) {
        expect(VALID_TRANSITIONS[BookingStatus.CANCELLED]).not.toContain(status);
      }
    });
  });

  describe("terminal states", () => {
    it("COMPLETED cannot transition to anything", () => {
      const allowed = VALID_TRANSITIONS[BookingStatus.COMPLETED];
      expect(allowed).toHaveLength(0);
    });

    it("CANCELLED cannot transition to anything", () => {
      const allowed = VALID_TRANSITIONS[BookingStatus.CANCELLED];
      expect(allowed).toHaveLength(0);
    });
  });

  describe("invalid status", () => {
    it("returns empty array for an undefined status key", () => {
      const result = VALID_TRANSITIONS["nonexistent_status"] ?? [];
      expect(result).toEqual([]);
    });

    it("returns empty array for an empty string key", () => {
      const result = VALID_TRANSITIONS[""] ?? [];
      expect(result).toEqual([]);
    });
  });

  describe("non-terminal statuses — all transition only to COMPLETED or CANCELLED", () => {
    const nonTerminalStatuses = [
      BookingStatus.PENDING,
      BookingStatus.PASSENGERS_ADDED,
      BookingStatus.WEIGHT_DECLARED,
      BookingStatus.FREIGHT_DECLARED,
      BookingStatus.FLIGHT_ASSIGNED,
      BookingStatus.PILOT_REVIEW,
      BookingStatus.APPROVED,
    ];

    for (const status of nonTerminalStatuses) {
      it(`${status} transitions are exactly [COMPLETED, CANCELLED]`, () => {
        const allowed = VALID_TRANSITIONS[status];
        expect(allowed).toHaveLength(2);
        expect(allowed).toContain(BookingStatus.COMPLETED);
        expect(allowed).toContain(BookingStatus.CANCELLED);
      });
    }
  });
});
