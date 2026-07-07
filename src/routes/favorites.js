const express = require("express");
const Favorite = require("../models/Favorite");
const File = require("../models/File");
const { protect } = require("../middleware/auth");

const router = express.Router();

// GET /api/favorites — danh sách file yêu thích
router.get("/", protect, async (req, res) => {
  try {
    const favorites = await Favorite.find({ user: req.user._id })
      .populate("file", "originalName mimetype size url _id createdAt")
      .sort({ createdAt: -1 });
    res.json({ favorites: favorites.filter((f) => f.file != null) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/favorites — thêm vào yêu thích
router.post("/", protect, async (req, res) => {
  try {
    const { fileId } = req.body;
    if (!fileId) return res.status(400).json({ message: "Thiếu fileId" });

    const file = await File.findById(fileId);
    if (!file) return res.status(404).json({ message: "File không tồn tại" });

    await Favorite.create({ user: req.user._id, file: fileId });
    res.status(201).json({ message: "Đã thêm vào yêu thích" });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "File đã trong danh sách yêu thích" });
    }
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/favorites/:fileId — xóa khỏi yêu thích
router.delete("/:fileId", protect, async (req, res) => {
  try {
    await Favorite.deleteOne({ user: req.user._id, file: req.params.fileId });
    res.json({ message: "Đã xóa khỏi yêu thích" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
