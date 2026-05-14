import express from "express";
import Stripe from "stripe";
import crypto from "crypto";
import mongoose from "mongoose";
import PurchaseOrder from "../models/PurchaseOrder.js";
import PurchaseOrderDraft from "../models/PurchaseOrderDraft.js";
import User from "../models/User.js";
import Guest from "../models/Guest.js";
import {
  sendPurchaseOrderConfirmation,
  sendAdminOrderNotification,
} from "../utils/sendEmail.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const PROCESSING_FEE_RATE = 0.05;

console.log(
  "Stripe key loaded:",
  process.env.STRIPE_SECRET_KEY
    ? process.env.STRIPE_SECRET_KEY.slice(0, 8) + "..."
    : "NOT FOUND"
);

/* ---------------------------
   RETRY UTILITY
----------------------------*/
const retryStripe = async (fn, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.statusCode === 429 && i < retries - 1) {
        await new Promise((r) => setTimeout(r, delay * 2 ** i));
      } else {
        throw err;
      }
    }
  }
};

/* ---------------------------
   HELPERS
----------------------------*/
async function resolveCustomerEmail(order, ownerType, ownerId) {
  if (order?.email) return order.email;

  if (order?.ownerType && order?.ownerId) {
    if (order.ownerType === "User") {
      const user = await User.findById(order.ownerId).select("email").lean();
      if (user?.email) return user.email;
    } else {
      const guest = await Guest.findById(order.ownerId).select("email").lean();
      if (guest?.email) return guest.email;
    }
  }

  if (ownerType && ownerId) {
    if (ownerType === "User") {
      const user = await User.findById(ownerId).select("email").lean();
      if (user?.email) return user.email;
    } else {
      const guest = await Guest.findById(ownerId).select("email").lean();
      if (guest?.email) return guest.email;
    }
  }

  return undefined;
}

const toObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : id;

const buildFallbackPurchaseOrderId = (sessionId) => {
  const tail =
    String(sessionId || "").slice(-8) ||
    crypto.randomBytes(4).toString("hex");
  return `PO-${Date.now()}-${tail}`;
};

/* ---------------------------
   STRIPE LINE ITEM PARSER
----------------------------*/
const splitStripeLineItems = (lineItems = []) => {
  const items = [];
  let shippingCost = 0;
  let estimatedTax = 0;
  let processingFee = 0;

  for (const li of lineItems) {
    const label = String(li.description || "").trim();
    const amount =
      Number(li.amount_total || li.amount_subtotal || 0) / 100;
    const qty = Math.max(1, Number(li.quantity || 1));

    if (label === "Shipping") {
      shippingCost += amount;
      continue;
    }

    if (label === "Estimated Tax") {
      estimatedTax += amount;
      continue;
    }

    if (label === "Processing Fee") {
      processingFee += amount;
      continue;
    }

    items.push({
      styleNo: li.metadata?.styleNo || "",
      description: label || "Product",
      qty,
      price: qty > 0 ? amount / qty : 0,
      total: amount,
    });
  }

  const subtotal = items.reduce((sum, i) => sum + i.total, 0);

  return { items, subtotal, shippingCost, estimatedTax, processingFee };
};

/* ---------------------------
   OWNER RESOLUTION
----------------------------*/
async function resolveOwnerFromMetadata(metadata = {}) {
  let ownerType = metadata.ownerType || null;
  let ownerId = metadata.ownerId || null;

  if ((!ownerType || !ownerId) && metadata.purchaseOrderId) {
    const draft = await PurchaseOrderDraft.findOne({
      purchaseOrderId: metadata.purchaseOrderId,
    }).lean();

    if (draft) {
      ownerType = ownerType || draft.ownerType;
      ownerId = ownerId || String(draft.ownerId);
    }
  }

  return { ownerType, ownerId };
}

