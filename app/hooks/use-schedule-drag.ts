import { useMemo } from "react";
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { createDragStartHandler, createDragOverHandler, createDragEndHandler } from "../utils/scheduling/drag-handlers";
import type { CreateDragEndParams } from "../utils/scheduling/drag-handlers";
import type { DragItem } from "../utils/scheduling/drag-state";

export function useScheduleDrag(params: {
  setActiveDragItem: (item: DragItem | null) => void;
  setActiveOverId: (id: string | null) => void;
  setIsDraggingBooking: (v: boolean) => void;
  dragEndParams: CreateDragEndParams;
}) {
  const { setActiveDragItem, setActiveOverId, setIsDraggingBooking, dragEndParams } = params;

  const handleDragStart = useMemo(
    () => createDragStartHandler(setIsDraggingBooking, setActiveDragItem),
    [setIsDraggingBooking, setActiveDragItem]
  );

  const handleDragOver = useMemo(
    () => createDragOverHandler(setActiveOverId),
    [setActiveOverId]
  );

  // Only flights, optimisticAssignedIds, scheduleId, and selectedDate are reactive.
  // setters, refs, and fetcherSubmit have stable identities.
  const handleDragEnd = useMemo(
    () => createDragEndHandler(dragEndParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      dragEndParams.flights, dragEndParams.optimisticAssignedIds,
      dragEndParams.scheduleId, dragEndParams.selectedDate,
    ]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return { handleDragStart, handleDragOver, handleDragEnd, sensors };
}
