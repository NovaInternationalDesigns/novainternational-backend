import nodemailer from "nodemailer";
import PurchaseOrder from "../models/PurchaseOrder.js";
import User from "../models/User.js";
import Guest from "../models/Guest.js";

const transporter = nodemailer.createTransport({
    host: "outlook.office365.com",
    port: 587,
    secure: false,
    requireTLS: true,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    logger: true,
    tls: {
        minVersion: "TLSv1.2",
    },
});

transporter.verify((err) => {
    if (err) {
        console.error("[OrderEmail] SMTP verify failed:", err?.message || err);
        return;
    }
    console.log("[OrderEmail] SMTP verified and ready");
});

const resolveCustomerEmail = async (order) => {
    if (order?.email) return order.email;

    if (order?.ownerType === "User" && order?.ownerId) {
        const user = await User.findById(order.ownerId).select("email").lean();
        if (user?.email) return user.email;
    }

    if (order?.ownerType === "Guest" && order?.ownerId) {
        const guest = await Guest.findById(order.ownerId).select("email").lean();
        if (guest?.email) return guest.email;
    }

    return "";
};

export async function sendOrderEmailsIfNeeded(orderLike, logPrefix = "OrderEmail") {
    if (!orderLike?._id) return;

    const order = await PurchaseOrder.findById(orderLike._id).lean();
    if (!order) return;

    const customerEmail = await resolveCustomerEmail(order);
    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;

    if (customerEmail) {
        const reservation = new Date();
        const claimedCustomer = await PurchaseOrder.findOneAndUpdate(
            { _id: order._id, customerEmailSentAt: null },
            {
                $set: {
                    customerEmailSentAt: reservation,
                    ...(order.email ? {} : { email: customerEmail }),
                },
            },
            { new: true }
        ).lean();

        if (claimedCustomer) {
            try {
                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: customerEmail,
                    subject: `Purchase Order Confirmation - ${order.purchaseOrderId}`,
                    html: `<h2>Thank you for your purchase</h2><p>Order ID: ${order.purchaseOrderId}</p><p>Total: $${Number(
                        order.totalAmount || 0
                    ).toFixed(2)}</p>`,
                });

                console.log(`[${logPrefix}] Customer email sent`, {
                    purchaseOrderId: order.purchaseOrderId,
                    to: customerEmail,
                });
            } catch (err) {
                await PurchaseOrder.updateOne(
                    { _id: order._id, customerEmailSentAt: reservation },
                    { $set: { customerEmailSentAt: null } }
                );
                throw err;
            }
        }
    }

    if (adminEmail) {
        const reservation = new Date();
        const claimedAdmin = await PurchaseOrder.findOneAndUpdate(
            { _id: order._id, adminEmailSentAt: null },
            { $set: { adminEmailSentAt: reservation } },
            { new: true }
        ).lean();

        if (claimedAdmin) {
            try {
                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: adminEmail,
                    subject: `New Order Received - ${order.purchaseOrderId}`,
                    html: `<h2>New Order</h2><p>Order ID: ${order.purchaseOrderId}</p><p>Customer: ${customerEmail || order.email || "N/A"}</p><p>Total: $${Number(
                        order.totalAmount || 0
                    ).toFixed(2)}</p>`,
                });

                console.log(`[${logPrefix}] Admin email sent`, {
                    purchaseOrderId: order.purchaseOrderId,
                    to: adminEmail,
                });
            } catch (err) {
                await PurchaseOrder.updateOne(
                    { _id: order._id, adminEmailSentAt: reservation },
                    { $set: { adminEmailSentAt: null } }
                );
                throw err;
            }
        }
    }
}

export function sendOrderEmailsInBackground(orderLike, logPrefix = "OrderEmail") {
    // Never block request/response lifecycle on SMTP availability.
    Promise.resolve(sendOrderEmailsIfNeeded(orderLike, logPrefix)).catch((err) => {
        console.error(`[${logPrefix}] Async email dispatch failed:`, {
            message: err?.message || String(err),
            code: err?.code,
            command: err?.command,
            responseCode: err?.responseCode,
            response: err?.response,
        });
    });
}
