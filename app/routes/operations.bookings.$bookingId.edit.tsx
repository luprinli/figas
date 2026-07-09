import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useSubmit, useNavigation , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { useState, useRef, useCallback, useMemo } from "react";
import { Minus } from "lucide-react";
import { requirePermission } from "../utils/permissions.server";
import { Permission, MAX_PASSENGERS_PER_BOOKING, DEFAULT_MAX_LEGS_PER_BOOKING } from "../utils/constants";
import { bookingRepository } from "../utils/repositories/booking";
import { bookingLegRepository } from "../utils/repositories/booking-leg";
import { bookingPassengerRepository } from "../utils/repositories/booking-passenger";
import { bookingLegPassengerRepository } from "../utils/repositories/booking-leg-passenger";
import { aerodromeRepository } from "../utils/repositories/aerodrome";
import { getNoFlyDateStrings } from "../utils/services/no-fly.service";
import LegsTable from "../components/LegsTable";
import type { LegInitialValue } from "../components/LegsTable";
import PassengersTable from "../components/PassengersTable";
import type { PrefillData } from "../components/PassengersTable";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import { useDynamicFields, parseIndexedFormData } from "../utils/form-data";
import { todayISO, daysFromNow } from "../utils/dates";

/* ── Validation Types ─────────────────────────────────── */

type ValidationErrors = Record<string, string>;

/* ── Validation Helpers ────────────────────────────────── */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false;
  const d = new Date(dateStr + "T00:00:00");
  return !isNaN(d.getTime());
}

function isPastDate(dateStr: string): boolean {
  if (!isValidDate(dateStr)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + "T00:00:00") < today;
}

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

function isValidTime(time: string): boolean {
  return TIME_REGEX.test(time);
}

/* ── Meta ──────────────────────────────────────────────── */

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.booking) return [{ title: "Booking Not Found | FIGAS" }];
  return [{ title: `Edit Booking ${data.booking.booking_reference} | FIGAS Operations` }];
};

/* ── Loader ────────────────────────────────────────────── */

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await requirePermission(request, Permission.BOOKING_EDIT);

  const bookingId = Number(params.bookingId);
  if (isNaN(bookingId)) {
    throw json({ error: "Invalid booking ID" }, { status: 400 });
  }

  const booking = await bookingRepository.findById(bookingId);
  if (!booking) {
    throw json({ error: "Booking not found" }, { status: 404 });
  }

  const [legs, passengers, aerodromes] = await Promise.all([
    bookingLegRepository.findByBookingId(bookingId),
    bookingPassengerRepository.findByBookingId(bookingId),
    aerodromeRepository.findAll(),
  ]);

  // Build initial values for LegsTable
  const legInitialValues: LegInitialValue[] = legs.map((leg) => ({
    origin: leg.origin_code,
    destination: leg.destination_code,
    date: leg.leg_date,
    preferredTime: leg.preferred_time ?? "",
  }));

  // Build prefill data map for PassengersTable
  const passengerPrefills = new Map<number, PrefillData>();
  passengers.forEach((p, idx) => {
    passengerPrefills.set(idx, {
      existingId: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email ?? "",
      phone: p.phone ?? "",
      date_of_birth: p.date_of_birth ?? "",
      clothed_weight_kg: p.clothed_weight_kg ?? 0,
      residency: p.residency ?? "",
    });
  });

  // Load no-fly dates for the next 90 days to pass to the frontend
  const noFlyDates = await getNoFlyDateStrings(todayISO(), daysFromNow(90));

  return json({
    booking,
    bookingId,
    legs,
    passengers,
    aerodromes,
    legInitialValues,
    passengerPrefills: Object.fromEntries(passengerPrefills),
    noFlyDates,
    permissions: {
      canEdit: user.permissions.includes(Permission.BOOKING_EDIT),
    },
  });
}

/* ── Action ────────────────────────────────────────────── */

