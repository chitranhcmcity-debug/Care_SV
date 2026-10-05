const { assert } = require('../utils/kiemTra');
const { getJwtSecret } = require('../utils/moiTruong');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const NguoiDung = require('../models/NguoiDung');
const NhomHocPhan = require('../models/NhomHocPhan');
const { ROLE_LABEL, ORDER_STATUS } = require('../utils/hangSo');
const { permissionsForRole } = require('../services/dichVuPhanQuyen');
const subscription = require('../services/dichVuGoiDichVu');
const payos = require('../services/dichVuPayOS');
const DonThanhToan = require('../models/DonThanhToan');
const {
  renewUrl,
  accountFromRenewToken,
  accountExpired,
} = require('../services/dichVuGiaHanTaiKhoan');
const { releaseStaffClasses } = require('../services/dichVuPhanCongLop');
const {
  sendAccountEmail,
  sendApprovalRequestEmail,
  sendActivationKeyEmail,
  sendRegistrationRejectedEmail,
  sendPasswordResetEmail,
} = require('../services/dichVuEmail');

// Self sign-up: Trưởng phòng / PHT approve new accounts, then the applicant enters the key.
const WAITING_APPROVAL = ['pending', 'unverified'];
const REGISTRATION_STATUSES = [...WAITING_APPROVAL, 'awaiting_key'];
const ACTIVATION_KEY_DAYS = 7;
// Unambiguous characters (no 0/O, 1/I/L) so a key copied by hand still works.
const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newActivationKey() {
  const chars = Array.from(
    { length: 12 },
    () => KEY_ALPHABET[crypto.randomInt(KEY_ALPHABET.length)],
  );
  return [0, 4, 8].map((i) => chars.slice(i, i + 4).join('')).join('-');
}
const normalizeKey = (value) =>
  String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
const RESET_MINUTES = 30;
// Minimum gap between two emails to the same address, so the forms cannot be used to spam.
const EMAIL_COOLDOWN_MS = 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SELF_REGISTER_ROLES = ['staff', 'teacher'];
// A Trưởng phòng / PHT may also sign up, but only by paying for their own plan.
const PAID_REGISTER_ROLE = 'manager';
// Roles an admin may give an account (admins are not created through the UI).
const ASSIGNABLE_ROLES = ['staff', 'teacher', 'manager'];

/**
 * Hands back the work tied to an account's current role before it changes role or is deleted:
 * a staff member's classes are released (history kept, open calls go to the manager's queue),
 * a teacher is taken off the course groups they teach.
 */
async function releaseRoleWork(user, by, reason) {
  if (user.role === 'staff') await releaseStaffClasses(user, by, reason);
  else if (user.role === 'teacher')
    await NhomHocPhan.updateMany({ teacherId: user._id }, { teacherId: null });
}

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
// Optional phone (parents can call back on it).
function readPhone(value) {
  if (value === undefined || value === null) return undefined;
  assert(typeof value === 'string', 'Số điện thoại không hợp lệ');
  const phone = value.trim();
  assert(!phone || /^\+?[\d\s.-]{8,20}$/.test(phone), 'Số điện thoại không hợp lệ');
  return phone;
}
function assertPassword(value) {
  assert(
    typeof value === 'string' && value.length >= 8 && value.length <= 128,
    'Mật khẩu phải có từ 8 đến 128 ký tự',
  );
}
// A password the admin typed (same rules as sign-up), or a random 16-character one.
function chosenOrRandomPassword(value) {
  assert(value === undefined || typeof value === 'string', 'Mật khẩu không hợp lệ');
  if (!value || !value.trim()) return crypto.randomBytes(12).toString('base64url');
  assertPassword(value.trim());
  return value.trim();
}
// Never sent to the browser: password hash and one-time token / key hashes.
const PRIVATE_FIELDS = '-password -verifyTokenHash -resetTokenHash -activationKeyHash';

