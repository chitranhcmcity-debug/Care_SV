// Hồ sơ chăm sóc sinh viên — xem controllers/dieuKhienHoSoChamSoc.js cho quy tắc theo vai trò.
const express = require('express');
const router = express.Router();
const { verifyToken, requireSignedIn } = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienHoSoChamSoc');

const { loadCase, requireWork, requireManage, requireOpen } = ctrl;

router.use(verifyToken, requireSignedIn);

// GET /api/care-cases?status=open|closed|<code>&q=&mine=1
router.get('/', ctrl.list);

// GET /api/care-cases/summary — số lượng cho huy hiệu và bảng điều khiển.
router.get('/summary', ctrl.getSummary);

// GET /api/care-cases/staff — nhân viên CSSV mà quản lý có thể chỉ đạo, kèm số hồ sơ đang mở.
router.get('/staff', ctrl.requireManageRead, ctrl.listStaff);

// GET /api/care-cases/student/:studentId — hồ sơ đang mở của sinh viên (nếu có) và lịch sử.
router.get('/student/:studentId', ctrl.listForStudent);

// POST /api/care-cases — body { studentId, reason, assignedStaffId?, directive?, dueDate? }.
// Quản lý nêu tên nhân viên thì hồ sơ mở ở dạng có chỉ đạo; người khác thì đề xuất.
router.post('/', ctrl.create);

// GET /api/care-cases/:id
router.get('/:id', loadCase, ctrl.getOne);

// PUT /api/care-cases/:id/direct — quản lý chỉ đạo (hoặc chỉ đạo lại) một nhân viên.
router.put('/:id/direct', loadCase, requireManage, requireOpen, ctrl.direct);

// POST /api/care-cases/:id/steps — body { title, source?: 'ai' }.
router.post('/:id/steps', loadCase, requireWork, requireOpen, ctrl.addStep);

// PUT /api/care-cases/:id/steps/:stepId — body { done?, note?, title? }.
router.put('/:id/steps/:stepId', loadCase, requireWork, requireOpen, ctrl.updateStep);

// DELETE /api/care-cases/:id/steps/:stepId
router.delete('/:id/steps/:stepId', loadCase, requireWork, requireOpen, ctrl.removeStep);

// PUT /api/care-cases/:id/findings — body { cause?, solution? }.
router.put('/:id/findings', loadCase, requireWork, requireOpen, ctrl.updateFindings);

// POST /api/care-cases/:id/notes — body { kind: 'trao_doi' | 'kho_khan' | 'chi_dao', text }.
router.post('/:id/notes', loadCase, requireWork, ctrl.addNote);

// POST /api/care-cases/:id/ai-steps — AI Care gợi ý các bước chăm sóc (chưa lưu; người dùng tự chọn).
router.post('/:id/ai-steps', loadCase, requireWork, requireOpen, ctrl.suggestSteps);

// POST /api/care-cases/:id/close-request — nhân viên báo cáo kết quả và đề nghị kết thúc.
router.post('/:id/close-request', loadCase, requireWork, requireOpen, ctrl.requestClose);

// POST /api/care-cases/:id/close — quản lý duyệt, trả lại, hoặc kết thúc trực tiếp.
router.post('/:id/close', loadCase, requireManage, requireOpen, ctrl.close);

module.exports = router;
