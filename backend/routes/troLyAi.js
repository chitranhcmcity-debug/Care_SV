const express = require('express');
const router = express.Router();
const { verifyToken, requirePermission, requireSignedIn } = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienTroLyAi');

// GET /api/ai/care (every role) — AI Care profile for the signed-in user: what it helps with,
// which data it can look up for them, and suggested questions.
router.get('/care', verifyToken, requireSignedIn, ctrl.getCareProfile);

// POST /api/ai/care (every role) — role-aware assistant. ChatGPT (OpenAI) looks data up through tools that
// are filtered, and scoped, by the caller's role and permissions.
router.post('/care', verifyToken, requireSignedIn, ctrl.careChat);

// POST /api/ai/care/actions/:id/confirm — the user approved an action AI Care prepared.
router.post('/care/actions/:id/confirm', verifyToken, requireSignedIn, ctrl.confirmAction);

// POST /api/ai/care/actions/:id/cancel — the user dismissed it.
router.post('/care/actions/:id/cancel', verifyToken, requireSignedIn, ctrl.cancelAction);

// POST /api/ai/call-advice { careCaseId } (managers, or the staff member directed to the case)
// Suggests an opening line, questions to ask, and how to handle the situation.
router.post('/call-advice', verifyToken, requireSignedIn, ctrl.callAdvice);

// POST /api/ai/review-task-evidence (Admin only)
// Summarizes submitted evidence and suggests approve / needs-more-detail.
router.post(
  '/review-task-evidence',
  verifyToken,
  requirePermission('tasks.manage'),
  ctrl.reviewTaskEvidence,
);

// POST /api/ai/chat (Admin only) — stateless: the client resends the full
// conversation each turn, using the Responses API with explicit history.
router.post('/chat', verifyToken, requirePermission('ai.chat'), ctrl.adminChat);

// POST /api/ai/staff-performance { staffId, from?, to? } (Trưởng phòng / PHT)
// AI nhận xét năng lực nhân viên dựa trên số liệu khách quan (tiến độ, đúng hạn, chất lượng,
// chăm sóc sinh viên) kèm KPI tham khảo do hệ thống tính.
router.post(
  '/staff-performance',
  verifyToken,
  requirePermission('tasks.manage'),
  ctrl.staffPerformance,
);

module.exports = router;
