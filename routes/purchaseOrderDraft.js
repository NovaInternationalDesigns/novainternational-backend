import express from "express";
import PurchaseOrderDraft from "../models/PurchaseOrderDraft.js";
import Product from "../models/Product.js";
import crypto from "crypto";
import mongoose from "mongoose";

const router = express.Router();

const toKey = (value) => String(value ?? "");
const normalizeIdentifier = (value) => String(value ?? "").trim();

const buildProductIdentifierMap = async (identifiers) => {
  const normalized = [...new Set((identifiers || []).map(normalizeIdentifier).filter(Boolean))];
  if (normalized.length === 0) return new Map();

  const validObjectIds = normalized
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const orQuery = [];
  if (validObjectIds.length > 0) {
    orQuery.push({ _id: { $in: validObjectIds } });
  }
  orQuery.push({ productId: { $in: normalized } });

  const products = await Product.find({ $or: orQuery })
    .select("_id productId minQty")
    .lean();

  const byIdentifier = new Map();
  for (const p of products) {
    byIdentifier.set(toKey(p._id), p);
    if (p.productId) byIdentifier.set(toKey(p.productId), p);
  }

  return byIdentifier;
};

const getProductKeys = (product, requestedId = null) => {
  const keys = new Set();
  if (requestedId) keys.add(toKey(requestedId));
  if (product?._id) keys.add(toKey(product._id));
  if (product?.productId) keys.add(toKey(product.productId));
  return keys;
};

/**
 * GET /:ownerType/:ownerId
 * Fetch or create a draft PO for a user or guest
 */
router.get("/:ownerType/:ownerId", async (req, res) => {
  try {
    const { ownerType, ownerId } = req.params;

    if (!["User", "Guest"].includes(ownerType)) {
      return res.status(400).json({ error: "ownerType must be 'User' or 'Guest'" });
    }

    // Convert string ownerId to ObjectId for MongoDB query
    const ownerIdObj = mongoose.Types.ObjectId.isValid(ownerId)
      ? new mongoose.Types.ObjectId(ownerId)
      : ownerId;

    let po = await PurchaseOrderDraft.findOne({ ownerType, ownerId: ownerIdObj });
    if (!po) {
      const purchaseOrderId = crypto.randomBytes(16).toString("hex");
      po = new PurchaseOrderDraft({ ownerType, ownerId: ownerIdObj, purchaseOrderId, items: [] });
      await po.save();
    }

    res.json(po);
  } catch (err) {
    console.error("Error fetching PO draft:", err);
    res.status(500).json({ error: "Failed to fetch PO draft" });
  }
});

/**
 * POST /:ownerType/:ownerId/items
 * Add/update items in draft PO
 */
router.post("/:ownerType/:ownerId/items", async (req, res) => {
  try {
    const { ownerType, ownerId } = req.params;
    const { items } = req.body;

    if (!["User", "Guest"].includes(ownerType)) {
      return res.status(400).json({ error: "ownerType must be 'User' or 'Guest'" });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items array is required" });
    }

    for (const item of items) {
      const numericQty = Number(item.quantity);
      if (!item.productId) {
        return res.status(400).json({ error: "Each item must include productId" });
      }
      if (!Number.isFinite(numericQty) || numericQty < 0) {
        return res.status(400).json({ error: "Each item quantity must be a number greater than or equal to 0" });
      }
    }

    // Convert string ownerId to ObjectId for MongoDB query
    const ownerIdObj = mongoose.Types.ObjectId.isValid(ownerId)
      ? new mongoose.Types.ObjectId(ownerId)
      : ownerId;

    let po = await PurchaseOrderDraft.findOne({ ownerType, ownerId: ownerIdObj });
    if (!po) {
      const purchaseOrderId = crypto.randomBytes(16).toString("hex");
      po = new PurchaseOrderDraft({ ownerType, ownerId: ownerIdObj, purchaseOrderId, items: [] });
      await po.save();
    }

    // merge items into a plain array then atomically replace
    const merged = [...po.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      price: i.price,
      qty: i.qty,
      image: i.image || null,
      color: i.color,
      size: i.size,
    }))];

    items.forEach((item) => {
      const idx = merged.findIndex(
        (i) =>
          toKey(i.productId) === toKey(item.productId) &&
          toKey(i.color) === toKey(item.color) &&
          toKey(i.size) === toKey(item.size)
      );
      if (idx > -1) {
        merged[idx].qty = (Number(merged[idx].qty) || 0) + (Number(item.quantity) || 0);
      } else {
        merged.push({
          productId: item.productId,
          name: item.name,
          price: item.price,
          qty: Number(item.quantity) || 0,
          image: item.image || null,
          color: item.color || null,
          size: item.size || null,
        });
      }
    });

    const affectedProductIds = [...new Set(items.map((item) => normalizeIdentifier(item.productId)).filter(Boolean))];
    const productById = await buildProductIdentifierMap(affectedProductIds);

    for (const productId of affectedProductIds) {
      const product = productById.get(productId);
      if (!product) {
        return res.status(400).json({ error: `Product not found for productId ${productId}` });
      }

      const requiredMinQty = Number(product.minQty) > 0 ? Number(product.minQty) : 1;
      const productKeys = getProductKeys(product, productId);
      const productTotalQty = merged
        .filter((i) => productKeys.has(toKey(i.productId)))
        .reduce((sum, i) => sum + (Number(i.qty) || 0), 0);

      if (productTotalQty < requiredMinQty) {
        return res.status(400).json({
          error: `Minimum quantity should be ${requiredMinQty} for this product. Selected: ${productTotalQty}`,
          productId,
          minQty: requiredMinQty,
          selectedQty: productTotalQty,
        });
      }
    }

    const updated = await PurchaseOrderDraft.findOneAndUpdate(
      { ownerType, ownerId: ownerIdObj },
      { $set: { items: merged } },
      { new: true, upsert: true }
    );

    res.json({ message: "Order added successfully", po: updated });
  } catch (err) {
    console.error("Error adding items to PO:", err);
    res.status(500).json({ error: "Failed to update PO draft", details: err.message });
  }
});

