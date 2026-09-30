// AI Care — thao tác trên hệ thống thay người dùng.
// Mô hình KHÔNG tự thực hiện được gì: công cụ thao tác chỉ SOẠN một đề xuất (đã kiểm tra dữ liệu và
// quyền), lưu tạm phía máy chủ; giao diện hiện thẻ Xác nhận / Hủy và chỉ khi người dùng bấm Xác nhận
// thao tác mới chạy — qua đúng các service mà trang web dùng, sau khi kiểm tra quyền lần nữa.
const crypto = require('crypto');
const SinhVien = require('../models/SinhVien');
const NguoiDung = require('../models/NguoiDung');
const NhiemVu = require('../models/NhiemVu');
const HoSoChamSoc = require('../models/HoSoChamSoc');
const { can } = require('./dichVuPhanQuyen');
const { createTask, acknowledgeTask, reviewTask } = require('./dichVuNhiemVu');
const { assignClass } = require('./dichVuPhanCongLop');
const { assert, normalizeClass, parseOptionalDate } = require('../utils/kiemTra');
const {
  CARE_STATUS,
  OPEN_CARE_STATUSES,
  TASK_STATUS,
  TASK_CATEGORY_LABEL,
  TASK_PRIORITY_LABEL,
} = require('../utils/hangSo');

const PENDING_TTL_MS = 15 * 60 * 1000;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : 'không có');
const text = (value, name, max = 500) => {
  assert(typeof value === 'string' && value.trim(), `Thiếu ${name}`);
  assert(value.length <= max, `${name} quá dài`);
  return value.trim();
};
const optionalText = (value, max = 1000) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;

/** One active CSKH staff member by (part of) name or email; asks to be more specific if ambiguous. */
async function findStaff(query) {
  const q = text(query, 'tên nhân viên', 100);
  const pattern = new RegExp(escapeRegex(q), 'i');
  const matches = await NguoiDung.find({
    role: 'staff',
    status: 'active',
    $or: [{ fullName: pattern }, { email: pattern }],
  })
    .select('fullName email')
    .limit(10);
  assert(matches.length, `Không tìm thấy nhân viên CSKH đang hoạt động nào khớp "${q}"`);
  const exact = matches.find((s) => s.fullName.toLowerCase() === q.toLowerCase());
  assert(
    exact || matches.length === 1,
    `Có nhiều nhân viên khớp "${q}": ${matches.map((s) => s.fullName).join(', ')}. Hãy nói rõ tên đầy đủ.`,
  );
  return exact || matches[0];
}

/** The caller's task (or one they may review) whose title contains `title`. */
async function findTaskByTitle(filter, title) {
  const q = text(title, 'tên nhiệm vụ', 200);
  const matches = await NhiemVu.find({ ...filter, title: new RegExp(escapeRegex(q), 'i') })
    .populate('assignedTo', 'fullName')
    .limit(10);
  assert(matches.length, `Không tìm thấy nhiệm vụ phù hợp có tiêu đề chứa "${q}"`);
  assert(
    matches.length === 1,
    `Có ${matches.length} nhiệm vụ khớp "${q}": ${matches
      .map((t) => `"${t.title}" (${t.assignedTo?.fullName || '—'})`)
      .join('; ')}. Hãy nói rõ hơn.`,
  );
  return matches[0];
}

