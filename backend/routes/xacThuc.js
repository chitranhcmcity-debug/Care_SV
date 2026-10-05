const express = require('express');
const router = express.Router();
const {
  verifyToken,
  requireAdmin,
  requireSignedIn,
  requireRoles,
} = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienXacThuc');

// Self sign-up: Trưởng phòng / PHT approve new accounts, then the applicant enters the key.
const requireApprover = requireRoles('manager');

// POST /api/auth/login
router.post('/login', ctrl.login);

// GET /api/auth/me — the signed-in user and their current permissions, so the UI picks up
// changes an admin makes to the permission matrix without signing in again.
router.get('/me', verifyToken, requireSignedIn, ctrl.me);

// POST /api/auth/register (Public) — self sign-up.
router.post('/register', ctrl.register);

// ---- Own plans of self-registered Trưởng phòng / PHT accounts (public, no sign-in) ----

// GET /api/auth/account-plans — price list for the sign-up and renewal pages.
router.get('/account-plans', ctrl.getAccountPlans);

// GET /api/auth/account-renewal?token= — who the renewal link (from email or login) is for.
router.get('/account-renewal', ctrl.getAccountRenewal);

// POST /api/auth/account-orders — body: { token, planCode }; returns the PayOS checkout link.
router.post('/account-orders', ctrl.createAccountOrder);

// POST /api/auth/account-orders/:orderCode/sync — called by the PayOS return page.
router.post('/account-orders/:orderCode/sync', ctrl.syncAccountOrder);

// GET /api/auth/registrations (Trưởng phòng / PHT) — sign-ups waiting for approval or a key.
router.get('/registrations', verifyToken, requireApprover, ctrl.listRegistrations);

// POST /api/auth/registrations/:id/approve (Trưởng phòng / PHT)
router.post('/registrations/:id/approve', verifyToken, requireApprover, ctrl.approveRegistration);

// POST /api/auth/registrations/:id/reject (Trưởng phòng / PHT) — removes the sign-up.
router.post('/registrations/:id/reject', verifyToken, requireApprover, ctrl.rejectRegistration);

// POST /api/auth/forgot-password (Public)
router.post('/forgot-password', ctrl.forgotPassword);

// POST /api/auth/reset-password (Public) — completes the forgot-password flow.
router.post('/reset-password', ctrl.resetPassword);

// POST /api/auth/create-staff (Admin only)
router.post('/create-staff', verifyToken, requireAdmin, ctrl.createStaff);

// GET /api/auth/staff-list (Admin or Staff)
router.get('/staff-list', verifyToken, requireSignedIn, ctrl.listStaff);

// PUT /api/auth/staff/:id (Admin only - Update staff info & optional password/role)
router.put('/staff/:id', verifyToken, requireAdmin, ctrl.updateStaff);

// POST /api/auth/staff/:id/reset-password (Admin only - Reset Staff Password)
router.post('/staff/:id/reset-password', verifyToken, requireAdmin, ctrl.resetStaffPassword);

// PUT /api/auth/staff/:id/status (Admin only)
router.put('/staff/:id/status', verifyToken, requireAdmin, ctrl.setStaffStatus);

// DELETE /api/auth/staff/:id (Admin only - Delete Staff Account)
router.delete('/staff/:id', verifyToken, requireAdmin, ctrl.deleteStaff);

// Phân lớp phụ trách cho nhân viên CSSV: xem routes/phanCongLop.js (/api/class-assignments).

module.exports = router;
