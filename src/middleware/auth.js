const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Middleware xác thực JWT token
const protect = async (req, res, next) => {
  try {
    // Token được gửi trong header: Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Chưa đăng nhập" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ message: "User không tồn tại" });
    }

    // Phát hiện đăng nhập từ thiết bị khác: tokenVersion lệch nhau
    if (decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({
        message: "Tài khoản đã đăng nhập ở thiết bị khác",
        code: "SESSION_INVALIDATED",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Token không hợp lệ hoặc đã hết hạn" });
  }
};

// Middleware kiểm tra quyền Admin
const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Chỉ Admin mới có quyền này" });
  }
  next();
};

module.exports = { protect, adminOnly };
