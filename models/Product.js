import mongoose from "mongoose";
import slugify from "slugify";

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true },
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

// Auto-generate slug before save
ProductSchema.pre("save", function (next) {
  if (!this.slug) {
    this.slug = slugify(this.name, {
      lower: true,
      strict: true
    });
  }
  next();
});

export default mongoose.model("Product", ProductSchema);
