import express from "express";
import PurchaseOrder from "../models/PurchaseOrder.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const order = new PurchaseOrder(req.body);
    await order.save();
    res.json({ message: "Order saved successfully" });
  } catch (error) {
    console.error("PurchaseOrder save error:", error);  // <-- Log the actual error
    res.status(500).json({ error: "Failed to save order", details: error.message });
  }
});


export default router;
    