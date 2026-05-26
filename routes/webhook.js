import express from "express";
import Stripe from "stripe";
import mongoose from "mongoose";
import PurchaseOrder from "../models/PurchaseOrder.js";
import PurchaseOrderDraft from "../models/PurchaseOrderDraft.js";
import { sendOrderEmailsIfNeeded } from "../utils/orderEmails.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ----------------------
// CONFIG
// ----------------------
const MAX_RETRIES = 3;
const RETRY_DELAY = 1500;

// ----------------------
// LOGGING
// ----------------------
const log = (stage, data = {}) => {
  console.log(`[StripeWebhook:${stage}]`, {
    at: new Date().toISOString(),
    ...data,
  });
};

// ----------------------
// HELPERS
// ----------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const buildFallbackPurchaseOrderId = (sessionId) => {
  const tail = String(sessionId || "").slice(-8) || "session";
  return `PO-${Date.now()}-${tail}`;
};

// ----------------------
// SAFE ORDER FETCH (RETRY)
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
// WEBHOOK ROUTE
// ----------------------
router.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;

    // ----------------------
    // VERIFY STRIPE SIGNATURE
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
      console.error("[Webhook] Signature error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      // =========================================================
      // 1. CHECKOUT SESSION COMPLETED
      // =========================================================
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        log("checkout_session_received", {
          sessionId: session.id,
          email: session.customer_email,
        });

        let order = await findOrderWithRetry(session.id);

        // ----------------------
        // CREATE ORDER IF MISSING
        // ----------------------
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
          order.paymentStatus = "paid";
          await order.save();
        }

        log("order_marked_paid", {
          sessionId: session.id,
          orderId: order.purchaseOrderId,
          email: order.email,
        });

        // ----------------------
        // EMAIL TRIGGER (SAFE)
        // ----------------------
        try {
          if (!order.email) {
            log("missing_email_skip_send", {
              orderId: order.purchaseOrderId,
            });
          } else {
            await sendOrderEmailsIfNeeded(order, "Webhook");

            log("email_triggered", {
              orderId: order.purchaseOrderId,
              email: order.email,
            });
          }
        } catch (emailErr) {
          console.error("[Webhook] Email failed:", emailErr);
        }
      }

      // =========================================================
      // 2. PAYMENT INTENT SUCCEEDED (FALLBACK)
      // =========================================================
      if (event.type === "payment_intent.succeeded") {
        const paymentIntent = event.data.object;

        const sessionId = paymentIntent.metadata?.sessionId;

        if (!sessionId) {
          log("missing_session_id_payment_intent");
          return res.json({ received: true });
        }

        let order = await findOrderWithRetry(sessionId);

        if (!order) {
          log("payment_intent_order_not_found", { sessionId });
          return res.json({ received: true });
        }

        if (order.paymentStatus !== "paid") {
          order.paymentStatus = "paid";
          await order.save();
        }

        try {
          await sendOrderEmailsIfNeeded(order, "Webhook");

          log("email_sent_payment_intent", {
            orderId: order.purchaseOrderId,
          });
        } catch (err) {
          console.error("[Webhook] Email failed (payment_intent):", err);
        }
      }

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