// Optional allow-list, e.g. SIGNUP_EMAIL_DOMAINS=itc.edu.vn — empty means any domain.
const signupDomains = () =>
  (process.env.SIGNUP_EMAIL_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

// "ch***@gmail.com": enough for the holder to recognise, without exposing the address.
const maskEmail = (email) => email.replace(/^(.{1,2})[^@]*/, '$1***');

const renewalAccount = async (token) => {
  const user = await accountFromRenewToken(token);
  assert(
    user,
    'Liên kết gia hạn không hợp lệ hoặc đã hết hạn. Hãy đăng nhập để nhận liên kết mới.',
  );
  return user;
};

const findRegistration = async (id) => {
  assert(/^[a-f\d]{24}$/i.test(String(id)), 'Mã tài khoản không hợp lệ');
  const user = await NguoiDung.findOne({ _id: id, status: { $in: REGISTRATION_STATUSES } });
  assert(user, 'Không tìm thấy yêu cầu đăng ký này (có thể đã được xử lý).', 404);
  return user;
};

/** Active manager whose unit a staff member or teacher joins (admin picks one). */
async function findUnitManager(managerId) {
  assert(
    /^[a-f\d]{24}$/i.test(String(managerId || '')),
    'Vui lòng chọn Trưởng phòng / Phó hiệu trưởng quản lý tài khoản này',
  );
  const manager = await NguoiDung.findOne({ _id: managerId, role: 'manager', status: 'active' });
  assert(manager, 'Không tìm thấy Trưởng phòng / Phó hiệu trưởng đang hoạt động đã chọn', 404);
  return manager;
}

async function login(req, res, next) {
  try {
    const { email, password, activationKey } = req.body;
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

    if (WAITING_APPROVAL.includes(user.status)) {
      return res.status(403).json({
        code: 'PENDING_APPROVAL',
        message:
          'Tài khoản đang chờ Trưởng phòng / Phó hiệu trưởng xác nhận. Bạn sẽ nhận key kích hoạt qua email khi được duyệt.',
      });
    }
    if (user.status === 'awaiting_key') {
      if (!activationKey) {
        return res.status(403).json({
          code: 'ACTIVATION_KEY_REQUIRED',
          message: 'Tài khoản đã được duyệt. Hãy nhập key kích hoạt đã gửi vào email của bạn.',
        });
      }
      const valid =
        typeof activationKey === 'string' &&
        user.activationKeyHash === hashToken(normalizeKey(activationKey)) &&
        user.activationKeyExpires > new Date();
      if (!valid) {
        return res.status(403).json({
          code: 'ACTIVATION_KEY_INVALID',
          message:
            'Key kích hoạt không đúng hoặc đã hết hạn. Hãy kiểm tra lại email, hoặc nhờ Trưởng phòng / PHT gửi lại key.',
        });
      }
      user.status = 'active';
      user.activationKeyHash = null;
      user.activationKeyExpires = null;
      await user.save();
    }
    if (user.status === 'awaiting_payment') {
      return res.status(403).json({
        code: 'PAYMENT_REQUIRED',
        message:
          'Tài khoản chưa hoàn tất thanh toán gói dịch vụ. Hãy thanh toán để kích hoạt tài khoản.',
        renewUrl: renewUrl(user),
      });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị vô hiệu hóa' });
    }
    if (accountExpired(user)) {
      return res.status(403).json({
        code: 'ACCOUNT_EXPIRED',
        message: 'Gói dịch vụ của tài khoản đã hết hạn. Gia hạn để kích hoạt lại tài khoản.',
        renewUrl: renewUrl(user),
      });
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
        accessExpiresAt: user.accessExpiresAt,
      },
      permissions: await permissionsForRole(user.role),
    });
  } catch (error) {
    next(error);
  }
}

function me(req, res) {
  const { id, fullName, email, phone, role, status, accessExpiresAt, permissions } = req.user;
  res.json({ user: { id, fullName, email, phone, role, status, accessExpiresAt }, permissions });
}

