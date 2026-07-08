const express = require("express");
const Share = require("../models/Share");
const File = require("../models/File");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { emitToUser } = require("../socket");
const { protect } = require("../middleware/auth");

const router = express.Router();

// GET /api/shares/received — file được người khác chia sẻ với tôi
router.get("/received", protect, async (req, res) => {
  try {
    const shares = await Share.find({ sharedTo: req.user._id })
      .populate("file", "originalName mimetype size url _id createdAt")
      .populate("sharedBy", "username email")
      .sort({ createdAt: -1 });

    res.json({ shares: shares.filter((s) => s.file != null) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/shares/sent — file tôi đã chia sẻ với người khác
router.get("/sent", protect, async (req, res) => {
  try {
    const shares = await Share.find({ sharedBy: req.user._id })
      .populate("file", "originalName mimetype size url _id createdAt")
      .populate("sharedTo", "username email")
      .sort({ createdAt: -1 });

    res.json({ shares: shares.filter((s) => s.file != null) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/shares — chia sẻ file với một người dùng
router.post("/", protect, async (req, res) => {
  try {
    const { fileId, identifier } = req.body;
    if (!fileId || !identifier) {
      return res.status(400).json({ message: "Thiếu fileId hoặc identifier" });
    }

    const file = await File.findById(fileId);
    if (!file) return res.status(404).json({ message: "File không tồn tại" });
    if (file.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Chỉ chủ sở hữu mới có thể chia sẻ file" });
    }

    const targetUser = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
    });
    if (!targetUser) return res.status(404).json({ message: "Không tìm thấy người dùng" });
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "Không thể chia sẻ với chính mình" });
    }

    await Share.create({ file: fileId, sharedBy: req.user._id, sharedTo: targetUser._id });

    // Tạo thông báo và emit real-time cho người nhận
    const notif = await Notification.create({
      recipient: targetUser._id,
      type: "file_shared",
      message: `${req.user.username} đã chia sẻ file "${file.originalName}" với bạn`,
      file: file._id,
      fromUser: req.user._id,
    });
    const populated = await Notification.findById(notif._id)
      .populate("fromUser", "username")
      .populate("file", "originalName");
    emitToUser(targetUser._id, "notification:new", populated);

    res.status(201).json({ message: `Đã chia sẻ với ${targetUser.username}` });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "File đã được chia sẻ với người dùng này" });
    }
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/shares/:shareId — thu hồi chia sẻ
router.delete("/:shareId", protect, async (req, res) => {
  try {
    const share = await Share.findById(req.params.shareId)
      .populate("file", "originalName _id")
      .populate("sharedTo", "_id");
    if (!share) return res.status(404).json({ message: "Không tìm thấy bản ghi chia sẻ" });
    if (share.sharedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Không có quyền thu hồi chia sẻ này" });
    }

    const recipientId = share.sharedTo._id;
    const fileName = share.file?.originalName || "file";
    await share.deleteOne();

    // Thông báo thu hồi cho người đã nhận
    const notif = await Notification.create({
      recipient: recipientId,
      type: "share_revoked",
      message: `${req.user.username} đã thu hồi chia sẻ file "${fileName}"`,
      fromUser: req.user._id,
    });
    const populated = await Notification.findById(notif._id)
      .populate("fromUser", "username");
    emitToUser(recipientId, "notification:new", populated);

    res.json({ message: "Đã thu hồi chia sẻ" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
