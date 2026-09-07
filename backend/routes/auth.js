const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const { verifyToken, requireAdmin, requireStaffOrAdmin } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ message: 'Tài khoản hoặc mật khẩu không chính xác' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị vô hiệu hóa' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Tài khoản hoặc mật khẩu không chính xác' });
    }

    const token = jwt.sign(
      { id: user._id, fullName: user.fullName, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'supersecretjwtkey_itc_care_2026',
      { expiresIn: '7d' }
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
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Lỗi máy chủ nội bộ' });
  }
});

// POST /api/auth/create-staff (Admin only)
router.post('/create-staff', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { fullName, email, customPassword, role } = req.body;
    if (!fullName || !email) {
      return res.status(400).json({ message: 'Tên và email là bắt buộc' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ message: 'Email này đã tồn tại trong hệ thống' });
    }

    // Custom password or generate random 8-character hex password
    const rawPassword = customPassword && customPassword.trim() ? customPassword.trim() : crypto.randomBytes(4).toString('hex');
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    const assignedRole = role && ['staff', 'teacher'].includes(role) ? role : 'staff';

    const newStaff = new User({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: assignedRole,
      status: 'active',
    });

    await newStaff.save();

    // Nodemailer fallback mechanism
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: false,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        await transporter.sendMail({
          from: `"Hệ thống Quản lý ITC Care" <${smtpUser}>`,
          to: email,
          subject: '[ITC Care] Thông tin tài khoản nhân sự mới',
          html: `
            <h3>Xin chào ${fullName},</h3>
            <p>Tài khoản nhân sự của bạn trên <b>Hệ thống Chăm sóc Sinh viên ITC</b> đã được khởi tạo:</p>
            <ul>
              <li><b>Email:</b> ${email}</li>
              <li><b>Mật khẩu đăng nhập:</b> <code>${rawPassword}</code></li>
              <li><b>Vai trò:</b> ${assignedRole === 'teacher' ? 'Giảng viên' : 'Nhân viên CSKH'}</li>
            </ul>
            <p>Vui lòng đăng nhập và đổi mật khẩu khi cần thiết.</p>
          `,
        });
        console.log(` [Nodemailer] Đã gửi email tài khoản tới ${email}`);
      } catch (mailErr) {
        console.warn(' [Nodemailer Fallback] Không thể gửi email qua SMTP:', mailErr.message);
        console.log(` [CONSOLE CREDENTIALS] Email: ${email} | Password: ${rawPassword}`);
      }
    } else {
      console.log(' [Nodemailer Fallback - No SMTP] Mật khẩu tài khoản nhân sự mới:');
      console.log(` [STAFF CREATED] Email: ${email} | Mật khẩu: ${rawPassword}`);
    }

    res.status(201).json({
      message: `Tạo tài khoản ${assignedRole === 'teacher' ? 'Giảng viên' : 'Nhân viên CSKH'} thành công!`,
      staff: {
        id: newStaff._id,
        fullName: newStaff.fullName,
        email: newStaff.email,
        role: newStaff.role,
        status: newStaff.status,
      },
      generatedPassword: rawPassword,
    });
  } catch (error) {
    console.error('Create staff error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo tài khoản nhân viên' });
  }
});

// GET /api/auth/staff-list (Admin or Staff)
router.get('/staff-list', verifyToken, requireStaffOrAdmin, async (req, res) => {
  try {
    const staffs = await User.find({ role: { $ne: 'admin' } }).select('-password').sort({ createdAt: -1 });
    res.json(staffs);
  } catch (error) {
    res.status(500).json({ message: 'Không thể lấy danh sách nhân viên' });
  }
});

