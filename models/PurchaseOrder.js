import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  styleNo: String,       // product _id or SKU
  description: String,   // product name
  qty: { type: Number, default: 1 },
  price: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
});

const purchaseOrderSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  attn: String,
  address: String,
  tel: String,
  fax: String,
  notes: String,
  items: [itemSchema],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("PurchaseOrder", purchaseOrderSchema);
