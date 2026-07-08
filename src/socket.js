const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io;
// userId (string) → socketId
const userSockets = new Map();

/**
 * Khởi tạo Socket.io gắn vào httpServer.
 * Gọi một lần duy nhất trong index.js.
 */
const setupSocket = (httpServer, allowedOrigins) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
          return cb(null, true);
        }
        cb(new Error("CORS not allowed"));
      },
      credentials: true,
    },
  });

  // Middleware xác thực JWT khi client kết nối
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id.toString();
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    userSockets.set(socket.userId, socket.id);

    socket.on("disconnect", () => {
      userSockets.delete(socket.userId);
    });
  });

  return io;
};

/**
 * Emit event đến một user cụ thể nếu họ đang online.
 * Dùng trong các route cần push real-time (shares, v.v.)
 */
const emitToUser = (userId, event, data) => {
  if (!io) return;
  const socketId = userSockets.get(userId.toString());
  if (socketId) {
    io.to(socketId).emit(event, data);
  }
};

module.exports = { setupSocket, emitToUser };
