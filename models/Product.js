import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    productId: {
      type: String,
      index: true,
      sparse: true,
    },
    price: Number,

    category: {
    type: String,
    required: true, // electronics, fashion, robots
    },
    subcategory: {
    type: String,   // fans, vacuum, clutches
    },
    color: [String],
    slug: { type: String, unique: true },
    sizes: [String],
    minQty: Number,
    images: [String],
    description: String
  },
  { timestamps: true }
);

export default mongoose.model("Product", ProductSchema);
