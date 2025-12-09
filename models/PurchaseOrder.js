import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  styleNo: String,
  description: String,
  color: String,
  qty: Number,
  price: Number,
  total: Number,
});

const purchaseOrderSchema = new mongoose.Schema({
  bankName: String,
  accountNo: String,
  routingNo: String,
  customerName: String,
  attn: String,
  address: String,
  tel: String,
  fax: String,
  notes: String,
  items: [itemSchema],
});

export default mongoose.model("PurchaseOrder", purchaseOrderSchema);
