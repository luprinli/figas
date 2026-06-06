import type { LoaderFunctionArgs } from "@remix-run/node";
import { db } from "../utils/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const scheduleId = Number(url.searchParams.get("scheduleId"));

  if (!scheduleId) {
    return new Response("scheduleId query parameter is required", { status: 400 });
  }

  let closed = false;
  let lastState = "";

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      async function poll() {
        if (closed) return;
        try {
          const rows = await db.$queryRawUnsafe<Array<{ flight_count: number; assigned_count: number }>>(
            `SELECT
           COALESCE((SELECT COUNT(*) FROM flights WHERE schedule_id = $1), 0)::int AS flight_count,
           COALESCE((SELECT COUNT(*) FROM booking_leg_passengers blp
             JOIN booking_legs bl ON bl.id = blp.booking_leg_id
             WHERE bl.flight_id IN (SELECT id FROM flights WHERE schedule_id = $1)), 0)::int AS assigned_count`,
            [scheduleId]
          );

          if (rows.length > 0) {
            const current = JSON.stringify({
              scheduleId,
              flightCount: Number(rows[0].flight_count),
              assignedCount: Number(rows[0].assigned_count),
              timestamp: new Date().toISOString(),
            });
            if (current !== lastState) {
              lastState = current;
              controller.enqueue(encoder.encode(`event: schedule-update\ndata: ${current}\n\n`));
            }
          }
        } catch {
          if (!closed) {
            controller.enqueue(encoder.encode(`event: error\ndata: {"message":"Poll failed"}\n\n`));
          }
        }
        if (!closed) {
          await new Promise((r) => setTimeout(r, 5000));
          poll();
        }
      }

      poll();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
