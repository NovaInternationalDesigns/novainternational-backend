import express from "express";
import Stripe from "stripe";
import mongoose from "mongoose";
import PurchaseOrder from "../models/PurchaseOrder.js";
import PurchaseOrderDraft from "../models/PurchaseOrderDraft.js";
import { sendOrderEmailsIfNeeded } from "../utils/orderEmails.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ----------------------
// Config
// ----------------------
const MAX_RETRIES = 3;
const RETRY_DELAY = 1500;

// ----------------------
// Logger
// ----------------------
const log = (stage, data = {}) => {
  console.log(`[StripeWebhook:${stage}]`, {
    at: new Date().toISOString(),
    ...data,
  });
};

// ----------------------
// Helpers
// ----------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const buildFallbackPurchaseOrderId = (sessionId) => {
  const tail = String(sessionId || "").slice(-8) || "session";
  return `PO-${Date.now()}-${tail}`;
};

// ----------------------
// Safe Order Fetch (with retry)
// ----------------------
const findOrderWithRetry = async (sessionId) => {
  for (let i = 0; i < MAX_RETRIES; i++) {
    const order = await PurchaseOrder.findOne({
      stripeSessionId: sessionId,
    });

    if (order) return order;

    await sleep(RETRY_DELAY * (i + 1));
  }

  return null;
};

// ----------------------
// Webhook Route
// ----------------------
router.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;

    // ----------------------
    // Verify Stripe Signature
    // ----------------------
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      log("event_received", {
        type: event.type,
        id: event.id,
      });
    } catch (err) {
      console.error("[Webhook] Signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      // =========================================================
      // 1. CHECKOUT SESSION COMPLETED (MAIN FLOW)
      // =========================================================
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        let order = await findOrderWithRetry(session.id);

        // If order doesn't exist yet, create fallback minimal record
        if (!order) {
          log("order_not_found_creating", { sessionId: session.id });

          const metadata = session.metadata || {};

          order = await PurchaseOrder.create({
            purchaseOrderId:
              metadata.purchaseOrderId ||
              buildFallbackPurchaseOrderId(session.id),

            ownerType: metadata.ownerType || "User",
            ownerId: metadata.ownerId || null,

            stripeSessionId: session.id,

            email:
              session.customer_email ||
              session.customer_details?.email ||
              "",

            items: [],
            subtotal: 0,
            shippingCost: 0,
            estimatedTax: 0,
            totalAmount: Number(session.amount_total || 0) / 100,

            paymentStatus: "paid",
          });
        } else {
          // update payment status safely
          order.paymentStatus = "paid";
          await order.save();
        }

        log("order_paid", {
          sessionId: session.id,
          orderId: order.purchaseOrderId,
        });

        // ----------------------
        // Send Emails (IDEMPOTENT)
        // ----------------------
        await sendOrderEmailsIfNeeded(order, "Webhook");
      }

      // =========================================================
      // 2. PAYMENT INTENT SUCCESS (fallback path)
      // =========================================================
      if (event.type === "payment_intent.succeeded") {
        const paymentIntent = event.data.object;

        const sessionId = paymentIntent.metadata?.sessionId;

        if (!sessionId) {
          log("missing_sessionId_in_payment_intent");
          return res.json({ received: true });
        }

        let order = await findOrderWithRetry(sessionId);

        if (!order) {
          log("payment_intent_no_order_found", { sessionId });
          return res.json({ received: true });
        }

        if (order.paymentStatus !== "paid") {
          order.paymentStatus = "paid";
          await order.save();
        }

        await sendOrderEmailsIfNeeded(order, "Webhook");
      }

      // =========================================================
      // SUCCESS RESPONSE
      // =========================================================
      return res.json({ received: true });
    } catch (err) {
      console.error("[Webhook] Processing error:", err);

      return res.status(500).json({
        received: false,
        error: err.message,
      });
    }
  }
);

export default router;