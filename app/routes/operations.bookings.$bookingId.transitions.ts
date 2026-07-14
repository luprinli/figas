import { BookingStatus } from "../utils/constants";

// Simplified transitions: only completed and cancelled are terminal states.
// All non-terminal statuses can transition to completed or cancelled.
export const VALID_TRANSITIONS: Record<string, string[]> = {
  [BookingStatus.PENDING]: [BookingStatus.PASSENGERS_ADDED, BookingStatus.CANCELLED],
  [BookingStatus.PASSENGERS_ADDED]: [BookingStatus.WEIGHT_DECLARED, BookingStatus.CANCELLED],
  [BookingStatus.WEIGHT_DECLARED]: [BookingStatus.FREIGHT_DECLARED, BookingStatus.CANCELLED],
  [BookingStatus.FREIGHT_DECLARED]: [BookingStatus.FLIGHT_ASSIGNED, BookingStatus.CANCELLED],
  [BookingStatus.FLIGHT_ASSIGNED]: [BookingStatus.PILOT_REVIEW, BookingStatus.CANCELLED],
  [BookingStatus.PILOT_REVIEW]: [BookingStatus.APPROVED, BookingStatus.CANCELLED],
  [BookingStatus.APPROVED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.CANCELLED]: [],
};
