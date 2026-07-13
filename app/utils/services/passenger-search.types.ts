export type SearchScope = "family" | "recent" | "agency" | "global" | "auto";

export interface PassengerSearchResult {
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

export interface PassengerSearchParams {
  query: string;
  bookerUserId: number;
  organizationId?: number;
  scope: SearchScope;
  dateOfBirth?: string;
  limit?: number;
}
