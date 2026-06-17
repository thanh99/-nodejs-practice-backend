const express = require("express");
const User = require("../models/User");
const File = require("../models/File");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

// GET /api/stats/admin — Thống kê tổng quan (chỉ Admin)
router.get("/admin", protect, adminOnly, async (req, res) => {
  try {
    const [totalUsers, totalFiles, storageResult, filesByDay, usersByDay] = await Promise.all([
      // Tổng số user
      User.countDocuments({ role: "user" }),

      // Tổng số file
      File.countDocuments(),

      // Tổng dung lượng đã dùng
      File.aggregate([
        { $group: { _id: null, total: { $sum: "$size" } } },
      ]),

      // Số file upload theo ngày (7 ngày gần nhất)
      File.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
            size: { $sum: "$size" },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Số user đăng ký theo ngày (7 ngày gần nhất)
      User.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      totalUsers,
      totalFiles,
      totalStorage: storageResult[0]?.total || 0,
      filesByDay,
      usersByDay,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/stats/me — Thống kê của user hiện tại
router.get("/me", protect, async (req, res) => {
  try {
    const [totalFiles, storageResult, filesByDay] = await Promise.all([
      File.countDocuments({ owner: req.user._id }),

      File.aggregate([
        { $match: { owner: req.user._id } },
        { $group: { _id: null, total: { $sum: "$size" } } },
      ]),

      File.aggregate([
        {
          $match: {
            owner: req.user._id,
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      totalFiles,
      storageUsed: storageResult[0]?.total || 0,
      filesByDay,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
