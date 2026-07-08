const mongoose = require("mongoose");
const { Schema, Types: { ObjectId } } = mongoose;

const notificationSchema = new Schema(
  {
    recipient: { type: ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["file_shared", "share_revoked"],
      required: true,
    },
    message:  { type: String, required: true },
    file:     { type: ObjectId, ref: "File" },
    fromUser: { type: ObjectId, ref: "User" },
    read:     { type: Boolean, default: false },
  },
  { timestamps: true }
);

// index để query nhanh theo recipient + sort theo thời gian
notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
