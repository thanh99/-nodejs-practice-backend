const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    originalName: {
      type: String,
      required: true,
    },
    filename: {
      type: String,
      required: true, // Tên file đã được đổi (unique) trên server
    },
    mimetype: {
      type: String,
      required: true, // Ví dụ: "image/png", "application/pdf"
    },
    size: {
      type: Number,
      required: true, // bytes
    },
    path: {
      type: String,
      required: true, // Đường dẫn lưu trên server
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Tham chiếu tới User model
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("File", fileSchema);
