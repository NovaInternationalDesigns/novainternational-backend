import express from "express";
import Stripe from "stripe";
import PurchaseOrder from "../models/PurchaseOrder.js";
import PurchaseOrderDraft from "../models/PurchaseOrderDraft.js";
import nodemailer from "nodemailer";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const logWebhook = (stage, data = {}) => {
    console.log(`[Webhook][${stage}]`, {
        at: new Date().toISOString(),
        ...data,
    });
};

const buildFallbackPurchaseOrderId = (sessionId) => {
    const safeSessionTail = String(sessionId || "").slice(-8) || "session";
    return `PO-${Date.now()}-${safeSessionTail}`;
};

/* =============================
   EMAIL CONFIG (GoDaddy SMTP)
============================= */
const transporter = nodemailer.createTransport({
    host: "smtpout.secureserver.net",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

router.get("/health", (req, res) => {
    return res.json({
        ok: true,
        route: "/api/webhook",
        checks: {
            stripeKeyConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
            webhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
            smtpConfigured: Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS),
        },
        timestamp: new Date().toISOString(),
    });
});

router.get("/", (req, res) => {
    return res.status(200).json({
        ok: true,
        message: "Webhook endpoint is live. Send Stripe-signed POST events to this URL.",
        health: "/api/webhook/health",
    });
});

/* =============================
   STRIPE WEBHOOK
============================= */
router.post(
    "/",
    express.raw({ type: "application/json" }),
    async (req, res) => {
        const sig = req.headers["stripe-signature"];

        let event;

        try {
            event = stripe.webhooks.constructEvent(
                req.body,
                sig,
                process.env.STRIPE_WEBHOOK_SECRET
            );
            logWebhook("event_received", {
                eventId: event.id,
                type: event.type,
            });
        } catch (err) {
            console.error("Webhook signature error:", err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        if (event.type === "checkout.session.completed") {
            const session = event.data.object;
            try {
                const metadata = session.metadata || {};

                // Prevent duplicate save
                const existing = await PurchaseOrder.findOne({
                    stripeSessionId: session.id,
                });

                if (existing) {
                    logWebhook("duplicate_ignored", {
                        sessionId: session.id,
                        orderId: String(existing._id),
                    });
                    return res.json({ received: true });
                }

                // Get line items safely (amount_total and amount_subtotal are always present)
                const lineItemsRes = await stripe.checkout.sessions.listLineItems(
                    session.id,
                    { limit: 100 }
                );
                const lineItems = lineItemsRes.data || [];

                const items = lineItems
                    .filter(
                        (li) =>
                            li.description !== "Shipping" &&
                            li.description !== "Estimated Tax"
                    )
                    .map((li) => {
                        const qty = Number(li.quantity || 1);
                        const lineTotal = Number(li.amount_total || li.amount_subtotal || 0) / 100;
                        const unitPrice = qty > 0 ? lineTotal / qty : 0;
                        return {
                            description: li.description || "Product",
                            qty,
                            price: unitPrice,
                            total: lineTotal,
                        };
                    });

                const subtotal = items.reduce((sum, it) => sum + Number(it.total || 0), 0);

                const shippingCost = lineItems
                    .filter((li) => li.description === "Shipping")
                    .reduce((sum, li) => sum + Number(li.amount_total || 0) / 100, 0);

                const estimatedTax = lineItems
                    .filter((li) => li.description === "Estimated Tax")
                    .reduce((sum, li) => sum + Number(li.amount_total || 0) / 100, 0);

                let ownerType = metadata.ownerType || null;
                let ownerId = metadata.ownerId || null;

                // Fallback: resolve owner from draft by purchaseOrderId
                if ((!ownerType || !ownerId) && metadata.purchaseOrderId) {
                    const draft = await PurchaseOrderDraft.findOne({ purchaseOrderId: metadata.purchaseOrderId }).lean();
                    if (draft) {
                        ownerType = ownerType || draft.ownerType;
                        ownerId = ownerId || String(draft.ownerId);
                    }
                }

                if (!ownerType || !ownerId) {
                    console.error("[Webhook] Missing owner metadata; cannot persist order", {
                        sessionId: session.id,
                        purchaseOrderId: metadata.purchaseOrderId,
                        ownerType,
                        ownerId,
                    });
                    return res.status(400).json({ received: false, error: "Missing owner info in webhook metadata" });
                }

                const customerEmail =
                    session.customer_email ||
                    session.customer_details?.email ||
                    metadata.customer_email ||
                    metadata.prefilledEmail ||
                    "";

                let resolvedPurchaseOrderId = metadata.purchaseOrderId || buildFallbackPurchaseOrderId(session.id);
                const existingByBusinessId = await PurchaseOrder.findOne({ purchaseOrderId: resolvedPurchaseOrderId }).lean();
                if (existingByBusinessId) {
                    const previousId = resolvedPurchaseOrderId;
                    resolvedPurchaseOrderId = buildFallbackPurchaseOrderId(session.id);
                    logWebhook("purchase_order_id_regenerated", {
                        sessionId: session.id,
                        previousId,
                        newId: resolvedPurchaseOrderId,
                    });
                }

                const order = await PurchaseOrder.create({
                    purchaseOrderId: resolvedPurchaseOrderId,
                    ownerType,
                    ownerId,
                    email: customerEmail,
                    items,
                    subtotal,
                    shippingCost,
                    estimatedTax,
                    totalAmount: Number(session.amount_total || 0) / 100,
                    stripeSessionId: session.id,
                    shippingInfo: {
                        name: session.customer_details?.name || metadata.shipping_name || "",
                        address: session.customer_details?.address?.line1 || metadata.shipping_address || "",
                        city: session.customer_details?.address?.city || metadata.shipping_city || "",
                        postalCode:
                            session.customer_details?.address?.postal_code ||
                            metadata.shipping_postal_code ||
                            "",
                        country: session.customer_details?.address?.country || metadata.shipping_country || "",
                    },
                });

                /* =============================
                   SEND EMAILS
                ============================= */

                if (order.email) {
                    await transporter.sendMail({
                        from: process.env.EMAIL_USER,
                        to: order.email,
                        subject: "Order Confirmation - Nova International Designs",
                        html: `
          <h2>Thank you for your purchase</h2>
          <p><strong>Order ID:</strong> ${order.purchaseOrderId}</p>
          <p><strong>Total:</strong> $${order.totalAmount}</p>
        `,
                    });
                    logWebhook("email_customer_sent", {
                        sessionId: session.id,
                        to: order.email,
                    });
                }

                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: process.env.ADMIN_EMAIL || "info@novainternationaldesigns.com",
                    subject: "New Order Received",
                    html: `
          <h2>New Order</h2>
          <p><strong>Order ID:</strong> ${order.purchaseOrderId}</p>
          <p><strong>Customer Email:</strong> ${order.email || "N/A"}</p>
          <p><strong>Total:</strong> $${order.totalAmount}</p>
        `,
                });
                logWebhook("email_admin_sent", {
                    sessionId: session.id,
                    to: process.env.ADMIN_EMAIL || "info@novainternationaldesigns.com",
                });

                logWebhook("fulfillment_success", {
                    sessionId: session.id,
                    purchaseOrderId: order.purchaseOrderId,
                    dbOrderId: String(order._id),
                });
            } catch (fulfillmentErr) {
                console.error("[Webhook] Fulfillment failed:", fulfillmentErr);
                return res.status(500).json({ received: false, error: "Webhook fulfillment failed" });
            }
        }

        res.json({ received: true });
    }
);

export default router;