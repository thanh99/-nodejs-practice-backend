const express = require("express");
const Notification = require("../models/Notification");
const { protect } = require("../middleware/auth");

const router = express.Router();

// GET /api/notifications — lấy thông báo của tôi (30 mới nhất)
router.get("/", protect, async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ recipient: req.user._id })
        .populate("fromUser", "username")
        .populate("file", "originalName")
        .sort({ createdAt: -1 })
        .limit(30),
      Notification.countDocuments({ recipient: req.user._id, read: false }),
    ]);
    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/notifications/read-all — đánh dấu tất cả đã đọc
// Phải định nghĩa TRƯỚC /:id để không bị nhầm route
router.put("/read-all", protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, read: false },
      { read: true }
    );
    res.json({ message: "Đã đánh dấu tất cả là đã đọc" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/notifications/:id/read — đánh dấu 1 thông báo đã đọc
router.put("/:id/read", protect, async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { read: true },
      { new: true }
    );
    if (!notif) return res.status(404).json({ message: "Không tìm thấy thông báo" });
    res.json({ notification: notif });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/notifications/:id — xóa một thông báo
router.delete("/:id", protect, async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user._id });
    res.json({ message: "Đã xóa thông báo" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
