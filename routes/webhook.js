import express from "express";
import Stripe from "stripe";
import PurchaseOrder from "../models/PurchaseOrder.js";
import PurchaseOrderDraft from "../models/PurchaseOrderDraft.js";
import mongoose from "mongoose";

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

      try {
        const order = await PurchaseOrder.findById(orderId);
        if (order) {
          // 1️ Mark order as paid
          order.paymentStatus = "paid";
          await order.save();
          console.log(`Payment confirmed for order ${orderId}`);

          // 2️ Clear purchase order draft for this user or guest
          if (order.ownerType === "User" && order.ownerId) {
            await PurchaseOrderDraft.deleteOne({ ownerType: "User", ownerId: order.ownerId });
            console.log(
              `Cleared draft purchase order for user ${order.ownerId}`
            );
          } else if (order.ownerType === "Guest" && order.ownerId) {
            await PurchaseOrderDraft.deleteOne({ ownerType: "Guest", ownerId: order.ownerId });
            console.log(
              `Cleared draft purchase order for guest ${order.ownerId}`
            );
          }
        }
      } catch (err) {
        console.error("Error processing webhook:", err);
      }
    }

    res.json({ received: true });
  }
);

export default router;
