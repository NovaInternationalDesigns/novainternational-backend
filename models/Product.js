import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    price: Number,
    category: String,
    colors: [String],
    sizes: [String],
    minQty: Number,
    images: [String],
    description: String
  },
  { timestamps: true }
);

export default mongoose.model("Product", ProductSchema);
