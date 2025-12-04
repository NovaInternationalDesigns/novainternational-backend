const mongoose = require("mongoose");
require("dotenv").config();
const Product = require("./models/Product"); // Make sure this points to your product model

// Sample products
const products = [
  {
    name: "Campfire Light",
    description: "Latest Campfire light with adjustable brightness",
    price: 799,
    images: [
      "https://res.cloudinary.com/djgz1kays/image/upload/v1764691277/light_kjmbmg.png"
    ],
    category: "Electronics"
  },
  {
    name: "Vacuum Sealing Machine",
    description: "vacuum sealing machine for food preservation",
    price: 1299,
    images: [
      "https://res.cloudinary.com/djgz1kays/image/upload/v1764691276/vaccum-sealing-machine_xlx3wr.png"
    ],
    category: "Electronics"
  },
  {
    name: "Digital Photo Frame",
    description: "Noise cancelling over-ear headphones",
    price: 199,
    images: [
      "https://res.cloudinary.com/djgz1kays/image/upload/v1764691276/digital-photoframe_xem684.png"
    ],
    category: "Electronics"
  }
];

// Connect to MongoDB and insert products
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected. Seeding products...");

    // Remove existing products (optional)
    await Product.deleteMany({});

    // Insert sample products
    await Product.insertMany(products);
    console.log("Products seeded successfully!");
    process.exit();
  })
  .catch((err) => {
    console.error("Error connecting to MongoDB:", err);
    process.exit(1);
  });