// Teachers and staff: the account stays 'pending' until a Trưởng phòng / PHT approves it; every
// active manager is emailed. Approval emails the applicant an activation key for the login.
// Trưởng phòng / PHT: must buy a plan (body.planCode). The account waits in 'awaiting_payment'
// and is activated, with a receipt emailed, as soon as PayOS confirms the payment.
async function register(req, res, next) {
  try {
    const { fullName, email, password, role, planCode, managerEmail } = req.body ?? {};
    const phone = readPhone(req.body?.phone) ?? '';
    const isPaid = role === PAID_REGISTER_ROLE;
    assert(
      typeof fullName === 'string' && fullName.trim() && fullName.trim().length <= 100,
      'Vui lòng nhập họ và tên',
    );
    const normalizedEmail = readEmail(email);
    assertPassword(password);
    assert(
      isPaid || SELF_REGISTER_ROLES.includes(role),
      'Chỉ được đăng ký tài khoản Giảng viên, Nhân viên hoặc Trưởng phòng / PHT',
    );
    const plan = isPaid ? (await subscription.getPlans()).find((p) => p.code === planCode) : null;
    assert(!isPaid || plan, 'Vui lòng chọn gói dịch vụ');
    assert(
      !isPaid || payos.isConfigured(),
      'Hệ thống chưa bật thanh toán trực tuyến. Vui lòng liên hệ quản trị viên.',
      503,
    );
    const domains = signupDomains();
    assert(
      !domains.length || domains.includes(normalizedEmail.split('@')[1]),
      `Chỉ chấp nhận email thuộc tên miền: ${domains.join(', ')}`,
    );

    let user = await NguoiDung.findOne({ email: normalizedEmail });
    if (user && ![...REGISTRATION_STATUSES, 'awaiting_payment'].includes(user.status)) {
      return res.status(409).json({
        message: 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng chức năng Quên mật khẩu.',
      });
    }
    if (user && Date.now() - user.updatedAt.getTime() < EMAIL_COOLDOWN_MS) {
      return res
        .status(429)
        .json({ message: 'Yêu cầu vừa được gửi. Vui lòng chờ 1 phút rồi thử lại.' });
    }
    if (isPaid) {
      // Registering again before paying replaces the details and opens a new payment link.
      const isNewAccount = !user;
      const fields = {
        fullName: fullName.trim(),
        password: await bcrypt.hash(password, 10),
        role,
        phone,
        status: 'awaiting_payment',
        verifyTokenHash: null,
        verifyTokenExpires: null,
        activationKeyHash: null,
        activationKeyExpires: null,
        approvedBy: null,
      };
      if (user) user.set(fields);
      else user = new NguoiDung({ email: normalizedEmail, ...fields });
      user.unitId = user._id; // a new, empty unit of their own
      await user.save();
      let order;
      try {
        order = await subscription.createOrder(plan.code, user, { account: user });
      } catch (error) {
        if (isNewAccount) await user.deleteOne();
        throw error;
      }
      return res.status(201).json({
        message: 'Đang chuyển tới trang thanh toán...',
        checkoutUrl: order.checkoutUrl,
      });
    }

    // The applicant joins this manager's unit; only this manager can approve them.
    assert(
      typeof managerEmail === 'string' && EMAIL_PATTERN.test(managerEmail.trim()),
      'Vui lòng nhập email của Trưởng phòng / Phó hiệu trưởng quản lý bạn',
    );
    const manager = await NguoiDung.findOne({
      email: managerEmail.trim().toLowerCase(),
      role: 'manager',
      status: 'active',
    }).select('fullName email unitId');
    assert(
      manager,
      'Không tìm thấy Trưởng phòng / Phó hiệu trưởng nào đang hoạt động với email này. Hãy kiểm tra lại email lãnh đạo.',
      404,
    );

    // Registering again while waiting simply replaces the details and asks again.
    const isNew = !user;
    const fields = {
      fullName: fullName.trim(),
      password: await bcrypt.hash(password, 10),
      role,
      phone,
      status: 'pending',
      unitId: manager.unitId || manager._id,
      verifyTokenHash: null,
      verifyTokenExpires: null,
      activationKeyHash: null,
      activationKeyExpires: null,
      approvedBy: null,
    };
    if (user) user.set(fields);
    else user = new NguoiDung({ email: normalizedEmail, ...fields });
    await user.save();

    const applicant = {
      id: String(user._id),
      fullName: user.fullName,
      email: normalizedEmail,
      role,
    };
    const sent = await sendApprovalRequestEmail({
      to: manager.email,
      managerName: manager.fullName,
      applicant,
    });
    if (!sent) {
      if (isNew) await user.deleteOne();
      return res.status(503).json({
        message: 'Không gửi được email tới Trưởng phòng / PHT. Vui lòng thử lại sau ít phút.',
      });
    }

    res.status(201).json({
      message: `Đăng ký thành công! Yêu cầu đã được gửi tới ${manager.fullName}. Khi được xác nhận, key kích hoạt sẽ được gửi tới ${normalizedEmail}.`,
    });
  } catch (error) {
    next(error);
  }
}

// ---- Own plans of self-registered Trưởng phòng / PHT accounts (public, no sign-in) ----

