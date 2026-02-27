import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import session from "express-session";
import MongoStore from "connect-mongo";
import connectDB from "./config/db.js";

// Routes
import authRoutes from "./routes/auth/index.js";
import uploadRoutes from "./routes/upload.js";
import productRoutes from "./routes/product.js";
import purchaseOrderRoute from "./routes/purchaseOrder.js";
import purchaseOrderDraftRoutes from "./routes/purchaseOrderDraft.js";
import signupRouter from "./routes/auth/signup.js";
import paymentRoutes from "./routes/payment.js";
import webhookRoutes from "./routes/webhook.js";
import guestRoutes from "./routes/guests.js";
import ordersRoutes from "./routes/orders.js";

// Stripe
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Load env variables
dotenv.config();
const env = process.env.NODE_ENV;

// Connect to MongoDB
connectDB();

const app = express();

// --- Stripe webhook route ---
// Must come BEFORE express.json() for raw body
app.use("/api/webhook", webhookRoutes);

// --- Middleware ---
app.use(express.json());

// CORS
const allowedOrigins = [
  "http://localhost:5173",
  "https://calm-blini-7a30a5.netlify.app",
  "https://www.novainternationaldesigns.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Session
app.use(
  session({
    name: "nova.sid",
    secret: process.env.SESSION_SECRET || "secret-key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: {
      httpOnly: true,
      secure: env === "production",
      sameSite: env === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// --- API Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/products", productRoutes);
app.use("/api/purchase-order", purchaseOrderRoute);
app.use("/api/purchaseOrderDraft", purchaseOrderDraftRoutes);
app.use("/api/guests", guestRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/signup", signupRouter);

// --- Health check ---
app.get("/health", (req, res) => {
  res.json({ status: "ok", mongoState: mongoose.connection.readyState });
});

// --- Root ---
app.get("/", (req, res) => res.send("Backend is running..."));

// --- Logout ---
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ message: "Logout failed" });

    res.clearCookie("nova.sid", {
      httpOnly: true,
      sameSite: env === "production" ? "none" : "lax",
      secure: env === "production",
    });

    res.json({ message: "Logged out successfully" });
  });
});

// --- Stripe test endpoint ---
app.post("/create-payment-intent", async (req, res) => {
  const { amount } = req.body;
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
    });
    res.status(200).send({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Start server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));