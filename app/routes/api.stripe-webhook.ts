import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import type Stripe from "stripe";
import { getStripe, getStripeWebhookSecret } from "../utils/stripe.server";
import { handleStripeSuccess } from "../utils/services/payment.service";
import { stripePaymentRepository } from "../utils/repositories/stripe-payment";
import { bookingRepository } from "../utils/repositories/booking";
import { db } from "../utils/db.server";
import { sql } from "kysely";
import { PaymentStatus, StripePaymentStatus } from "../utils/constants";
import { webhookEventRepository } from "../utils/repositories/webhook-event";

/**
 * System/service account user ID used for webhook-initiated actions
 * where no authenticated user session exists.
 */
const SYSTEM_USER_ID = 0;

/**
 * Stripe webhook handler — called by Stripe, not by authenticated users.
 * Receives events like checkout.session.completed and updates payment records.
 * Includes idempotency checking to prevent duplicate event processing.
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const sig = request.headers.get("stripe-signature");
    if (!sig) {
      return json({ error: "Missing stripe-signature header" }, { status: 400 });
    }

    const rawBody = await request.text();

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(rawBody, sig, getStripeWebhookSecret());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Signature verification failed";
      console.error("Stripe webhook signature verification failed:", message);
      return json({ error: message }, { status: 400 });
    }

    // Log event to dead letter queue
    let webhookEventId = 0;
    try {
      webhookEventId = await webhookEventRepository.create({
        provider: "stripe",
        event_id: event.id,
        event_type: event.type,
        payload: event.data.object,
      });
    } catch (err) {
      console.error("Failed to log webhook event:", err);
    }

    // Idempotency: atomically claim the session for processing.
    // Uses atomicClaimProcessing which only succeeds if the stripe_payments
    // record is still in 'pending' status, preventing concurrent webhook
    // deliveries from double-processing the same session (TOCTOU fix).
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as { id: string };
      const claimed = await stripePaymentRepository.atomicClaimProcessing(session.id);
      if (!claimed) {
        console.log(`Stripe webhook: session ${session.id} already claimed or processed, skipping`);
        return json({ received: true, duplicate: true }, { status: 200 });
      }
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as { id: string; payment_intent: string | null };
        const sessionId = session.id;
        const paymentIntentId = session.payment_intent ?? "";

        console.log(`Stripe webhook: checkout.session.completed — session ${sessionId}`);

        // Use system/service account ID since webhooks have no authenticated user session
        const result = await handleStripeSuccess({
          sessionId,
          paymentIntentId,
          userId: SYSTEM_USER_ID,
        });

        if (result.success) {
          if (webhookEventId) await webhookEventRepository.markProcessed(event.id);
        } else {
          console.error("Failed to handle Stripe success:", result.error);
          if (webhookEventId) await webhookEventRepository.markFailed(event.id, result.error ?? "Unknown error");
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as { id: string };
        console.log(`Stripe webhook: checkout.session.expired — session ${session.id}`);

        // Reset the booking from "processing" back to "pending" so the user can retry
        // booking_id lives on the parent payments table, accessed via the payment relation
        try {
          const stripePayment = await stripePaymentRepository.findBySessionId(session.id);
          if (stripePayment?.payment?.booking_id) {
            await stripePaymentRepository.updateStatus(stripePayment.id, "expired");
            await bookingRepository.updatePayment(stripePayment.payment.booking_id, {
              payment_status: PaymentStatus.PENDING,
            });
            console.log(`Reset booking ${stripePayment.payment.booking_id} to pending after session expiry`);
          }
        } catch (lookupError) {
          console.error("Failed to reset booking on session expiry:", lookupError);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as { id: string; last_payment_error?: { message?: string } };
        console.error(
          `Stripe webhook: payment_intent.payment_failed — ${paymentIntent.id}`,
          paymentIntent.last_payment_error?.message ?? ""
        );

        try {
          const stripePayment = await stripePaymentRepository.findByPaymentIntentId(paymentIntent.id);
          if (stripePayment?.payment?.booking_id) {
            await stripePaymentRepository.updateStatus(stripePayment.id, StripePaymentStatus.FAILED);
            await bookingRepository.updatePayment(stripePayment.payment.booking_id, {
              payment_status: PaymentStatus.FAILED,
            });
            console.log(`Reset booking ${stripePayment.payment.booking_id} to failed status`);
          }
        } catch (lookupError) {
          console.error("Failed to update booking on payment failure:", lookupError);
        }
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as { id: string; charge: string; reason: string; amount: number; status: string };
        console.warn(`Stripe webhook: DISPUTE CREATED — ${dispute.id}, reason: ${dispute.reason}, amount: ${dispute.amount}`);

        try {
          const stripePayment = await stripePaymentRepository.findByPaymentIntentId(dispute.charge);
          if (stripePayment?.payment?.booking_id) {
            await sql`
              UPDATE payments SET status = 'disputed', notes = COALESCE(notes, '') || ${`\nDispute created: ${dispute.id} (${dispute.reason}) — £${(dispute.amount / 100).toFixed(2)}`} WHERE id = ${stripePayment.payment_id}
            `.execute(db);
            console.log(`Marked payment ${stripePayment.payment_id} as disputed`);
          }
        } catch (err) {
          console.error("Failed to process dispute creation:", err);
        }
        break;
      }

      case "charge.dispute.closed": {
        const dispute = event.data.object as { id: string; charge: string; status: string };
        console.log(`Stripe webhook: dispute closed — ${dispute.id}, outcome: ${dispute.status}`);

        try {
          const stripePayment = await stripePaymentRepository.findByPaymentIntentId(dispute.charge);
            if (stripePayment?.payment?.booking_id) {
            const newStatus = dispute.status === "won" ? StripePaymentStatus.SUCCEEDED : PaymentStatus.REFUNDED;
            await sql`
              UPDATE payments SET status = ${newStatus}, notes = COALESCE(notes, '') || ${`\nDispute ${dispute.id} ${dispute.status}`} WHERE id = ${stripePayment.payment_id}
            `.execute(db);
          }
        } catch (err) {
          console.error("Failed to process dispute closure:", err);
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as { id: string; amount_refunded: number; refunded: boolean };
        console.log(`Stripe webhook: charge refunded — ${charge.id}, amount: ${charge.amount_refunded}`);

        try {
          const stripePayment = await stripePaymentRepository.findByPaymentIntentId(charge.id);
          if (stripePayment?.payment?.booking_id) {
            await sql`
              UPDATE payments SET status = ${PaymentStatus.REFUNDED}, notes = COALESCE(notes, '') || ${`\nRefunded: £${(charge.amount_refunded / 100).toFixed(2)}`} WHERE id = ${stripePayment.payment_id}
            `.execute(db);
            if (stripePayment.payment.booking_id) {
              await bookingRepository.updatePayment(stripePayment.payment.booking_id, {
                payment_status: PaymentStatus.REFUNDED,
              });
            }
          }
        } catch (err) {
          console.error("Failed to process refund:", err);
        }
        break;
      }

      default:
        console.log(`Stripe webhook: unhandled event type — ${event.type}`);
    }

    return json({ received: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Stripe webhook error:", message);
    return json({ error: message }, { status: 500 });
  }
}