async function getAccountPlans(req, res, next) {
  try {
    res.json({ plans: await subscription.getPlans(), payosConfigured: payos.isConfigured() });
  } catch (error) {
    next(error);
  }
}

async function getAccountRenewal(req, res, next) {
  try {
    const user = await renewalAccount(req.query.token);
    res.json({
      fullName: user.fullName,
      email: maskEmail(user.email),
      status: user.status,
      accessExpiresAt: user.accessExpiresAt,
    });
  } catch (error) {
    next(error);
  }
}

async function createAccountOrder(req, res, next) {
  try {
    const user = await renewalAccount(req.body?.token);
    const order = await subscription.createOrder(req.body?.planCode, user, { account: user });
    res.status(201).json({ orderCode: order.orderCode, checkoutUrl: order.checkoutUrl });
  } catch (error) {
    next(error);
  }
}

// Called by the PayOS return page. Asks PayOS directly (so it works where PayOS cannot reach the
// webhook) and reports the result.
async function syncAccountOrder(req, res, next) {
  try {
    const code = Number(req.params.orderCode);
    assert(Number.isSafeInteger(code) && code > 0, 'Mã đơn không hợp lệ');
    const found = await DonThanhToan.findOne({ orderCode: code, kind: 'account' });
    assert(found, 'Không tìm thấy đơn thanh toán', 404);
    const order = await subscription.syncOrder(found);
    const user = await NguoiDung.findById(order.account).select('email accessExpiresAt');
    res.json({
      status: order.status,
      planName: order.planName,
      months: order.months,
      amount: order.amount,
      email: user ? maskEmail(user.email) : '',
      accessExpiresAt: order.status === ORDER_STATUS.PAID ? user?.accessExpiresAt : null,
    });
  } catch (error) {
    next(error);
  }
}

async function listRegistrations(req, res, next) {
  try {
    const users = await NguoiDung.find({ status: { $in: REGISTRATION_STATUSES } })
      .select(`${PRIVATE_FIELDS} -resetTokenExpires`)
      .populate('approvedBy', 'fullName')
      .sort({ createdAt: -1 });
    res.json(
      users.map((u) => ({
        ...u.toJSON(),
        status: WAITING_APPROVAL.includes(u.status) ? 'pending' : u.status,
        keyExpiresAt: u.status === 'awaiting_key' ? u.activationKeyExpires : null,
      })),
    );
  } catch (error) {
    next(error);
  }
}

// Issues a fresh activation key and emails it; approving again re-sends a new key.
async function approveRegistration(req, res, next) {
  try {
    const user = await findRegistration(req.params.id);
    const key = newActivationKey();
    user.status = 'awaiting_key';
    user.activationKeyHash = hashToken(normalizeKey(key));
    user.activationKeyExpires = new Date(Date.now() + ACTIVATION_KEY_DAYS * 24 * 60 * 60 * 1000);
    user.approvedBy = req.user.id;
    await user.save();
    const emailSent = await sendActivationKeyEmail({
      to: user.email,
      fullName: user.fullName,
      role: user.role,
      key,
      approvedBy: req.user.fullName,
      days: ACTIVATION_KEY_DAYS,
    });
    res.json({
      message: emailSent
        ? `Đã xác nhận và gửi key kích hoạt tới ${user.email}.`
        : 'Đã xác nhận nhưng không gửi được email. Hãy gửi key bên dưới cho người đăng ký.',
      emailSent,
      // Always returned: a provider can accept the email yet never deliver it, so the manager
      // can hand the key over another way.
      activationKey: key,
    });
  } catch (error) {
    next(error);
  }
}

async function rejectRegistration(req, res, next) {
  try {
    const user = await findRegistration(req.params.id);
    await user.deleteOne();
    await sendRegistrationRejectedEmail({ to: user.email, fullName: user.fullName });
    res.json({ message: `Đã từ chối yêu cầu đăng ký của ${user.fullName}.` });
  } catch (error) {
    next(error);
  }
}

// Always answers the same way so the form cannot be used to discover which emails exist.
async function forgotPassword(req, res, next) {
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
}

async function resetPassword(req, res, next) {
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
}