// Every action: allowed(user); prepare(user, input) → { title, details[], payload };
// run(user, payload) → { message, navigate? }. Both steps re-validate everything.
const ACTIONS = [
  {
    name: 'cap_nhat_ho_so_cham_soc',
    label: 'Cập nhật hồ sơ chăm sóc (nguyên nhân, hướng giải quyết, báo khó khăn)',
    description:
      'Soạn việc cập nhật hồ sơ chăm sóc đang mở của một sinh viên do chính người dùng được giao: nguyên nhân tìm hiểu được, hướng giải quyết, hoặc một khó khăn cần báo lên cấp quản lý. Chỉ soạn; người dùng phải bấm Xác nhận.',
    input_schema: {
      type: 'object',
      properties: {
        mssv: { type: 'string', description: 'Mã số sinh viên' },
        nguyenNhan: { type: 'string' },
        huongGiaiQuyet: { type: 'string' },
        khoKhan: { type: 'string', description: 'Khó khăn cần báo cấp quản lý' },
      },
      required: ['mssv'],
      additionalProperties: false,
    },
    allowed: (u) => u.role === 'staff' && can(u, 'care.work'),
    async prepare(user, input) {
      const student = await SinhVien.findOne({ studentCode: text(input.mssv, 'MSSV', 30) });
      assert(student, `Không có sinh viên MSSV ${input.mssv}`);
      const careCase = await HoSoChamSoc.findOne({
        studentId: student._id,
        assignedStaffId: user.id,
        status: { $in: [...OPEN_CARE_STATUSES] },
      });
      assert(careCase, `Bạn không có hồ sơ chăm sóc đang mở cho ${student.fullName}`);
      const payload = {
        caseId: String(careCase._id),
        cause: optionalText(input.nguyenNhan, 2000),
        solution: optionalText(input.huongGiaiQuyet, 2000),
        difficulty: optionalText(input.khoKhan, 2000),
      };
      assert(
        payload.cause || payload.solution || payload.difficulty,
        'Cần ít nhất một thông tin: nguyên nhân, hướng giải quyết hoặc khó khăn',
      );
      return {
        title: `Cập nhật hồ sơ chăm sóc — ${student.fullName} (${student.studentCode})`,
        details: [
          payload.cause && `Nguyên nhân: ${payload.cause}`,
          payload.solution && `Hướng giải quyết: ${payload.solution}`,
          payload.difficulty && `Báo khó khăn: ${payload.difficulty}`,
        ].filter(Boolean),
        payload,
      };
    },
    async run(user, p) {
      const careCase = await HoSoChamSoc.findById(p.caseId);
      assert(careCase, 'Hồ sơ chăm sóc không còn tồn tại', 404);
      assert(String(careCase.assignedStaffId) === user.id, 'Hồ sơ không còn thuộc về bạn', 403);
      assert(careCase.status !== CARE_STATUS.CLOSED, 'Hồ sơ đã kết thúc');
      if (p.cause) careCase.cause = p.cause;
      if (p.solution) careCase.solution = p.solution;
      if (p.cause || p.solution)
        careCase.notes.push({
          kind: 'su_kien',
          authorId: user.id,
          text: `Cập nhật qua AI Care — ${[p.cause && `Nguyên nhân: ${p.cause}`, p.solution && `Hướng giải quyết: ${p.solution}`].filter(Boolean).join('; ')}`,
        });
      if (p.difficulty)
        careCase.notes.push({ kind: 'kho_khan', authorId: user.id, text: p.difficulty });
      await careCase.save();
      return { message: 'Đã cập nhật hồ sơ chăm sóc.', navigate: `/care?case=${careCase._id}` };
    },
  },
  {
    name: 'xac_nhan_nhan_viec',
    label: 'Xác nhận đã nhận một nhiệm vụ được giao',
    description:
      'Soạn việc xác nhận đã nhận một nhiệm vụ nội bộ đang ở trạng thái "Mới giao" của chính người dùng, tìm theo tiêu đề. Chỉ soạn; người dùng phải bấm Xác nhận.',
    input_schema: {
      type: 'object',
      properties: { tieuDe: { type: 'string', description: 'Tiêu đề (hoặc một phần) nhiệm vụ' } },
      required: ['tieuDe'],
      additionalProperties: false,
    },
    allowed: (u) => u.role === 'staff',
    async prepare(user, input) {
      const task = await findTaskByTitle(
        { assignedTo: user.id, status: TASK_STATUS.PENDING },
        input.tieuDe,
      );
      return {
        title: `Xác nhận nhận việc — "${task.title}"`,
        details: [`Hạn chót: ${fmtDate(task.dueDate)}`],
        payload: { taskId: String(task._id) },
      };
    },
    async run(user, p) {
      const task = await NhiemVu.findById(p.taskId);
      assert(task && String(task.assignedTo) === user.id, 'Nhiệm vụ không còn thuộc về bạn', 403);
      await acknowledgeTask(task);
      return { message: `Đã xác nhận nhận việc "${task.title}".`, navigate: '/tasks' };
    },
  },
  {
    name: 'giao_viec',
    label: 'Giao nhiệm vụ cho nhân viên CSKH',
    description: `Soạn một nhiệm vụ nội bộ giao cho nhân viên CSKH (tìm theo tên hoặc email). loai: ${Object.keys(TASK_CATEGORY_LABEL).join(' | ')}; uuTien: ${Object.keys(TASK_PRIORITY_LABEL).join(' | ')}; hanChot dạng YYYY-MM-DD. Chỉ soạn; người dùng phải bấm Xác nhận.`,
    input_schema: {
      type: 'object',
      properties: {
        nhanVien: { type: 'string' },
        tieuDe: { type: 'string' },
        moTa: { type: 'string' },
        hanChot: { type: 'string' },
        loai: { type: 'string', enum: Object.keys(TASK_CATEGORY_LABEL) },
        uuTien: { type: 'string', enum: Object.keys(TASK_PRIORITY_LABEL) },
      },
      required: ['nhanVien', 'tieuDe', 'moTa'],
      additionalProperties: false,
    },
    allowed: (u) => can(u, 'tasks.manage'),
    async prepare(user, input) {
      const staff = await findStaff(input.nhanVien);
      const dueDate = input.hanChot
        ? parseOptionalDate(input.hanChot, 'Hạn chót không hợp lệ')
        : null;
      const payload = {
        assignedTo: String(staff._id),
        title: text(input.tieuDe, 'tiêu đề', 200),
        description: text(input.moTa, 'mô tả', 3000),
        dueDate: dueDate ? dueDate.toISOString() : undefined,
        category: input.loai,
        priority: input.uuTien,
      };
      return {
        title: `Giao việc cho ${staff.fullName}`,
        details: [
          `Tiêu đề: ${payload.title}`,
          `Mô tả: ${payload.description}`,
          `Hạn chót: ${fmtDate(payload.dueDate)}`,
          payload.category && `Loại: ${TASK_CATEGORY_LABEL[payload.category]}`,
          payload.priority && `Ưu tiên: ${TASK_PRIORITY_LABEL[payload.priority]}`,
        ].filter(Boolean),
        payload,
      };
    },
    async run(user, p) {
      const { staff } = await createTask(p, user.id);
      return { message: `Đã giao việc cho ${staff.fullName}.`, navigate: '/management?tab=tasks' };
    },
  },
  {
    name: 'duyet_nhiem_vu',
    label: 'Duyệt hoặc trả lại nhiệm vụ nhân viên đã nộp',
    description:
      'Soạn việc duyệt (duyet=true, có thể chấm diem 1–5) hoặc trả lại làm lại (duyet=false, nên có nhanXet) một nhiệm vụ đang chờ duyệt, tìm theo tiêu đề. Chỉ soạn; người dùng phải bấm Xác nhận.',
    input_schema: {
      type: 'object',
      properties: {
        tieuDe: { type: 'string' },
        duyet: { type: 'boolean' },
        nhanXet: { type: 'string' },
        diem: { type: 'integer', minimum: 1, maximum: 5 },
      },
      required: ['tieuDe', 'duyet'],
      additionalProperties: false,
    },
    allowed: (u) => can(u, 'tasks.manage'),
    async prepare(user, input) {
      assert(typeof input.duyet === 'boolean', 'Cần chọn duyệt hay trả lại');
      const task = await findTaskByTitle({ status: TASK_STATUS.SUBMITTED }, input.tieuDe);
      const payload = {
        taskId: String(task._id),
        approve: input.duyet,
        reviewNote: optionalText(input.nhanXet),
        score: input.duyet && Number.isInteger(input.diem) ? input.diem : undefined,
      };
      return {
        title: `${payload.approve ? 'Duyệt' : 'Trả lại'} nhiệm vụ "${task.title}"`,
        details: [
          `Người thực hiện: ${task.assignedTo?.fullName || '—'}`,
          payload.score && `Điểm chất lượng: ${payload.score}/5`,
          payload.reviewNote && `Nhận xét: ${payload.reviewNote}`,
        ].filter(Boolean),
        payload,
      };
    },
    async run(user, p) {
      const task = await NhiemVu.findById(p.taskId);
      assert(task, 'Nhiệm vụ không còn tồn tại', 404);
      await reviewTask(task, p, user.id);
      return {
        message: p.approve ? `Đã duyệt "${task.title}".` : `Đã trả lại "${task.title}".`,
        navigate: '/management?tab=tasks',
      };
    },
  },
  {
    name: 'phan_lop_cskh',
    label: 'Phân / chuyển lớp hành chính cho nhân viên CSKH',
    description:
      'Soạn việc giao một lớp hành chính cho nhân viên CSKH (tìm theo tên), hoặc thu hồi (nhanVien để trống) — hồ sơ chăm sóc đang mở của nhân viên cũ cho sinh viên lớp đó chuyển theo. Chỉ soạn; người dùng phải bấm Xác nhận.',
    input_schema: {
      type: 'object',
      properties: {
        lop: { type: 'string', description: 'Mã lớp hành chính, vd CD25CT1' },
        nhanVien: { type: 'string', description: 'Tên nhân viên; bỏ trống = thu hồi phân công' },
      },
      required: ['lop'],
      additionalProperties: false,
    },
    allowed: (u) => can(u, 'classes.assign'),
    async prepare(user, input) {
      const classCode = normalizeClass(text(input.lop, 'mã lớp', 30));
      const size = await SinhVien.countDocuments({ classCode });
      assert(size, `Lớp ${classCode} không có sinh viên nào`);
      const staff = optionalText(input.nhanVien) ? await findStaff(input.nhanVien) : null;
      return {
        title: staff
          ? `Giao lớp ${classCode} cho ${staff.fullName}`
          : `Thu hồi phân công lớp ${classCode}`,
        details: [
          `Sĩ số: ${size} sinh viên`,
          staff
            ? 'Hồ sơ chăm sóc đang mở của lớp sẽ chuyển sang nhân viên này.'
            : 'Hồ sơ chăm sóc đang mở của lớp sẽ chờ Trưởng phòng / PHT chỉ đạo.',
        ],
        payload: { classCode, staffId: staff ? String(staff._id) : null },
      };
    },
    async run(user, p) {
      const result = await assignClass({
        classCode: p.classCode,
        staffId: p.staffId,
        by: user.id,
        reason: 'Phân công qua AI Care',
      });
      return {
        message: result.staff
          ? `Đã giao lớp ${p.classCode} cho ${result.staff.fullName} (${result.movedCases} hồ sơ chăm sóc chuyển theo).`
          : `Đã thu hồi lớp ${p.classCode}; ${result.movedCases} hồ sơ chờ chỉ đạo.`,
        navigate: '/management?tab=classes',
      };
    },
  },
];

