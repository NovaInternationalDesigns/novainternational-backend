import express from "express";
import PurchaseOrder from "../models/PurchaseOrder.js";
import User from "../models/User.js";
import Guest from "../models/Guest.js";

const router = express.Router();

/**
 * GET ALL ORDERS FOR A LOGGED-IN USER
 * GET /api/orders/my-orders
 * Requires session/authentication
 */
router.get("/my-orders", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const orders = await PurchaseOrder.find({ userId: req.session.userId })
      .sort({ createdAt: -1 })
      .populate("userId", "name email");

    res.json({ orders, count: orders.length });
  } catch (err) {
    console.error("Error fetching user orders:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/**
 * GET ALL ORDERS FOR A GUEST BY GUEST ID
 * GET /api/orders/guest/:guestId
 */
router.get("/guest/:guestId", async (req, res) => {
  try {
    const { guestId } = req.params;

    // Fetch guest details
    const guest = await Guest.findById(guestId);
    if (!guest) {
      return res.status(404).json({ error: "Guest not found" });
    }

    // Fetch all orders for this guest
    const orders = await PurchaseOrder.find({ guestId })
      .sort({ createdAt: -1 });

    res.json({ 
      guest: { _id: guest._id, name: guest.name, email: guest.email },
      orders, 
      count: orders.length 
    });
  } catch (err) {
    console.error("Error fetching guest orders:", err);
    res.status(500).json({ error: "Failed to fetch guest orders" });
  }
});

/**
 * GET USER PROFILE WITH ALL ORDERS
 * GET /api/orders/user/:userId
 */
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Fetch user details
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Fetch all orders for this user
    const orders = await PurchaseOrder.find({ userId })
      .sort({ createdAt: -1 });

    res.json({ 
      user: { _id: user._id, name: user.name, email: user.email },
      orders, 
      count: orders.length 
    });
  } catch (err) {
    console.error("Error fetching user orders:", err);
    res.status(500).json({ error: "Failed to fetch user orders" });
  }
});

/**
 * GET SINGLE ORDER BY ORDER ID
 * GET /api/orders/:orderId
 */
router.get("/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await PurchaseOrder.findById(orderId)
      .populate("userId", "name email")
      .populate("guestId", "name email");

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({ order });
  } catch (err) {
    console.error("Error fetching order:", err);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

/**
 * SEARCH ORDERS BY EMAIL (for both users and guests)
 * GET /api/orders/search/:email
 */
router.get("/search/:email", async (req, res) => {
  try {
    const { email } = req.params;

    // Find user orders
    const userOrders = await PurchaseOrder.find({ 
      $or: [
        { email: { $regex: email, $options: "i" } },
      ]
    }).sort({ createdAt: -1 });

    // Find guest orders
    const guestOrders = await PurchaseOrder.find({ 
      guestEmail: { $regex: email, $options: "i" }
    }).sort({ createdAt: -1 });

    const allOrders = [...userOrders, ...guestOrders];

    res.json({ 
      orders: allOrders,
      count: allOrders.length,
      userOrdersCount: userOrders.length,
      guestOrdersCount: guestOrders.length
    });
  } catch (err) {
    console.error("Error searching orders:", err);
    res.status(500).json({ error: "Failed to search orders" });
  }
});

export default router;
