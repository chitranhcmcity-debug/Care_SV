// Tài khoản admin đầu tiên cho bản triển khai mới (kể cả production): tạo lúc khởi động từ
// ADMIN_EMAIL / ADMIN_PASSWORD, chỉ khi cơ sở dữ liệu chưa có admin. Khi đã có admin thì
// không làm gì, nên các biến này có thể để nguyên (hoặc xóa) mà không ảnh hưởng tài khoản.
const bcrypt = require('bcryptjs');
const NguoiDung = require('../models/NguoiDung');

async function ensureInitialAdmin(env = process.env) {
  const email = (env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = env.ADMIN_PASSWORD || '';
  if (await NguoiDung.exists({ role: 'admin' })) return { created: false, reason: 'exists' };
  if (!email || !password) return { created: false, reason: 'not-configured' };
  if (password.length < 12 || password.length > 128)
    throw new Error('ADMIN_PASSWORD must contain 12 to 128 characters.');
  if (await NguoiDung.exists({ email }))
    throw new Error('ADMIN_EMAIL is already used by a non-admin account.');
  const user = await NguoiDung.create({
    email,
    fullName: (env.ADMIN_NAME || '').trim() || 'Quản trị viên hệ thống',
    password: await bcrypt.hash(password, 10),
    role: 'admin',
    status: 'active',
  });
  return { created: true, user };
}

module.exports = { ensureInitialAdmin };