export async function action({ request, params }: ActionFunctionArgs) {
  const bookingId = Number(params.bookingId);
  if (isNaN(bookingId)) {
    return json({ error: "Invalid booking ID" }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "update") {
    try {
      // Parse legs from uncontrolled array-indexed fields
      const legs = parseIndexedFormData<{
        leg_origin: string;
        leg_destination: string;
        leg_date: string;
        leg_preferred_time: string;
      }>(formData, ["leg_origin", "leg_destination", "leg_date", "leg_preferred_time"], {
        filterEmpty: true,
      });

      // Check raw formData for leg rows
      const rawOrigins = formData.getAll("leg_origin[]");
      if (rawOrigins.length === 0) {
        return json<{ error: string; fields?: Record<string, string> }>(
          { error: "At least one leg is required." },
          { status: 400 }
        );
      }

      // Validate all leg dates are in the future and not no-fly days
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const noFlyDates = await getNoFlyDateStrings(todayISO(), daysFromNow(90));
      const noFlySet = new Set(noFlyDates);
      for (const leg of legs) {
        if (leg.leg_origin === leg.leg_destination) {
          return json<{ error: string; fields?: Record<string, string> }>(
            { error: `Leg ${leg.leg_origin} → ${leg.leg_destination}: origin and destination must be different.` },
            { status: 400 }
          );
        }
        const legDate = new Date(leg.leg_date + "T00:00:00");
        if (isNaN(legDate.getTime())) {
          return json<{ error: string; fields?: Record<string, string> }>(
            { error: `Leg ${leg.leg_origin} → ${leg.leg_destination}: invalid date.` },
            { status: 400 }
          );
        }
        if (legDate <= today) {
          return json<{ error: string; fields?: Record<string, string> }>(
            { error: `Leg ${leg.leg_origin} → ${leg.leg_destination} on ${leg.leg_date}: date must be in the future.` },
            { status: 400 }
          );
        }
        if (noFlySet.has(leg.leg_date)) {
          return json<{ error: string; fields?: Record<string, string> }>(
            { error: `Leg ${leg.leg_origin} → ${leg.leg_destination} on ${leg.leg_date}: this date is a no-fly day and cannot be booked.` },
            { status: 400 }
          );
        }
      }

      // Parse passengers from uncontrolled array-indexed fields
      const passengers = parseIndexedFormData<{
        passenger_first_name: string;
        passenger_last_name: string;
        passenger_email: string;
        passenger_phone: string;
        passenger_dob: string;
        passenger_weight: string;
        passenger_residency: string;
        passenger_special: string;
        passenger_existing_id: string;
      }>(formData, [
        "passenger_first_name",
        "passenger_last_name",
        "passenger_email",
        "passenger_phone",
        "passenger_dob",
        "passenger_weight",
        "passenger_residency",
        "passenger_special",
        "passenger_existing_id",
      ], { filterEmpty: true });

      // Check raw formData for passenger rows
      const rawFirstNames = formData.getAll("passenger_first_name[]");
      if (rawFirstNames.length === 0) {
        return json<{ error: string; fields?: Record<string, string> }>(
          { error: "At least one passenger is required." },
          { status: 400 }
        );
      }

      // ── Step 1: Delete existing junction records ──────────────
      const existingLegs = await bookingLegRepository.findByBookingId(bookingId);
      for (const leg of existingLegs) {
        await bookingLegPassengerRepository.deleteByLegId(leg.id).catch((err: unknown) => {
          console.error(`Failed to delete leg-passenger junctions for leg ${leg.id}:`, err);
        });
      }

      // ── Step 2: Delete existing passengers ────────────────────
      const existingPassengers = await bookingPassengerRepository.findByBookingId(bookingId);
      for (const p of existingPassengers) {
        await bookingPassengerRepository.delete(p.id).catch((err: unknown) => {
          console.error(`Failed to delete passenger ${p.id}:`, err);
        });
      }

      // ── Step 3: Delete existing legs ──────────────────────────
      for (const leg of existingLegs) {
        await bookingLegRepository.delete(leg.id).catch((err: unknown) => {
          console.error(`Failed to delete leg ${leg.id}:`, err);
        });
      }

      // ── Step 4: Create new legs ───────────────────────────────
      const legIds: number[] = [];
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        const created = await bookingLegRepository.create({
          booking_id: bookingId,
          origin_code: leg.leg_origin,
          destination_code: leg.leg_destination,
          leg_date: leg.leg_date,
          preferred_time: leg.leg_preferred_time || null,
          preferred_time_start: null,
          preferred_time_end: null,
          leg_sequence: i + 1,
        });
        legIds.push(created.id);
      }

      // ── Step 5: Create new passengers ─────────────────────────
      const passengerIds: number[] = [];
      for (const p of passengers) {
        const created = await bookingPassengerRepository.create({
          booking_id: bookingId,
          first_name: p.passenger_first_name,
          last_name: p.passenger_last_name,
          email: p.passenger_email,
          phone: p.passenger_phone || null,
          date_of_birth: p.passenger_dob,
          clothed_weight_kg: Number(p.passenger_weight) || 0,
          residency: p.passenger_residency,
          special_requirements: p.passenger_special || null,
        });
        passengerIds.push(created.id);
      }

      // ── Step 6: Create junction records ───────────────────────
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

      // ── Step 7: Recalculate fares ──
      const { computeBookingCost, updateBookingTotals } = await import("../utils/pricing/booking-costing.server");
      const cost = await computeBookingCost({ bookingId });
      await updateBookingTotals(bookingId, cost.grandTotal);

      return redirect(`/operations/bookings/${bookingId}?updated=true&t=${Date.now()}`);
    } catch (error) {
      console.error("Booking update failed:", error);
      if (error instanceof Error && error.message.includes('origin and destination must be different')) {
        return json<{ error: string }>(
          { error: error.message },
          { status: 400 }
        );
      }
      return json<{ error: string }>(
        { error: "Failed to update booking. Please try again." },
        { status: 500 }
      );
    }
  }

  return json<{ error: string }>({ error: "Unknown intent" }, { status: 400 });
}

