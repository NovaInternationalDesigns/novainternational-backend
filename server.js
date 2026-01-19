import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import session from "express-session";

import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.js";
import uploadRoutes from "./routes/upload.js";
import productRoutes from "./routes/product.js";
import purchaseOrderRoute from "./routes/purchaseOrder.js";

dotenv.config();

const app = express();

// ✅ Database
connectDB();

// ✅ Middleware: JSON
app.use(express.json());

// ✅ Environment-based CORS
const allowedOrigins = [
  "https://calm-blini-7a30a5.netlify.app",  // dev Netlify
  "https://www.novainternationaldesigns.com" // production
];

app.use(cors({
  origin: function(origin, callback) {
    // allow Postman or server requests with no origin
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // allow cookies
}));

// ✅ Session (MUST be before routes)
app.use(session({
  name: "nova.sid",
  secret: process.env.SESSION_SECRET || "hello_nova",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // must be true in prod (HTTPS)
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // cross-domain cookies in prod
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  }
}));

// ✅ Routes
app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/products", productRoutes);
app.use("/api/purchase-order", purchaseOrderRoute);

// ✅ Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    mongoState: mongoose.connection.readyState
  });
});

// ✅ Root test
app.get("/", (req, res) => {
  res.send("Backend is running...");
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
