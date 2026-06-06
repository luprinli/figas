import { useDraggable } from "@dnd-kit/core";

export interface FreightConsignment {
  id: number;
  consignor_name: string;
  consignee_name: string;
  weight_kg: number;
  waybill_number: string;
  priority: string;
  origin_code?: string;
  destination_code?: string;
}

export default function DraggableFreightItem({ freight }: { freight: FreightConsignment }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `freight-${freight.id}`,
    data: { type: "freight", consignment: freight },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="border-2 border-dashed border-orange-400 dark:border-orange-500 rounded-lg bg-orange-50/30 dark:bg-orange-900/30 p-3"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="group cursor-grab active:cursor-grabbing rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs shadow-sm transition hover:border-orange-300 dark:hover:border-orange-500 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-800 dark:text-slate-100">{freight.waybill_number}</span>
        <span className="text-[10px] text-slate-500 dark:text-slate-400">{freight.weight_kg} kg</span>
      </div>
      <div className="mt-0.5 text-slate-500 dark:text-slate-400">
        {freight.consignor_name}
      </div>
      <div className="truncate text-slate-500 dark:text-slate-400">{freight.consignee_name}</div>
    </div>
  );
}
