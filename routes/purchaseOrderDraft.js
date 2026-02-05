import express from "express";
import PurchaseOrderDraft from "../models/PurchaseOrderDraft.js";
import GuestPurchaseOrderDraft from "../models/GuestPurchaseOrderDraft.js";
import crypto from "crypto";

const router = express.Router();

// Get draft PO for a user
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    let po = await PurchaseOrderDraft.findOne({ userId });
    if (!po) {
      const purchaseOrderId = crypto.randomBytes(16).toString("hex");
      // create with purchaseOrderId
      po = new PurchaseOrderDraft({ userId, purchaseOrderId, items: [] });
      await po.save();
    }

    res.json(po);
  } catch (err) {
    console.error("Error fetching PO draft:", err);
    res.status(500).json({ error: "Failed to fetch PO draft" });
  }
});

// Add/update items in draft PO
router.post("/:userId/items", async (req, res) => {
  try {
    const { userId } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items array is required" });
    }

    let po = await PurchaseOrderDraft.findOne({ userId });
    if (!po) {    
      const purchaseOrderId = crypto.randomBytes(16).toString("hex");
      po = new PurchaseOrderDraft({ userId, purchaseOrderId, items: [] });
      await po.save();
    }

    // merge items into a plain array then atomically replace using findOneAndUpdate
    const merged = [...po.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      price: i.price,
      qty: i.qty,
      color: i.color,
      size: i.size,
    }))];

    items.forEach((item) => {
      const idx = merged.findIndex(
        (i) => i.productId === item.productId && i.color === item.color && i.size === item.size
      );
      if (idx > -1) {
        merged[idx].qty = (Number(merged[idx].qty) || 0) + (Number(item.quantity) || 0);
      } else {
        merged.push({
          productId: item.productId,
          name: item.name,
          price: item.price,
          qty: Number(item.quantity) || 0,
          color: item.color || null,
          size: item.size || null,
        });
      }
    });

    const updated = await PurchaseOrderDraft.findOneAndUpdate(
      { userId },
      { $set: { items: merged } },
      { new: true, upsert: true }
    );

    res.json({ message: "Order added successfully", po: updated });
  } catch (err) {
    console.error("Error adding items to PO:", err);
    res.status(500).json({ error: "Failed to update PO draft" });
  }
});

  // Delete a single item from draft PO or clear all items
  router.delete("/:userId/items", async (req, res) => {
    try {
      const { userId } = req.params;
      const { productId, color, size } = req.body || {};

      const po = await PurchaseOrderDraft.findOne({ userId });
      if (!po) return res.status(404).json({ error: "Draft not found" });

      if (productId) {
        // Remove matching items (match productId + optional color + size)
        const newItems = po.items.filter(
          (i) => !(
            i.productId === productId &&
            (color ? i.color === color : true) &&
            (size ? i.size === size : true)
          )
        );

        if (newItems.length === po.items.length) {
          return res.status(404).json({ error: "Item not found in draft" });
        }

        const updated = await PurchaseOrderDraft.findOneAndUpdate(
          { userId },
          { $set: { items: newItems } },
          { new: true }
        );

        return res.json({ message: "Item removed", po: updated });
      }

      // No productId -> clear all items
      const cleared = await PurchaseOrderDraft.findOneAndUpdate(
        { userId },
        { $set: { items: [] } },
        { new: true }
      );
      return res.json({ message: "Draft cleared", po: cleared });
    } catch (err) {
      console.error("Error deleting items from PO:", err);
      res.status(500).json({ error: "Failed to delete items from PO" });
    }
  });

// ========== GUEST ROUTES ==========

// Get draft PO for a guest
router.get("/guest/:guestId", async (req, res) => {
  try {
    const { guestId } = req.params;

    let po = await GuestPurchaseOrderDraft.findOne({ guestId });
    if (!po) {
      const purchaseOrderId = crypto.randomBytes(16).toString("hex");
      po = new GuestPurchaseOrderDraft({ guestId, purchaseOrderId, items: [] });
      await po.save();
    }

    res.json(po);
  } catch (err) {
    console.error("Error fetching guest PO draft:", err);
    res.status(500).json({ error: "Failed to fetch guest PO draft" });
  }
});

// Add/update items in guest draft PO
router.post("/guest/:guestId/items", async (req, res) => {
  try {
    const { guestId } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items array is required" });
    }

    let po = await GuestPurchaseOrderDraft.findOne({ guestId });
    if (!po) {
      const purchaseOrderId = crypto.randomBytes(16).toString("hex");
      po = new GuestPurchaseOrderDraft({ guestId, purchaseOrderId, items: [] });
      await po.save();
    }

    // merge items
    const merged = [...po.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      price: i.price,
      qty: i.qty,
      color: i.color,
      size: i.size,
    }))];

    items.forEach((item) => {
      const idx = merged.findIndex(
        (i) => i.productId === item.productId && i.color === item.color && i.size === item.size
      );
      if (idx > -1) {
        merged[idx].qty = (Number(merged[idx].qty) || 0) + (Number(item.quantity) || 0);
      } else {
        merged.push({
          productId: item.productId,
          name: item.name,
          price: item.price,
          qty: Number(item.quantity) || 0,
          color: item.color || null,
          size: item.size || null,
        });
      }
    });

    const updated = await GuestPurchaseOrderDraft.findOneAndUpdate(
      { guestId },
      { $set: { items: merged } },
      { new: true, upsert: true }
    );

    res.json({ message: "Guest order added successfully", po: updated });
  } catch (err) {
    console.error("Error adding items to guest PO:", err);
    res.status(500).json({ error: "Failed to update guest PO draft" });
  }
});

// Delete a single item from guest draft PO or clear all items
router.delete("/guest/:guestId/items", async (req, res) => {
  try {
    const { guestId } = req.params;
    const { productId, color, size } = req.body || {};

    const po = await GuestPurchaseOrderDraft.findOne({ guestId });
    if (!po) return res.status(404).json({ error: "Guest draft not found" });

    if (productId) {
      // Remove matching items
      const newItems = po.items.filter(
        (i) => !(
          i.productId === productId &&
          (color ? i.color === color : true) &&
          (size ? i.size === size : true)
        )
      );

      if (newItems.length === po.items.length) {
        return res.status(404).json({ error: "Item not found in guest draft" });
      }

      const updated = await GuestPurchaseOrderDraft.findOneAndUpdate(
        { guestId },
        { $set: { items: newItems } },
        { new: true }
      );

      return res.json({ message: "Item removed", po: updated });
    }

    // No productId -> clear all items
    const cleared = await GuestPurchaseOrderDraft.findOneAndUpdate(
      { guestId },
      { $set: { items: [] } },
      { new: true }
    );
    return res.json({ message: "Guest draft cleared", po: cleared });
  } catch (err) {
    console.error("Error deleting items from guest PO:", err);
    res.status(500).json({ error: "Failed to delete items from guest PO" });
  }
});

export default router;
