import { NextResponse } from "next/server";
import Stripe from "stripe";
import { handleStripeEvent } from "@/lib/billing/stripe";

/*
 * Stripe's webhook. Public by necessity (outside proxy.ts's gate); every
 * request must carry a valid Stripe-Signature for STRIPE_WEBHOOK_SECRET, so
 * nobody else can mark an invoice paid. The raw body is needed for that
 * check, so it is read as text, never parsed first.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return new Response("Not found", { status: 404 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const outcome = await handleStripeEvent(event);
  return NextResponse.json({ received: true, outcome });
}
