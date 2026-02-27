import express from "express";
import Stripe from "stripe";
import PurchaseOrder from "../models/PurchaseOrder.js";
import User from "../models/User.js";
import Guest from "../models/Guest.js";
import crypto from "crypto";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

console.log(
  "Stripe key loaded:",
  process.env.STRIPE_SECRET_KEY
    ? process.env.STRIPE_SECRET_KEY.slice(0, 8) + "..."
    : "NOT FOUND"
);

/** CREATE STRIPE CHECKOUT SESSION */
router.post("/create-checkout-session", async (req, res) => {
  try {
    const { orderId: orderIdRaw, purchaseOrderId, items, shippingInfo, subtotal, shippingCost, estimatedTax, totalAmount, form, ownerType, ownerId } = req.body;
    // `orderId` means an existing DB order; `purchaseOrderId` is a business reference for new flow.
    const orderId = orderIdRaw || null;
    const effectivePurchaseOrderId = purchaseOrderId || crypto.randomBytes(16).toString("hex");

    let line_items = [];
    let dbCustomerEmail;

    if (orderId) {
      // orderId may be either a Mongo ObjectId or a custom purchaseOrderId string.
      let order = null;
      if (/^[a-fA-F0-9]{24}$/.test(orderId)) {
        order = await PurchaseOrder.findById(orderId);
      } else {
        order = await PurchaseOrder.findOne({ purchaseOrderId: orderId });
      }

      if (!order) return res.status(404).json({ error: "Order not found" });
      if (!order.items || !order.items.length) return res.status(400).json({ error: "Order has no items" });

      // Resolve email from saved order first, fallback to owner record.
      dbCustomerEmail = order.email || undefined;
      if (!dbCustomerEmail && order.ownerType && order.ownerId) {
        if (order.ownerType === "User") {
          const userDoc = await User.findById(order.ownerId).select("email").lean();
          dbCustomerEmail = userDoc?.email || undefined;
        } else if (order.ownerType === "Guest") {
          const guestDoc = await Guest.findById(order.ownerId).select("email").lean();
          dbCustomerEmail = guestDoc?.email || undefined;
        }
      }

      line_items = order.items.map((it) => ({
        price_data: {
          currency: "usd",
          product_data: {
            name: it.description || "Product",
            metadata: { styleNo: it.styleNo || "" },
          },
          unit_amount: Math.round((it.price || 0) * 100), // in cents
        },
        quantity: it.qty || 1,
      }));

      const itemsSubtotal = order.items.reduce(
        (sum, it) => sum + (Number(it.qty) || 0) * (Number(it.price) || 0),
        0
      );

      const shippingAmount = Number(shippingCost ?? order.shippingCost ?? 0);
      const taxAmount = Number(estimatedTax ?? order.estimatedTax ?? 0);

      // Fallback: if shipping/tax were not provided, derive remaining amount from order total.
      const remaining = Number(order.totalAmount || 0) - itemsSubtotal;
      const inferredExtra = remaining > 0 ? remaining : 0;

      const finalShipping = shippingAmount > 0 ? shippingAmount : 0;
      const finalTax = taxAmount > 0 ? taxAmount : finalShipping === 0 ? inferredExtra : 0;

      if (finalShipping > 0) {
        line_items.push({
          price_data: {
            currency: "usd",
            product_data: { name: "Shipping" },
            unit_amount: Math.round(finalShipping * 100),
          },
          quantity: 1,
        });
      }

      if (finalTax > 0) {
        line_items.push({
          price_data: {
            currency: "usd",
            product_data: { name: "Estimated Tax" },
            unit_amount: Math.round(finalTax * 100),
          },
          quantity: 1,
        });
      }
    } else {
      // Build line_items from provided payload (no DB save yet)
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items are required to create session" });
      }

      line_items = items.map((it) => ({
        price_data: {
          currency: "usd",
          product_data: {
            name: it.name || it.description || "Product",
            metadata: { productId: it.productId || "" },
          },
          unit_amount: Math.round((it.price || 0) * 100),
        },
        quantity: Math.max(1, Number(it.quantity || it.qty || 1)),
      }));

      // Add shipping and tax as separate line items so they appear on Stripe checkout
      if (shippingCost && Number(shippingCost) > 0) {
        line_items.push({
          price_data: {
            currency: "usd",
            product_data: { name: "Shipping" },
            unit_amount: Math.round(Number(shippingCost) * 100),
          },
          quantity: 1,
        });
      }
      if (estimatedTax && Number(estimatedTax) > 0) {
        line_items.push({
          price_data: {
            currency: "usd",
            product_data: { name: "Estimated Tax" },
            unit_amount: Math.round(Number(estimatedTax) * 100),
          },
          quantity: 1,
        });
      }
    }

    // Fallback: if no email from order flow, resolve from owner passed in request.
    if (!dbCustomerEmail && ownerType && ownerId) {
      if (ownerType === "User") {
        const userDoc = await User.findById(ownerId).select("email").lean();
        dbCustomerEmail = userDoc?.email || undefined;
      } else if (ownerType === "Guest") {
        const guestDoc = await Guest.findById(ownerId).select("email").lean();
        dbCustomerEmail = guestDoc?.email || undefined;
      }
    }

    // Validate line_items
    if (!line_items.every(li => li.price_data.unit_amount > 0 && li.quantity > 0)) {
      return res.status(400).json({ error: "Invalid item price or quantity" });
    }

    // Determine frontend URL
    let frontendUrl = process.env.VITE_FRONTEND_URL || "http://localhost:5173";
    if (!frontendUrl.startsWith("http")) frontendUrl = `http://${frontendUrl}`;

    console.log(`[Stripe] Creating session for existingOrderId ${orderId || "none"}, purchaseOrderId ${effectivePurchaseOrderId}`);
    // Attach minimal metadata so webhook can reconstruct order
    const metadata = {};
    if (orderId) metadata.orderId = orderId;
    metadata.purchaseOrderId = effectivePurchaseOrderId;
    if (ownerType) metadata.ownerType = ownerType;
    if (ownerId) metadata.ownerId = ownerId;
    if (subtotal) metadata.subtotal = String(subtotal);
    if (shippingCost) metadata.shippingCost = String(shippingCost);
    if (estimatedTax) metadata.estimatedTax = String(estimatedTax);
    if (totalAmount) metadata.totalAmount = String(totalAmount);
    if (shippingInfo?.firstName || shippingInfo?.lastName) {
      metadata.shipping_name = `${shippingInfo.firstName || ""} ${shippingInfo.lastName || ""}`.trim();
    }
    if (shippingInfo?.address) metadata.shipping_address = String(shippingInfo.address);
    if (shippingInfo?.city) metadata.shipping_city = String(shippingInfo.city);
    if (shippingInfo?.zip) metadata.shipping_postal_code = String(shippingInfo.zip);
    if (shippingInfo?.country) metadata.shipping_country = String(shippingInfo.country);

    // Resolve email from request/database for records.
    const customerEmail =
      (form && form.email) ||
      (shippingInfo && shippingInfo.email) ||
      dbCustomerEmail ||
      undefined;

    if (customerEmail) {
      metadata.prefilledEmail = String(customerEmail);
      metadata.customer_email = String(customerEmail);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      success_url: `${frontendUrl}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/checkout`,
      metadata,
      customer_email: customerEmail,
    });

    res.json({ url: session.url, purchaseOrderId: effectivePurchaseOrderId });
  } catch (err) {
    console.error("Stripe session error:", err);
    res.status(500).json({ error: "Failed to create checkout session", details: err.message });
  }
});

