import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import uploadRoutes from "./routes/upload.js";
import productRoutes from "./routes/product.js";
import purchaseOrderRoute from "./routes/purchaseOrder.js";
import mongoose from "mongoose";


dotenv.config();  // <-- loads .env file
console.log("Using MongoDB URI:", process.env.MONGO_URI);

const app = express();

// Database
connectDB();

// Middleware
// app.use(cors({ origin: "*", methods: ["GET","POST","PUT","DELETE"] }));

app.use(cors({origin: "*"})); // Allow all origins

app.use(express.json());

// Routes
app.use("/api/upload", uploadRoutes);
app.use("/api/products", productRoutes);
app.use("/api/purchase-order", purchaseOrderRoute);
app.use("/api/purchaseOrderDraft.js", purchaseOrderRoute);


// Health check route
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    mongoState: mongoose.connection.readyState
  });
});


// Test route
app.get("/", (req, res) => res.send("Backend is running..."));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
