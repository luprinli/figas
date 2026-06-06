import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  /** Auto-dismiss duration in ms. 0 means no auto-dismiss. */
  duration: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Default duration in ms before a toast auto-dismisses. */
const DEFAULT_DURATION = 5000;
/** Duration of the fade-out animation in ms. */
const EXIT_ANIMATION_DURATION = 300;

// ── Event system ───────────────────────────────────────────────────────────────

type Listener = (toast: Toast) => void;

let listeners: Listener[] = [];
let toastCounter = 0;

function subscribe(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function emit(toast: Toast): void {
  listeners.forEach((l) => l(toast));
}

/**
 * Show a toast notification anywhere in the app.
 * Works by emitting an event that the ToastContainer picks up via useToastState.
 * @param message - The text to display.
 * @param type - "success" | "error" | "info".
 * @param duration - Auto-dismiss duration in ms (default 5000). Pass 0 to disable auto-dismiss.
 */
export function showToast(
  message: string,
  type: ToastType = "info",
  duration: number = DEFAULT_DURATION,
): void {
  toastCounter++;
  emit({
    id: `toast-${toastCounter}-${Date.now()}`,
    message,
    type,
    duration,
  });
}

// ── React hooks ────────────────────────────────────────────────────────────────

/**
 * Hook to access the showToast function from any component.
 */
export function useToast(): { showToast: typeof showToast } {
  return { showToast };
}

/**
 * Internal hook used by ToastContainer to manage toast state.
 * Handles auto-dismiss timers and exit animations with proper cleanup.
 */
export function useToastState() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup all timers on unmount
  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      currentTimers.forEach((t) => clearTimeout(t));
      currentTimers.clear();
    };
  }, []);

  /**
   * Begin the exit animation for a toast, then remove it from state.
   */
  const startExit = useCallback((id: string) => {
    // Already leaving — don't double-trigger
    setLeavingIds((prev) => {
      if (prev.has(id)) return prev;
      return new Set(prev).add(id);
    });

    // Schedule actual removal after the exit animation completes
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      setLeavingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      timers.current.delete(id);
    }, EXIT_ANIMATION_DURATION);
    timers.current.set(id, timer);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe((toast) => {
      setToasts((prev) => [...prev, toast]);

      // Set up auto-dismiss timer if duration > 0
      if (toast.duration > 0) {
        const autoDismissTimer = setTimeout(() => {
          startExit(toast.id);
        }, toast.duration);
        timers.current.set(`auto-${toast.id}`, autoDismissTimer);
      }
    });
    return unsubscribe;
  }, [startExit]);

  const removeToast = useCallback(
    (id: string) => {
      startExit(id);
    },
    [startExit],
  );

  return { toasts, removeToast, leavingIds };
}