/* ── DOM Helper ───────────────────────────────────────── */

function getFieldValue(list: RadioNodeList | null, index: number): string {
  return (list?.[index] as HTMLInputElement | HTMLSelectElement | undefined)?.value ?? "";
}

/* ── Client-side Validation ────────────────────────────── */

function validateForm(
  form: HTMLFormElement,
  committedLegs: Set<number>,
  committedPassengers: Set<number>
): ValidationErrors {
  const errors: ValidationErrors = {};
  const elements = form.elements as HTMLFormControlsCollection;

  // ── Leg fields (only validate committed rows) ────────
  const origins = elements.namedItem("leg_origin[]") as RadioNodeList | null;
  const destinations = elements.namedItem("leg_destination[]") as RadioNodeList | null;
  const legDates = elements.namedItem("leg_date[]") as RadioNodeList | null;
  const legTimes = elements.namedItem("leg_preferred_time[]") as RadioNodeList | null;

  const legCount = origins?.length ?? 0;

  for (let i = 0; i < legCount; i++) {
    if (!committedLegs.has(i)) continue;

    const origin = getFieldValue(origins, i);
    const destination = getFieldValue(destinations, i);
    const legDate = getFieldValue(legDates, i);
    const legTime = getFieldValue(legTimes, i);

    if (!origin) {
      errors[`leg_origin_${i}`] = "Origin is required";
    }

    if (!destination) {
      errors[`leg_destination_${i}`] = "Destination is required";
    }

    if (origin && destination && origin === destination) {
      errors[`leg_destination_${i}`] = "Origin and destination cannot be the same";
    }

    if (!legDate) {
      errors[`leg_date_${i}`] = "Leg date is required";
    } else if (!isValidDate(legDate)) {
      errors[`leg_date_${i}`] = "Leg date must be a valid date (YYYY-MM-DD)";
    }

    if (legTime && !isValidTime(legTime)) {
      errors[`leg_preferred_time_${i}`] = "Time must be in HH:MM format";
    }
  }

  // ── Passenger fields (only validate committed rows) ──
  const firstNames = elements.namedItem("passenger_first_name[]") as RadioNodeList | null;
  const lastNames = elements.namedItem("passenger_last_name[]") as RadioNodeList | null;
  const emails = elements.namedItem("passenger_email[]") as RadioNodeList | null;
  const dobs = elements.namedItem("passenger_dob[]") as RadioNodeList | null;
  const weights = elements.namedItem("passenger_weight[]") as RadioNodeList | null;

  const passengerCount = firstNames?.length ?? 0;

  for (let i = 0; i < passengerCount; i++) {
    if (!committedPassengers.has(i)) continue;

    const firstName = getFieldValue(firstNames, i);
    const lastName = getFieldValue(lastNames, i);
    const email = getFieldValue(emails, i);
    const dob = getFieldValue(dobs, i);
    const weight = getFieldValue(weights, i);

    if (!firstName.trim()) {
      errors[`passenger_first_name_${i}`] = "First name is required";
    }

    if (!lastName.trim()) {
      errors[`passenger_last_name_${i}`] = "Last name is required";
    }

    if (!dob) {
      errors[`passenger_dob_${i}`] = "Date of birth is required";
    } else if (!isValidDate(dob)) {
      errors[`passenger_dob_${i}`] = "DOB must be a valid date (YYYY-MM-DD)";
    } else if (!isPastDate(dob)) {
      errors[`passenger_dob_${i}`] = "DOB must be a past date";
    }

    if (email && !isValidEmail(email)) {
      errors[`passenger_email_${i}`] = "Invalid email format";
    }

    if (!weight) {
      errors[`passenger_weight_${i}`] = "Weight is required";
    } else {
      const weightNum = Number(weight);
      if (isNaN(weightNum) || !Number.isInteger(weightNum)) {
        errors[`passenger_weight_${i}`] = "Weight must be a whole number";
      } else if (weightNum < 1 || weightNum > 500) {
        errors[`passenger_weight_${i}`] = "Weight must be between 1 and 500 kg";
      }
    }
  }

  return errors;
}

