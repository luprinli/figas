// ---------------------------------------------------------------------------
// Reference data fetched from the database
// ---------------------------------------------------------------------------

export interface AerodromeRef {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

export interface AircraftRef {
  id: number;
  registration: string;
  model: string;
  seat_capacity: number;
  max_baggage_kg: number;
}

export interface FareRouteRef {
  id: number;
  origin_code: string;
  destination_code: string;
  base_fare: number;
  passenger_fare: number;
  freight_rate: number;
}

export interface NoFlyRuleRef {
  id: number;
  rule_type: "recurring" | "one_off";
  day_of_week: number[] | null;
  specific_date: string | null;
  season_start: string | null;
  season_end: string | null;
  is_active: boolean;
}

export interface UserRef {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface OrganizationRef {
  id: number;
  name: string;
  credit_limit: number;
}

export interface ReferenceData {
  aerodromes: AerodromeRef[];
  aircraft: AircraftRef[];
  fareRoutes: FareRouteRef[];
  noFlyRules: NoFlyRuleRef[];
  users: UserRef[];
  organizations: OrganizationRef[];
}

// ---------------------------------------------------------------------------
// Generated data structures
// ---------------------------------------------------------------------------

export interface PassengerProfile {
  first_name: string;
  last_name: string;
  category: string;
  date_of_birth: string;
  weight_kg: number;
  baggage_kg: number;
  freight_kg: number;
  freight_description: string | null;
}

export interface ItineraryLeg {
  origin: string;
  destination: string;
  leg_date: string;
  flight_id: number | null;
}

export interface Itinerary {
  legs: ItineraryLeg[];
  type: "one-way" | "round-trip" | "multi-stop";
}

export interface BookingSeed {
  reference: string;
  source: string;
  status: string;
  created_by: number;
  organization_id: number | null;
  legs: ItineraryLeg[];
  passengers: PassengerProfile[];
  payment_method: string;
}
