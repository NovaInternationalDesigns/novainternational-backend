const express = require("express");
const router = express.Router();
const upload = require("../config/multer");

// MULTIPLE upload (max 10 files)
router.post("/upload", upload.array("files", 10), (req, res) => {
  try {
    const urls = req.files.map(file => file.path); // Cloudinary URL
    res.json({ success: true, urls });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
