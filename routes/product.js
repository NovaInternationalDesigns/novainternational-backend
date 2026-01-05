import express from "express";
import Product from "../models/Product.js";

const router = express.Router();

// GET ALL PRODUCTS
router.get("/", async (req, res) => {
  try {
    const products = await Product.find({});
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET PRODUCT BY ID
router.get("/id/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET PRODUCT BY SLUG
router.get("/slug/:slug", async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ✅ GET PRODUCTS BY CATEGORY (FIXED)
router.get("/category/:category", async (req, res) => {
  try {
    const category = req.params.category;

    const products = await Product.find({
      category: { $regex: `^${category}$`, $options: "i" }
    });

    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
