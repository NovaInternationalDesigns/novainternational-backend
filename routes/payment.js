import express from "express";
import Stripe from "stripe";
import PurchaseOrder from "../models/PurchaseOrder.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

console.log(
  "Stripe key loaded:",
  process.env.STRIPE_SECRET_KEY
    ? process.env.STRIPE_SECRET_KEY.slice(0, 8)
    : "NOT FOUND"
);

/**
 * CREATE STRIPE CHECKOUT SESSION
 * POST /api/create-checkout-session
 */
router.post("/create-checkout-session", async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }

    const order = await PurchaseOrder.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Map order items into Stripe line items
    const line_items = order.items.map((it) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: it.description || "Product",
          metadata: {
            styleNo: it.styleNo || "",
          },
        },
        unit_amount: Math.round((it.price || 0) * 100), // in cents
      },
      quantity: it.qty || 1,
    }));

    // Determine frontend URL based on environment
    let frontendUrl;
    if (process.env.NODE_ENV === "production") {
      // Use production frontend URL, fallback to your Netlify URL
      frontendUrl = process.env.VITE_FRONTEND_URL_PRODUCTION || "https://calm-blini-7a30a5.netlify.app";
    } else {
      // Use dev frontend URL, fallback to localhost
      frontendUrl = process.env.VITE_FRONTEND_URL || "http://localhost:5173";
    }

    // Ensure URL starts with http or https
    if (!frontendUrl.startsWith("http://") && !frontendUrl.startsWith("https://")) {
      frontendUrl = `https://${frontendUrl}`;
    }

    console.log(`[Stripe] Using frontend URL: ${frontendUrl} (NODE_ENV: ${process.env.NODE_ENV})`);

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      success_url: `${frontendUrl}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/checkout`,
      metadata: {
        orderId: order._id.toString(),
      },
    });

    // Save Stripe session ID to order document
    order.stripeSessionId = session.id;
    await order.save();

    // Return session URL to frontend for redirect
    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe session error:", err);
    res.status(500).json({
      error: "Failed to create checkout session",
      details: err.message,
    });
  }
});

/**
 * GET ORDER BY STRIPE SESSION ID
 * GET /api/order/:sessionId
 */
router.get("/order/:sessionId", async (req, res) => {
  try {
    const order = await PurchaseOrder.findOne({
      stripeSessionId: req.params.sessionId,
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(order);
  } catch (err) {
    console.error("Fetch order error:", err);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

export default router;
