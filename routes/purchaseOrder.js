import express from "express";
import PurchaseOrder from "../models/PurchaseOrder.js";

const router = express.Router();

// Create a new purchase order
router.post("/", async (req, res) => {
  try {
    const order = new PurchaseOrder(req.body);
    await order.save();
    res.json({ message: "Order saved successfully", order });
  } catch (error) {
    console.error("PurchaseOrder save error:", error);
    res.status(500).json({ error: "Failed to save order", details: error.message });
  }
});

// Get a single purchase order by ID (for Digital Letter Head)
router.get("/:id", async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (error) {
    console.error("Error fetching purchase order:", error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
