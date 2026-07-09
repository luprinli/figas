interface PassengerInput {
  id: number;
  bookingLegId: number;
  clothedWeightKg: number;
  baggageWeightKg: number;
}

export interface SeatAssignment {
  passengerId: number;
  bookingLegId: number;
  seatRow: number | null;
  seatSide: "L" | "R" | "C" | null;
  clothedWeightKg: number;
  baggageWeightKg: number;
}

const SEAT_ARMS_MM: Record<string, number> = {
  "1C": 749.3,
  "2L": 1549.4,
  "2R": 1549.4,
  "3L": 2349.5,
  "3R": 2349.5,
  "4L": 3149.6,
  "4R": 3149.6,
  "5L": 3949.7,
  "5R": 3949.7,
};

const AFT_HOLD_ARM_MM = 4724.4;
const PILOT_ARM_MM = 355.6;
const FUEL_ARM_MM = 1143.0;
const EMPTY_CG_ARM_MM = 2108.2;
const CABIN_CENTER_ARM_MM = 2500.0;

const CG_FWD_LIMIT_MM = 2057.4;
const CG_AFT_LIMIT_MM = 2565.4;

const MAX_SEATS = 9;

const AVAILABLE_SEATS: Array<{ row: number; side: "L" | "R" | "C" }> = [
  { row: 1, side: "C" },
  { row: 2, side: "L" },
  { row: 2, side: "R" },
  { row: 3, side: "L" },
  { row: 3, side: "R" },
  { row: 4, side: "L" },
  { row: 4, side: "R" },
  { row: 5, side: "L" },
  { row: 5, side: "R" },
];

export function assignSeatsByCOG(passengers: PassengerInput[]): SeatAssignment[] {
  const sorted = [...passengers].sort(
    (a, b) => b.clothedWeightKg + b.baggageWeightKg - (a.clothedWeightKg + a.baggageWeightKg)
  );

  // First MAX_SEATS passengers get seat assignments sorted by CG-optimal placement;
  // remaining passengers are included but without a seat (overflow / standing).
  const seated = sorted.slice(0, MAX_SEATS).map((p, i) => {
    const seat = AVAILABLE_SEATS[i];
    return {
      passengerId: p.id,
      bookingLegId: p.bookingLegId,
      seatRow: seat.row,
      seatSide: seat.side,
      clothedWeightKg: p.clothedWeightKg,
      baggageWeightKg: p.baggageWeightKg,
    };
  });

  const overflow = sorted.slice(MAX_SEATS).map((p) => ({
    passengerId: p.id,
    bookingLegId: p.bookingLegId,
    seatRow: null,
    seatSide: null,
    clothedWeightKg: p.clothedWeightKg,
    baggageWeightKg: p.baggageWeightKg,
  }));

  return [...seated, ...overflow];
}

export function computeCG(
  assignments: SeatAssignment[],
  baggageTotalKg: number,
  fuelKg: number,
  emptyWeightKg: number,
  pilotWeightKg: number
): { cogMm: number; status: "ok" | "warning" | "violation" } {
  let totalMoment = 0;
  let totalWeight = 0;

  totalMoment += emptyWeightKg * EMPTY_CG_ARM_MM;
  totalWeight += emptyWeightKg;

  totalMoment += pilotWeightKg * PILOT_ARM_MM;
  totalWeight += pilotWeightKg;

  for (const a of assignments) {
    const w = a.clothedWeightKg;
    if (a.seatRow != null && a.seatSide != null) {
      const key = `${a.seatRow}${a.seatSide}`;
      const arm = SEAT_ARMS_MM[key] ?? 0;
      totalMoment += w * arm;
    } else {
      totalMoment += w * CABIN_CENTER_ARM_MM;
    }
    totalWeight += w;
  }

  totalMoment += baggageTotalKg * AFT_HOLD_ARM_MM;
  totalWeight += baggageTotalKg;

  totalMoment += fuelKg * FUEL_ARM_MM;
  totalWeight += fuelKg;

  const cogMm = totalWeight > 0 ? totalMoment / totalWeight : 0;

  const status: "ok" | "warning" | "violation" =
    cogMm < CG_FWD_LIMIT_MM || cogMm > CG_AFT_LIMIT_MM
      ? "violation"
      : cogMm < CG_FWD_LIMIT_MM + 100 || cogMm > CG_AFT_LIMIT_MM - 100
        ? "warning"
        : "ok";

  return { cogMm, status };
}
