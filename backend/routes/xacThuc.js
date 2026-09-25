const { assert } = require('../utils/kiemTra');
const { getJwtSecret } = require('../utils/moiTruong');
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const NguoiDung = require('../models/NguoiDung');
const { ROLE_LABEL } = require('../utils/hangSo');
const { verifyToken, requireAdmin, requireSignedIn } = require('../middleware/xacThuc');
const { permissionsForRole } = require('../services/dichVuPhanQuyen');
const { releaseStaffClasses } = require('../services/dichVuPhanCongLop');
const {
  sendAccountEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require('../services/dichVuEmail');

// How long the email-confirmation link stays valid; VERIFY_EMAIL_HOURS in .env overrides it.
const DEFAULT_VERIFY_HOURS = 72;
const verifyHours = () => {
  const hours = Number(process.env.VERIFY_EMAIL_HOURS);
  return Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_VERIFY_HOURS;
};
const RESET_MINUTES = 30;
// Minimum gap between two emails to the same address, so the forms cannot be used to spam.
const EMAIL_COOLDOWN_MS = 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SELF_REGISTER_ROLES = ['staff', 'teacher'];
// Roles an admin may give an account (admins are not created through the UI).
const ASSIGNABLE_ROLES = ['staff', 'teacher', 'manager'];

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
function newToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}
// True when a token with this lifetime was issued less than EMAIL_COOLDOWN_MS ago.
const issuedRecently = (expires, lifetimeMs) =>
  Boolean(expires) && expires.getTime() - lifetimeMs + EMAIL_COOLDOWN_MS > Date.now();

