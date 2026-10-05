const express = require('express');
const router = express.Router();
const { verifyToken, requirePermission, requireSignedIn } = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienTroLyAi');

// GET /api/ai/care (mọi vai trò) — hồ sơ AI Care của người dùng đã đăng nhập: hỗ trợ việc gì,
// tra cứu được dữ liệu nào cho họ, và các câu hỏi gợi ý.
router.get('/care', verifyToken, requireSignedIn, ctrl.getCareProfile);

// POST /api/ai/care (mọi vai trò) — trợ lý theo vai trò. ChatGPT (OpenAI) tra cứu dữ liệu qua các công cụ được
// lọc và giới hạn phạm vi theo vai trò và quyền của người gọi.
router.post('/care', verifyToken, requireSignedIn, ctrl.careChat);

// POST /api/ai/care/actions/:id/confirm — người dùng đã đồng ý một thao tác AI Care chuẩn bị.
router.post('/care/actions/:id/confirm', verifyToken, requireSignedIn, ctrl.confirmAction);

// POST /api/ai/care/actions/:id/cancel — người dùng đã bỏ qua.
router.post('/care/actions/:id/cancel', verifyToken, requireSignedIn, ctrl.cancelAction);

// POST /api/ai/call-advice { careCaseId } (quản lý, hoặc nhân viên được chỉ đạo hồ sơ)
// Gợi ý câu mở đầu, các câu hỏi nên hỏi và cách xử lý tình huống.
router.post('/call-advice', verifyToken, requireSignedIn, ctrl.callAdvice);

// POST /api/ai/review-task-evidence (chỉ Admin)
// Tóm tắt minh chứng đã nộp và đề xuất duyệt / cần làm rõ thêm.
router.post(
  '/review-task-evidence',
  verifyToken,
  requirePermission('tasks.manage'),
  ctrl.reviewTaskEvidence,
);

// POST /api/ai/chat (chỉ Admin) — không lưu trạng thái: client gửi lại toàn bộ
// cuộc trò chuyện mỗi lượt, dùng Responses API với lịch sử tường minh.
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
