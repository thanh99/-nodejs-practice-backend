require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");

const authRoutes = require("./routes/auth");
const fileRoutes = require("./routes/files");
const statsRoutes = require("./routes/stats");
const adminRoutes = require("./routes/admin");

const app = express();

// Kết nối MongoDB
connectDB();

// Middleware: parse JSON body từ request
app.use(express.json());

// Cho phép localhost, domain Vercel cụ thể, và tất cả preview URL của Vercel
const allowedOrigins = [
  "http://localhost:3000",
  process.env.FRONTEND_URL,
];
app.use(
  cors({
    origin: (origin, callback) => {
      // Cho phép request không có origin (mobile app, Postman, curl)
      if (!origin) return callback(null, true);
      // Cho phép nếu nằm trong danh sách hoặc là subdomain của vercel.app
      if (allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
        return callback(null, true);
      }
      callback(new Error("CORS not allowed"));
    },
    credentials: true,
  })
);

// Serve file tĩnh từ thư mục uploads (để xem file sau khi upload)
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/admin", adminRoutes);

// Health check
app.get("/", (req, res) => res.json({ message: "Server đang chạy!" }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
});
