const express = require("express");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const File = require("../models/File");
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const { protect } = require("../middleware/auth");

const router = express.Router();

const storage = multer.memoryStorage();

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
  limits: { fileSize: 150 * 1024 * 1024 },
});

const getResourceType = (mimetype) => {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  return "raw";
};

const uploadToCloudinary = (buffer, options) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
    stream.end(buffer);
  });
};

// POST /api/files/upload — hỗ trợ upload nhiều file cùng lúc (tối đa 10)
router.post("/upload", protect, upload.array("files", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "Vui lòng chọn ít nhất 1 file" });
    }

    const uploadResults = await Promise.all(
      req.files.map((file, i) =>
        uploadToCloudinary(file.buffer, {
          folder: "nodejs-app",
          resource_type: getResourceType(file.mimetype),
          public_id: `${Date.now()}-${i}-${file.originalname.replace(/\s+/g, "_")}`,
        })
      )
    );

    const fileDocs = await Promise.all(
      req.files.map((file, i) =>
        File.create({
          originalName: file.originalname,
          filename: uploadResults[i].public_id,
          mimetype: file.mimetype,
          size: file.size,
          url: uploadResults[i].secure_url,
          publicId: uploadResults[i].public_id,
          owner: req.user._id,
        })
      )
    );

    const totalSize = req.files.reduce((sum, f) => sum + f.size, 0);
    await User.findByIdAndUpdate(req.user._id, { $inc: { storageUsed: totalSize } });

    res.status(201).json({
      message: `Upload thành công ${fileDocs.length} file`,
      files: fileDocs,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/files
router.get("/", protect, async (req, res) => {
  try {
    const files = await File.find({ owner: req.user._id })
      .populate("owner", "username email")
      .sort({ createdAt: -1 });
    res.json({ files });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/files/all — Admin
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

// GET /api/files/:id/download — proxy file từ Cloudinary về client
// Auth qua query param token để dùng được với thẻ <a> thông thường (cả iOS)
router.get("/:id/download", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1] || req.query.token;
    if (!token) return res.status(401).json({ message: "Chưa đăng nhập" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUser = await User.findById(decoded.id).select("-password");
    if (!currentUser) return res.status(401).json({ message: "User không tồn tại" });

    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: "File không tồn tại" });

    const isOwner = file.owner.toString() === currentUser._id.toString();
    const isAdmin = currentUser.role === "admin";
    if (!isOwner && !isAdmin) return res.status(403).json({ message: "Không có quyền" });

    if (!file.url) return res.status(404).json({ message: "File không có URL" });

    const response = await fetch(file.url);
    if (!response.ok) throw new Error("Không thể tải file từ Cloudinary");

    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
    );
    res.setHeader("Content-Type", file.mimetype);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/files/:id
router.delete("/:id", protect, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ message: "File không tồn tại" });
    }

    const isOwner = file.owner.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Không có quyền xóa file này" });
    }

    await cloudinary.uploader.destroy(file.publicId, {
      resource_type: getResourceType(file.mimetype),
    });

    await User.findByIdAndUpdate(file.owner, {
      $inc: { storageUsed: -file.size },
    });

    await file.deleteOne();

    res.json({ message: "Xóa file thành công" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
