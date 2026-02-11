import express from "express";
import Stripe from "stripe";
import PurchaseOrder from "../models/PurchaseOrder.js";
import PurchaseOrderDraft from "../models/PurchaseOrderDraft.js";
import mongoose from "mongoose";
import { sendPaymentConfirmationEmail } from "../utils/mailer.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Use raw body for Stripe signature verification
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.log("Webhook signature verification failed.", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const orderId = session.metadata.orderId;

      console.log("📦 Webhook received - Checkout completed");
      console.log("   Order ID:", orderId);

      try {
        const order = await PurchaseOrder.findById(orderId);
        if (order) {
<<<<<<< HEAD
          console.log("✓ Order found");
          console.log("  Email on record:", order.email);
          console.log("  Customer:", order.customerName);

          // 1️ Mark order as paid
          order.paymentStatus = "paid";
          await order.save();
          console.log(`✓ Payment marked as paid for order ${orderId}`);

          // 2️ Send payment confirmation email
          if (order.email) {
            console.log("📧 Sending payment confirmation email to:", order.email);
            await sendPaymentConfirmationEmail(order.email, {
              purchaseOrderId: order.purchaseOrderId,
              customerName: order.customerName,
              totalAmount: order.totalAmount,
            }).catch((err) => {
              console.error("✗ Error sending payment email:", err.message);
            });
          } else {
            console.warn("⚠ No email on record - skipping payment confirmation");
          }

          // 3️ Clear purchase order draft for this user or guest
          if (order.ownerType === "User" && order.ownerId) {
            await PurchaseOrderDraft.deleteOne({ ownerType: "User", ownerId: order.ownerId });
            console.log(
              `✓ Cleared draft purchase order for user ${order.ownerId}`
=======
          // 1️ Mark order as paid
          order.paymentStatus = "paid";
          await order.save();
          console.log(`Payment confirmed for order ${orderId}`);

          // 2️ Clear purchase order draft for this user or guest
          if (order.ownerType === "User" && order.ownerId) {
            await PurchaseOrderDraft.deleteOne({ ownerType: "User", ownerId: order.ownerId });
            console.log(
              `Cleared draft purchase order for user ${order.ownerId}`
>>>>>>> 13080ad0b09c99c5d8ce31f07b1bef7040e0b411
            );
          } else if (order.ownerType === "Guest" && order.ownerId) {
            await PurchaseOrderDraft.deleteOne({ ownerType: "Guest", ownerId: order.ownerId });
            console.log(
<<<<<<< HEAD
              `✓ Cleared draft purchase order for guest ${order.ownerId}`
=======
              `Cleared draft purchase order for guest ${order.ownerId}`
>>>>>>> 13080ad0b09c99c5d8ce31f07b1bef7040e0b411
            );
          }
        } else {
          console.error("✗ Order not found:", orderId);
        }
      } catch (err) {
<<<<<<< HEAD
        console.error("✗ Error processing webhook:", err.message);
=======
        console.error("Error processing webhook:", err);
>>>>>>> 13080ad0b09c99c5d8ce31f07b1bef7040e0b411
      }
    }

    res.json({ received: true });
  }
);

export default router;