async function createStaff(req, res, next) {
  try {
    const { fullName, email, customPassword, role, managerId } = req.body;
    const phone = readPhone(req.body?.phone) ?? '';
    if (typeof fullName !== 'string' || !fullName.trim()) {
      return res.status(400).json({ message: 'Tên và email là bắt buộc' });
    }
    const normalizedEmail = readEmail(email);
    const rawPassword = chosenOrRandomPassword(customPassword);

    const existing = await NguoiDung.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ message: 'Email này đã tồn tại trong hệ thống' });
    }

    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    const assignedRole = ASSIGNABLE_ROLES.includes(role) ? role : 'staff';
    const unitManager = assignedRole === 'manager' ? null : await findUnitManager(managerId);

    const newStaff = new NguoiDung({
      fullName: fullName.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: assignedRole,
      phone,
      status: 'active',
    });
    newStaff.unitId = unitManager ? unitManager.unitId || unitManager._id : newStaff._id;

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
}

async function listStaff(req, res, next) {
  try {
    // Admins see every unit, with the manager who owns each account's unit.
    const staffs = await NguoiDung.find({ role: { $ne: 'admin' } })
      .select(PRIVATE_FIELDS)
      .populate(req.user.role === 'admin' ? { path: 'unitId', select: 'fullName email' } : [])
      .sort({ createdAt: -1 });
    res.json(staffs);
  } catch (error) {
    next(error);
  }
}

// Update staff info & optional password/role.
async function updateStaff(req, res, next) {
  try {
    const { fullName, email, password, role } = req.body;
    for (const value of [fullName, email, password, role])
      assert(value === undefined || typeof value === 'string', 'Invalid account details');
    const user = await NguoiDung.findById(req.params.id);
    if (!user || user.role === 'admin') {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản nhân viên' });
    }

    if (fullName) user.fullName = fullName.trim();
    const phone = readPhone(req.body?.phone);
    if (phone !== undefined) user.phone = phone;
    if (ASSIGNABLE_ROLES.includes(role) && role !== user.role) {
      await releaseRoleWork(user, req.user.id, 'Đổi vai trò tài khoản');
      user.role = role;
      user.managedClasses = [];
    }
    if (email) {
      const normalizedEmail = readEmail(email);
      const existing = await NguoiDung.findOne({
        email: normalizedEmail,
        _id: { $ne: req.params.id },
      });
      if (existing) {
        return res.status(400).json({ message: 'Email này đã thuộc về tài khoản khác' });
      }
      user.email = normalizedEmail;
    }
    if (password && password.trim()) {
      assertPassword(password.trim());
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      user.password = await bcrypt.hash(password.trim(), 10);
    }

    await user.save();
    res.json({
      message: 'Cập nhật thông tin nhân viên thành công!',
      staff: await NguoiDung.findById(user._id).select(PRIVATE_FIELDS),
    });
  } catch (error) {
    next(error);
  }
}

async function resetStaffPassword(req, res, next) {
  try {
    const { newPassword } = req.body;
    const user = await NguoiDung.findById(req.params.id);
    if (!user || user.role === 'admin') {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản nhân viên' });
    }

    const rawPassword = chosenOrRandomPassword(newPassword);
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
}

async function setStaffStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }

    // Admin accounts are never locked from here, so the system always keeps an administrator.
    const updated = await NguoiDung.findOneAndUpdate(
      { _id: req.params.id, role: { $ne: 'admin' } },
      { status, $inc: { tokenVersion: 1 } },
      { returnDocument: 'after', runValidators: true },
    ).select(PRIVATE_FIELDS);
    if (!updated) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }
    if (updated.role === 'staff' && status === 'inactive')
      await releaseStaffClasses(updated, req.user.id, 'Tài khoản nhân viên bị khóa');

    res.json({ message: 'Cập nhật trạng thái thành công', staff: updated });
  } catch (error) {
    next(error);
  }
}

async function deleteStaff(req, res, next) {
  try {
    const user = await NguoiDung.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản nhân viên' });
    }
    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Không thể xóa tài khoản Quản trị viên (Admin)' });
    }

    await releaseRoleWork(user, req.user.id, 'Tài khoản nhân viên bị xóa');
    await NguoiDung.findByIdAndDelete(req.params.id);
    res.json({ message: `Đã xóa vĩnh viễn tài khoản nhân viên ${user.fullName}!` });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  me,
  register,
  getAccountPlans,
  getAccountRenewal,
  createAccountOrder,
  syncAccountOrder,
  listRegistrations,
  approveRegistration,
  rejectRegistration,
  forgotPassword,
  resetPassword,
  createStaff,
  listStaff,
  updateStaff,
  resetStaffPassword,
  setStaffStatus,
  deleteStaff,
};
