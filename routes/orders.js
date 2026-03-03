import express from "express";
import PurchaseOrder from "../models/PurchaseOrder.js";

const router = express.Router();

/* =============================
   GET MY ORDERS
============================= */
router.get("/my-orders", async (req, res) => {
  try {
    const sessionUserId = req.session.userId || req.session.user?._id;
    if (!sessionUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const orders = await PurchaseOrder.find({
      ownerType: "User",
      ownerId: sessionUserId,
    }).sort({ createdAt: -1 });

    res.json({ orders, count: orders.length });
  } catch (err) {
    console.error("Fetch orders error:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/* =============================
   GET ORDERS BY USER ID
============================= */
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const orders = await PurchaseOrder.find({
      ownerType: "User",
      ownerId: userId,
    }).sort({ createdAt: -1 });

    res.json({ orders, count: orders.length });
  } catch (err) {
    console.error("Fetch user orders error:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/* =============================
   GET ORDERS BY GUEST ID
============================= */
router.get("/guest/:guestId", async (req, res) => {
  try {
    const { guestId } = req.params;

    const orders = await PurchaseOrder.find({
      ownerType: "Guest",
      ownerId: guestId,
    }).sort({ createdAt: -1 });

    res.json({ orders, count: orders.length });
  } catch (err) {
    console.error("Fetch guest orders error:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

export default router;