/**
 * DELETE /:ownerType/:ownerId/items
 * Delete a single item from draft PO or clear all items
 */
router.delete("/:ownerType/:ownerId/items", async (req, res) => {
  try {
    const { ownerType, ownerId } = req.params;
    const { productId, color, size } = req.body || {};

    if (!["User", "Guest"].includes(ownerType)) {
      return res.status(400).json({ error: "ownerType must be 'User' or 'Guest'" });
    }

    // Convert string ownerId to ObjectId for MongoDB query
    const ownerIdObj = mongoose.Types.ObjectId.isValid(ownerId)
      ? new mongoose.Types.ObjectId(ownerId)
      : ownerId;

    const po = await PurchaseOrderDraft.findOne({ ownerType, ownerId: ownerIdObj });
    if (!po) return res.status(404).json({ error: "Draft not found" });

    if (productId) {
      // Remove matching items (match productId + optional color + size)
      const newItems = po.items.filter(
        (i) => !(
          i.productId === productId &&
          (color ? i.color === color : true) &&
          (size ? i.size === size : true)
        )
      );

      if (newItems.length === po.items.length) {
        return res.status(404).json({ error: "Item not found in draft" });
      }

      const updated = await PurchaseOrderDraft.findOneAndUpdate(
        { ownerType, ownerId: ownerIdObj },
        { $set: { items: newItems } },
        { new: true }
      );

      return res.json({ message: "Item removed", po: updated });
    }

    // No productId -> clear all items
    const cleared = await PurchaseOrderDraft.findOneAndUpdate(
      { ownerType, ownerId: ownerIdObj },
      { $set: { items: [] } },
      { new: true }
    );
    return res.json({ message: "Draft cleared", po: cleared });
  } catch (err) {
    console.error("Error deleting items from PO:", err);
    res.status(500).json({ error: "Failed to delete items from PO" });
  }
});

/**
 * PATCH /:ownerType/:ownerId/items
 * Update quantity for a single item in draft PO
 */
router.patch("/:ownerType/:ownerId/items", async (req, res) => {
  try {
    const { ownerType, ownerId } = req.params;
    const { productId, color, size, qty } = req.body || {};

    if (!['User', 'Guest'].includes(ownerType)) {
      return res.status(400).json({ error: "ownerType must be 'User' or 'Guest'" });
    }

    if (!productId) {
      return res.status(400).json({ error: "productId is required" });
    }

    const numericQty = Number(qty);
    if (!Number.isFinite(numericQty) || numericQty < 0) {
      return res.status(400).json({ error: "qty must be a number greater than or equal to 0" });
    }

    const ownerIdObj = mongoose.Types.ObjectId.isValid(ownerId)
      ? new mongoose.Types.ObjectId(ownerId)
      : ownerId;

    const po = await PurchaseOrderDraft.findOne({ ownerType, ownerId: ownerIdObj });
    if (!po) return res.status(404).json({ error: "Draft not found" });

    const productById = await buildProductIdentifierMap([productId]);
    const product = productById.get(normalizeIdentifier(productId));
    if (!product) {
      return res.status(400).json({ error: "Product not found" });
    }

    const productKeys = getProductKeys(product, productId);
    const index = po.items.findIndex(
      (i) =>
        productKeys.has(toKey(i.productId)) &&
        (color ? i.color === color : true) &&
        (size ? i.size === size : true)
    );

    if (index === -1) {
      return res.status(404).json({ error: "Item not found in draft" });
    }

    const requiredMinQty = Number(product.minQty) > 0 ? Number(product.minQty) : 1;
    const updatedTotalQtyForProduct = po.items.reduce((sum, item, itemIndex) => {
      if (!productKeys.has(toKey(item.productId))) return sum;
      return sum + (itemIndex === index ? numericQty : Number(item.qty) || 0);
    }, 0);

    if (updatedTotalQtyForProduct < requiredMinQty) {
      return res.status(400).json({
        error: `Minimum quantity should be ${requiredMinQty} for this product. Selected: ${updatedTotalQtyForProduct}`,
        productId,
        minQty: requiredMinQty,
        selectedQty: updatedTotalQtyForProduct,
      });
    }

    po.items[index].qty = numericQty;
    po.updatedAt = new Date();
    await po.save();

    return res.json({ message: "Item quantity updated", po });
  } catch (err) {
    console.error("Error updating item quantity in PO:", err);
    return res.status(500).json({ error: "Failed to update item quantity" });
  }
});

export default router;
