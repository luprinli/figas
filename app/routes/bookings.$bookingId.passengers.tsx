import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { requireAuth } from "../utils/auth.server";
import { bookingRepository } from "../utils/repositories/booking";
import { bookingLegRepository } from "../utils/repositories/booking-leg";
import { bookingPassengerRepository } from "../utils/repositories/booking-passenger";
import { bookingLegPassengerRepository } from "../utils/repositories/booking-leg-passenger";
import { MAX_PASSENGERS_PER_BOOKING } from "../utils/constants";
import { useDynamicFields, parseIndexedFormData } from "../utils/form-data";
import PassengersTable from "../components/PassengersTable";
import Button from "../components/Button";
import Skeleton from "../components/Skeleton";

export const meta: MetaFunction = () => [{ title: "Add Passengers - FIGAS" }];

export const headers: HeadersFunction = () => ({
  "Cache-Control": "no-cache, no-store, must-revalidate",
});

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireAuth(request);
  const bookingId = Number(params.bookingId);
  if (isNaN(bookingId)) {
    throw new Response("Invalid booking ID", { status: 400 });
  }

  const booking = await bookingRepository.findById(bookingId);
  if (!booking || booking.user_id !== Number(userId)) {
    throw new Response("Booking not found", { status: 404 });
  }

  if (!["pending"].includes(booking.status)) {
    return redirect(`/bookings/${bookingId}`);
  }

  const legs = await bookingLegRepository.findByBookingId(bookingId);

  return json({ booking, legs });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireAuth(request);
  const bookingId = Number(params.bookingId);
  if (isNaN(bookingId)) {
    return json({ error: "Invalid booking ID" }, { status: 400 });
  }

  const booking = await bookingRepository.findById(bookingId);
  if (!booking || booking.user_id !== Number(userId)) {
    return json({ error: "Booking not found" }, { status: 404 });
  }

  const formData = await request.formData();

  const passengers = parseIndexedFormData<{
    passenger_first_name: string;
    passenger_last_name: string;
    passenger_email: string;
    passenger_phone: string;
    passenger_dob: string;
    passenger_weight: string;
    passenger_residency: string;
    passenger_special: string;
  }>(formData, [
    "passenger_first_name",
    "passenger_last_name",
    "passenger_email",
    "passenger_phone",
    "passenger_dob",
    "passenger_weight",
    "passenger_residency",
    "passenger_special",
  ], { filterEmpty: true });

  const rawFirstNames = formData.getAll("passenger_first_name[]");
  if (rawFirstNames.length === 0) {
    return json({ error: "At least one passenger is required." }, { status: 400 });
  }

  if (passengers.length > MAX_PASSENGERS_PER_BOOKING) {
    return json({ error: `Maximum ${MAX_PASSENGERS_PER_BOOKING} passengers per booking.` }, { status: 400 });
  }

  const legs = await bookingLegRepository.findByBookingId(bookingId);
  const legIds = legs.map((l) => l.id);

  if (legIds.length === 0) {
    return json({ error: "Booking has no legs. Please add a route first." }, { status: 400 });
  }

  try {
    const passengerIds: number[] = [];
    for (const p of passengers) {
      const created = await bookingPassengerRepository.create({
        booking_id: bookingId,
        first_name: p.passenger_first_name,
        last_name: p.passenger_last_name,
        email: p.passenger_email || "",
        phone: p.passenger_phone || null,
        date_of_birth: p.passenger_dob || "",
        clothed_weight_kg: Number(p.passenger_weight) || 70,
        residency: p.passenger_residency || "",
        special_requirements: p.passenger_special || null,
      });
      passengerIds.push(created.id);
    }

    for (const passengerId of passengerIds) {
      for (const legId of legIds) {
        await bookingLegPassengerRepository.create({
          booking_leg_id: legId,
          booking_passenger_id: passengerId,
          clothed_weight_kg: null,
          baggage_weight_kg: 0,
          baggage_description: null,
          freight_description: null,
          freight_weight_kg: 0,
        });
      }
    }

    const { computeBookingCost, updateBookingTotals } = await import("../utils/pricing/booking-costing.server");
    const cost = await computeBookingCost({ bookingId });
    await updateBookingTotals(booking.id, cost.grandTotal);

    return redirect(`/bookings/${bookingId}?passengers_added=true`);
  } catch (error) {
    console.error("Passenger addition failed:", error);
    return json({ error: "Failed to add passengers. Please try again." }, { status: 500 });
  }
}

export default function BookingPassengers() {
  const { booking, legs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const passengers = useDynamicFields(1, MAX_PASSENGERS_PER_BOOKING);

  const isSubmitting = navigation.state === "submitting";
  const isLoading = navigation.state === "loading" && !navigation.formData;

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-48 rounded" />
        <Skeleton className="h-4 w-64 rounded" />
        <Skeleton className="h-64 w-full rounded" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <Link
        to={`/bookings/${booking.id}`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 transition-colors mb-4"
      >
        &larr; Back to Booking
      </Link>

      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Add Passengers</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Booking {booking.booking_reference} &middot;{" "}
        {legs.length > 0
          ? `${legs[0].origin_code} \u2192 ${legs[legs.length - 1].destination_code}`
          : "No route"}
      </p>

      {actionData?.error && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 p-4 text-sm text-red-700" role="alert">
          {actionData.error}
        </div>
      )}

      <Form method="post" className="space-y-6">
        <PassengersTable
          passengerCount={passengers.count}
          committedPassengers={passengers.committed}
          onAdd={(index) => passengers.commit(index)}
          onRemove={(index) => passengers.remove(index)}
          maxPassengers={MAX_PASSENGERS_PER_BOOKING}
        />

        <div className="flex items-center justify-between pt-4">
          <Link
            to={`/bookings/${booking.id}`}
            className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700"
          >
            Skip for now
          </Link>
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting || passengers.committed.size === 0}
          >
            {isSubmitting ? "Saving..." : "Save Passengers"}
          </Button>
        </div>
      </Form>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-400 dark:text-slate-600">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">{error.statusText}</p>
          <Button size="md" onClick={() => window.location.reload()}>Try Again</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">An unexpected error occurred. Please try again.</p>
        <Button size="md" onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    </div>
  );
}
