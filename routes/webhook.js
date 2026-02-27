import express from "express";
import Stripe from "stripe";
import mongoose from "mongoose";
import PurchaseOrder from "../models/PurchaseOrder.js";
import PurchaseOrderDraft from "../models/PurchaseOrderDraft.js";
import {
  sendPaymentConfirmationEmail,
  sendPurchaseOrderConfirmation,
  sendAdminOrderNotification,
} from "../utils/mailer.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const clearDraftForOwner = async (ownerType, ownerId) => {
  if (!ownerType || !ownerId || !mongoose.Types.ObjectId.isValid(ownerId))
    return;

  await PurchaseOrderDraft.deleteOne({
    ownerType,
    ownerId: new mongoose.Types.ObjectId(ownerId),
  });
};

router.post(
  ["/", "/webhook"],
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;

    try {
      const sig = req.headers["stripe-signature"];

      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type !== "checkout.session.completed") {
      return res.json({ received: true });
    }

    const session = event.data.object;
    const md = session.metadata || {};

    try {
      // Prevent duplicate processing
      const existingBySession = await PurchaseOrder.findOne({
        stripeSessionId: session.id,
      });

      if (existingBySession) {
        console.log('[Webhook] Order already exists for session:', session.id);
        return res.json({ received: true });
      }

      // If order already exists by ID
      const orderId = md.orderId;
      if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
        const existingOrder = await PurchaseOrder.findById(orderId);
        if (existingOrder) {
          existingOrder.paymentStatus = "paid";
          existingOrder.stripeSessionId = session.id;
          await existingOrder.save();

          console.log('[Webhook] Existing order found and updated:', orderId);
          await sendEmails(existingOrder);
          await clearDraftForOwner(
            existingOrder.ownerType,
            existingOrder.ownerId?.toString()
          );

          return res.json({ received: true });
        }
      }

      // Finalize Draft If Exists
      let draft = null;
      if (
        md.purchaseOrderId &&
        md.ownerType &&
        md.ownerId &&
        mongoose.Types.ObjectId.isValid(md.ownerId)
      ) {
        draft = await PurchaseOrderDraft.findOne({
          purchaseOrderId: md.purchaseOrderId,
          ownerType: md.ownerType,
          ownerId: md.ownerId,
        });
        console.log('[Webhook] Draft lookup:', {
          purchaseOrderId: md.purchaseOrderId,
          ownerType: md.ownerType,
          ownerId: md.ownerId,
          found: !!draft
        });
      }

      if (draft) {
        const po = new PurchaseOrder({
          ...draft.toObject(),
          stripeSessionId: session.id,
          paymentStatus: "paid",
        });

        await po.save();
        await draft.deleteOne();

        console.log('[Webhook] Draft finalized to order:', po._id);
        await sendEmails(po);
        return res.json({ received: true });
      }

      // Fallback: Build From Stripe
      const lineItemsRes = await stripe.checkout.sessions.listLineItems(
        session.id,
        { limit: 100 }
      );

      const items = lineItemsRes.data.map((li) => ({
        description: li.description || "Product",
        qty: li.quantity || 1,
        price: (li.amount_subtotal || 0) / 100,
        total:
          ((li.amount_subtotal || 0) / 100) * (li.quantity || 1),
      }));

      const subtotal = items.reduce(
        (sum, item) => sum + item.total,
        0
      );

      const po = new PurchaseOrder({
        purchaseOrderId: `PO-${Date.now()}`,
        ownerType: md.ownerType || "Guest",
        ownerId:
          md.ownerId && mongoose.Types.ObjectId.isValid(md.ownerId)
            ? new mongoose.Types.ObjectId(md.ownerId)
            : new mongoose.Types.ObjectId(),
        email:
          session.customer_email ||
          session.customer_details?.email ||
          "",
        customerName:
          session.customer_details?.name || "",
        items,
        subtotal,
        shippingCost: Number(md.shippingCost || 0),
        estimatedTax: Number(md.estimatedTax || 0),
        totalAmount:
          Number(md.totalAmount) ||
          subtotal +
            Number(md.shippingCost || 0) +
            Number(md.estimatedTax || 0),
        shippingInfo: {
          name: session.customer_details?.name || "",
          address: session.customer_details?.address?.line1 || "",
          city: session.customer_details?.address?.city || "",
          postalCode:
            session.customer_details?.address?.postal_code || "",
          country:
            session.customer_details?.address?.country || "",
        },
        stripeSessionId: session.id,
        paymentStatus: "paid",
      });

      await po.save();
      console.log('[Webhook] Fallback order created:', po._id);
      await sendEmails(po);

      return res.json({ received: true });
    } catch (err) {
      console.error("Webhook processing error:", err.message);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);


// Email Helper

async function sendEmails(order) {
  if (!order.email) return;

  await sendPaymentConfirmationEmail(order.email, {
    purchaseOrderId: order.purchaseOrderId,
    customerName: order.customerName,
    totalAmount: order.totalAmount,
  }).catch((err) =>
    console.error("Payment email error:", err.message)
  );

  await sendPurchaseOrderConfirmation(order.email, order).catch(
    (err) => console.error("Order email error:", err.message)
  );

  await sendAdminOrderNotification(order).catch((err) =>
    console.error("Admin email error:", err.message)
  );
}

export default router;