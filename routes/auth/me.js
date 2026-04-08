// routes/auth/me.js
import express from "express";
import jwt from "jsonwebtoken";
import User from "../../models/User.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "jwt-secret";

const getTokenFromHeader = (req) => {
  const authHeader = req.headers.authorization || req.headers["x-access-token"];
  if (!authHeader) return null;
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
};

// GET /api/auth/me
router.get("/", async (req, res) => {
  if (req.session.userId) {
    try {
      const user = await User.findById(req.session.userId).select("-password");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.json({
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role || "buyer",
        },
        authenticated: true,
      });
    } catch (err) {
      console.error("Fetch user error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }

  const token = getTokenFromHeader(req);
  if (!token) {
    return res.status(200).json({ user: null, authenticated: false });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || "buyer",
      },
      authenticated: true,
    });
  } catch (err) {
    console.error("JWT fetch user error:", err);
    return res.status(401).json({ message: "Invalid token" });
  }
});

export default router;
