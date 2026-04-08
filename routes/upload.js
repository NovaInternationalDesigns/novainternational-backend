// /routes/upload.js
import express from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import { verifyToken, requireAdmin } from "../middleware/auth.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/", verifyToken, requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(req.file.path);
    res.json({
      imageUrl: result.secure_url,
      public_id: result.public_id,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
