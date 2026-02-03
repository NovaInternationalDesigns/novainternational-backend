// purchaseorder.js
import express from "express";
import PurchaseOrder from "../models/PurchaseOrder.js";
import PurchaseOrderDraft from "../models/PurchaseOrderDraft.js";
import crypto from "crypto";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { email, userId, purchaseOrderId: incomingPOId } = req.body;

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(email).toLowerCase())) {
        return res.status(400).json({ error: "Invalid email format" });
      }
    }

    // ensure purchaseOrderId is set (prefer incoming, then draft, then generate)
    let purchaseOrderId = incomingPOId;
    if (!purchaseOrderId && userId) {
      const draft = await PurchaseOrderDraft.findOne({ userId });
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

    const orderData = { ...cleaned, purchaseOrderId };

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

    res.json({ message: "Order saved successfully", order });
  } catch (error) {
    console.error("PurchaseOrder save error:", error);
    res.status(500).json({ error: "Failed to save order", details: error.message });
  }
});

export default router;
