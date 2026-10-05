// Hồ sơ chăm sóc sinh viên — xem controllers/dieuKhienHoSoChamSoc.js cho quy tắc theo vai trò.
const express = require('express');
const router = express.Router();
const { verifyToken, requireSignedIn } = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienHoSoChamSoc');

const { loadCase, requireWork, requireManage, requireOpen } = ctrl;

router.use(verifyToken, requireSignedIn);

// GET /api/care-cases?status=open|closed|<code>&q=&mine=1
router.get('/', ctrl.list);

// GET /api/care-cases/summary — counts for badges and the dashboard.
router.get('/summary', ctrl.getSummary);

// GET /api/care-cases/staff — CSSV staff a manager can direct, with their open case load.
router.get('/staff', ctrl.requireManageRead, ctrl.listStaff);

// GET /api/care-cases/student/:studentId — the student's open case (if any) and history.
router.get('/student/:studentId', ctrl.listForStudent);

// POST /api/care-cases — body { studentId, reason, assignedStaffId?, directive?, dueDate? }.
// A manager naming a staff member opens it directed; everyone else proposes it.
router.post('/', ctrl.create);

// GET /api/care-cases/:id
router.get('/:id', loadCase, ctrl.getOne);

// PUT /api/care-cases/:id/direct — a manager directs (or re-directs) a staff member.
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

// POST /api/care-cases/:id/ai-steps — AI Care suggests care steps (not saved; the user picks).
router.post('/:id/ai-steps', loadCase, requireWork, requireOpen, ctrl.suggestSteps);

// POST /api/care-cases/:id/close-request — staff reports the outcome and asks to close.
router.post('/:id/close-request', loadCase, requireWork, requireOpen, ctrl.requestClose);

// POST /api/care-cases/:id/close — manager approves, sends back, or closes directly.
router.post('/:id/close', loadCase, requireManage, requireOpen, ctrl.close);

module.exports = router;
