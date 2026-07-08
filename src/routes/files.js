const express = require("express");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const File = require("../models/File");
const User = require("../models/User");
const Share = require("../models/Share");
const Favorite = require("../models/Favorite");
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

// GET /api/files — phân trang + tìm kiếm + lọc theo loại/ngày
// ?page=1&limit=20&search=name&type=image|video|pdf|other&dateFrom=2024-01-01&dateTo=2024-12-31
router.get("/", protect, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip  = (page - 1) * limit;
    const { search, type, dateFrom, dateTo } = req.query;

    const query = { owner: req.user._id };

    // Tìm theo tên file (regex không phân biệt hoa thường)
    if (search) query.originalName = { $regex: search, $options: "i" };

    // Lọc theo loại file
    if (type === "image") query.mimetype = /^image\//;
    else if (type === "video") query.mimetype = /^video\//;
    else if (type === "pdf")   query.mimetype = "application/pdf";
    else if (type === "other") query.mimetype = { $not: /^(image|video)\//, $ne: "application/pdf" };

    // Lọc theo khoảng ngày
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   query.createdAt.$lte = new Date(dateTo + "T23:59:59.999Z");
    }

    const total = await File.countDocuments(query);
    const files = await File.find(query)
      .populate("owner", "username email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ files, total, page, hasMore: skip + files.length < total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/files/all — Admin, cũng hỗ trợ phân trang
router.get("/all", protect, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Chỉ Admin mới có quyền này" });
    }
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip  = (page - 1) * limit;

    const total = await File.countDocuments();
    const files = await File.find()
      .populate("owner", "username email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ files, total, page, hasMore: skip + files.length < total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/files/bulk — xóa nhiều file cùng lúc (chỉ file của chính mình)
router.delete("/bulk", protect, async (req, res) => {
  try {
    const { ids } = req.body; // mảng string IDs
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Vui lòng chọn ít nhất 1 file" });
    }

    // Lấy tất cả file, chỉ giữ lại file thuộc về user này (bảo vệ ownership)
    const filesToDelete = await File.find({
      _id: { $in: ids },
      owner: req.user._id,
    });

    if (filesToDelete.length === 0) {
      return res.status(403).json({ message: "Không có file nào thuộc về bạn" });
    }

    // Xóa khỏi Cloudinary (song song)
    await Promise.allSettled(
      filesToDelete.map((f) =>
        cloudinary.uploader.destroy(f.publicId, {
          resource_type: f.mimetype.startsWith("video/") ? "video"
            : f.mimetype.startsWith("image/") ? "image" : "raw",
        })
      )
    );

    // Xóa khỏi MongoDB
    const deletedIds = filesToDelete.map((f) => f._id);
    await File.deleteMany({ _id: { $in: deletedIds } });

    // Trừ storageUsed
    const totalSize = filesToDelete.reduce((sum, f) => sum + f.size, 0);
    await User.findByIdAndUpdate(req.user._id, { $inc: { storageUsed: -totalSize } });

    res.json({ message: `Đã xóa ${filesToDelete.length} file`, deletedCount: filesToDelete.length });
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
    const isShared = await Share.exists({ file: file._id, sharedTo: currentUser._id });
    if (!isOwner && !isAdmin && !isShared) return res.status(403).json({ message: "Không có quyền" });

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

    await Share.deleteMany({ file: file._id });
    await Favorite.deleteMany({ file: file._id });
    await file.deleteOne();

    res.json({ message: "Xóa file thành công" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
