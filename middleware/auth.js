import jwt from "jsonwebtoken";
import User from "../models/User.js";

const JWT_SECRET = process.env.JWT_SECRET || "jwt-secret";

export const getTokenFromHeader = (req) => {
  const authHeader = req.headers.authorization || req.headers["x-access-token"];
  if (!authHeader) return null;
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
};

export const verifyToken = async (req, res, next) => {
  const token = getTokenFromHeader(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      console.error("JWT verification failed:", err);
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  }

  if (req.session?.userId) {
    try {
      const user = await User.findById(req.session.userId).select("name email role");
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      req.user = {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || "buyer",
      };
      return next();
    } catch (err) {
      console.error("Session auth failed:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }

  return res.status(401).json({ message: "Unauthorized" });
};

export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admins only" });
  }

  next();
};
