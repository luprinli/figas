import type { ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { getUserId } from "../utils/auth.server";
import { createAuditLogEntry } from "../utils/permissions.server";
import { BookingSource } from "../utils/constants";
import { bookingRepository } from "../utils/repositories/booking";
import { bookingLegRepository } from "../utils/repositories/booking-leg";
import { bookingPassengerRepository } from "../utils/repositories/booking-passenger";
import { bookingLegPassengerRepository } from "../utils/repositories/booking-leg-passenger";
import { getNoFlyDateStrings } from "../utils/services/no-fly.service";
import { parseIndexedFormData } from "../utils/form-data";
import { todayISO, daysFromNow } from "../utils/dates";

export async function action({ request }: ActionFunctionArgs) {
  const userId = await getUserId(request);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "search_passengers") {
    const query = (formData.get("query") as string) ?? "";
    if (query.trim().length < 2) {
      return json({ passengers: [] });
    }
    try {
      const passengers = await bookingPassengerRepository.search(query.trim(), 10);
      return json({ passengers });
    } catch (error) {
      console.error("Passenger search failed:", error);
      return json({ passengers: [] });
    }
  }

  if (intent === "create") {
    try {
      const bookingSource = BookingSource.OPERATIONS_STAFF;
      const createdBy = Number(userId);

      // Parse legs from uncontrolled array-indexed fields
      const legs = parseIndexedFormData<{
        leg_origin: string;
        leg_destination: string;
        leg_date: string;
        leg_preferred_time: string;
      }>(formData, ["leg_origin", "leg_destination", "leg_date", "leg_preferred_time"], {
        filterEmpty: true,
      });

      // Check raw formData for leg rows — filterEmpty may remove rows with empty fields
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
            { error: `Leg ${leg.leg_origin} \u2192 ${leg.leg_destination}: origin and destination must be different.` },
            { status: 400 }
          );
        }
        const legDate = new Date(leg.leg_date + "T00:00:00");
        if (isNaN(legDate.getTime())) {
          return json<{ error: string; fields?: Record<string, string> }>(
            { error: `Leg ${leg.leg_origin} \u2192 ${leg.leg_destination}: invalid date.` },
            { status: 400 }
          );
        }
        if (legDate <= today) {
          return json<{ error: string; fields?: Record<string, string> }>(
            { error: `Leg ${leg.leg_origin} \u2192 ${leg.leg_destination} on ${leg.leg_date}: date must be in the future.` },
            { status: 400 }
          );
        }
        if (noFlySet.has(leg.leg_date)) {
          return json<{ error: string; fields?: Record<string, string> }>(
            { error: `Leg ${leg.leg_origin} \u2192 ${leg.leg_destination} on ${leg.leg_date}: this date is a no-fly day and cannot be booked.` },
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

      // Check raw formData for passenger rows — filterEmpty may remove rows with empty fields
      const rawFirstNames = formData.getAll("passenger_first_name[]");
      if (rawFirstNames.length === 0) {
        return json<{ error: string; fields?: Record<string, string> }>(
          { error: "At least one passenger is required." },
          { status: 400 }
        );
      }

      // ── Step 1: Create booking ──────────────────────────────
      const booking = await bookingRepository.createPending(Number(userId), null, false, {
        booking_source: bookingSource,
        created_by: createdBy,
      });

      // ── Step 2: Create legs ─────────────────────────────────
      const legIds: number[] = [];
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        const created = await bookingLegRepository.create({
          booking_id: booking.id,
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

      // ── Step 3: Create passengers (new repository) ──────────
      const passengerIds: number[] = [];
      for (const p of passengers) {
        const created = await bookingPassengerRepository.create({
          booking_id: booking.id,
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

      // ── Step 4: Create junction records (link each passenger to each leg) ──
      for (const passengerId of passengerIds) {
        for (const legId of legIds) {
          await bookingLegPassengerRepository.create({
            booking_leg_id: legId,
            booking_passenger_id: passengerId,
            clothed_weight_kg: null, // will be set at check-in
            baggage_weight_kg: 0,
            baggage_description: null,
            freight_description: null,
            freight_weight_kg: 0,
          });
        }
      }

      // ── Step 5: Compute fares and update booking totals ──
      const { computeBookingCost, updateBookingTotals } = await import("../utils/pricing/booking-costing.server");
      const cost = await computeBookingCost({ bookingId: booking.id });
      await updateBookingTotals(booking.id, cost.grandTotal);

      // ── Step 6: Send booking confirmation email ─────────────
      // Non-blocking: if email sending fails, the booking still succeeds
      const passengerEmails = passengers
        .filter((p) => p.passenger_email)
        .map((p) => p.passenger_email as string);
      if (passengerEmails.length > 0) {
        const { sendEmailQuiet } = await import("../utils/email.server");
        sendEmailQuiet({
          to: passengerEmails,
          subject: `Booking Confirmed — ${booking.booking_reference}`,
          text: `Your booking ${booking.booking_reference} has been confirmed. View details: ${process.env.APP_URL ?? ""}/bookings/${booking.id}`,
          notificationType: "booking_confirmation",
          bookingId: booking.id,
          recipientType: "passenger",
        });
      }

      // ── Step 7: Audit log ──────────────────────────────
      await createAuditLogEntry({
        actorId: Number(userId),
        action: "booking.created",
        entityType: "booking",
        entityId: booking.id,
        newValues: { booking_reference: booking.booking_reference, passenger_count: passengers.length, leg_count: legs.length },
      }).catch(() => {});

      return redirect(`/operations/bookings/${booking.id}?created=true&t=${Date.now()}`);
    } catch (error) {
      console.error("Booking creation failed:", error);
      if (error instanceof Error && error.message.includes('origin and destination must be different')) {
        return json<{ error: string }>(
          { error: error.message },
          { status: 400 }
        );
      }
      return json<{ error: string }>(
        { error: "Failed to create booking. Please try again." },
        { status: 500 }
      );
    }
  }

  return json<{ error: string }>({ error: "Unknown intent" }, { status: 400 });
}