// Pages AI Care may open for the user (the app still checks the user may open them).
const PAGES = {
  '/students': 'Hồ sơ sinh viên',
  '/attendance': 'Điểm danh',
  '/care': 'Hồ sơ chăm sóc',
  '/tasks': 'Nhiệm vụ được giao',
  '/timetable': 'Thời khóa biểu',
  '/calls': 'Lịch sử cuộc gọi',
  '/management': 'Quản lý & báo cáo',
  '/admin': 'Quản trị hệ thống',
  '/billing': 'Gói dịch vụ',
};
const OPEN_PAGE = {
  name: 'mo_trang',
  label: 'Mở một trang chức năng trong hệ thống',
  description: `Chuyển người dùng tới một trang của hệ thống (thực hiện ngay, không cần xác nhận): ${Object.entries(
    PAGES,
  )
    .map(([path, name]) => `${path} = ${name}`)
    .join('; ')}.`,
  input_schema: {
    type: 'object',
    properties: { trang: { type: 'string', enum: Object.keys(PAGES) } },
    required: ['trang'],
    additionalProperties: false,
  },
  allowed: () => true,
};

// ------------------------- Pending proposals -------------------------
// Kept in memory for PENDING_TTL_MS; a proposal can only be confirmed by the user it was made for.
const pending = new Map();
function sweep() {
  const now = Date.now();
  for (const [id, p] of pending) if (p.expires < now) pending.delete(id);
}

