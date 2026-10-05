const express = require('express');
const router = express.Router();
const {
  verifyToken,
  requireAdmin,
  requireSignedIn,
  requireRoles,
} = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienXacThuc');

// Tự đăng ký: Trưởng phòng / PHT duyệt tài khoản mới, rồi người đăng ký nhập key.
const requireApprover = requireRoles('manager');

// POST /api/auth/login
router.post('/login', ctrl.login);

// GET /api/auth/me — người dùng đang đăng nhập và quyền hiện tại, để giao diện nhận
// thay đổi admin sửa trong ma trận phân quyền mà không cần đăng nhập lại.
router.get('/me', verifyToken, requireSignedIn, ctrl.me);

// POST /api/auth/register (công khai) — tự đăng ký.
router.post('/register', ctrl.register);

// ---- Gói riêng của tài khoản Trưởng phòng / PHT tự đăng ký (công khai, không cần đăng nhập) ----

// GET /api/auth/account-plans — bảng giá cho trang đăng ký và gia hạn.
router.get('/account-plans', ctrl.getAccountPlans);

// GET /api/auth/account-renewal?token= — link gia hạn (từ email hoặc đăng nhập) dành cho ai.
router.get('/account-renewal', ctrl.getAccountRenewal);

// POST /api/auth/account-orders — body: { token, planCode }; trả về link thanh toán PayOS.
router.post('/account-orders', ctrl.createAccountOrder);

// POST /api/auth/account-orders/:orderCode/sync — gọi bởi trang quay về từ PayOS.
router.post('/account-orders/:orderCode/sync', ctrl.syncAccountOrder);

// GET /api/auth/registrations (Trưởng phòng / PHT) — các đăng ký đang chờ duyệt hoặc chờ key.
router.get('/registrations', verifyToken, requireApprover, ctrl.listRegistrations);

// POST /api/auth/registrations/:id/approve (Trưởng phòng / PHT)
router.post('/registrations/:id/approve', verifyToken, requireApprover, ctrl.approveRegistration);

// POST /api/auth/registrations/:id/reject (Trưởng phòng / PHT) — xóa đăng ký.
router.post('/registrations/:id/reject', verifyToken, requireApprover, ctrl.rejectRegistration);

// POST /api/auth/forgot-password (công khai)
router.post('/forgot-password', ctrl.forgotPassword);

// POST /api/auth/reset-password (công khai) — hoàn tất luồng quên mật khẩu.
router.post('/reset-password', ctrl.resetPassword);

// POST /api/auth/create-staff (chỉ Admin)
router.post('/create-staff', verifyToken, requireAdmin, ctrl.createStaff);

// GET /api/auth/staff-list (Admin hoặc Nhân viên)
router.get('/staff-list', verifyToken, requireSignedIn, ctrl.listStaff);

// PUT /api/auth/staff/:id (chỉ Admin - cập nhật thông tin nhân viên, mật khẩu/vai trò tùy chọn)
router.put('/staff/:id', verifyToken, requireAdmin, ctrl.updateStaff);

// POST /api/auth/staff/:id/reset-password (chỉ Admin - đặt lại mật khẩu nhân viên)
router.post('/staff/:id/reset-password', verifyToken, requireAdmin, ctrl.resetStaffPassword);

// PUT /api/auth/staff/:id/status (chỉ Admin)
router.put('/staff/:id/status', verifyToken, requireAdmin, ctrl.setStaffStatus);

// DELETE /api/auth/staff/:id (chỉ Admin - xóa tài khoản nhân viên)
router.delete('/staff/:id', verifyToken, requireAdmin, ctrl.deleteStaff);

// Phân lớp phụ trách cho nhân viên CSSV: xem routes/phanCongLop.js (/api/class-assignments).

module.exports = router;
