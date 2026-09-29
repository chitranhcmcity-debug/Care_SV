// Hồ sơ chăm sóc sinh viên.
// - Trưởng phòng / PHT (care.manage): xem mọi hồ sơ, chỉ đạo nhân viên, tạo bước, phản hồi,
//   duyệt hoặc tự kết thúc hồ sơ. Admin chỉ xem.
// - Nhân viên CSKH (care.work): làm hồ sơ được giao — tick các bước, ghi nguyên nhân / hướng giải
//   quyết, gọi điện, báo khó khăn, đề nghị kết thúc.
// - Ai có care.propose (giảng viên, nhân viên) đề xuất mở hồ sơ cho sinh viên mình phụ trách.
const express = require('express');
const router = express.Router();
const HoSoChamSoc = require('../models/HoSoChamSoc');
const SinhVien = require('../models/SinhVien');
const NguoiDung = require('../models/NguoiDung');
const DiemDanh = require('../models/DiemDanh');
const CuocGoi = require('../models/CuocGoi');
const aiService = require('../services/dichVuTroLyAi');
const { openCase, openCaseOf } = require('../services/dichVuHoSoChamSoc');
const { verifyToken, requireSignedIn } = require('../middleware/xacThuc');
const { canAccessStudent } = require('../middleware/phanQuyen');
const { can } = require('../services/dichVuPhanQuyen');
const { assert, validateId } = require('../utils/kiemTra');
const {
  CARE_STATUS,
  CARE_STATUSES,
  OPEN_CARE_STATUSES,
  CARE_RESULTS,
  CARE_RESULT_LABEL,
  toLabel,
} = require('../utils/hangSo');

const text = (value, max, label) => {
  assert(value === undefined || typeof value === 'string', `${label} không hợp lệ`);
  const trimmed = (value ?? '').trim();
  assert(trimmed.length <= max, `${label} tối đa ${max} ký tự`);
  return trimmed;
};
const optionalDate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  assert(!Number.isNaN(Date.parse(value)), 'Ngày không hợp lệ');
  return new Date(value);
};

const isManager = (user) => can(user, 'care.manage');
/** Id of a ref that may already be populated. */
const idOf = (ref) => String(ref?._id ?? ref);
const isOwner = (user, careCase) =>
  can(user, 'care.work') && idOf(careCase.assignedStaffId) === user.id;
/** Business actions are for managers and the assigned staff member; the admin only reads. */
const canWork = (user, careCase) =>
  user.role !== 'admin' && (isManager(user) || isOwner(user, careCase));
const canRead = (user, careCase) =>
  isManager(user) ||
  isOwner(user, careCase) ||
  (careCase.proposedBy && idOf(careCase.proposedBy) === user.id);

const detailPopulation = [
  { path: 'studentId', select: 'studentCode fullName classCode major phone parentPhone tags' },
  { path: 'assignedStaffId', select: 'fullName email' },
  { path: 'directedBy', select: 'fullName role' },
  { path: 'proposedBy', select: 'fullName role' },
  { path: 'notes.authorId', select: 'fullName role' },
  { path: 'closing.proposedBy', select: 'fullName' },
  { path: 'closing.approvedBy', select: 'fullName' },
];

async function loadCase(req, res, next) {
  try {
    validateId(req.params.id);
    const careCase = await HoSoChamSoc.findById(req.params.id);
    assert(careCase, 'Không tìm thấy hồ sơ chăm sóc', 404);
    assert(canRead(req.user, careCase), 'Bạn không có quyền xem hồ sơ này', 403);
    req.careCase = careCase;
    next();
  } catch (error) {
    next(error);
  }
}
const requireWork = (req, res, next) =>
  canWork(req.user, req.careCase)
    ? next()
    : res.status(403).json({ message: 'Bạn không được giao hồ sơ này' });
const requireManage = (req, res, next) =>
  isManager(req.user) && req.user.role !== 'admin'
    ? next()
    : res.status(403).json({ message: 'Chỉ Trưởng phòng / Phó hiệu trưởng thực hiện được' });
const requireOpen = (req, res, next) =>
  req.careCase.status === CARE_STATUS.CLOSED
    ? res.status(400).json({ message: 'Hồ sơ đã kết thúc' })
    : next();

