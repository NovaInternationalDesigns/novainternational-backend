import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import uploadRoutes from "./routes/upload.js";
import productRoutes from "./routes/product.js";

dotenv.config();

const app = express();

// Database
connectDB();

// Middleware
app.use(cors({ origin: "*", methods: ["GET","POST","PUT","DELETE"] }));
app.use(express.json());

// Routes
app.use("/api/upload", uploadRoutes);
app.use("/api/products", productRoutes);

// Test route
app.get("/", (req, res) => res.send("Backend is running..."));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
