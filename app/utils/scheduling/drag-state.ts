import type { FlightSummaryRow } from "./build-flight-card-flight";

/** Represents an item currently being dragged */
export interface DragItem {
  type: "flight" | "booking" | "passenger";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

/** Snapshot used for optimistic rollback on error */
export interface DragSnapshot {
  flights: FlightSummaryRow[];
  assignedIds: Set<number>;
}

/** A pending mutation that may need rollback if the server request fails */
export interface PendingOp {
  type: "assign" | "unassign" | "reorder" | "create-flight";
  snapshot: DragSnapshot;
  timestamp: number;
  /** Temporary negative flight ID used for the optimistic flight card, so it
   * can be replaced with the real flight on success. */
  tempFlightId?: number;
}

/** Buffered assignment created while a create-flight-from-booking is in flight */
export interface PendingAssignEntry {
  bookingLegId: number;
  bookingLegPassengerId?: number;
}
