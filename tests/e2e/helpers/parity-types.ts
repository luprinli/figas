export interface FlightSnapshot {
  flightNumber: string;
  originCode: string;
  destinationCode: string;
  stopSequence: string[];
  legCount: number;
  passengerCount: number;
  passengerNames: string[];
  totalDistanceNm: number;
  aircraftRegistration: string | null;
  aircraftType: string | null;
  pilotName: string | null;
}

export interface ScheduleSnapshot {
  phase: "auto" | "manual";
  timestamp: string;
  flightCount: number;
  flights: FlightSnapshot[];
  passengerCoverage: {
    totalUnassignedBefore: number;
    totalAssigned: number;
    coveragePct: number;
  };
  warnings: string[];
  errors: string[];
  elapsedMs: number;
}

export interface ParityResult {
  passed: boolean;
  flightCountMatch: boolean;
  passengerCoverageMatch: boolean;
  details: string[];
  autoSnapshot: ScheduleSnapshot;
  manualSnapshot: ScheduleSnapshot;
}
