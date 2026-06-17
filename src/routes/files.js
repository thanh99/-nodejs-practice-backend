const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const File = require("../models/File");
const User = require("../models/User");
const { protect } = require("../middleware/auth");

const router = express.Router();

// --- Cấu hình Multer ---
// diskStorage: lưu file vào ổ đĩa (thay vì memory)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../../uploads"));
  },
  filename: (req, file, cb) => {
    // Đổi tên file: timestamp + tên gốc để tránh trùng
    const uniqueName = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;
    cb(null, uniqueName);
  },
});

// Kiểm tra loại file được phép
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "video/mp4", "video/webm", "video/quicktime",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Loại file không được hỗ trợ"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // Giới hạn 50MB
});

// POST /api/files/upload — upload file
router.post("/upload", protect, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng chọn file" });
    }

    // Lưu thông tin file vào MongoDB
    const file = await File.create({
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      owner: req.user._id,
    });

    // Cập nhật dung lượng đã dùng của user
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { storageUsed: req.file.size },
    });

    res.status(201).json({ message: "Upload thành công", file });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/files — lấy danh sách file của user hiện tại
router.get("/", protect, async (req, res) => {
  try {
    const files = await File.find({ owner: req.user._id })
      .populate("owner", "username email") // Lấy thêm thông tin owner
      .sort({ createdAt: -1 }); // Mới nhất trước

    res.json({ files });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/files/all — Admin: lấy tất cả file
router.get("/all", protect, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Chỉ Admin mới có quyền này" });
    }

    const files = await File.find()
      .populate("owner", "username email")
      .sort({ createdAt: -1 });

    res.json({ files });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/files/:id — xóa file
router.delete("/:id", protect, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ message: "File không tồn tại" });
    }

    // Chỉ owner hoặc admin mới được xóa
    const isOwner = file.owner.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Không có quyền xóa file này" });
    }

    // Xóa file vật lý khỏi ổ đĩa
    fs.unlink(file.path, (err) => {
      if (err) console.error("Không thể xóa file vật lý:", err);
    });

    // Giảm dung lượng đã dùng của user
    await User.findByIdAndUpdate(file.owner, {
      $inc: { storageUsed: -file.size },
    });

    // Xóa record trong DB
    await file.deleteOne();

    res.json({ message: "Xóa file thành công" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