/* ── Confirmation Summary Builders ────────────────────── */

function buildCommittedLegsSummary(
  form: HTMLFormElement | null,
  committed: Set<number>
): Array<{ origin: string; destination: string; date: string }> {
  if (!form) return [];
  const elements = form.elements as HTMLFormControlsCollection;
  const origins = elements.namedItem("leg_origin[]") as RadioNodeList | null;
  const destinations = elements.namedItem("leg_destination[]") as RadioNodeList | null;
  const dates = elements.namedItem("leg_date[]") as RadioNodeList | null;

  return Array.from(committed)
    .sort((a, b) => a - b)
    .map((i) => ({
      origin: getFieldValue(origins, i),
      destination: getFieldValue(destinations, i),
      date: getFieldValue(dates, i),
    }));
}

function buildCommittedPassengersSummary(
  form: HTMLFormElement | null,
  committed: Set<number>
): Array<{ first_name: string; last_name: string; email: string; existingId: number | null }> {
  if (!form) return [];
  const elements = form.elements as HTMLFormControlsCollection;
  const firstNames = elements.namedItem("passenger_first_name[]") as RadioNodeList | null;
  const lastNames = elements.namedItem("passenger_last_name[]") as RadioNodeList | null;
  const emails = elements.namedItem("passenger_email[]") as RadioNodeList | null;
  const existingIds = elements.namedItem("passenger_existing_id[]") as RadioNodeList | null;

  return Array.from(committed)
    .sort((a, b) => a - b)
    .map((i) => ({
      first_name: getFieldValue(firstNames, i),
      last_name: getFieldValue(lastNames, i),
      email: getFieldValue(emails, i),
      existingId: existingIds?.[i] ? Number((existingIds[i] as HTMLInputElement).value) : null,
    }));
}

/* ── Component ─────────────────────────────────────────── */

