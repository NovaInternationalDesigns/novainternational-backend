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

// GET PRODUCTS BY CATEGORY
router.get("/:category", async (req, res) => {
  const { category } = req.params;
  try {
    const products = await Product.find({ category });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
