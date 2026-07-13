import type { ScheduleRow } from "../../utils/repositories/schedule";
import type { FlightSummaryRow } from "../../utils/scheduling/build-flight-card-flight";
import type { FlightLegRow, PassengerManifestRow } from "../../utils/scheduling/build-stop-activities";
import type { UnassignedBookingRow } from "../../components/schedule/DraggableBookingItem";
import type { ScheduleBuildResult } from "../../utils/scheduling/types";
import type { PilotOption, AircraftOption } from "../../components/schedule/FlightCard";

export interface LoaderData {
  schedule: ScheduleRow | null;
  flights: FlightSummaryRow[];
  flightLegs: FlightLegRow[];
  passengerManifests: PassengerManifestRow[];
  unassignedBookings: UnassignedBookingRow[];
  selectedDate: string;
  isNoFlyDay: boolean;
  user: { name: string; email: string };
  canApprove: boolean;
  canPublish: boolean;
  canEdit: boolean;
  canAssignPilot: boolean;
  canAssignAircraft: boolean;
  availablePilots: PilotOption[];
  availableAircraft: AircraftOption[];
  aerodromeNames: Record<string, string>;
  aerodromes: { id: number; code: string; name: string }[];
  buildResult: ScheduleBuildResult | null;
  csrfToken: string | null;
}