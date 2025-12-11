import mongoose from "mongoose";

const draftItemSchema = new mongoose.Schema({
  productId: String,
  name: String,
  price: Number,
  qty: Number,
});

const purchaseOrderDraftSchema = new mongoose.Schema({
  userId: String,
  items: [draftItemSchema],
});

export default mongoose.model("PurchaseOrderDraft", purchaseOrderDraftSchema);