/* ---------------------------
   CREATE ORDER FROM SESSION
----------------------------*/
async function createOrderFromStripeSession(sessionId) {
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (!session) return null;

  const existing = await PurchaseOrder.findOne({
    stripeSessionId: session.id,
  });

  if (existing) return existing;

  const metadata = session.metadata || {};
  const { ownerType, ownerId } =
    await resolveOwnerFromMetadata(metadata);

  if (!ownerType || !ownerId) return null;

  // FIX: safe parsing
  let items = [];
  try {
    items = metadata.items ? JSON.parse(metadata.items) : [];
  } catch {
    items = [];
  }

  if (!items.length) return null;

  const subtotal = items.reduce(
    (sum, it) =>
      sum + Number(it.qty || 1) * Number(it.price || 0),
    0
  );

  const shippingCost = 0;
  const estimatedTax = 0;
  const processingFee = subtotal * PROCESSING_FEE_RATE;

  const purchaseOrderId =
    metadata.purchaseOrderId ||
    buildFallbackPurchaseOrderId(session.id);

  const customerEmail =
    session.customer_email ||
    session.customer_details?.email ||
    "";

  const order = await PurchaseOrder.create({
    purchaseOrderId,
    ownerType,
    ownerId: toObjectId(ownerId),
    stripeSessionId: session.id,
    email: customerEmail,
    items,
    subtotal,
    shippingCost,
    estimatedTax,
    Processing_Fee: processingFee,
    totalAmount: Number(session.amount_total || 0) / 100,
    paymentStatus:
      session.payment_status === "paid" ? "paid" : "pending",
    shippingInfo: {
      name:
        session.customer_details?.name || metadata.shipping_name || "",
      address:
        session.customer_details?.address?.line1 || "",
      city:
        session.customer_details?.address?.city || "",
      postalCode:
        session.customer_details?.address?.postal_code || "",
      country:
        session.customer_details?.address?.country || "",
    },
  });

  if (order.paymentStatus === "paid") {
    await PurchaseOrderDraft.deleteOne({
      ownerId: order.ownerId,
      ownerType: order.ownerType,
    });

    (async () => {
      try {
        if (customerEmail)
          await sendPurchaseOrderConfirmation(customerEmail, order);

        await sendAdminOrderNotification(order);
      } catch (e) {
        console.error("Email error:", e?.message || e);
      }
    })();
  }

  return order;
}

/* ---------------------------
   CREATE CHECKOUT SESSION
----------------------------*/
router.post("/create-checkout-session", async (req, res) => {
  try {
    const {
      orderId: orderIdRaw,
      purchaseOrderId,
      items,
      shippingInfo,
      estimatedTax,
      ownerType,
      ownerId,
      guestSessionId,
      form,
    } = req.body;

    let dbCustomerEmail = null;

    if (orderIdRaw) {
      const orderFromDb = /^[a-fA-F0-9]{24}$/.test(orderIdRaw)
        ? await PurchaseOrder.findById(orderIdRaw)
        : await PurchaseOrder.findOne({
            purchaseOrderId: orderIdRaw,
          });

      dbCustomerEmail = orderFromDb
        ? await resolveCustomerEmail(
            orderFromDb,
            ownerType,
            ownerId
          )
        : null;
    }

    const customerEmail =
      form?.email?.trim() ||
      shippingInfo?.email?.trim() ||
      dbCustomerEmail?.trim();

    if (!customerEmail)
      return res.status(400).json({
        error: "Customer email is required",
      });

    if (!items?.length)
      return res.status(400).json({
        error: "Items required",
      });

    const line_items = items.map((it) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: it.name || it.description || "Product",
        },
        unit_amount: Math.round((it.price || 0) * 100),
      },
      quantity: Math.max(1, it.qty || 1),
    }));

    const subtotal = items.reduce(
      (s, it) =>
        s +
        Number(it.qty || 1) * Number(it.price || 0),
      0
    );

    const processingFee =
      subtotal * PROCESSING_FEE_RATE;

    if (estimatedTax) {
      line_items.push({
        price_data: {
          currency: "usd",
          product_data: { name: "Estimated Tax" },
          unit_amount: Math.round(estimatedTax * 100),
        },
        quantity: 1,
      });
    }

    if (processingFee) {
      line_items.push({
        price_data: {
          currency: "usd",
          product_data: { name: "Processing Fee" },
          unit_amount: Math.round(processingFee * 100),
        },
        quantity: 1,
      });
    }

    const customers = await stripe.customers.list({
      email: customerEmail,
      limit: 1,
    });

    const customerId =
      customers.data[0]?.id ||
      (
        await stripe.customers.create({
          email: customerEmail,
          name:
            shippingInfo?.firstName || "Guest User",
        })
      ).id;

    const frontendUrl =
      req.headers.origin ||
      process.env.VITE_FRONTEND_URL ||
      "http://localhost:5173";

    const metadata = {
      purchaseOrderId:
        purchaseOrderId ||
        crypto.randomBytes(16).toString("hex"),
      orderId: orderIdRaw,
      ownerType,
      ownerId,
      guestSessionId,
      items: JSON.stringify(items),
    };

    const session = await retryStripe(() =>
      stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items,
        customer: customerId,
        billing_address_collection: "required",
        shipping_address_collection: {
          allowed_countries: [
            "US",
            "CA",
            "GB",
            "AU",
            "IN",
          ],
        },
        metadata,
        success_url: `${frontendUrl}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/checkout`,
      })
    );

    res.json({
      url: session.url,
      purchaseOrderId: metadata.purchaseOrderId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Checkout failed",
      details: err.message,
    });
  }
});

/* ---------------------------
   GET ORDER
----------------------------*/
router.get("/order/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;

    const existing = await PurchaseOrder.findOne({
      stripeSessionId: sessionId,
    });

    if (existing) {
      return res.json(existing);
    }

    const order =
      await createOrderFromStripeSession(sessionId);

    return res.json(order);
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;