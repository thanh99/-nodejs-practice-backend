const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Kết nối MongoDB thành công!");
  } catch (error) {
    console.error("Lỗi kết nối MongoDB:", error.message);
    process.exit(1); // Dừng server nếu không kết nối được DB
  }
};

module.exports = connectDB;
