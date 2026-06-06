import { useDraggable, useDroppable, DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";

interface Passenger {
  id: number;
  name: string;
  weightKg: number;
}

interface Seat {
  id: string;
  row: number;
  side: "L" | "R" | "C";
  label: string;
  x: number;
  y: number;
}

const BN2_SEATS: Seat[] = [
  { id: "1L", row: 1, side: "L", label: "1L", x: 45, y: 35 },
  { id: "1C", row: 1, side: "C", label: "1C", x: 95, y: 35 },
  { id: "1R", row: 1, side: "R", label: "1R", x: 145, y: 35 },
  { id: "2L", row: 2, side: "L", label: "2L", x: 45, y: 95 },
  { id: "2C", row: 2, side: "C", label: "2C", x: 95, y: 95 },
  { id: "2R", row: 2, side: "R", label: "2R", x: 145, y: 95 },
  { id: "3L", row: 3, side: "L", label: "3L", x: 45, y: 155 },
  { id: "3C", row: 3, side: "C", label: "3C", x: 95, y: 155 },
  { id: "3R", row: 3, side: "R", label: "3R", x: 145, y: 155 },
];

function DroppableSeat({
  seat,
  assignedPassenger,
  isOver,
}: {
  seat: Seat;
  assignedPassenger: Passenger | null;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: `seat-${seat.id}`, data: { type: "seat", seatId: seat.id } });

  return (
    <foreignObject
      x={seat.x - 14}
      y={seat.y - 14}
      width={28}
      height={28}
      ref={setNodeRef as React.Ref<SVGForeignObjectElement>}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 4,
          background: isOver ? "#dbeafe" : assignedPassenger ? "#dcfce7" : "#f8fafc",
          border: `1px solid ${isOver ? "#3b82f6" : assignedPassenger ? "#16a34a" : "#cbd5e1"}`,
          borderWidth: isOver ? 2 : 1,
          textAlign: "center",
          fontSize: 9,
          lineHeight: "28px",
          fontWeight: assignedPassenger ? 600 : 400,
          color: assignedPassenger ? "#166534" : "#94a3b8",
        }}
      >
        {assignedPassenger
          ? assignedPassenger.name.slice(0, 3).toUpperCase()
          : seat.label}
      </div>
    </foreignObject>
  );
}

function DraggablePassenger({ passenger }: { passenger: Passenger }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `passenger-${passenger.id}`,
    data: { type: "passenger", passenger },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50, opacity: isDragging ? 0.4 : 1 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="flex cursor-grab items-center justify-between rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:border-blue-300 active:cursor-grabbing dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
    >
      <span>{passenger.name}</span>
      <span className="text-slate-500 tabular-nums dark:text-slate-400 dark:text-slate-500">{passenger.weightKg}kg</span>
    </div>
  );
}

export interface SeatMapProps {
  passengers: Passenger[];
  assignments: Record<string, Passenger | null>;
  onAssign: (seatId: string, passengerId: number) => void;
  currentCGMM?: number;
  className?: string;
}

export default function SeatMap({
  passengers,
  assignments,
  onAssign,
  currentCGMM,
  className = "",
}: SeatMapProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const overData = over.data.current;
    if (overData?.type !== "seat") return;

    const passengerId = Number(String(active.id).replace("passenger-", ""));
    onAssign(overData.seatId, passengerId);
  }

  const unassignedPassengers = passengers.filter(
    (p) => !Object.values(assignments).some((a) => a?.id === p.id)
  );

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className={`space-y-4 ${className}`}>
        <div className="relative mx-auto w-full max-w-[320px]">
          {/* Cockpit */}
          <div className="absolute left-1/2 top-0 -translate-x-1/2 rounded-t-xl bg-slate-100 px-3 py-1 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400 dark:text-slate-500">
            COCKPIT
          </div>

          <svg viewBox="0 0 220 200" className="w-full" role="img" aria-label="BN-2 Islander seat map">
            {/* Fuselage outline */}
            <rect x={20} y={15} width={180} height={172} rx={12} fill="none" stroke="#94a3b8" strokeWidth="1.5" />
            {/* Aisle */}
            <line x1={88} y1={20} x2={88} y2={180} stroke="#cbd5e1" strokeDasharray="4 3" strokeWidth="1" />

            {BN2_SEATS.map((seat) => (
              <DroppableSeat
                key={seat.id}
                seat={seat}
                assignedPassenger={assignments[seat.id] ?? null}
                isOver={false}
              />
            ))}

            {/* CG indicator */}
            {currentCGMM !== undefined && (
              <>
                <line x1={30} y1={190} x2={190} y2={190} stroke="#cbd5e1" strokeWidth="1" />
                <circle
                  cx={30 + ((currentCGMM - 2057) / (2565 - 2057)) * 160}
                  cy={190}
                  r="4"
                  fill="#dc2626"
                  stroke="#fff"
                  strokeWidth="1"
                />
                <text x={30} y={200} fontSize="7" fill="#94a3b8" textAnchor="middle">2057</text>
                <text x={190} y={200} fontSize="7" fill="#94a3b8" textAnchor="middle">2565</text>
              </>
            )}
          </svg>

          {/* Cargo hold */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-b-lg bg-slate-100 px-3 py-0.5 text-[9px] text-slate-500 dark:bg-slate-700 dark:text-slate-400 dark:text-slate-500">
            CARGO HOLD
          </div>
        </div>

        {/* Unassigned passengers */}
        {unassignedPassengers.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">
              Unassigned ({unassignedPassengers.length})
            </h4>
            <div className="space-y-1">
              {unassignedPassengers.map((p) => (
                <DraggablePassenger key={p.id} passenger={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </DndContext>
  );
}
