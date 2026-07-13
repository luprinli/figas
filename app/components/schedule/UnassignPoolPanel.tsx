import { useState } from "react";
import EmptyState from "../EmptyState";
import { DraggableBookingItem } from "./DraggableBookingItem";
import type { UnassignedBookingRow } from "./DraggableBookingItem";

export { type UnassignedBookingRow } from "./DraggableBookingItem";

export function UnassignPoolPanel({ unassignedBookings, visibleCount, isNoFlyDay = false, optimisticAssignedIds }: { unassignedBookings: UnassignedBookingRow[]; visibleCount: number; isNoFlyDay?: boolean; optimisticAssignedIds?: Set<number> }) {
  const [showAll, setShowAll] = useState(false);
  const filtered = optimisticAssignedIds
    ? unassignedBookings.filter((b) => !optimisticAssignedIds.has(b.id))
    : unassignedBookings;
  const visible = showAll ? filtered : filtered.slice(0, visibleCount);
  return (
    <div className="w-full max-w-md rounded-lg bg-white dark:bg-slate-800 p-6 shadow-xl dark:shadow-slate-900/50">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Unassigned Passengers</h3>
        <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-500">{filtered.length}</span>
      </div>
      <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-500">Drag bookings onto a flight card to assign them to a flight.</p>
      <div className="space-y-2" role="list">
        {visible.length === 0 && isNoFlyDay ? (
          <EmptyState title="No unassigned bookings" description="This is a no-fly day — no bookings are available for scheduling." />
        ) : visible.length === 0 ? (
          <EmptyState title="No unassigned bookings" description="All bookings for this date have been assigned to flights, or there are no bookings for this date." />
        ) : (
          <>
            {visible.map((booking) => <DraggableBookingItem key={booking.id} booking={booking} />)}
            {filtered.length > visibleCount && !showAll && (
              <button onClick={() => setShowAll(true)} className="w-full rounded py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:bg-blue-900/30 dark:hover:bg-blue-900/30 dark:bg-blue-900/30">
                Show all {filtered.length} bookings
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
