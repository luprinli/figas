import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requireAuth } from "../utils/auth.server";
import { bookingRepository } from "../utils/repositories/booking";
import { bookingLegRepository } from "../utils/repositories/booking-leg";
import { aerodromeRepository } from "../utils/repositories/aerodrome";
import RouteSelector from "../components/RouteSelector";
import DatePicker from "../components/DatePicker";

export const meta: MetaFunction = () => [{ title: "New Booking - FIGAS" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuth(request);
  const aerodromes = await aerodromeRepository.findAll();
  return json({ aerodromes });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireAuth(request);
  const formData = await request.formData();

  const origin = formData.get("origin") as string;
  const destination = formData.get("destination") as string;
  const departureDate = formData.get("departure_date") as string;
  const preferredTime = formData.get("preferred_time") as string;

  if (!origin || !destination || !departureDate) {
    return json({
      error: "Origin, destination, and departure date are required.",
      fields: { origin, destination, departureDate, preferredTime },
    }, { status: 400 });
  }

  if (origin === destination) {
    return json({
      error: "Origin and destination must be different.",
      fields: { origin, destination, departureDate, preferredTime },
    }, { status: 400 });
  }

  // Validate departure date is in the future
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const depDate = new Date(departureDate + "T00:00:00");
  if (isNaN(depDate.getTime())) {
    return json({
      error: "Invalid departure date.",
      fields: { origin, destination, departureDate, preferredTime },
    }, { status: 400 });
  }
  if (depDate <= today) {
    return json({
      error: "Departure date must be in the future.",
      fields: { origin, destination, departureDate, preferredTime },
    }, { status: 400 });
  }

  // Create pending booking (customer direct source)
  const booking = await bookingRepository.createPending(Number(userId), null, false, {
    booking_source: "customer_direct",
  });

  // Create booking leg
  await bookingLegRepository.create({
    booking_id: booking.id,
    origin_code: origin,
    destination_code: destination,
    leg_date: departureDate,
    preferred_time: preferredTime || null,
    leg_sequence: 1,
  });

  return redirect(`/bookings/${booking.id}/passengers`);
}

export default function NewBooking() {
  const { aerodromes } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [departureDate, setDepartureDate] = useState(actionData?.fields?.departureDate ?? "");

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">New Booking</h1>

      {actionData?.error && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 p-4 text-sm text-red-700">
          {actionData.error}
        </div>
      )}

      <Form method="post" className="space-y-4">
        <RouteSelector
          aerodromes={aerodromes}
          defaultOrigin={actionData?.fields?.origin ?? ""}
          defaultDestination={actionData?.fields?.destination ?? ""}
        />

        <div>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Departure Date
          </span>
          <DatePicker
            value={departureDate}
            onChange={setDepartureDate}
            label="Departure Date"
          />
          {/* Hidden input to submit the date value with the form */}
          <input type="hidden" name="departure_date" value={departureDate} />
        </div>

        <div>
          <label htmlFor="preferred_time" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Preferred Time (optional)
          </label>
          <input
            type="time"
            id="preferred_time"
            name="preferred_time"
            defaultValue={actionData?.fields?.preferredTime ?? ""}
            className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors"
          >
            Create Booking
          </button>
          <Link
            to="/bookings"
            className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:text-slate-100"
          >
            Cancel
          </Link>
        </div>
      </Form>
    </div>
  );
}



export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-500 dark:text-slate-600 dark:text-slate-300 dark:text-slate-500">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{error.statusText}</p>
          <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">An unexpected error occurred. Please try again.</p>
        <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
      </div>
    </div>
  );
}