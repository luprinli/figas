import Stripe from "stripe";

let _stripe: Stripe | null = null;
let _webhookSecret: string | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY environment variable is required for Stripe operations");
    }
    _stripe = new Stripe(key, {
      apiVersion: (process.env.STRIPE_API_VERSION as any) || "2026-04-22.dahlia",
    });
  }
  return _stripe;
}

function getStripeWebhookSecret(): string {
  if (!_webhookSecret) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error("STRIPE_WEBHOOK_SECRET environment variable is required for webhook verification");
    }
    _webhookSecret = secret;
  }
  return _webhookSecret;
}

// Singleton pattern for dev HMR
declare global {
  // eslint-disable-next-line no-var
  var __stripe: Stripe | undefined;
  // eslint-disable-next-line no-var
  var __stripeWebhookSecret: string | undefined;
}

if (process.env.NODE_ENV === "development") {
  if (global.__stripe) {
    _stripe = global.__stripe;
  }
  if (global.__stripeWebhookSecret) {
    _webhookSecret = global.__stripeWebhookSecret;
  }
}

export { getStripe, getStripeWebhookSecret };
export type { Stripe };
