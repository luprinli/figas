import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useActionData, Form, Link , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import { notificationRepository } from "../utils/repositories/notification";
import { processPendingNotifications } from "../utils/email.server";
import { requireUser } from "../utils/layout.server";
import { validateCsrfRequest } from "../utils/csrf-check.server";
import DataTable from "../components/DataTable";
import type { Column } from "../components/DataTable";

export const meta: MetaFunction = () => [{ title: "Notifications - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);

  const result = await sql<Record<string, unknown>>`
    SELECT n.*,
            f.flight_number,
            b.booking_reference
     FROM notifications n
     LEFT JOIN flights f ON f.id = n.flight_id
     LEFT JOIN bookings b ON b.id = n.booking_id
     ORDER BY n.created_at DESC
     LIMIT 100
  `.execute(kdb);

  const notifications = result.rows;

  return json({ notifications });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);

  const formData = await request.formData();

  if (!(await validateCsrfRequest(request, formData))) {
    return json({ error: "CSRF token validation failed" }, { status: 403 });
  }

  const intent = formData.get("intent") as string;
  const notificationId = Number(formData.get("notificationId"));

  if (intent === "resend" && notificationId) {
    const notification = await notificationRepository.findById(notificationId);
    if (notification) {
      await sql`
        UPDATE notifications SET status = ${"pending"}, updated_at = NOW() WHERE id = ${notificationId}
      `.execute(kdb);
    }
    return redirect("/operations/notifications");
  }

  if (intent === "process-pending") {
    const result = await processPendingNotifications();
    return json({ processResult: result });
  }

  return redirect("/operations/notifications");
}

type NotificationRow = Record<string, unknown>;

export default function Notifications() {
  const { notifications } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      sent: "bg-green-100 text-green-800",
      pending: "bg-yellow-100 text-yellow-800",
      failed: "bg-red-100 text-red-800",
    };
    return (
      <span
        className={`px-2 py-1 rounded text-xs font-medium ${colors[status] ?? "bg-slate-100 text-slate-800 dark:text-slate-100"
          }`}
      >
        {status}
      </span>
    );
  };

  const columns: Column<NotificationRow>[] = [
    {
      key: "notification_type",
      header: "Type",
      render: (notif) => (
        <span className="font-medium text-slate-800 dark:text-slate-100">
          {(notif.notification_type as string).replace(/_/g, " ")}
        </span>
      ),
      sortable: true,
    },
    {
      key: "recipient_email",
      header: "Recipient",
      render: (notif) => (
        <div>
          <div className="text-slate-800 dark:text-slate-100">{notif.recipient_email as string}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{notif.recipient_type as string}</div>
        </div>
      ),
      sortable: true,
    },
    {
      key: "related_to",
      header: "Related To",
      render: (notif) => (
        <>
          {notif.flight_number ? (
            <Link
              to={`/ops/flight/${notif.flight_id as number}`}
              className="text-blue-600 hover:underline"
            >
              {notif.flight_number as string}
            </Link>
          ) : notif.booking_reference ? (
            <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">
              Booking: {notif.booking_reference as string}
            </span>
          ) : (
            <span className="text-slate-500 dark:text-slate-400">—</span>
          )}
        </>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (notif) => statusBadge(notif.status as string),
      sortable: true,
    },
    {
      key: "created_at",
      header: "Created",
      render: (notif) => (
        <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">
          {new Date(notif.created_at as string).toLocaleDateString("en-GB")}
        </span>
      ),
      sortable: true,
    },
    {
      key: "sent_at",
      header: "Sent",
      render: (notif) => (
        <span className="text-slate-600 dark:text-slate-300 dark:text-slate-500">
          {notif.sent_at
            ? new Date(notif.sent_at as string).toLocaleDateString("en-GB")
            : "—"}
        </span>
      ),
    },
  ];

  const data = Array.isArray(notifications) ? (notifications as NotificationRow[]) : [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          to="/operations"
          className="text-blue-600 hover:underline text-sm"
        >
          Ã¢â€ Â Back to Dashboard
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">
        Notifications
      </h1>

      {actionData && 'processResult' in actionData ? (
        <div className={`mb-4 p-4 rounded-md text-sm ${
          actionData.processResult.success
            ? "bg-green-50 text-green-800 border border-green-200"
            : "bg-red-50 text-red-800 border border-red-200"
        }`}>
          {actionData.processResult.success
            ? `Processed: ${actionData.processResult.processed} sent, ${actionData.processResult.failed} failed.`
            : `Error: ${actionData.processResult.error}`}
        </div>
      ) : null}

      <div className="mb-4">
        <Form method="post">
          <input type="hidden" name="intent" value="process-pending" />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Process Pending
          </button>
        </Form>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700">
        <DataTable
          columns={columns}
          data={data}
          keyExtractor={(notif) => notif.id as number}
          sortable
          initialSortColumn="created_at"
          initialSortDirection="desc"
          emptyState={
            <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
              No notifications found.
            </div>
          }
          actions={(notif) =>
            (notif.status as string) === "failed" ? (
              <Form method="post" className="inline">
                <input type="hidden" name="intent" value="resend" />
                <input type="hidden" name="notificationId" value={notif.id as number} />
                <button
                  type="submit"
                  className="text-blue-600 hover:underline text-xs"
                >
                  Resend
                </button>
              </Form>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}



export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-600">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">{error.statusText}</p>
          <button onClick={() => window.location.reload()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Try Again</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">An unexpected error occurred. Please try again.</p>
        <button onClick={() => window.location.reload()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Try Again</button>
      </div>
    </div>
  );
}