/** GET ORDER BY STRIPE SESSION ID */
router.get("/order/:sessionId", async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const order = await PurchaseOrder.findOne({ stripeSessionId: sessionId });
    if (order) return res.json(order);

    // If order not yet saved (webhook may be delayed), try to reconstruct from Stripe
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
      if (!session) return res.status(404).json({ error: "Order not found" });

      const lineItemsRes = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
      const lineItems = lineItemsRes.data || [];

      const items = lineItems
        .filter(li => li.description !== "Shipping" && li.description !== "Estimated Tax")
        .map((li) => ({
          description: li.description || li.price?.product?.name || "Product",
          qty: li.quantity || 1,
          price: (li.price?.unit_amount || li.amount_subtotal || 0) / 100,
          total: ((li.price?.unit_amount || li.amount_subtotal || 0) / 100) * (li.quantity || 1),
        }));

      const md = session.metadata || {};
      const shippingInfo = {
        name: session.customer_details?.name || md.shipping_name || "",
        address: session.customer_details?.address?.line1 || md.shipping_address || "",
        city: session.customer_details?.address?.city || md.shipping_city || "",
        postalCode: session.customer_details?.address?.postal_code || md.shipping_postal_code || "",
        country: session.customer_details?.address?.country || md.shipping_country || "",
      };

      const itemsTotal = items.reduce((s, it) => s + (it.total || 0), 0);
      const shippingFromLines = lineItems
        .filter(li => li.description === "Shipping")
        .reduce((sum, li) => sum + ((li.amount_total || 0) / 100), 0);

      const taxFromLines = lineItems
        .filter(li => li.description === "Estimated Tax")
        .reduce((sum, li) => sum + ((li.amount_total || 0) / 100), 0);

      const shippingCost = md.shippingCost ? Number(md.shippingCost) : shippingFromLines;
      const estimatedTax = md.estimatedTax ? Number(md.estimatedTax) : taxFromLines;
      const totalAmount = md.totalAmount ? Number(md.totalAmount) : itemsTotal + shippingCost + estimatedTax;

      return res.json({
        _id: null,
        purchaseOrderId: md.purchaseOrderId || null,
        items,
        shippingInfo,
        shippingCost,
        estimatedTax,
        totalAmount,
        paymentStatus: session.payment_status || "unpaid",
        form: md.form || {},
      });
    } catch (stripeErr) {
      console.error("Failed to reconstruct order from Stripe:", stripeErr.message);
      return res.status(404).json({ error: "Order not found" });
    }
  } catch (err) {
    console.error("Fetch order error:", err);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

export default router;