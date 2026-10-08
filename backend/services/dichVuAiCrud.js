// Các thao tác CRUD của AI Care dùng cùng controller với giao diện thông thường.
// Mô hình chỉ chuẩn bị đề xuất; dichVuAiThaoTac kiểm tra quyền và chờ xác nhận.
const SinhVien = require('../models/SinhVien');
const NhomHocPhan = require('../models/NhomHocPhan');
const DiemDanh = require('../models/DiemDanh');
const HoSoChamSoc = require('../models/HoSoChamSoc');
const CuocGoi = require('../models/CuocGoi');
const NhiemVu = require('../models/NhiemVu');
const studentController = require('../controllers/dieuKhienSinhVien');
const groupController = require('../controllers/dieuKhienNhomHocPhan');
const taskController = require('../controllers/dieuKhienNhiemVu');
const { can } = require('./dichVuPhanQuyen');
const { assert } = require('../utils/kiemTra');

const required = (value, label, max = 100) => {
  assert(typeof value === 'string' && value.trim(), `Thiếu ${label}`);
  assert(value.trim().length <= max, `${label} quá dài`);
  return value.trim();
};

// Chạy đúng handler API hiện có để giữ nguyên validation và dọn dữ liệu liên quan.
function runController(handler, body, id, extra = {}) {
  return new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(result) {
        if (status >= 400)
          reject(Object.assign(new Error(result?.message || 'Thao tác thất bại'), { status }));
        else resolve(result);
        return this;
      },
    };
    try {
      Promise.resolve(handler({ body, params: { id }, ...extra }, res, reject)).catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

const ensureFresh = async (Model, payload, label) => {
  const item = await Model.findById(payload.id);
  assert(item, `${label} không còn tồn tại`, 404);
  assert(
    new Date(item.updatedAt).getTime() === payload.updatedAt,
    `${label} đã được thay đổi sau khi AI soạn đề xuất. Hãy yêu cầu soạn lại.`,
    409,
  );
  return item;
};

const studentFields = [
  'studentCode',
  'fullName',
  'classCode',
  'dob',
  'major',
  'phone',
  'parentPhone',
];
const studentProperties = Object.fromEntries(
  studentFields.map((field) => [field, { type: 'string' }]),
);
const studentInput = (input, partial) => {
  assert(
    input && typeof input === 'object' && !Array.isArray(input),
    'Dữ liệu sinh viên không hợp lệ',
  );
  const data = {};
  for (const field of studentFields) {
    if (input[field] === undefined) continue;
    assert(typeof input[field] === 'string', `${field} phải là chuỗi`);
    data[field] = input[field].trim();
  }
  if (!partial)
    for (const field of ['studentCode', 'fullName', 'classCode']) required(data[field], field);
  else assert(Object.keys(data).length, 'Cần ít nhất một trường để sửa');
  return data;
};
const findStudent = async (code) => {
  const item = await SinhVien.findOne({ studentCode: required(code, 'MSSV', 30) });
  assert(item, `Không tìm thấy sinh viên MSSV ${code}`, 404);
  return item;
};
const findGroup = async (code) => {
  const item = await NhomHocPhan.findOne({ groupCode: required(code, 'mã nhóm', 60) });
  assert(item, `Không tìm thấy nhóm học phần ${code}`, 404);
  return item;
};
const findTask = async (title) => {
  const items = await NhiemVu.find({ title: required(title, 'tiêu đề nhiệm vụ', 200) }).limit(2);
  assert(items.length, 'Không tìm thấy nhiệm vụ có tiêu đề này', 404);
  assert(
    items.length === 1,
    'Có nhiều nhiệm vụ trùng tiêu đề; hãy thao tác trong trang Nhiệm vụ',
    409,
  );
  return items[0];
};

const groupFields = [
  'courseCode',
  'courseName',
  'shift',
  'room',
  'startDate',
  'endDate',
  'startTime',
  'endTime',
  'periodsPerSession',
  'totalPeriods',
  'teacherName',
];
const groupProperties = Object.fromEntries(
  groupFields.map((field) => [
    field,
    {
      type: ['periodsPerSession', 'totalPeriods'].includes(field) ? 'number' : 'string',
    },
  ]),
);
const groupInput = (input) => {
  assert(
    input && typeof input === 'object' && !Array.isArray(input),
    'Dữ liệu học phần không hợp lệ',
  );
  const data = {};
  for (const field of groupFields) if (input[field] !== undefined) data[field] = input[field];
  if (input.scheduleDays !== undefined) {
    assert(Array.isArray(input.scheduleDays), 'Lịch học phải là mảng thứ trong tuần');
    data.scheduleDays = input.scheduleDays;
  }
  return data;
};

const CRUD_ACTIONS = [
  {
    name: 'them_sinh_vien',
    label: 'Thêm sinh viên',
    description:
      'Soạn thêm một sinh viên. Cần studentCode (MSSV), fullName (họ tên), classCode (lớp); các trường khác tùy chọn. Chỉ thực hiện sau khi người dùng xác nhận.',
    input_schema: {
      type: 'object',
      properties: studentProperties,
      required: ['studentCode', 'fullName', 'classCode'],
      additionalProperties: false,
    },
    allowed: (u) => u.role !== 'admin' && can(u, 'excel.import'),
    async prepare(_user, input) {
      const data = studentInput(input, false);
      assert(!(await SinhVien.exists({ studentCode: data.studentCode })), 'MSSV đã tồn tại', 409);
      return {
        title: `Thêm sinh viên ${data.fullName}`,
        details: Object.entries(data).map(([k, v]) => `${k}: ${v}`),
        payload: { data },
      };
    },
    async run(_user, { data }) {
      const item = await runController(studentController.create, data);
      return {
        message: `Đã thêm sinh viên ${item.fullName} (${item.studentCode}).`,
        navigate: '/students',
      };
    },
  },
  {
    name: 'sua_sinh_vien',
    label: 'Sửa thông tin sinh viên',
    description:
      'Soạn sửa sinh viên theo MSSV. Chỉ gửi các trường thực sự muốn thay đổi trong thayDoi. Chỉ thực hiện sau khi người dùng xác nhận.',
    input_schema: {
      type: 'object',
      properties: {
        mssv: { type: 'string' },
        thayDoi: { type: 'object', properties: studentProperties, additionalProperties: false },
      },
      required: ['mssv', 'thayDoi'],
      additionalProperties: false,
    },
    allowed: (u) => u.role !== 'admin' && can(u, 'excel.import'),
    async prepare(_user, input) {
      const item = await findStudent(input.mssv);
      const data = studentInput(input.thayDoi, true);
      return {
        title: `Sửa sinh viên ${item.fullName} (${item.studentCode})`,
        details: Object.entries(data).map(
          ([k, v]) => `${k}: ${item[k] || '(trống)'} → ${v || '(trống)'}`,
        ),
        payload: { id: String(item._id), updatedAt: item.updatedAt.getTime(), data },
      };
    },
    async run(_user, payload) {
      await ensureFresh(SinhVien, payload, 'Sinh viên');
      const item = await runController(studentController.update, payload.data, payload.id);
      return {
        message: `Đã sửa sinh viên ${item.fullName} (${item.studentCode}).`,
        navigate: '/students',
      };
    },
  },
  {
    name: 'xoa_sinh_vien',
    label: 'Xóa sinh viên và dữ liệu liên quan',
    description:
      'Soạn xóa một sinh viên theo MSSV chính xác. Xóa cả liên kết học phần, điểm danh, hồ sơ chăm sóc, cuộc gọi và bản ghi âm. Chỉ thực hiện sau khi người dùng xác nhận.',
    input_schema: {
      type: 'object',
      properties: { mssv: { type: 'string' } },
      required: ['mssv'],
      additionalProperties: false,
    },
    allowed: (u) => u.role !== 'admin' && can(u, 'excel.import'),
    async prepare(_user, input) {
      const item = await findStudent(input.mssv);
      const [groups, attendance, cases, calls] = await Promise.all([
        NhomHocPhan.countDocuments({ students: item._id }),
        DiemDanh.countDocuments({
          $or: [{ absentStudents: item._id }, { 'excusedStudents.studentId': item._id }],
        }),
        HoSoChamSoc.countDocuments({ studentId: item._id }),
        CuocGoi.countDocuments({ studentId: item._id }),
      ]);
      return {
        title: `Xóa sinh viên ${item.fullName} (${item.studentCode})`,
        details: [
          `Lớp ${item.classCode}`,
          `Ảnh hưởng: ${groups} nhóm học phần, ${attendance} bản ghi điểm danh, ${cases} hồ sơ chăm sóc, ${calls} cuộc gọi và file ghi âm liên quan.`,
          'Không thể hoàn tác sau khi xác nhận.',
        ],
        payload: { id: String(item._id), updatedAt: item.updatedAt.getTime() },
      };
    },
    async run(_user, payload) {
      await ensureFresh(SinhVien, payload, 'Sinh viên');
      const result = await runController(studentController.remove, {}, payload.id);
      return { message: result.message, navigate: '/students' };
    },
  },
  {
    name: 'them_nhom_hoc_phan',
    label: 'Thêm nhóm học phần',
    description:
      'Soạn tạo nhóm học phần. Cần groupCode; có thể thêm courseName, courseCode, shift (sang/chieu/toi), scheduleDays, giờ học, số tiết và phòng. Chỉ thực hiện sau xác nhận.',
    input_schema: {
      type: 'object',
      properties: {
        groupCode: { type: 'string' },
        ...groupProperties,
        scheduleDays: { type: 'array', items: { type: 'string' } },
      },
      required: ['groupCode'],
      additionalProperties: false,
    },
    allowed: (u) => u.role !== 'admin' && can(u, 'courses.manage'),
    async prepare(_user, input) {
      const groupCode = required(input.groupCode, 'mã nhóm', 60);
      assert(!(await NhomHocPhan.exists({ groupCode })), 'Mã nhóm đã tồn tại', 409);
      const data = { groupCode, ...groupInput(input) };
      return {
        title: `Thêm nhóm học phần ${groupCode}`,
        details: Object.entries(data).map(
          ([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`,
        ),
        payload: { data },
      };
    },
    async run(_user, { data }) {
      await runController(groupController.create, data);
      return { message: `Đã thêm nhóm học phần ${data.groupCode}.`, navigate: '/timetable' };
    },
  },
  {
    name: 'sua_nhom_hoc_phan',
    label: 'Sửa nhóm học phần và lịch học',
    description:
      'Soạn sửa nhóm học phần theo groupCode. Chỉ gửi trường muốn đổi trong thayDoi; không đổi groupCode. Chỉ thực hiện sau xác nhận.',
    input_schema: {
      type: 'object',
      properties: {
        groupCode: { type: 'string' },
        thayDoi: {
          type: 'object',
          properties: {
            ...groupProperties,
            scheduleDays: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
      },
      required: ['groupCode', 'thayDoi'],
      additionalProperties: false,
    },
    allowed: (u) => u.role !== 'admin' && can(u, 'courses.manage'),
    async prepare(_user, input) {
      const item = await findGroup(input.groupCode);
      const data = groupInput(input.thayDoi);
      assert(Object.keys(data).length, 'Cần ít nhất một trường để sửa');
      return {
        title: `Sửa nhóm học phần ${item.groupCode}`,
        details: Object.entries(data).map(
          ([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`,
        ),
        payload: { id: String(item._id), updatedAt: item.updatedAt.getTime(), data },
      };
    },
    async run(_user, payload) {
      await ensureFresh(NhomHocPhan, payload, 'Nhóm học phần');
      await runController(groupController.update, payload.data, payload.id);
      return { message: 'Đã sửa nhóm học phần.', navigate: '/timetable' };
    },
  },
  {
    name: 'xoa_nhom_hoc_phan',
    label: 'Xóa nhóm học phần',
    description:
      'Soạn xóa nhóm học phần theo groupCode chính xác; xóa cả bản ghi điểm danh của nhóm. Chỉ thực hiện sau xác nhận.',
    input_schema: {
      type: 'object',
      properties: { groupCode: { type: 'string' } },
      required: ['groupCode'],
      additionalProperties: false,
    },
    allowed: (u) => u.role !== 'admin' && can(u, 'courses.manage'),
    async prepare(_user, input) {
      const item = await findGroup(input.groupCode);
      const attendance = await DiemDanh.countDocuments({ courseGroupId: item._id });
      return {
        title: `Xóa nhóm học phần ${item.groupCode}`,
        details: [
          `${item.students.length} sinh viên, ${attendance} bản ghi điểm danh sẽ bị ảnh hưởng.`,
          'Không thể hoàn tác sau khi xác nhận.',
        ],
        payload: { id: String(item._id), updatedAt: item.updatedAt.getTime() },
      };
    },
    async run(_user, payload) {
      await ensureFresh(NhomHocPhan, payload, 'Nhóm học phần');
      await runController(groupController.remove, {}, payload.id);
      return { message: 'Đã xóa nhóm học phần.', navigate: '/timetable' };
    },
  },
  {
    name: 'sua_nhiem_vu',
    label: 'Sửa nhiệm vụ đã giao',
    description:
      'Soạn sửa nhiệm vụ theo tiêu đề chính xác khi chưa nộp minh chứng. Có thể đổi title, description, dueDate (YYYY-MM-DD), category hoặc priority. Chỉ thực hiện sau xác nhận.',
    input_schema: {
      type: 'object',
      properties: {
        tieuDe: { type: 'string' },
        thayDoi: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            dueDate: { type: 'string' },
            category: { type: 'string' },
            priority: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      required: ['tieuDe', 'thayDoi'],
      additionalProperties: false,
    },
    allowed: (u) => u.role !== 'admin' && can(u, 'tasks.manage'),
    async prepare(_user, input) {
      const task = await findTask(input.tieuDe);
      assert(
        ['moi_giao', 'da_xac_nhan'].includes(task.status),
        'Nhiệm vụ đã nộp minh chứng, không thể sửa',
      );
      const allowed = ['title', 'description', 'dueDate', 'category', 'priority'];
      const data = Object.fromEntries(
        allowed
          .filter((key) => input.thayDoi?.[key] !== undefined)
          .map((key) => [key, input.thayDoi[key]]),
      );
      assert(Object.keys(data).length, 'Cần ít nhất một trường để sửa');
      return {
        title: `Sửa nhiệm vụ “${task.title}”`,
        details: Object.entries(data).map(([k, v]) => `${k}: ${v}`),
        payload: { id: String(task._id), updatedAt: task.updatedAt.getTime(), data },
      };
    },
    async run(user, payload) {
      const task = await ensureFresh(NhiemVu, payload, 'Nhiệm vụ');
      await runController(taskController.update, payload.data, payload.id, { task, user });
      return { message: 'Đã sửa nhiệm vụ.', navigate: '/management?tab=tasks' };
    },
  },
  {
    name: 'xoa_nhiem_vu',
    label: 'Xóa nhiệm vụ và minh chứng',
    description:
      'Soạn xóa nhiệm vụ theo tiêu đề chính xác; xóa cả file minh chứng. Chỉ thực hiện sau xác nhận.',
    input_schema: {
      type: 'object',
      properties: { tieuDe: { type: 'string' } },
      required: ['tieuDe'],
      additionalProperties: false,
    },
    allowed: (u) => u.role !== 'admin' && can(u, 'tasks.manage'),
    async prepare(_user, input) {
      const task = await findTask(input.tieuDe);
      return {
        title: `Xóa nhiệm vụ “${task.title}”`,
        details: [
          `Trạng thái: ${task.status}`,
          `${task.evidenceFiles.length} file minh chứng sẽ bị xóa.`,
          'Không thể hoàn tác sau khi xác nhận.',
        ],
        payload: { id: String(task._id), updatedAt: task.updatedAt.getTime() },
      };
    },
    async run(user, payload) {
      const task = await ensureFresh(NhiemVu, payload, 'Nhiệm vụ');
      await runController(taskController.remove, {}, payload.id, { task, user });
      return { message: 'Đã xóa nhiệm vụ.', navigate: '/management?tab=tasks' };
    },
  },
];

module.exports = { CRUD_ACTIONS };
