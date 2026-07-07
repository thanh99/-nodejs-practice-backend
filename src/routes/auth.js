const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/auth");

const router = express.Router();

// Tạo JWT token
// [SINGLE-SESSION] Thay dòng dưới bằng: const generateToken = (userId, tokenVersion) => {
//   return jwt.sign({ id: userId, tokenVersion }, ...)
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Kiểm tra user đã tồn tại chưa
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      return res.status(400).json({ message: "Email hoặc username đã tồn tại" });
    }

    // Tạo user mới (password sẽ tự hash qua pre-save hook trong model)
    const user = await User.create({ username, email, password });
    const token = generateToken(user._id);

    res.status(201).json({
      token,
      user: { id: user._id, username: user.username, email: user.email, role: user.role },
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Tìm user (chỉ select thêm password vì schema mặc định không trả về)
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Email hoặc password không đúng" });
    }

    // So sánh password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Email hoặc password không đúng" });
    }

    // [SINGLE-SESSION] Bỏ comment 4 dòng dưới và xóa 2 dòng generateToken + res.json bên dưới
    // const updatedUser = await User.findByIdAndUpdate(
    //   user._id, { $inc: { tokenVersion: 1 } }, { new: true }
    // );
    // const token = generateToken(updatedUser._id, updatedUser.tokenVersion);
    // res.json({ token, user: { id: updatedUser._id, username: updatedUser.username, email: updatedUser.email, role: updatedUser.role } });
    const token = generateToken(user._id);
    res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email, role: user.role },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/auth/me — lấy thông tin user hiện tại
router.get("/me", protect, (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/auth/profile — đổi username và/hoặc mật khẩu
router.put("/profile", protect, async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select("+password");

    if (username && username !== user.username) {
      const existing = await User.findOne({ username });
      if (existing) return res.status(400).json({ message: "Username đã được sử dụng" });
      user.username = username;
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: "Vui lòng nhập mật khẩu hiện tại" });
      }
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) return res.status(400).json({ message: "Mật khẩu hiện tại không đúng" });
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Mật khẩu mới tối thiểu 6 ký tự" });
      }
      user.password = newPassword; // pre-save hook tự hash
    }

    await user.save();
    res.json({
      message: "Cập nhật thành công",
      user: { id: user._id, username: user.username, email: user.email, role: user.role },
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
