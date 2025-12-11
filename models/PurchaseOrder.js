import mongoose from "mongoose";

const itemSchema = mongoose.Schema({
  styleNo: { type: String, required: true },
  description: { type: String, required: true },
  color: { type: String, required: true },
  qty: { type: Number, required: true },
  price: { type: Number, required: true },
  total: { type: Number, required: true },
});

const purchaseOrderSchema = mongoose.Schema({
  bankName: { type: String, required: true },
  accountNo: { type: String, required: true },
  routingNo: { type: String, required: true },
  customerName: { type: String, required: true },
  attn: { type: String, required: true },
  address: { type: String, required: true },
  tel: { type: String, required: true },
  fax: { type: String },
  notes: { type: String },
  items: [itemSchema],
}, { timestamps: true });

const PurchaseOrder = mongoose.model("PurchaseOrder", purchaseOrderSchema);

export default PurchaseOrder;
