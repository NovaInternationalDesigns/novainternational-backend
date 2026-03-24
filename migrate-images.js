import { v2 as cloudinary } from "cloudinary";
import products from "./seedProducts.js";

// 🔹 TEST (source)
const testCloud = cloudinary;
testCloud.config({
  cloud_name: "djgz1kays",
  api_key: "642728461838965",
  api_secret: "Dx3ezV3-yAcVL6lsMeaxMpqf7fA",
});

// 🔹 PROD (destination)
const prodCloud = cloudinary;
prodCloud.config({
  cloud_name: "djux8tl4r",
  api_key: "869585928496349",
  api_secret: "y_BY0BewVk0W1PV3Me3Qsr_RjMs",
});

function buildUrl(cloudName, publicId) {
  return `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`;
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function migrateImages() {
  for (const product of products) {
    const productIds = product.images_public_id || [];

    const variantIds = (product.variants || [])
      .map((v) => v?.images_public_id)
      .filter(Boolean);

    // ✅ FLATTEN + UNIQUE
    const publicIds = [...new Set([...productIds, ...variantIds])];

    for (const publicId of publicIds) {
      try {
        console.log("Migrating:", publicId);

        // 🔹 Direct upload from URL (BEST METHOD)
        await prodCloud.uploader.upload(
          buildUrl("djgz1kays", publicId),
          {
            public_id: publicId,
            overwrite: true,
            resource_type: "image",
          }
        );

        console.log("✔ Uploaded:", publicId);

        await delay(200);
      } catch (err) {
        console.error("❌ Failed:", publicId, err.message);
      }
    }
  }

  console.log("🎉 Migration completed!");
}

migrateImages();