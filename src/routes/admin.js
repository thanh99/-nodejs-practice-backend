const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const File = require("../models/File");
const Share = require("../models/Share");
const cloudinary = require("../config/cloudinary");
const { adminProtect } = require("../middleware/adminAuth");

const getResourceType = (mimetype) => {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  return "raw";
};

const router = express.Router();

// POST /api/admin/login — đăng nhập bằng tài khoản hardcoded
router.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (
    username !== process.env.ADMIN_USERNAME ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({ message: "Sai thông tin đăng nhập" });
  }
  const token = jwt.sign({ role: "superadmin" }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
  res.json({ token });
});

// GET /api/admin/users — danh sách tất cả user
router.get("/users", adminProtect, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const fileCount = await File.countDocuments({ owner: user._id });
        return { ...user.toObject(), fileCount };
      })
    );
    res.json({ users: usersWithStats });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/admin/users/:id — chi tiết user + file của họ
router.get("/users/:id", adminProtect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User không tồn tại" });
    const files = await File.find({ owner: req.params.id }).sort({ createdAt: -1 });
    res.json({ user, files });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/admin/users/:id — cập nhật thông tin user (kể cả đổi mật khẩu)
router.put("/users/:id", adminProtect, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User không tồn tại" });

    if (username) user.username = username;
    if (email) user.email = email;
    if (password) user.password = password; // pre-save hook tự hash

    await user.save();
    res.json({ message: "Cập nhật thành công" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE /api/admin/users/:id — xóa user + toàn bộ file của họ
router.delete("/users/:id", adminProtect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User không tồn tại" });

    const files = await File.find({ owner: req.params.id });
    await Promise.all(
      files.map((file) =>
        cloudinary.uploader.destroy(file.publicId, {
          resource_type: getResourceType(file.mimetype),
        }).catch((err) => console.error("Không thể xóa file Cloudinary:", err))
      )
    );

    await File.deleteMany({ owner: req.params.id });
    await Share.deleteMany({ $or: [{ sharedBy: req.params.id }, { sharedTo: req.params.id }] });
    await user.deleteOne();

    res.json({ message: "Xóa user thành công" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