function readEmail(value) {
  assert(typeof value === 'string' && EMAIL_PATTERN.test(value.trim()), 'Email không hợp lệ');
  return value.trim().toLowerCase();
}
function assertPassword(value) {
  assert(
    typeof value === 'string' && value.length >= 8 && value.length <= 128,
    'Mật khẩu phải có từ 8 đến 128 ký tự',
  );
}
// Optional allow-list, e.g. SIGNUP_EMAIL_DOMAINS=itc.edu.vn — empty means any domain.
const signupDomains = () =>
  (process.env.SIGNUP_EMAIL_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu' });
    }

    const user = await NguoiDung.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ message: 'Tài khoản hoặc mật khẩu không chính xác' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Tài khoản hoặc mật khẩu không chính xác' });
    }

    if (user.status === 'unverified') {
      return res.status(403).json({
        message:
          'Tài khoản chưa xác thực email. Vui lòng mở email xác thực đã được gửi tới hộp thư.',
      });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị vô hiệu hóa' });
    }

    const token = jwt.sign(
      {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion || 0,
      },
      getJwtSecret(),
      { expiresIn: '7d' },
    );

    res.json({
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
      },
      permissions: await permissionsForRole(user.role),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me — the signed-in user and their current permissions, so the UI picks up
// changes an admin makes to the permission matrix without signing in again.
router.get('/me', verifyToken, requireSignedIn, (req, res) => {
  const { id, fullName, email, role, status, permissions } = req.user;
  res.json({ user: { id, fullName, email, role, status }, permissions });
});

// POST /api/auth/register (Public) — self sign-up for teachers and staff only.
// The account stays 'unverified' (cannot log in or receive work) until the email link is opened.
router.post('/register', async (req, res, next) => {
  try {
    const { fullName, email, password, role } = req.body ?? {};
    assert(
      typeof fullName === 'string' && fullName.trim() && fullName.trim().length <= 100,
      'Vui lòng nhập họ và tên',
    );
    const normalizedEmail = readEmail(email);
    assertPassword(password);
    assert(
      SELF_REGISTER_ROLES.includes(role),
      'Chỉ được đăng ký tài khoản Giảng viên hoặc Nhân viên',
    );
    const domains = signupDomains();
    assert(
      !domains.length || domains.includes(normalizedEmail.split('@')[1]),
      `Chỉ chấp nhận email thuộc tên miền: ${domains.join(', ')}`,
    );

    let user = await NguoiDung.findOne({ email: normalizedEmail });
    if (user && user.status !== 'unverified') {
      return res.status(409).json({
        message: 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng chức năng Quên mật khẩu.',
      });
    }
    const hours = verifyHours();
    const verifyLifetime = hours * 60 * 60 * 1000;
    if (user && issuedRecently(user.verifyTokenExpires, verifyLifetime)) {
      return res
        .status(429)
        .json({ message: 'Email xác thực vừa được gửi. Vui lòng chờ 1 phút rồi thử lại.' });
    }

    // Registering again before verifying simply replaces the pending details and link.
    const { token, hash } = newToken();
    const isNew = !user;
    const fields = {
      fullName: fullName.trim(),
      password: await bcrypt.hash(password, 10),
      role,
      status: 'unverified',
      verifyTokenHash: hash,
      verifyTokenExpires: new Date(Date.now() + verifyLifetime),
    };
    if (user) user.set(fields);
    else user = new NguoiDung({ email: normalizedEmail, ...fields });
    await user.save();

    const sent = await sendVerificationEmail({
      to: normalizedEmail,
      fullName: user.fullName,
      role,
      token,
      hours,
    });
    if (!sent) {
      if (isNew) await user.deleteOne();
      return res
        .status(503)
        .json({ message: 'Không gửi được email xác thực. Vui lòng thử lại sau ít phút.' });
    }

    res.status(201).json({
      message: `Đăng ký thành công! Đã gửi email xác thực tới ${normalizedEmail}. Vui lòng mở email để kích hoạt tài khoản.`,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/verify-email (Public)
router.post('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.body ?? {};
    assert(typeof token === 'string' && token, 'Liên kết xác thực không hợp lệ');
    const user = await NguoiDung.findOne({
      verifyTokenHash: hashToken(token),
      verifyTokenExpires: { $gt: new Date() },
      status: 'unverified',
    });
    assert(
      user,
      'Liên kết xác thực không hợp lệ hoặc đã hết hạn. Hãy đăng ký lại để nhận liên kết mới.',
    );
    user.status = 'active';
    user.verifyTokenHash = null;
    user.verifyTokenExpires = null;
    await user.save();
    res.json({ message: 'Xác thực email thành công! Bạn có thể đăng nhập ngay bây giờ.' });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/forgot-password (Public)
// Always answers the same way so the form cannot be used to discover which emails exist.
router.post('/forgot-password', async (req, res, next) => {
  try {
    const normalizedEmail = readEmail(req.body?.email);
    const resetLifetime = RESET_MINUTES * 60 * 1000;
    const user = await NguoiDung.findOne({ email: normalizedEmail, status: 'active' });
    if (user && !issuedRecently(user.resetTokenExpires, resetLifetime)) {
      const { token, hash } = newToken();
      user.resetTokenHash = hash;
      user.resetTokenExpires = new Date(Date.now() + resetLifetime);
      await user.save();
      await sendPasswordResetEmail({
        to: user.email,
        fullName: user.fullName,
        token,
        minutes: RESET_MINUTES,
      });
    }
    res.json({
      message:
        'Nếu email này đã đăng ký trong hệ thống, liên kết đặt lại mật khẩu đã được gửi tới hộp thư. Vui lòng kiểm tra cả mục Spam.',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/reset-password (Public) — completes the forgot-password flow.
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body ?? {};
    assert(typeof token === 'string' && token, 'Liên kết đặt lại mật khẩu không hợp lệ');
    assertPassword(password);
    const user = await NguoiDung.findOne({
      resetTokenHash: hashToken(token),
      resetTokenExpires: { $gt: new Date() },
      status: 'active',
    });
    assert(
      user,
      'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.',
    );
    user.password = await bcrypt.hash(password, 10);
    user.tokenVersion = (user.tokenVersion || 0) + 1; // sign out every existing session
    user.resetTokenHash = null;
    user.resetTokenExpires = null;
    await user.save();
    res.json({ message: 'Đặt lại mật khẩu thành công! Hãy đăng nhập bằng mật khẩu mới.' });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/create-staff (Admin only)
router.post('/create-staff', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { fullName, email, customPassword, role } = req.body;
    if (
      typeof fullName !== 'string' ||
      typeof email !== 'string' ||
      !fullName.trim() ||
      !email.trim()
    ) {
      return res.status(400).json({ message: 'Tên và email là bắt buộc' });
    }

    assert(customPassword === undefined || typeof customPassword === 'string', 'Invalid password');
    const existing = await NguoiDung.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ message: 'Email này đã tồn tại trong hệ thống' });
    }

    // Custom password, or a random 16-character base64url one
    const rawPassword =
      customPassword && customPassword.trim()
        ? customPassword.trim()
        : crypto.randomBytes(12).toString('base64url');
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    const assignedRole = ASSIGNABLE_ROLES.includes(role) ? role : 'staff';

    const newStaff = new NguoiDung({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: assignedRole,
      status: 'active',
    });

    await newStaff.save();

    const emailSent = await sendAccountEmail({
      to: newStaff.email,
      fullName: newStaff.fullName,
      password: rawPassword,
      role: assignedRole,
    });

    res.status(201).json({
      message: `Tạo tài khoản ${ROLE_LABEL[assignedRole]} thành công!`,
      staff: {
        id: newStaff._id,
        fullName: newStaff.fullName,
        email: newStaff.email,
        role: newStaff.role,
        status: newStaff.status,
      },
      generatedPassword: rawPassword,
      emailSent,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/staff-list (Admin or Staff)
router.get('/staff-list', verifyToken, requireSignedIn, async (req, res, next) => {
  try {
    const staffs = await NguoiDung.find({ role: { $ne: 'admin' } })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(staffs);
  } catch (error) {
    next(error);
  }
});

// PUT /api/auth/staff/:id (Admin only - Update staff info & optional password/role)
router.put('/staff/:id', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { fullName, email, password, role } = req.body;
    for (const value of [fullName, email, password, role])
      assert(value === undefined || typeof value === 'string', 'Invalid account details');
    const user = await NguoiDung.findById(req.params.id);
    if (!user || user.role === 'admin') {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản nhân viên' });
    }

    if (fullName) user.fullName = fullName.trim();
    if (ASSIGNABLE_ROLES.includes(role) && role !== user.role) {
      if (user.role === 'staff')
        await releaseStaffClasses(user, req.user.id, 'Đổi vai trò tài khoản');
      user.role = role;
      user.managedClasses = [];
    }
    if (email) {
      const existing = await NguoiDung.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: req.params.id },
      });
      if (existing) {
        return res.status(400).json({ message: 'Email này đã thuộc về tài khoản khác' });
      }
      user.email = email.toLowerCase().trim();
    }
    if (password && password.trim()) {
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      user.password = await bcrypt.hash(password.trim(), 10);
    }

    await user.save();
    res.json({ message: 'Cập nhật thông tin nhân viên thành công!', staff: user });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/staff/:id/reset-password (Admin only - Reset Staff Password)
router.post('/staff/:id/reset-password', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    const user = await NguoiDung.findById(req.params.id);
    if (!user || user.role === 'admin') {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản nhân viên' });
    }

    assert(newPassword === undefined || typeof newPassword === 'string', 'Invalid password');
    const rawPassword =
      newPassword && newPassword.trim()
        ? newPassword.trim()
        : crypto.randomBytes(12).toString('base64url');
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.password = await bcrypt.hash(rawPassword, 10);
    await user.save();

    const emailSent = await sendAccountEmail({
      to: user.email,
      fullName: user.fullName,
      password: rawPassword,
      role: user.role,
      isReset: true,
    });

    res.json({
      message: `Đã đặt lại mật khẩu cho nhân viên ${user.fullName} thành công!`,
      newPassword: rawPassword,
      emailSent,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/auth/staff/:id/status (Admin only)
router.put('/staff/:id/status', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }

    const updated = await NguoiDung.findByIdAndUpdate(
      req.params.id,
      { status, $inc: { tokenVersion: 1 } },
      { returnDocument: 'after', runValidators: true },
    ).select('-password');
    if (!updated) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }
    if (updated.role === 'staff' && status === 'inactive')
      await releaseStaffClasses(updated, req.user.id, 'Tài khoản nhân viên bị khóa');

    res.json({ message: 'Cập nhật trạng thái thành công', staff: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/auth/staff/:id (Admin only - Delete Staff Account)
router.delete('/staff/:id', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const user = await NguoiDung.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản nhân viên' });
    }
    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Không thể xóa tài khoản Quản trị viên (Admin)' });
    }

    if (user.role === 'staff') {
      // Their classes are released (history kept) and open call tasks go to the manager's queue.
      await releaseStaffClasses(user, req.user.id, 'Tài khoản nhân viên bị xóa');
    } else if (user.role === 'teacher') {
      // Course groups taught by this teacher would otherwise keep a dangling teacherId.
      const NhomHocPhan = require('../models/NhomHocPhan');
      await NhomHocPhan.updateMany({ teacherId: user._id }, { teacherId: null });
    }

    await NguoiDung.findByIdAndDelete(req.params.id);
    res.json({ message: `Đã xóa vĩnh viễn tài khoản nhân viên ${user.fullName}!` });
  } catch (error) {
    next(error);
  }
});

// Phân lớp phụ trách cho nhân viên CSKH: xem routes/phanCongLop.js (/api/class-assignments).

module.exports = router;