// PUT /api/auth/staff/:id (Admin only - Update staff info & optional password/role)
router.put('/staff/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;
    const user = await User.findById(req.params.id);
    if (!user || user.role === 'admin') {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản nhân viên' });
    }

    if (fullName) user.fullName = fullName.trim();
    if (role && ['staff', 'teacher'].includes(role)) user.role = role;
    if (email) {
      const existing = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: req.params.id } });
      if (existing) {
        return res.status(400).json({ message: 'Email này đã thuộc về tài khoản khác' });
      }
      user.email = email.toLowerCase().trim();
    }
    if (password && password.trim()) {
      user.password = await bcrypt.hash(password.trim(), 10);
    }

    await user.save();
    res.json({ message: 'Cập nhật thông tin nhân viên thành công!', staff: user });
  } catch (error) {
    console.error('Update staff error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật thông tin nhân viên' });
  }
});

// POST /api/auth/staff/:id/reset-password (Admin only - Reset Staff Password)
router.post('/staff/:id/reset-password', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const user = await User.findById(req.params.id);
    if (!user || user.role === 'admin') {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản nhân viên' });
    }

    const rawPassword = newPassword && newPassword.trim() ? newPassword.trim() : crypto.randomBytes(4).toString('hex');
    user.password = await bcrypt.hash(rawPassword, 10);
    await user.save();

    res.json({
      message: `Đã đặt lại mật khẩu cho nhân viên ${user.fullName} thành công!`,
      newPassword: rawPassword,
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Lỗi khi đặt lại mật khẩu nhân viên' });
  }
});

// PUT /api/auth/staff/:id/status (Admin only)
router.put('/staff/:id/status', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }

    const updated = await User.findByIdAndUpdate(req.params.id, { status }, { new: true }).select('-password');
    if (!updated) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    res.json({ message: 'Cập nhật trạng thái thành công', staff: updated });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái nhân viên' });
  }
});

// DELETE /api/auth/staff/:id (Admin only - Delete Staff Account)
router.delete('/staff/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản nhân viên' });
    }
    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Không thể xóa tài khoản Quản trị viên (Admin)' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: `Đã xóa vĩnh viễn tài khoản nhân viên ${user.fullName}!` });
  } catch (error) {
    console.error('Delete staff error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa tài khoản nhân viên' });
  }
});

// GET /api/auth/class-assignments (Admin/Staff: Get staff class & student assignments + all available classes & students)
router.get('/class-assignments', verifyToken, requireStaffOrAdmin, async (req, res) => {
  try {
    const Student = require('../models/Student');
    const staffs = await User.find({ role: 'staff' })
      .select('fullName email status managedClasses managedStudents')
      .populate('managedStudents', 'studentCode fullName classCode major')
      .sort({ fullName: 1 });

    const availableClasses = await Student.distinct('classCode');
    const allStudents = await Student.find().select('studentCode fullName classCode major').sort({ studentCode: 1 });

    res.json({
      staffs,
      availableClasses: availableClasses.filter(Boolean).sort(),
      allStudents,
    });
  } catch (error) {
    console.error('Fetch class assignments error:', error);
    res.status(500).json({ message: 'Không thể lấy danh sách phân công' });
  }
});

// PUT /api/auth/staff/:id/managed-classes (Admin: Assign fixed home classes to a staff member)
router.put('/staff/:id/managed-classes', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { managedClasses } = req.body;
    if (!Array.isArray(managedClasses)) {
      return res.status(400).json({ message: 'Danh sách lớp phải là một mảng' });
    }

    const staff = await User.findById(req.params.id);
    if (!staff || staff.role !== 'staff') {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản nhân viên' });
    }

    staff.managedClasses = managedClasses.map((c) => String(c).trim().toUpperCase());
    await staff.save();

    const updatedStaff = await User.findById(staff._id)
      .select('fullName email status managedClasses managedStudents')
      .populate('managedStudents', 'studentCode fullName classCode major');

    res.json({
      message: `Đã gán ${staff.managedClasses.length} lớp sinh hoạt cố định cho ${staff.fullName}!`,
      staff: updatedStaff,
    });
  } catch (error) {
    console.error('Assign managed classes error:', error);
    res.status(500).json({ message: 'Lỗi khi gán lớp sinh hoạt cố định' });
  }
});

