const mongoose = require("mongoose");

const shareSchema = new mongoose.Schema(
  {
    file: { type: mongoose.Schema.Types.ObjectId, ref: "File", required: true },
    sharedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sharedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

shareSchema.index({ file: 1, sharedTo: 1 }, { unique: true });

module.exports = mongoose.model("Share", shareSchema);