const actionTools = (user) => [...ACTIONS.filter((a) => a.allowed(user)), OPEN_PAGE];

/**
 * Runs an action tool the model called: prepares a proposal (nothing changes yet) and records it
 * in ctx.actions for the UI, or records a page to open in ctx.navigate.
 */
async function handleActionTool(user, name, input, ctx) {
  if (name === OPEN_PAGE.name) {
    assert(PAGES[input?.trang], 'Trang không hợp lệ');
    ctx.navigate = input.trang;
    return { ketQua: `Đã mở trang ${PAGES[input.trang]}.` };
  }
  const action = ACTIONS.find((a) => a.name === name);
  if (!action || !action.allowed(user)) return null;
  const { title, details, payload } = await action.prepare(user, input || {});
  sweep();
  const id = crypto.randomUUID();
  pending.set(id, { userId: user.id, name, payload, expires: Date.now() + PENDING_TTL_MS });
  ctx.actions.push({ id, title, details });
  return {
    daSoanThaoTac: title,
    chiTiet: details,
    trangThai:
      'CHƯA THỰC HIỆN — giao diện đang hiện nút Xác nhận / Hủy; hãy nhắc người dùng kiểm tra rồi bấm Xác nhận.',
  };
}

/** Executes a proposal the user confirmed, re-checking that they may still do it. */
async function confirmAction(user, id) {
  sweep();
  const proposal = pending.get(id);
  assert(
    proposal && proposal.userId === user.id,
    'Thao tác đã hết hạn hoặc không tồn tại. Hãy yêu cầu AI Care soạn lại.',
    404,
  );
  pending.delete(id); // one shot, even if it fails below
  const action = ACTIONS.find((a) => a.name === proposal.name);
  assert(action && action.allowed(user), 'Bạn không còn quyền thực hiện thao tác này', 403);
  return action.run(user, proposal.payload);
}

function cancelAction(user, id) {
  const proposal = pending.get(id);
  if (proposal && proposal.userId === user.id) pending.delete(id);
}

module.exports = { actionTools, handleActionTool, confirmAction, cancelAction };
