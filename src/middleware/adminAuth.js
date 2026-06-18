const jwt = require("jsonwebtoken");

const adminProtect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Chưa đăng nhập" });
    }
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "superadmin") {
      return res.status(403).json({ message: "Không có quyền truy cập" });
    }
    next();
  } catch {
    res.status(401).json({ message: "Token không hợp lệ" });
  }
};

module.exports = { adminProtect };