export default function OperationsEditBooking() {
  const {
    booking,
    bookingId,
    aerodromes,
    legInitialValues,
    passengerPrefills,
    noFlyDates,
  } = useLoaderData<typeof loader>();

  // Convert no-fly date strings to a Set for the DatePicker disabledDates prop
  const disabledDates = useMemo(() => new Set(noFlyDates), [noFlyDates]);
  const actionData = useActionData<{ error?: string; fields?: Record<string, string> }>();
  const formRef = useRef<HTMLFormElement>(null);
  const submit = useSubmit();
  const navigation = useNavigation();

  /* ── Validation state ──────────────────────────────── */
  const [errors, setErrors] = useState<ValidationErrors>({});

  const clearError = useCallback((fieldName: string) => {
    setErrors((prev) => {
      if (!prev[fieldName]) return prev;
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
  }, []);

  /* ── Dynamic fields state ──────────────────────────── */
  // Start with existing legs/passengers count, all pre-committed
  const initialLegCount = legInitialValues.length;
  const initialPassengerCount = Object.keys(passengerPrefills).length;

  const legs = useDynamicFields(Math.max(initialLegCount, 1), DEFAULT_MAX_LEGS_PER_BOOKING);
  const passengers = useDynamicFields(Math.max(initialPassengerCount, 1), MAX_PASSENGERS_PER_BOOKING);

  // Pre-commit all existing rows
  // We need to do this after mount since useDynamicFields initializes with empty committed set
  const [initialized, setInitialized] = useState(false);
  if (!initialized) {
    for (let i = 0; i < initialLegCount; i++) {
      legs.commit(i);
    }
    for (let i = 0; i < initialPassengerCount; i++) {
      passengers.commit(i);
    }
    setInitialized(true);
  }

  /* ── Passenger handlers ──────────────────────────────── */

  function addSelfAsPassenger() {
    passengers.add();
  }

  /* ── Confirmation dialog state ──────────────────────── */
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmLegs, setConfirmLegs] = useState<Array<{ origin: string; destination: string; date: string }>>([]);
  const [confirmPassengers, setConfirmPassengers] = useState<Array<{ first_name: string; last_name: string; email: string; existingId: number | null }>>([]);

  /* ── Confirmation handlers ──────────────────────────── */
  function handleSaveClick() {
    const form = formRef.current;
    if (!form) return;

    const validationErrors = validateForm(form, legs.committed, passengers.committed);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setConfirmLegs(buildCommittedLegsSummary(form, legs.committed));
    setConfirmPassengers(buildCommittedPassengersSummary(form, passengers.committed));

    setShowConfirm(true);
  }

  function handleConfirm() {
    const form = formRef.current;
    if (!form) return;

    if (navigation.state !== "idle") {
      console.warn("[DEBUG] Submission skipped — navigation already in progress");
      return;
    }

    submit(form, { method: "post" });
    setShowConfirm(false);
  }

  /* ── Passenger header actions ──────────────────────── */
  const passengerHeaderActions = (
    <Button
      type="button"
      variant="outlined"
      onClick={addSelfAsPassenger}
      className="!px-3 !py-1.5 !text-sm"
    >
      + Self
    </Button>
  );

  /* ── Render ──────────────────────────────────────────── */

  return (
    <div className="mx-auto px-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">
        Edit Booking — {booking.booking_reference}
      </h1>

      {actionData?.error && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 p-4 text-sm text-red-700">
          {actionData.error}
        </div>
      )}

      <Form id="booking-edit-form" ref={formRef} method="post" className="space-y-6">
        <input type="hidden" name="intent" value="update" />

        {/* ── Legs section ──────────────────────────────── */}
        <div className="min-w-fit">
          <LegsTable
            legCount={legs.count}
            committedLegs={legs.committed}
            aerodromes={aerodromes}
            onAdd={(index) => legs.commit(index)}
            onRemove={(index) => legs.remove(index)}
            maxLegs={DEFAULT_MAX_LEGS_PER_BOOKING}
            errors={errors}
            onErrorClear={clearError}
            initialValues={legInitialValues}
            disabledDates={disabledDates}
          />
        </div>

        {/* ── Passengers section ──────────────────────────── */}
        <div className="min-w-fit">
          <PassengersTable
            passengerCount={passengers.count}
            committedPassengers={passengers.committed}
            onAdd={(index) => passengers.commit(index)}
            onRemove={(index) => passengers.remove(index)}
            maxPassengers={MAX_PASSENGERS_PER_BOOKING}
            headerActions={passengerHeaderActions}
            errors={errors}
            onErrorClear={clearError}
            prefilledData={
              new Map(
                Object.entries(passengerPrefills).map(([key, val]) => [Number(key), val as PrefillData])
              )
            }
          />
        </div>

        {/* ── Submit button ──────────────────────────────── */}
        <div className="flex items-center justify-end gap-3">
          <Link
            to={`/operations/bookings/${bookingId}`}
            className="rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            Cancel
          </Link>
          <Button
            type="button"
            onClick={handleSaveClick}
            variant="contained"
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Save Changes
          </Button>
        </div>
      </Form>

      <div className="mt-6">
        <Link
          to={`/operations/bookings/${bookingId}`}
          className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:text-slate-100"
        >
          &larr; Back to booking
        </Link>
      </div>

      {/* ── Confirmation dialog ──────────────────────────── */}
      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
        title="Confirm Changes"
        confirmLabel="Save Changes"
      >
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Please review the changes below before saving. This will replace all existing legs and passengers.
        </p>

        {/* Legs summary */}
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            Legs ({confirmLegs.length})
          </h4>
          <div className="space-y-1.5">
            {confirmLegs.map((leg, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-sm bg-slate-50 dark:bg-slate-700 rounded-lg px-3 py-2"
              >
                <span className="font-semibold text-slate-500 dark:text-slate-400 text-xs min-w-[2.5rem]">
                  Leg {idx + 1}
                </span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{leg.origin}</span>
                <Minus size={16} className="text-slate-500 dark:text-slate-400 shrink-0" absoluteStrokeWidth />
                <span className="font-medium text-slate-900 dark:text-slate-100">{leg.destination}</span>
                <span className="text-slate-500 ml-auto text-xs">{leg.date}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Passengers summary */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            Passengers ({confirmPassengers.length})
          </h4>
          {confirmPassengers.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 italic">No passengers</p>
          ) : (
            <div className="space-y-1">
              {confirmPassengers.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500 font-mono text-xs min-w-[1.5rem]">{idx + 1}.</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {p.first_name || "(unnamed)"} {p.last_name}
                  </span>
                  {p.email && <span className="text-slate-500 text-xs">{p.email}</span>}
                  {p.existingId !== null && (
                    <span className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">existing</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </ConfirmDialog>
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