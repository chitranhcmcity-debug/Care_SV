// First admin account for a fresh deployment (production included): created at startup from
// ADMIN_EMAIL / ADMIN_PASSWORD, only while the database has no admin yet. Once an admin exists
// this is a no-op, so the variables can stay set (or be removed) without touching the account.
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