/** Full case for the detail view, with its calls and which recordings the viewer may play. */
async function detail(careCase, user) {
  const [populated, calls] = await Promise.all([
    careCase.populate(detailPopulation),
    CuocGoi.find({ careCaseId: careCase._id })
      .populate('callerId', 'fullName role')
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  const hearAll = can(user, 'recordings.viewAll');
  return {
    ...populated.toObject(),
    calls: calls.map((c) => ({
      ...c,
      canPlay:
        Boolean(c.recording || (c.record && c.stringeeCallId)) &&
        (hearAll || String(c.callerId?._id) === user.id),
    })),
    permissions: {
      manage: isManager(user) && user.role !== 'admin',
      work: canWork(user, careCase),
    },
  };
}

const note = (req, kind, value, extra = {}) => ({
  kind,
  text: value,
  authorId: req.user.id,
  ...extra,
});

router.use(verifyToken, requireSignedIn);

// GET /api/care-cases?status=open|closed|<code>&q=&mine=1 — managers see every case, staff their
// own, proposers the cases they proposed.
router.get('/', async (req, res, next) => {
  try {
    const { status = 'open', q, mine } = req.query;
    const filter = {};
    if (status === 'open') filter.status = { $in: [...OPEN_CARE_STATUSES] };
    else if (status === 'closed') filter.status = CARE_STATUS.CLOSED;
    else if (CARE_STATUSES.includes(status)) filter.status = status;
    if (!isManager(req.user) || mine === '1') {
      filter.$or = [{ proposedBy: req.user.id }];
      if (can(req.user, 'care.work')) filter.$or.push({ assignedStaffId: req.user.id });
    }
    if (typeof q === 'string' && q.trim()) {
      const pattern = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const students = await SinhVien.find({
        $or: [{ fullName: pattern }, { studentCode: pattern }, { classCode: pattern }],
      }).select('_id');
      filter.studentId = { $in: students.map((s) => s._id) };
    }
    const items = await HoSoChamSoc.find(filter)
      .select('-notes')
      .populate('studentId', 'studentCode fullName classCode')
      .populate('assignedStaffId', 'fullName')
      .populate('proposedBy', 'fullName role')
      .sort({ updatedAt: -1 })
      .limit(300)
      .lean();
    res.json({
      items: items.map((c) => ({
        ...c,
        stepsDone: c.steps.filter((s) => s.done).length,
        stepsTotal: c.steps.length,
        steps: undefined,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/care-cases/summary — counts for badges and the dashboard.
router.get('/summary', async (req, res, next) => {
  try {
    const scope = isManager(req.user) ? {} : { assignedStaffId: req.user.id };
    const rows = await HoSoChamSoc.aggregate([
      { $match: scope },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const counts = Object.fromEntries(CARE_STATUSES.map((s) => [s, 0]));
    for (const r of rows) counts[r._id] = r.count;
    res.json({ counts, open: OPEN_CARE_STATUSES.reduce((sum, s) => sum + counts[s], 0) });
  } catch (error) {
    next(error);
  }
});

// GET /api/care-cases/staff — CSKH staff a manager can direct, with their open case load.
router.get('/staff', requireManageRead, async (req, res, next) => {
  try {
    const [staffs, load] = await Promise.all([
      NguoiDung.find({ role: 'staff', status: 'active' })
        .select('fullName email managedClasses')
        .sort({ fullName: 1 })
        .lean(),
      HoSoChamSoc.aggregate([
        { $match: { status: { $in: [...OPEN_CARE_STATUSES] }, assignedStaffId: { $ne: null } } },
        { $group: { _id: '$assignedStaffId', count: { $sum: 1 } } },
      ]),
    ]);
    const loadMap = new Map(load.map((l) => [String(l._id), l.count]));
    res.json(staffs.map((s) => ({ ...s, openCases: loadMap.get(String(s._id)) || 0 })));
  } catch (error) {
    next(error);
  }
});
function requireManageRead(req, res, next) {
  return isManager(req.user)
    ? next()
    : res.status(403).json({ message: 'Bạn không có quyền xem mục này' });
}

// GET /api/care-cases/student/:studentId — the student's open case (if any) and history.
router.get('/student/:studentId', async (req, res, next) => {
  try {
    validateId(req.params.studentId);
    const student = await SinhVien.findById(req.params.studentId);
    assert(student, 'Không tìm thấy sinh viên', 404);
    assert(
      await canAccessStudent(req.user, student),
      'Bạn không được phân công sinh viên này',
      403,
    );
    const cases = await HoSoChamSoc.find({ studentId: student._id })
      .select('status source reason assignedStaffId closing createdAt updatedAt')
      .populate('assignedStaffId', 'fullName')
      .sort({ createdAt: -1 })
      .lean();
    res.json(cases);
  } catch (error) {
    next(error);
  }
});

// POST /api/care-cases — body { studentId, reason, assignedStaffId?, directive?, dueDate? }.
// A manager naming a staff member opens it directed; everyone else proposes it.
router.post('/', async (req, res, next) => {
  try {
    assert(req.user.role !== 'admin', 'Quản trị viên chỉ được xem hồ sơ', 403);
    assert(
      can(req.user, 'care.propose') || isManager(req.user),
      'Bạn không có quyền đề xuất chăm sóc',
      403,
    );
    const { studentId, assignedStaffId, dueDate } = req.body ?? {};
    const reason = text(req.body?.reason, 2000, 'Lý do');
    const directive = text(req.body?.directive, 4000, 'Chỉ đạo');
    assert(reason, 'Nhập lý do cần chăm sóc');
    validateId(studentId);
    const student = await SinhVien.findById(studentId);
    assert(student, 'Không tìm thấy sinh viên', 404);
    assert(
      await canAccessStudent(req.user, student),
      'Bạn không được phân công sinh viên này',
      403,
    );
    const existing = await openCaseOf(student._id);
    if (existing)
      return res
        .status(409)
        .json({ message: 'Sinh viên đã có hồ sơ chăm sóc đang mở', caseId: existing._id });

    let staff = null;
    if (assignedStaffId) {
      assert(isManager(req.user), 'Chỉ cấp quản lý được chỉ đạo nhân viên', 403);
      staff = await activeStaff(assignedStaffId);
    }
    const { careCase } = await openCase({
      student,
      source: isManager(req.user) && req.body?.fromTask ? 'giao_viec' : 'de_xuat',
      reason,
      by: req.user.id,
      assignedStaff: staff,
      directive,
      dueDate: optionalDate(dueDate),
    });
    res.status(201).json(await detail(careCase, req.user));
  } catch (error) {
    next(error);
  }
});

async function activeStaff(id) {
  validateId(id);
  const staff = await NguoiDung.findById(id);
  assert(
    staff && staff.role === 'staff' && staff.status === 'active',
    'Chỉ giao cho nhân viên CSKH đang hoạt động',
  );
  return staff;
}

// GET /api/care-cases/:id
router.get('/:id', loadCase, async (req, res, next) => {
  try {
    res.json(await detail(req.careCase, req.user));
  } catch (error) {
    next(error);
  }
});

// PUT /api/care-cases/:id/direct — body { assignedStaffId, directive?, dueDate? }: a manager
// directs (or re-directs) a staff member to care for the student.
router.put('/:id/direct', loadCase, requireManage, requireOpen, async (req, res, next) => {
  try {
    const c = req.careCase;
    const staff = await activeStaff(req.body?.assignedStaffId);
    const directive = text(req.body?.directive, 4000, 'Chỉ đạo');
    const changed = String(c.assignedStaffId) !== String(staff._id);
    c.assignedStaffId = staff._id;
    c.directedBy = req.user.id;
    c.directedAt = new Date();
    if (req.body?.dueDate !== undefined) c.dueDate = optionalDate(req.body.dueDate);
    if (directive) c.directive = directive;
    if (c.status === CARE_STATUS.AWAITING) c.status = CARE_STATUS.IN_PROGRESS;
    if (changed) c.notes.push(note(req, 'su_kien', `Chỉ đạo ${staff.fullName} chăm sóc`));
    if (directive) c.notes.push(note(req, 'chi_dao', directive));
    await c.save();
    res.json(await detail(c, req.user));
  } catch (error) {
    next(error);
  }
});

// POST /api/care-cases/:id/steps — body { title, source?: 'ai' }.
router.post('/:id/steps', loadCase, requireWork, requireOpen, async (req, res, next) => {
  try {
    const title = text(req.body?.title, 300, 'Tên bước');
    assert(title, 'Nhập tên bước chăm sóc');
    const source = req.body?.source === 'ai' ? 'ai' : isManager(req.user) ? 'quan_ly' : 'nhan_vien';
    req.careCase.steps.push({ title, source });
    await req.careCase.save();
    res.status(201).json(await detail(req.careCase, req.user));
  } catch (error) {
    next(error);
  }
});

// PUT /api/care-cases/:id/steps/:stepId — body { done?, note?, title? }.
router.put('/:id/steps/:stepId', loadCase, requireWork, requireOpen, async (req, res, next) => {
  try {
    const step = req.careCase.steps.id(req.params.stepId);
    assert(step, 'Không tìm thấy bước chăm sóc', 404);
    const { done } = req.body ?? {};
    if (req.body?.title !== undefined) {
      const title = text(req.body.title, 300, 'Tên bước');
      assert(title, 'Nhập tên bước chăm sóc');
      step.title = title;
    }
    if (req.body?.note !== undefined) step.note = text(req.body.note, 2000, 'Ghi chú');
    if (typeof done === 'boolean' && done !== step.done) {
      step.done = done;
      step.doneAt = done ? new Date() : null;
      req.careCase.notes.push(
        note(req, 'su_kien', `${done ? 'Hoàn thành' : 'Mở lại'} bước: ${step.title}`),
      );
    }
    await req.careCase.save();
    res.json(await detail(req.careCase, req.user));
  } catch (error) {
    next(error);
  }
});

// DELETE /api/care-cases/:id/steps/:stepId
router.delete('/:id/steps/:stepId', loadCase, requireWork, requireOpen, async (req, res, next) => {
  try {
    const step = req.careCase.steps.id(req.params.stepId);
    assert(step, 'Không tìm thấy bước chăm sóc', 404);
    step.deleteOne();
    await req.careCase.save();
    res.json(await detail(req.careCase, req.user));
  } catch (error) {
    next(error);
  }
});

// PUT /api/care-cases/:id/findings — body { cause?, solution? }: what was found and agreed.
router.put('/:id/findings', loadCase, requireWork, requireOpen, async (req, res, next) => {
  try {
    const c = req.careCase;
    const changes = [];
    if (req.body?.cause !== undefined) {
      const cause = text(req.body.cause, 2000, 'Nguyên nhân');
      if (cause !== c.cause) changes.push(`Nguyên nhân: ${cause || '(xóa)'}`);
      c.cause = cause;
    }
    if (req.body?.solution !== undefined) {
      const solution = text(req.body.solution, 2000, 'Hướng giải quyết');
      if (solution !== c.solution) changes.push(`Hướng giải quyết: ${solution || '(xóa)'}`);
      c.solution = solution;
    }
    if (changes.length) c.notes.push(note(req, 'su_kien', `Cập nhật — ${changes.join('; ')}`));
    await c.save();
    res.json(await detail(c, req.user));
  } catch (error) {
    next(error);
  }
});

// POST /api/care-cases/:id/notes — body { kind: 'trao_doi' | 'kho_khan' | 'chi_dao', text }.
// Staff report difficulties, managers give directions; both can simply reply.
router.post('/:id/notes', loadCase, requireWork, async (req, res, next) => {
  try {
    const kind = req.body?.kind || 'trao_doi';
    assert(['trao_doi', 'kho_khan', 'chi_dao'].includes(kind), 'Loại trao đổi không hợp lệ');
    assert(kind !== 'chi_dao' || isManager(req.user), 'Chỉ cấp quản lý gửi chỉ đạo', 403);
    const value = text(req.body?.text, 4000, 'Nội dung');
    assert(value, 'Nhập nội dung');
    req.careCase.notes.push(note(req, kind, value));
    await req.careCase.save();
    res.status(201).json(await detail(req.careCase, req.user));
  } catch (error) {
    next(error);
  }
});

// POST /api/care-cases/:id/ai-steps — AI Care suggests care steps (not saved; the user picks).
router.post('/:id/ai-steps', loadCase, requireWork, requireOpen, async (req, res, next) => {
  try {
    const c = await req.careCase.populate('studentId', 'studentCode fullName classCode major');
    const student = c.studentId;
    const [absences, calls] = await Promise.all([
      DiemDanh.countDocuments({ absentStudents: student._id }),
      CuocGoi.find({ studentId: student._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('outcome note')
        .lean(),
    ]);
    const prompt = `Sinh viên ${student.fullName} (MSSV ${student.studentCode}, lớp ${student.classCode}, ngành ${student.major || 'chưa rõ'}) cần được chăm sóc.
Lý do mở hồ sơ: ${c.reason || '(không ghi)'}.
Tổng số buổi vắng đã ghi nhận: ${absences}.
Nguyên nhân đã tìm hiểu: ${c.cause || '(chưa rõ)'}.
Hướng giải quyết đã đưa ra: ${c.solution || '(chưa có)'}.
Chỉ đạo của cấp quản lý: ${c.directive || '(không có)'}.
Các bước đã có: ${c.steps.map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`).join('; ') || '(chưa có)'}.
Ghi chú các cuộc gọi gần đây: ${
      calls
        .map((k) => k.note)
        .filter(Boolean)
        .join(' | ') || '(chưa có)'
    }.

Đề xuất 3 đến 5 bước chăm sóc TIẾP THEO, cụ thể, làm được, không trùng các bước đã có.
Trả về đúng mỗi bước một dòng, không đánh số, không giải thích thêm, mỗi dòng dưới 120 ký tự.`;
    const answer = await aiService.chat({
      system:
        'Bạn là trợ lý chăm sóc sinh viên của một trường cao đẳng tại Việt Nam. Đưa ra các bước thực tế, tôn trọng, mang tính hỗ trợ. Không bịa thông tin ngoài dữ liệu được cung cấp.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 400,
    });
    const steps = answer
      .split('\n')
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter((line) => line && line.length <= 300)
      .slice(0, 5);
    res.json({ steps });
  } catch (error) {
    next(error);
  }
});

// POST /api/care-cases/:id/close-request — body { result, summary, early? }: the staff member
// reports the outcome and asks a manager to close the case.
router.post('/:id/close-request', loadCase, requireWork, requireOpen, async (req, res, next) => {
  try {
    const c = req.careCase;
    assert(c.status === CARE_STATUS.IN_PROGRESS, 'Hồ sơ chưa ở trạng thái đang chăm sóc');
    const { result, early } = req.body ?? {};
    assert(CARE_RESULTS.includes(result), 'Chọn kết quả chăm sóc');
    const summary = text(req.body?.summary, 4000, 'Báo cáo');
    assert(summary, 'Nhập báo cáo kết quả chăm sóc');
    c.closing = {
      result,
      summary,
      early: Boolean(early),
      proposedBy: req.user.id,
      proposedAt: new Date(),
      approvedBy: null,
      closedAt: null,
    };
    c.status = CARE_STATUS.CLOSING;
    c.notes.push(
      note(
        req,
        'su_kien',
        `Đề nghị kết thúc${early ? ' sớm' : ''} — ${CARE_RESULT_LABEL[result]}: ${summary}`,
      ),
    );
    await c.save();
    res.json(await detail(c, req.user));
  } catch (error) {
    next(error);
  }
});

// POST /api/care-cases/:id/close — body { approve?: boolean, result?, summary?, note? }.
// A manager approves the staff member's request (approve true), sends it back (approve false,
// with a note), or closes the case directly with their own result and summary.
router.post('/:id/close', loadCase, requireManage, requireOpen, async (req, res, next) => {
  try {
    const c = req.careCase;
    const { approve } = req.body ?? {};
    if (c.status === CARE_STATUS.CLOSING && approve === false) {
      const reply = text(req.body?.note, 4000, 'Phản hồi');
      assert(reply, 'Nhập lý do chưa duyệt kết thúc');
      c.status = CARE_STATUS.IN_PROGRESS;
      c.notes.push(note(req, 'chi_dao', `Chưa duyệt kết thúc: ${reply}`));
    } else {
      if (c.status !== CARE_STATUS.CLOSING || req.body?.result !== undefined) {
        assert(CARE_RESULTS.includes(req.body?.result), 'Chọn kết quả chăm sóc');
        const summary = text(req.body?.summary, 4000, 'Báo cáo');
        assert(summary, 'Nhập đánh giá kết quả chăm sóc');
        c.closing = {
          ...c.closing?.toObject?.(),
          result: req.body.result,
          summary,
          early: Boolean(req.body?.early),
          proposedBy: c.closing?.proposedBy || req.user.id,
          proposedAt: c.closing?.proposedAt || new Date(),
        };
      }
      c.closing.approvedBy = req.user.id;
      c.closing.closedAt = new Date();
      c.status = CARE_STATUS.CLOSED;
      c.notes.push(note(req, 'su_kien', `Đã duyệt kết thúc hồ sơ — ${toLabel(c.closing.result)}`));
    }
    await c.save();
    res.json(await detail(c, req.user));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
