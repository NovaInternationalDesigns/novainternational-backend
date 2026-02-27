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
    if (!ownerType || !ownerId || !mongoose.Types.ObjectId.isValid(ownerId)) return;
    await PurchaseOrderDraft.deleteOne({
        ownerType,
        ownerId: new mongoose.Types.ObjectId(ownerId),
    });
};

router.post(
    ["/", "/webhook"],
    express.raw({ type: "application/json" }),
    async (req, res) => {
        console.log("[Stripe Webhook] Incoming request");
        const sig = req.headers["stripe-signature"];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        let event;

        try {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
            console.log("[Stripe Webhook] Signature verified. Event:", event.type);
        } catch (err) {
            console.log("Webhook signature verification failed.", err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        if (event.type !== "checkout.session.completed") {
            return res.json({ received: true });
        }

        const session = event.data.object;
        const md = session.metadata || {};
        console.log("[Stripe Webhook] checkout.session.completed", {
            sessionId: session.id,
            purchaseOrderId: md.purchaseOrderId || null,
            ownerType: md.ownerType || null,
            ownerId: md.ownerId || null,
        });

        try {
            const existingBySession = await PurchaseOrder.findOne({ stripeSessionId: session.id });
            if (existingBySession) {
                return res.json({ received: true });
            }

            const orderId = md.orderId || null;
            if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
                const existingOrder = await PurchaseOrder.findById(orderId);
                if (existingOrder) {
                    existingOrder.paymentStatus = "paid";
                    existingOrder.stripeSessionId = session.id;
                    await existingOrder.save();

                    if (existingOrder.email) {
                        await sendPaymentConfirmationEmail(existingOrder.email, {
                            purchaseOrderId: existingOrder.purchaseOrderId,
                            customerName: existingOrder.customerName,
                            totalAmount: existingOrder.totalAmount,
                        }).catch((err) => console.error("Payment email error:", err.message));

                        await sendPurchaseOrderConfirmation(existingOrder.email, existingOrder).catch((err) =>
                            console.error("Order email error:", err.message)
                        );
                    }

                    await sendAdminOrderNotification(existingOrder).catch((err) =>
                        console.error("Admin email error:", err.message)
                    );

                    await clearDraftForOwner(existingOrder.ownerType, existingOrder.ownerId?.toString());
                    return res.json({ received: true });
                }
            }

            const lineItemsRes = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
            const lineItems = lineItemsRes.data || [];

            const items = lineItems
                .filter((li) => li.description !== "Shipping" && li.description !== "Estimated Tax")
                .map((li) => ({
                    styleNo: li.price?.product?.metadata?.styleNo || "",
                    description: li.description || li.price?.product?.name || "Product",
                    color: "",
                    size: "",
                    qty: li.quantity || 1,
                    price: (li.price?.unit_amount || li.amount_subtotal || 0) / 100,
                    total: ((li.price?.unit_amount || li.amount_subtotal || 0) / 100) * (li.quantity || 1),
                }));

            const ownerType = md.ownerType || "Guest";
            const ownerId = md.ownerId || null;
            const ownerObjectId = ownerId && mongoose.Types.ObjectId.isValid(ownerId)
                ? new mongoose.Types.ObjectId(ownerId)
                : new mongoose.Types.ObjectId();

            const itemsTotal = items.reduce((sum, it) => sum + (it.total || it.price * it.qty), 0);
            const shippingCost = md.shippingCost ? Number(md.shippingCost) : 0;
            const estimatedTax = md.estimatedTax ? Number(md.estimatedTax) : 0;
            const subtotal = md.subtotal ? Number(md.subtotal) : itemsTotal;
            const totalAmount = md.totalAmount
                ? Number(md.totalAmount)
                : subtotal + shippingCost + estimatedTax;

            const customerEmail =
                session.customer_email ||
                session.customer_details?.email ||
                md.customer_email ||
                md.prefilledEmail ||
                "";

            const customerName =
                session.customer_details?.name ||
                md.shipping_name ||
                "";

            const po = new PurchaseOrder({
                purchaseOrderId: md.purchaseOrderId || `PO-${Date.now()}`,
                ownerType,
                ownerId: ownerObjectId,
                email: customerEmail,
                customerName,
                items,
                shippingInfo: {
                    name: customerName,
                    address: md.shipping_address || session.customer_details?.address?.line1 || "",
                    city: md.shipping_city || session.customer_details?.address?.city || "",
                    postalCode: md.shipping_postal_code || session.customer_details?.address?.postal_code || "",
                    country: md.shipping_country || session.customer_details?.address?.country || "",
                },
                subtotal,
                shippingCost,
                estimatedTax,
                totalAmount,
                form: {},
                stripeSessionId: session.id,
                paymentStatus: "paid",
            });

            await po.save();

            if (customerEmail) {
                await sendPaymentConfirmationEmail(customerEmail, {
                    purchaseOrderId: po.purchaseOrderId,
                    customerName: po.customerName,
                    totalAmount: po.totalAmount,
                }).catch((err) => console.error("Payment email error:", err.message));

                await sendPurchaseOrderConfirmation(customerEmail, po).catch((err) =>
                    console.error("Order email error:", err.message)
                );
            }

            await sendAdminOrderNotification(po).catch((err) =>
                console.error("Admin email error:", err.message)
            );

            await clearDraftForOwner(ownerType, ownerId);
        } catch (err) {
            console.error("Webhook processing error:", err.message);
        }

        return res.json({ received: true });
    }
);

export default router;
