import express from "express";
import slugify from "slugify";
import Product from "../models/Product.js";
import { verifyToken, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

const makeSlug = (value) => {
  if (!value) return "";
  return slugify(value, { lower: true, strict: true });
};

/**
 * GET PRODUCTS
 * Examples:
 * /api/products
 * /api/products?category=fashion
 * /api/products?category=fashion&subcategory=men
 */
router.get("/", async (req, res) => {
  try {
    const { category, subcategory } = req.query;

    let filter = {};

    if (category) filter.category = new RegExp(`^${category}$`, "i");
    if (subcategory) filter.subcategory = new RegExp(`^${subcategory}$`, "i");

    const products = await Product.find(filter);
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/products
 * Create a new product (admin only)
 */
router.post("/", verifyToken, requireAdmin, async (req, res) => {
  try {
    const {
      name,
      price,
      styleNo,
      category,
      subcategory,
      description,
      colors,
      sizes,
      slug,
      images_public_id,
    } = req.body;

    if (!name || !styleNo || !category) {
      return res.status(422).json({ message: "Name, style number and category are required." });
    }

    const existing = await Product.findOne({ styleNo });
    if (existing) {
      return res.status(409).json({ message: "A product with that style number already exists." });
    }

    const product = await Product.create({
      name,
      price,
      styleNo,
      category,
      subcategory,
      description,
      colors: Array.isArray(colors) ? colors : String(colors || "").split(",").map((item) => item.trim()).filter(Boolean),
      sizes: Array.isArray(sizes) ? sizes : String(sizes || "").split(",").map((item) => item.trim()).filter(Boolean),
      slug: slug ? makeSlug(slug) : makeSlug(name),
      images_public_id: Array.isArray(images_public_id) ? images_public_id : [images_public_id].filter(Boolean),
    });

    res.status(201).json(product);
  } catch (err) {
    console.error("Create product error:", err);
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET PRODUCT BY ID
 */
router.get("/id/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET PRODUCT BY STYLE NO
 */
router.get("/style/:styleNo", async (req, res) => {
  try {
    const rawStyleNo = String(req.params.styleNo || "").trim();
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const styleNoRegex = new RegExp(`^\\s*${esc(rawStyleNo)}\\s*$`, "i");

    const product = await Product.findOne({ styleNo: { $regex: styleNoRegex } });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET PRODUCT BY FLEXIBLE IDENTIFIER
 * Accepts Mongo _id, styleNo, variant.styleNo, or variant.productId
 */
router.get("/lookup/:identifier", async (req, res) => {
  try {
    const rawIdentifier = String(req.params.identifier || "").trim();
    if (!rawIdentifier) {
      return res.status(400).json({ message: "Identifier is required" });
    }

    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const idRegex = new RegExp(`^\\s*${esc(rawIdentifier)}\\s*$`, "i");

    let product = null;

    if (/^[a-f\d]{24}$/i.test(rawIdentifier)) {
      product = await Product.findById(rawIdentifier);
    }

    if (!product) {
      product = await Product.findOne({
        $or: [
          { styleNo: { $regex: idRegex } },
          { "variants.styleNo": { $regex: idRegex } },
          { "variants.productId": { $regex: idRegex } },
        ],
      });
    }

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET PRODUCT BY SLUG
 */
router.get("/slug/:slug", async (req, res) => {
  try {
    const rawSlug = String(req.params.slug || "").trim();
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const slugRegex = new RegExp(`^\\s*${esc(rawSlug)}\\s*$`, "i");
    const product = await Product.findOne({ slug: { $regex: slugRegex } });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * PUT /api/products/:id
 * Update a product (admin only)
 */
router.put("/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    const productId = req.params.id;
    const {
      name,
      price,
      styleNo,
      category,
      subcategory,
      description,
      colors,
      sizes,
      slug,
      images_public_id,
    } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (styleNo && styleNo !== product.styleNo) {
      const styleConflict = await Product.findOne({ styleNo });
      if (styleConflict) {
        return res.status(409).json({ message: "Another product already uses that style number." });
      }
    }

    product.name = name ?? product.name;
    product.price = price ?? product.price;
    product.styleNo = styleNo ?? product.styleNo;
    product.category = category ?? product.category;
    product.subcategory = subcategory ?? product.subcategory;
    product.description = description ?? product.description;
    product.colors = Array.isArray(colors) ? colors : String(colors || product.colors || "").split(",").map((item) => item.trim()).filter(Boolean);
    product.sizes = Array.isArray(sizes) ? sizes : String(sizes || product.sizes || "").split(",").map((item) => item.trim()).filter(Boolean);
    product.slug = slug ? makeSlug(slug) : product.slug || makeSlug(product.name);
    product.images_public_id = Array.isArray(images_public_id) ? images_public_id : product.images_public_id;

    await product.save();
    res.json(product);
  } catch (err) {
    console.error("Update product error:", err);
    res.status(500).json({ message: err.message });
  }
});

/**
 * DELETE /api/products/:id
 * Delete a product (admin only)
 */
router.delete("/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);
    if (!deletedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({ message: "Product deleted" });
  } catch (err) {
    console.error("Delete product error:", err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