// PUT /api/auth/staff/:id/managed-students (Admin: Assign individual exception students to a staff member)
router.put('/staff/:id/managed-students', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { managedStudentIds } = req.body;
    if (!Array.isArray(managedStudentIds)) {
      return res.status(400).json({ message: 'Danh sách sinh viên phải là một mảng' });
    }

    const staff = await User.findById(req.params.id);
    if (!staff || staff.role !== 'staff') {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản nhân viên' });
    }

    staff.managedStudents = managedStudentIds;
    await staff.save();

    const updatedStaff = await User.findById(staff._id)
      .select('fullName email status managedClasses managedStudents')
      .populate('managedStudents', 'studentCode fullName classCode major');

    res.json({
      message: `Đã gán ${staff.managedStudents.length} sinh viên ngoại lệ cá nhân cho ${staff.fullName}!`,
      staff: updatedStaff,
    });
  } catch (error) {
    console.error('Assign managed students error:', error);
    res.status(500).json({ message: 'Lỗi khi gán sinh viên ngoại lệ cá nhân' });
  }
});

// POST /api/auth/transfer-classes (Admin: Handover / Transfer managed classes & open call tasks from Staff A to Staff B)
router.post('/transfer-classes', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { fromStaffId, toStaffId, classCodes } = req.body;

    if (!fromStaffId || !toStaffId) {
      return res.status(400).json({ message: 'Vui lòng chọn Nhân viên chuyển giao và Nhân viên tiếp nhận' });
    }
    if (fromStaffId === toStaffId) {
      return res.status(400).json({ message: 'Nhân viên chuyển giao và tiếp nhận phải khác nhau' });
    }

    const fromStaff = await User.findById(fromStaffId);
    const toStaff = await User.findById(toStaffId);

    if (!fromStaff || !toStaff) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin nhân viên' });
    }

    const classesToTransfer = Array.isArray(classCodes) && classCodes.length > 0
      ? classCodes.map(c => String(c).trim().toUpperCase())
      : (fromStaff.managedClasses || []);

    if (classesToTransfer.length === 0) {
      return res.status(400).json({ message: 'Không có lớp nào để bàn giao' });
    }

    // Update managedClasses for fromStaff and toStaff
    fromStaff.managedClasses = (fromStaff.managedClasses || []).filter(c => !classesToTransfer.includes(c));
    const newToClasses = new Set([...(toStaff.managedClasses || []), ...classesToTransfer]);
    toStaff.managedClasses = Array.from(newToClasses);

    await fromStaff.save();
    await toStaff.save();

    // Reassign open CallTasks belonging to students of these classes
    const Student = require('../models/Student');
    const CallTask = require('../models/CallTask');

    const studentsInClasses = await Student.find({ classCode: { $in: classesToTransfer } }).select('_id');
    const studentIds = studentsInClasses.map(s => s._id);

    let reassignedTaskCount = 0;
    if (studentIds.length > 0) {
      const updateResult = await CallTask.updateMany(
        {
          assignedStaffId: fromStaff._id,
          studentId: { $in: studentIds },
          status: { $in: ['Chưa gọi', 'Không bắt máy'] },
        },
        { assignedStaffId: toStaff._id }
      );
      reassignedTaskCount = updateResult.modifiedCount || 0;
    }

    res.json({
      message: `🔄 Bàn giao thành công ${classesToTransfer.length} lớp (${classesToTransfer.join(', ')}) và ${reassignedTaskCount} nhiệm vụ cuộc gọi chưa xong từ ${fromStaff.fullName} sang ${toStaff.fullName}!`,
      transferredClasses: classesToTransfer,
      reassignedTaskCount,
      fromStaff: { _id: fromStaff._id, fullName: fromStaff.fullName, managedClasses: fromStaff.managedClasses },
      toStaff: { _id: toStaff._id, fullName: toStaff.fullName, managedClasses: toStaff.managedClasses },
    });
  } catch (error) {
    console.error('Transfer classes error:', error);
    res.status(500).json({ message: 'Lỗi khi bàn giao lớp nhân sự' });
  }
});

module.exports = router;
