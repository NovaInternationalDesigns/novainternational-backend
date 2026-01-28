import express from "express";
import PurchaseOrderDraft from "../models/PurchaseOrderDraft.js";

const router = express.Router();

// Get draft PO for a user
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    let po = await PurchaseOrderDraft.findOne({ userId });
    if (!po) {
      po = new PurchaseOrderDraft({ userId, items: [] });
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
      po = new PurchaseOrderDraft({ userId, items: [] });
    }

    items.forEach((item) => {
      const existing = po.items.find(
        (i) =>
          i.productId === item.productId &&
          i.color === item.color &&
          i.size === item.size
      );

      if (existing) {
        existing.qty += Number(item.quantity || 0);
      } else {
        po.items.push({
          productId: item.productId,
          name: item.name,
          price: item.price,
          qty: Number(item.quantity || 0),
          color: item.color || null,
          size: item.size || null,
        });
      }
    });

    await po.save();
    res.json({ message: "Order added successfully", po });
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
        const beforeCount = po.items.length;
        po.items = po.items.filter(
          (i) => !(
            i.productId === productId &&
            (color ? i.color === color : true) &&
            (size ? i.size === size : true)
          )
        );

        if (po.items.length === beforeCount) {
          return res.status(404).json({ error: "Item not found in draft" });
        }

        await po.save();
        return res.json({ message: "Item removed", po });
      }

      // No productId -> clear all items
      po.items = [];
      await po.save();
      return res.json({ message: "Draft cleared", po });
    } catch (err) {
      console.error("Error deleting items from PO:", err);
      res.status(500).json({ error: "Failed to delete items from PO" });
    }
  });

export default router;
