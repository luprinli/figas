import { useEffect, useRef, useState } from "react";

export interface ScheduleEvent {
  scheduleId: number;
  flightCount: number;
  assignedCount: number;
  timestamp: string;
}

interface UseScheduleSubscriptionOptions {
  scheduleId: number | null;
  onUpdate?: (event: ScheduleEvent) => void;
}

export function useScheduleSubscription({ scheduleId, onUpdate }: UseScheduleSubscriptionOptions) {
  const [lastEvent, setLastEvent] = useState<ScheduleEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!scheduleId) return;

    function connect() {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource(`/api/schedule-events?scheduleId=${scheduleId}`);
      eventSourceRef.current = es;

      es.onopen = () => setConnected(true);

      es.addEventListener("schedule-update", (e: MessageEvent) => {
        try {
          const event: ScheduleEvent = JSON.parse(e.data);
          setLastEvent(event);
          onUpdateRef.current?.(event);
        } catch {
          // parse error — ignore
        }
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        reconnectTimeoutRef.current = setTimeout(connect, 10000);
      };
    }

    connect();

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [scheduleId]);

  return { lastEvent, connected };
}
