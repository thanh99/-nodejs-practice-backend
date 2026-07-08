require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const { setupSocket } = require("./socket");

const authRoutes          = require("./routes/auth");
const fileRoutes          = require("./routes/files");
const statsRoutes         = require("./routes/stats");
const adminRoutes         = require("./routes/admin");
const sharesRoutes        = require("./routes/shares");
const favoritesRoutes     = require("./routes/favorites");
const notificationsRoutes = require("./routes/notifications");

const app = express();

// Kết nối MongoDB
connectDB();

// Middleware
app.use(express.json());

const allowedOrigins = [
  "http://localhost:3000",
  process.env.FRONTEND_URL,
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
        return callback(null, true);
      }
      callback(new Error("CORS not allowed"));
    },
    credentials: true,
  })
);

// Routes
app.use("/api/auth",          authRoutes);
app.use("/api/files",         fileRoutes);
app.use("/api/stats",         statsRoutes);
app.use("/api/admin",         adminRoutes);
app.use("/api/shares",        sharesRoutes);
app.use("/api/favorites",     favoritesRoutes);
app.use("/api/notifications", notificationsRoutes);

app.get("/", (req, res) => res.json({ message: "Server đang chạy!" }));

// Tạo HTTP server thủ công để Socket.io có thể gắn vào
const httpServer = http.createServer(app);

// Khởi tạo Socket.io
setupSocket(httpServer, allowedOrigins);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
});
