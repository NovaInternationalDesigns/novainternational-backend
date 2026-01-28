import mongoose from "mongoose";

const draftItemSchema = new mongoose.Schema({
  productId: String,
  name: String,
  price: Number,
  qty: Number,
  color: { type: String, default: null },
  size: { type: String, default: null },
});

const purchaseOrderDraftSchema = new mongoose.Schema({
  userId: String,
  items: [draftItemSchema],
});

export default mongoose.model("PurchaseOrderDraft", purchaseOrderDraftSchema);
