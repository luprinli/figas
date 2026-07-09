/**
 * CVRP type definitions for the Clarke-Wright Savings algorithm.
 */

/**
 * A passenger transport demand: passengers going from origin to destination.
 */
export interface PassengerDemand {
  bookingLegId: number;
  origin: string;
  destination: string;
  passengerCount: number;
}

/**
 * Assignment of a demand to a specific route.
 */
export interface DemandAssignment {
  bookingLegId: number;
  passengerCount: number;
  origin: string;
  destination: string;
  boardAtStopIndex: number;
  alightAtStopIndex: number;
}

/**
 * A single vehicle route: ordered list of stops, always starting and ending at STY.
 */
export interface CvrpRoute {
  stops: string[];
  assignments: DemandAssignment[];
  totalDistanceNm: number;
  passengerCount: number;
}

/**
 * A pair of route indices with associated distance savings.
 */
export interface SavingsPair {
  i: number;
  j: number;
  savings: number;
}

/**
 * Configuration for the CVRP solver.
 */
export interface CvrpConfig {
  depot: string;
  maxSeats: number;
  maxRangeNm: number;
  distanceMatrix: Map<string, number>;
}

/**
 * Result from the CVRP solver.
 */
export interface CvrpResult {
  routes: CvrpRoute[];
  unservedDemands: PassengerDemand[];
}
