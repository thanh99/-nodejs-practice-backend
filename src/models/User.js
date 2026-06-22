const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username là bắt buộc"],
      unique: true,
      trim: true,
      minlength: [3, "Username tối thiểu 3 ký tự"],
    },
    email: {
      type: String,
      required: [true, "Email là bắt buộc"],
      unique: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Email không hợp lệ"],
    },
    password: {
      type: String,
      required: [true, "Password là bắt buộc"],
      minlength: [6, "Password tối thiểu 6 ký tự"],
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    storageUsed: {
      type: Number,
      default: 0, // bytes
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true, // Tự động thêm createdAt và updatedAt
  }
);

// Hook: tự động hash password TRƯỚC KHI lưu vào DB
// Đây là "pre save middleware" của Mongoose
userSchema.pre("save", async function (next) {
  // Chỉ hash khi password bị thay đổi (tránh hash lại khi update field khác)
  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt(10); // salt rounds = 10 (cân bằng giữa bảo mật và tốc độ)
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method: so sánh password khi đăng nhập
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
