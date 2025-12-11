import express from "express";
import PurchaseOrder from "../models/PurchaseOrder.js";

const router = express.Router();

// Get draft PO for user
router.get("/:userId", async (req, res) => {
  try {
    let po = await PurchaseOrder.findOne({ userId: req.params.userId, status: "draft" });
    if (!po) {
      po = new PurchaseOrder({ userId: req.params.userId, items: [] });
      await po.save();
    }
    res.json(po);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch PO draft" });
  }
});

// Add/update items in draft PO
router.post("/:userId/items", async (req, res) => {
  try {
    const { item } = req.body; // single item
    let po = await PurchaseOrder.findOne({ userId: req.params.userId, status: "draft" });
    if (!po) {
      po = new PurchaseOrder({ userId: req.params.userId, items: [] });
    }

    // check if item already exists
    const existing = po.items.find(i => i.productId.toString() === item.productId);
    if (existing) {
      existing.qty += item.qty; // increase qty
      existing.total = existing.qty * existing.price;
    } else {
      po.items.push(item);
    }

    await po.save();
    res.json(po);
  } catch (err) {
    res.status(500).json({ error: "Failed to update PO draft" });
  }
});

// Submit PO
router.post("/:userId/submit", async (req, res) => {
  try {
    let po = await PurchaseOrder.findOne({ userId: req.params.userId, status: "draft" });
    if (!po) return res.status(404).json({ error: "Draft PO not found" });
    po.status = "submitted";
    await po.save();
    res.json({ message: "Purchase order submitted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to submit PO" });
  }
});

export default router;
