// purchaseorder.js
import express from "express";
import PurchaseOrder from "../models/PurchaseOrder.js";
import PurchaseOrderDraft from "../models/PurchaseOrderDraft.js";
import User from "../models/User.js";
import Guest from "../models/Guest.js";
import crypto from "crypto";
import mongoose from "mongoose";
<<<<<<< HEAD
import { sendPurchaseOrderConfirmation } from "../utils/mailer.js";
=======
import { sendPurchaseOrderNotification, sendPurchaseOrderToAdmin } from "../utils/mailer.js";
>>>>>>> 13080ad0b09c99c5d8ce31f07b1bef7040e0b411

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { email, userId, guestId, purchaseOrderId: incomingPOId, ownerType, ownerId } = req.body;

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(email).toLowerCase())) {
        return res.status(400).json({ error: "Invalid email format" });
      }
    }

    // Determine ownerType and ownerId from body or fallback to legacy fields
    let finalOwnerType = ownerType;
    let finalOwnerId = ownerId;

    if (!finalOwnerType || !finalOwnerId) {
      if (userId) {
        finalOwnerType = "User";
        finalOwnerId = userId;
      } else if (guestId) {
        finalOwnerType = "Guest";
        finalOwnerId = guestId;
      } else {
        return res.status(400).json({ error: "Either userId or guestId must be provided" });
      }
    }

    if (!["User", "Guest"].includes(finalOwnerType)) {
      return res.status(400).json({ error: "ownerType must be 'User' or 'Guest'" });
    }

    // ensure purchaseOrderId is set (prefer incoming, then draft, then generate)
    let purchaseOrderId = incomingPOId;
    if (!purchaseOrderId) {
      // Convert ownerId to ObjectId for draft lookup
      const ownerIdObj = mongoose.Types.ObjectId.isValid(finalOwnerId)
        ? new mongoose.Types.ObjectId(finalOwnerId)
        : finalOwnerId;
      const draft = await PurchaseOrderDraft.findOne({ ownerType: finalOwnerType, ownerId: ownerIdObj });
      if (draft && draft.purchaseOrderId) purchaseOrderId = draft.purchaseOrderId;
    }
    if (!purchaseOrderId) purchaseOrderId = crypto.randomBytes(16).toString("hex");

    // Remove empty-string top-level fields to avoid storing blank keys
    const cleaned = {};
    Object.keys(req.body || {}).forEach((k) => {
      const v = req.body[k];
      if (v === null || v === undefined) return;
      if (typeof v === "string" && v.trim() === "") return;
      cleaned[k] = v;
    });

    // remove empty strings inside nested objects like form and shippingInfo
    if (cleaned.form && typeof cleaned.form === "object") {
      Object.keys(cleaned.form).forEach((k) => {
        if (typeof cleaned.form[k] === "string" && cleaned.form[k].trim() === "") {
          delete cleaned.form[k];
        }
      });
      // if form becomes empty, remove it
      if (Object.keys(cleaned.form).length === 0) delete cleaned.form;
    }
    if (cleaned.shippingInfo && typeof cleaned.shippingInfo === "object") {
      Object.keys(cleaned.shippingInfo).forEach((k) => {
        if (typeof cleaned.shippingInfo[k] === "string" && cleaned.shippingInfo[k].trim() === "") {
          delete cleaned.shippingInfo[k];
        }
      });
      if (Object.keys(cleaned.shippingInfo).length === 0) delete cleaned.shippingInfo;
    }

    // Derive recipient email from cleaned input or from User/Guest record when missing
    let recipientEmail = cleaned.email || email;
    if (!recipientEmail) {
      try {
        if (finalOwnerType === "User") {
          const userDoc = await User.findById(finalOwnerId).select("email name").lean();
          if (userDoc && userDoc.email) {
            recipientEmail = userDoc.email;
            if (!cleaned.customerName && userDoc.name) cleaned.customerName = userDoc.name;
          }
        } else if (finalOwnerType === "Guest") {
          const guestDoc = await Guest.findById(finalOwnerId).select("email name").lean();
          if (guestDoc && guestDoc.email) {
            recipientEmail = guestDoc.email;
            if (!cleaned.customerName && guestDoc.name) cleaned.customerName = guestDoc.name;
          }
        }
      } catch (err) {
        console.warn("Email lookup error:", err.message);
      }
    }

    const orderData = {
      ...cleaned,
      email: recipientEmail,
      purchaseOrderId,
      ownerType: finalOwnerType,
      ownerId: mongoose.Types.ObjectId.isValid(finalOwnerId)
        ? new mongoose.Types.ObjectId(finalOwnerId)
        : finalOwnerId,
    };

    // Try saving; if purchaseOrderId unique constraint conflicts, regenerate and retry a few times
    let order = null;
    const maxRetries = 5;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        order = new PurchaseOrder({ ...orderData });
        await order.save();
        break; // success
      } catch (e) {
        // Duplicate key on purchaseOrderId -> generate new id and retry
        if (e && e.code === 11000 && e.keyPattern && e.keyPattern.purchaseOrderId) {
          attempt += 1;
          purchaseOrderId = crypto.randomBytes(16).toString("hex");
          orderData.purchaseOrderId = purchaseOrderId;
          continue;
        }
        // other errors -> rethrow
        throw e;
      }
    }

    if (!order) {
      throw new Error("Failed to save order after multiple attempts");
    }

<<<<<<< HEAD
    // Send confirmation email if we have an email on the saved order
    if (order.email) {
      console.log("📧 Sending purchase order confirmation to:", order.email);
      await sendPurchaseOrderConfirmation(order.email, {
        purchaseOrderId: order.purchaseOrderId,
        customerName: order.customerName,
        items: order.items,
        totalAmount: order.totalAmount,
        shippingInfo: order.shippingInfo,
        notes: order.notes,
        createdAt: order.createdAt,
      }).catch((err) => {
        // Log email error but don't fail the request
        console.error("✗ Failed to send PO confirmation email:", err.message);
      });
    } else {
      console.warn("⚠ No email available on order - skipping purchase order confirmation");
=======
    // Send email notifications
    try {
      // Get customer email
      const customerEmail = orderData.email;
      
      // Send email to customer
      if (customerEmail) {
        await sendPurchaseOrderNotification(customerEmail, orderData);
      }

      // Send email to admin/owner
      const adminEmail = process.env.SMTP_USER; // Admin email from env
      if (adminEmail) {
        await sendPurchaseOrderToAdmin(adminEmail, orderData);
      }
    } catch (emailErr) {
      console.error("Error sending emails:", emailErr.message);
      // Don't fail the order if emails fail
>>>>>>> 13080ad0b09c99c5d8ce31f07b1bef7040e0b411
    }

    res.json({ message: "Order saved successfully", order });
  } catch (error) {
    console.error("PurchaseOrder save error:", error);
    res.status(500).json({ error: "Failed to save order", details: error.message });
  }
});

export default router;
