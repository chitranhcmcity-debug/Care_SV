const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const NguoiDung = require('../models/NguoiDung');

async function createManagerAccount(password) {
  const existing = await NguoiDung.findOne({ email: 'manager' });
  if (existing) {
    if (existing.role !== 'manager')
      throw new Error('Ten manager da duoc su dung boi vai tro khac.');
    return { created: false, user: existing };
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new Error('Mat khau quan ly phai co tu 8 den 128 ky tu.');
  }
  const user = await NguoiDung.create({
    email: 'manager',
    fullName: 'Trưởng phòng / Phó hiệu trưởng',
    password: await bcrypt.hash(password, 10),
    role: 'manager',
    status: 'active',
  });
  return { created: true, user };
}

if (require.main === module) {
  require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
  const mongoose = require('mongoose');
  (async () => {
    if (process.env.NODE_ENV === 'production')
      throw new Error('Chi dung cho moi truong phat trien.');
    if (process.env.USE_MEMORY_DB === 'true' || !process.env.MONGO_URI) {
      throw new Error('Can MONGO_URI cua database dang su dung.');
    }
    try {
      await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      const password =
        process.env.DEMO_MANAGER_PASSWORD || crypto.randomBytes(12).toString('base64url');
      const result = await createManagerAccount(password);
      if (result.created) console.log(`Tai khoan: manager\nMat khau: ${password}`);
      else console.log('Tai khoan manager da ton tai; giu nguyen mat khau va trang thai.');
    } finally {
      await mongoose.disconnect();
    }
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { createManagerAccount };
