import { useDroppable } from "@dnd-kit/core";

export function DraftFlightPlaceholder({
  isDraggingBooking,
  activeOverId,
}: {
  isDraggingBooking: boolean;
  activeOverId?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: "draft-flight-placeholder",
    data: { type: "draft-flight" },
  });

  const isActiveOver = activeOverId === "draft-flight-placeholder";

  return (
    <div
      ref={setNodeRef}
      id="draft-flight-placeholder"
      role="button"
      aria-label="Draft flight drop zone. Drag bookings here to create a new flight."
      data-testid="draft-flight-placeholder"
      data-tour="new-flight"
      className={`rounded-lg border-2 border-dashed p-6 text-center transition-all duration-150 ${
        isOver
          ? "border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-400"
          : isActiveOver
            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-500 ring-offset-2"
            : isDraggingBooking
              ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30"
              : "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700"
      }`}
    >
      <div className="mb-2 text-lg font-semibold text-slate-500 dark:text-slate-400">Draft Flight</div>
      <div className="mb-4 grid grid-cols-2 gap-4 text-sm text-slate-500 dark:text-slate-400">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Origin</div>
          <div className="text-lg font-bold text-slate-300 dark:text-slate-600">---</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Destination</div>
          <div className="text-lg font-bold text-slate-300 dark:text-slate-600">---</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">ETD</div>
          <div className="text-lg font-bold text-slate-300 dark:text-slate-600">--:--</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">ETA</div>
          <div className="text-lg font-bold text-slate-300 dark:text-slate-600">--:--</div>
        </div>
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400">Drag bookings here to create a flight</div>
    </div>
  );
}
