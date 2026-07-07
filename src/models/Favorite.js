const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    file: { type: mongoose.Schema.Types.ObjectId, ref: "File", required: true },
  },
  { timestamps: true }
);

favoriteSchema.index({ user: 1, file: 1 }, { unique: true });

module.exports = mongoose.model("Favorite", favoriteSchema);
