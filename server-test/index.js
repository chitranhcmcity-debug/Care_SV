const mongoose = require('mongoose');

// Chuỗi kết nối của bạn
const uri = process.env.MONGO_URI;
if (!uri) {
    console.error('Set MONGO_URI before running this script (node --env-file=.env index.js).');
    process.exit(1);
}

mongoose.connect(uri)
    .then(() => {
        console.log(" Kết nối MongoDB Atlas thành công!");
        process.exit(0);
    })
    .catch((err) => {
        console.error(" Lỗi kết nối:", err.message);
        process.exit(1);
    });