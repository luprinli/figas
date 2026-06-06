import { useEffect, useCallback, type RefObject } from "react";

interface ScheduleShortcuts {
  onAssign?: () => void;
  onUnassign?: () => void;
  onToggleReorder?: () => void;
  onPrevDate?: () => void;
  onNextDate?: () => void;
  onJumpToday?: () => void;
  onNewFlight?: () => void;
}

export function useScheduleShortcuts(
  containerRef: RefObject<HTMLElement | null>,
  {
    onAssign,
    onUnassign,
    onToggleReorder,
    onPrevDate,
    onNextDate,
    onJumpToday,
    onNewFlight,
  }: ScheduleShortcuts
) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      switch (key) {
        case "a":
          e.preventDefault();
          onAssign?.();
          break;
        case "u":
          e.preventDefault();
          onUnassign?.();
          break;
        case "r":
          e.preventDefault();
          onToggleReorder?.();
          break;
        case "arrowleft":
          e.preventDefault();
          onPrevDate?.();
          break;
        case "arrowright":
          e.preventDefault();
          onNextDate?.();
          break;
        case "t":
          e.preventDefault();
          onJumpToday?.();
          break;
        case "n":
          e.preventDefault();
          onNewFlight?.();
          break;
      }
    },
    [onAssign, onUnassign, onToggleReorder, onPrevDate, onNextDate, onJumpToday, onNewFlight]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [containerRef, handleKeyDown]);
}
