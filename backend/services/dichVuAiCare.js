// AI Care — trợ lý AI dùng chung cho mọi vai trò. Mỗi người dùng chỉ được trao những công cụ
// (tra cứu dữ liệu) mà quyền của họ cho phép, và mỗi công cụ tự giới hạn dữ liệu theo phạm vi
// của người hỏi (giảng viên: học phần mình dạy; CSSV: sinh viên mình phụ trách...).
// Không gửi số điện thoại hay dữ liệu liên lạc của sinh viên cho mô hình.
const mongoose = require('mongoose');
const SinhVien = require('../models/SinhVien');
const NhomHocPhan = require('../models/NhomHocPhan');
const DiemDanh = require('../models/DiemDanh');
const HoSoChamSoc = require('../models/HoSoChamSoc');
const NhiemVu = require('../models/NhiemVu');
const NguoiDung = require('../models/NguoiDung');
const LichSuPhanCong = require('../models/LichSuPhanCong');
const { can } = require('./dichVuPhanQuyen');
const { getSummary } = require('./truyVanDiemDanh');
const { getSubscription } = require('./dichVuGoiDichVu');
const { describeIntegrations } = require('./dichVuCauHinhApi');
const {
  getWarningLevels,
  periodInfo,
  evaluate,
  describeLevels,
  classHours,
  attendanceWindow,
} = require('./dichVuCanhBao');
const { canAccessStudent } = require('../middleware/phanQuyen');
const { actionTools, handleActionTool } = require('./dichVuAiThaoTac');
const {
  ROLE_LABEL,
  CARE_STATUS,
  OPEN_CARE_STATUSES,
  TASK_STATUS,
  SHIFT_LABEL,
  WEEKDAY_LABEL,
  ATTENDANCE_EARLY_MINUTES,
  toLabel,
} = require('../utils/hangSo');

const { ObjectId } = mongoose.Types;
const MAX_ROWS = 30;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : null);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isTeacher = (u) => u.role === 'teacher';
const isStaff = (u) => u.role === 'staff';
const canTakeAttendance = (u) => isTeacher(u) && can(u, 'attendance.take');
const seesAllStudents = (u) => can(u, 'students.view');
const seesWarnings = (u) => canTakeAttendance(u) || can(u, 'reports.view') || seesAllStudents(u);

/**
 * Scope for attendance data: { groups, students } filters (null = no restriction), or null when
 * the user may not see attendance at all. Teachers: groups they teach. CSSV: students of their
 * assigned classes. Overseers: everything.
 */
async function attendanceScope(user) {
  if (seesAllStudents(user)) return { groups: {}, students: null };
  if (isTeacher(user)) return { groups: { teacherId: new ObjectId(user.id) }, students: null };
  if (isStaff(user)) {
    const ids = await SinhVien.find({ classCode: { $in: user.managedClasses || [] } }).distinct(
      '_id',
    );
    return { groups: { students: { $in: ids } }, students: new Set(ids.map(String)) };
  }
  if (can(user, 'reports.view')) return { groups: {}, students: null };
  return null;
}
const warningText = (w) =>
  w.warningLevel
    ? `${w.warningLevel.name}${w.warningLevel.examBan ? ' (cấm thi)' : ''}`
    : 'Chưa tới mức cảnh báo';

// ================================ Tools ================================
// allowed(user) quyết định công cụ có được đưa cho mô hình không; run(user, input) chạy truy vấn.
const TOOLS = [
  {
    name: 'hoc_phan_cua_toi',
    label: 'Lịch dạy và tình hình điểm danh các học phần của tôi',
    description:
      'Danh sách học phần giảng viên đang dạy: lịch học, giờ học, ca, phòng, sĩ số, số tiết, số buổi đã điểm danh, hôm nay đã điểm danh chưa và hiện có đang mở điểm danh không.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    allowed: canTakeAttendance,
    async run(user) {
      const groups = await NhomHocPhan.find({ teacherId: user.id })
        .select(
          'groupCode courseName shift scheduleDays room startDate endDate students startTime endTime periodsPerSession totalPeriods',
        )
        .lean();
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const [sessionCounts, today] = await Promise.all([
        DiemDanh.aggregate([
          { $match: { courseGroupId: { $in: groups.map((g) => g._id) } } },
          { $group: { _id: '$courseGroupId', count: { $sum: 1 } } },
        ]),
        DiemDanh.find({
          courseGroupId: { $in: groups.map((g) => g._id) },
          date: { $gte: startOfDay },
        })
          .select('courseGroupId')
          .lean(),
      ]);
      const countMap = Object.fromEntries(sessionCounts.map((c) => [String(c._id), c.count]));
      const takenToday = new Set(today.map((a) => String(a.courseGroupId)));
      return {
        homNay: new Date().toLocaleDateString('vi-VN', { weekday: 'long' }),
        hocPhan: groups.map((g) => ({
          maNhom: g.groupCode,
          tenHocPhan: g.courseName,
          ca: SHIFT_LABEL[g.shift] || g.shift,
          lichHoc: g.scheduleDays.map((d) => WEEKDAY_LABEL[d] || d),
          phong: g.room,
          batDau: fmtDate(g.startDate),
          ketThuc: fmtDate(g.endDate),
          gioHoc: `${classHours(g).startTime}–${classHours(g).endTime}`,
          soTietMoiBuoi: periodInfo(g).periodsPerSession,
          tongSoTiet: periodInfo(g).totalPeriods,
          siSo: g.students.length,
          soBuoiDaDiemDanh: countMap[String(g._id)] || 0,
          homNayDaDiemDanh: takenToday.has(String(g._id)),
          diemDanhLucNay: (() => {
            const w = attendanceWindow(g, { hasRecordToday: takenToday.has(String(g._id)) });
            return w.open ? 'Đang mở' : `Đang khóa — ${w.reason}`;
          })(),
        })),
      };
    },
  },
  {
    name: 'sinh_vien_nguy_co',
    label: 'Sinh viên đã chạm mức cảnh báo vắng (theo tiết nghỉ)',
    description:
      'Sinh viên có số tiết nghỉ (không phép) đạt một mức cảnh báo do Trưởng phòng/PHT cấu hình, theo từng học phần: số tiết nghỉ, % tổng số tiết, mức cảnh báo, trạng thái chăm sóc gần nhất. Có thể lọc theo mã nhóm học phần.',
    input_schema: {
      type: 'object',
      properties: {
        groupCode: { type: 'string', description: 'Mã nhóm học phần (không bắt buộc)' },
      },
      additionalProperties: false,
    },
    allowed: seesWarnings,
    async run(user, { groupCode } = {}) {
      const scope = await attendanceScope(user);
      if (!scope) return { loi: 'Bạn không có quyền xem dữ liệu này' };
      const groupFilter = { ...scope.groups };
      if (groupCode) groupFilter.groupCode = groupCode.trim();
      const groups = await NhomHocPhan.find(groupFilter)
        .select(
          'groupCode courseName shift scheduleDays startDate endDate periodsPerSession totalPeriods',
        )
        .lean();
      if (!groups.length)
        return {
          loi: groupCode ? 'Không tìm thấy học phần trong phạm vi của bạn' : 'Chưa có học phần',
        };
      const groupMap = Object.fromEntries(groups.map((g) => [String(g._id), g]));
      const levels = await getWarningLevels();
      const counts = await DiemDanh.aggregate([
        { $match: { courseGroupId: { $in: groups.map((g) => g._id) } } },
        { $unwind: '$absentStudents' },
        {
          $group: {
            _id: { group: '$courseGroupId', student: '$absentStudents' },
            absent: { $sum: 1 },
          },
        },
      ]);
      const rank = (w) => levels.findIndex((l) => l.name === w.warningLevel.name);
      const rows = counts
        .filter((r) => !scope.students || scope.students.has(String(r._id.student)))
        .map((r) => ({
          ...r,
          ...evaluate(r.absent, periodInfo(groupMap[String(r._id.group)]), levels),
        }))
        .filter((r) => r.warningLevel)
        .sort((a, b) => rank(b) - rank(a) || b.absentPeriods - a.absentPeriods)
        .slice(0, MAX_ROWS);
      const students = await SinhVien.find({ _id: { $in: rows.map((r) => r._id.student) } })
        .select('studentCode fullName classCode')
        .lean();
      const studentMap = Object.fromEntries(students.map((s) => [String(s._id), s]));
      const latestCases = await HoSoChamSoc.find({
        studentId: { $in: rows.map((r) => r._id.student) },
      })
        .sort({ createdAt: -1 })
        .select('studentId status cause')
        .lean();
      const caseMap = {};
      for (const c of latestCases)
        if (!caseMap[String(c.studentId)]) caseMap[String(c.studentId)] = c;
      return {
        cacMucCanhBao: describeLevels(levels),
        danhSach: rows.map((r) => {
          const s = studentMap[String(r._id.student)];
          const g = groupMap[String(r._id.group)];
          const careCase = caseMap[String(r._id.student)];
          return {
            mssv: s?.studentCode,
            hoTen: s?.fullName,
            lop: s?.classCode,
            hocPhan: `${g?.courseName || ''} (${g?.groupCode})`,
            soBuoiVang: r.absent,
            soTietNghi: r.absentPeriods,
            phanTramTongTiet: r.absentPercent,
            mucCanhBao: warningText(r),
            hoSoChamSoc: careCase
              ? `${toLabel(careCase.status)}${careCase.cause ? ` — ${careCase.cause}` : ''}`
              : 'Chưa có hồ sơ chăm sóc',
          };
        }),
      };
    },
  },
  {
    name: 'thong_ke_hoc_phan',
    label: 'Thống kê chuyên cần một học phần',
    description:
      'Số buổi đã học, tỉ lệ chuyên cần của từng sinh viên trong một nhóm học phần (theo mã nhóm).',
    input_schema: {
      type: 'object',
      properties: { groupCode: { type: 'string', description: 'Mã nhóm học phần' } },
      required: ['groupCode'],
      additionalProperties: false,
    },
    allowed: (u) => canTakeAttendance(u) || seesAllStudents(u),
    async run(user, { groupCode } = {}) {
      const scope = await attendanceScope(user);
      if (!scope || !groupCode) return { loi: 'Thiếu mã nhóm học phần hoặc không có quyền' };
      const group = await NhomHocPhan.findOne({ ...scope.groups, groupCode: groupCode.trim() });
      if (!group) return { loi: 'Không tìm thấy học phần trong phạm vi của bạn' };
      const data = await getSummary(group);
      return {
        hocPhan: `${data.courseGroup.courseName} (${data.courseGroup.groupCode})`,
        soBuoiDaDiemDanh: data.totalSessions,
        soTietMoiBuoi: data.periodsPerSession,
        tongSoTiet: data.totalPeriods,
        siSo: data.summary.length,
        sinhVien: data.summary.slice(0, 60).map((r) => ({
          mssv: r.student.studentCode,
          hoTen: r.student.fullName,
          vang: r.absentCount,
          vangCoPhep: r.excusedCount,
          soTietNghi: r.absentPeriods,
          phanTramTongTiet: r.absentPercent,
          tiLeChuyenCan: `${r.attendRate}%`,
          mucCanhBao: warningText(r),
          trangThaiGoi: r.callStatus ? toLabel(r.callStatus) : null,
        })),
      };
    },
  },
  {
    name: 'tra_cuu_sinh_vien',
    label: 'Tra cứu hồ sơ sinh viên',
    description:
      'Tìm sinh viên theo MSSV hoặc họ tên (chỉ trong phạm vi người dùng được phép xem) và trả về số buổi vắng theo học phần, lịch sử chăm sóc gần đây, nhãn.',
    input_schema: {
      type: 'object',
      properties: { keyword: { type: 'string', description: 'MSSV hoặc một phần họ tên' } },
      required: ['keyword'],
      additionalProperties: false,
    },
    allowed: () => true,
    async run(user, { keyword } = {}) {
      const kw = String(keyword || '').trim();
      if (kw.length < 2) return { loi: 'Từ khóa quá ngắn' };
      const pattern = new RegExp(escapeRegex(kw), 'i');
      const candidates = await SinhVien.find({
        $or: [{ studentCode: pattern }, { fullName: pattern }],
      })
        .limit(20)
        .select('studentCode fullName classCode major tags');
      const visible = [];
      for (const s of candidates) {
        if (visible.length >= 5) break;
        if (await canAccessStudent(user, s)) visible.push(s);
      }
      if (!visible.length)
        return { ketQua: [], ghiChu: 'Không có sinh viên phù hợp trong phạm vi của bạn' };
      return {
        ketQua: await Promise.all(
          visible.map(async (s) => {
            const [absences, calls] = await Promise.all([
              DiemDanh.aggregate([
                { $match: { absentStudents: s._id } },
                { $group: { _id: '$courseGroupId', count: { $sum: 1 } } },
                {
                  $lookup: {
                    from: 'nhom_hoc_phan',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'g',
                  },
                },
              ]),
              HoSoChamSoc.find({ studentId: s._id })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('status reason cause solution steps.done closing.result createdAt')
                .lean(),
            ]);
            return {
              mssv: s.studentCode,
              hoTen: s.fullName,
              lop: s.classCode,
              nganh: s.major,
              nhan: s.tags,
              vangTheoHocPhan: absences.map((a) => ({
                hocPhan: a.g[0] ? `${a.g[0].courseName} (${a.g[0].groupCode})` : 'Học phần đã xóa',
                soBuoiVang: a.count,
              })),
              hoSoChamSoc: calls.map((c) => ({
                ngayMo: fmtDate(c.createdAt),
                trangThai: toLabel(c.status),
                lyDoMo: c.reason || null,
                nguyenNhan: c.cause || null,
                huongGiaiQuyet: c.solution || null,
                buocDaLam: `${c.steps.filter((st) => st.done).length}/${c.steps.length}`,
                ketQua: c.closing?.result ? toLabel(c.closing.result) : null,
              })),
            };
          }),
        ),
      };
    },
  },
  {
    name: 'ho_so_cham_soc_cua_toi',
    label: 'Hồ sơ chăm sóc sinh viên tôi đang phụ trách',
    description:
      'Hồ sơ chăm sóc đang mở được giao cho chính người dùng: sinh viên, lý do, chỉ đạo, các bước đã làm, hạn.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    allowed: (u) => u.role === 'staff' && can(u, 'care.work'),
    async run(user) {
      const cases = await HoSoChamSoc.find({
        assignedStaffId: user.id,
        status: { $in: [...OPEN_CARE_STATUSES] },
      })
        .populate('studentId', 'studentCode fullName classCode')
        .sort({ dueDate: 1, updatedAt: -1 })
        .lean();
      return {
        tongSo: cases.length,
        danhSach: cases.slice(0, MAX_ROWS).map((c) => ({
          mssv: c.studentId?.studentCode,
          hoTen: c.studentId?.fullName,
          lop: c.studentId?.classCode,
          trangThai: toLabel(c.status),
          lyDo: c.reason || null,
          chiDao: c.directive || null,
          han: fmtDate(c.dueDate),
          buocDaLam: `${c.steps.filter((st) => st.done).length}/${c.steps.length}`,
          buocTiepTheo: c.steps.find((st) => !st.done)?.title || null,
          nguyenNhan: c.cause || null,
        })),
      };
    },
  },
  {
    name: 'viec_duoc_giao_cua_toi',
    label: 'Nhiệm vụ nội bộ được giao cho tôi',
    description:
      'Các nhiệm vụ nội bộ (giao việc) của người dùng: trạng thái, hạn chót, ghi chú duyệt.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    allowed: (u) => u.role === 'staff',
    async run(user) {
      const tasks = await NhiemVu.find({ assignedTo: user.id })
        .sort({ createdAt: -1 })
        .limit(MAX_ROWS)
        .select('title description status dueDate reviewNote')
        .lean();
      return {
        danhSach: tasks.map((t) => ({
          tieuDe: t.title,
          moTa: t.description.slice(0, 300),
          trangThai: toLabel(t.status),
          hanChot: fmtDate(t.dueDate),
          quaHan: Boolean(
            t.dueDate && new Date(t.dueDate) < new Date() && t.status !== TASK_STATUS.COMPLETED,
          ),
          nhanXetDuyet: t.reviewNote || null,
        })),
      };
    },
  },
  {
    name: 'tong_quan_he_thong',
    label: 'Số liệu tổng quan toàn trường',
    description:
      'Tổng số sinh viên, học phần, nhân viên, buổi điểm danh, hồ sơ chăm sóc và nhiệm vụ nội bộ theo trạng thái.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    // School-wide numbers: only for the whole-school AI right (reports.view is class-scoped for CSSV).
    allowed: (u) => can(u, 'ai.chat'),
    async run() {
      const byStatus = (Model) =>
        Model.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).then((rows) =>
          Object.fromEntries(rows.map((r) => [toLabel(r._id), r.count])),
        );
      const [
        sinhVien,
        hocPhan,
        nhanVien,
        giangVien,
        buoiDiemDanh,
        goiDien,
        noiBo,
        hangCho,
        levels,
      ] = await Promise.all([
        SinhVien.countDocuments(),
        NhomHocPhan.countDocuments(),
        NguoiDung.countDocuments({ role: 'staff', status: 'active' }),
        NguoiDung.countDocuments({ role: 'teacher', status: 'active' }),
        DiemDanh.countDocuments(),
        byStatus(HoSoChamSoc),
        byStatus(NhiemVu),
        HoSoChamSoc.countDocuments({ status: CARE_STATUS.AWAITING }),
        getWarningLevels(),
      ]);
      return {
        sinhVien,
        hocPhan,
        nhanVienCSSV: nhanVien,
        giangVien,
        buoiDiemDanh,
        hoSoChamSoc: goiDien,
        nhiemVuNoiBo: noiBo,
        hoSoChoChiDao: hangCho,
        cacMucCanhBao: describeLevels(levels),
      };
    },
  },
  {
    name: 'ly_do_vang_pho_bien',
    label: 'Phân tích lý do vắng học',
    description: 'Các nguyên nhân vắng học nhân viên đã tìm hiểu được trong hồ sơ chăm sóc.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    allowed: (u) => can(u, 'reports.view'),
    async run() {
      const rows = await HoSoChamSoc.aggregate([
        { $match: { cause: { $nin: ['', null] } } },
        { $group: { _id: '$cause', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]);
      return { lyDo: rows.map((r) => ({ lyDo: r._id, soLan: r.count })) };
    },
  },
  {
    name: 'khoi_luong_nhan_vien',
    label: 'Khối lượng công việc và tiến độ nhân viên CSSV',
    description:
      'Theo từng nhân viên CSSV: số hồ sơ chăm sóc đang làm, chờ duyệt kết thúc, quá hạn, đã kết thúc, và nhiệm vụ nội bộ đang làm / chờ duyệt / quá hạn.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    allowed: (u) => can(u, 'tasks.manage') || can(u, 'care.manage'),
    async run() {
      const now = new Date();
      const [staff, calls, tasks] = await Promise.all([
        NguoiDung.find({ role: 'staff', status: 'active' }).select('fullName').lean(),
        HoSoChamSoc.aggregate([
          { $match: { assignedStaffId: { $ne: null } } },
          {
            $group: {
              _id: '$assignedStaffId',
              open: { $sum: { $cond: [{ $eq: ['$status', CARE_STATUS.IN_PROGRESS] }, 1, 0] } },
              closing: { $sum: { $cond: [{ $eq: ['$status', CARE_STATUS.CLOSING] }, 1, 0] } },
              closed: { $sum: { $cond: [{ $eq: ['$status', CARE_STATUS.CLOSED] }, 1, 0] } },
              overdue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$status', CARE_STATUS.IN_PROGRESS] },
                        { $ne: ['$dueDate', null] },
                        { $lt: ['$dueDate', now] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]),
        NhiemVu.aggregate([
          {
            $group: {
              _id: '$assignedTo',
              inProgress: {
                $sum: {
                  $cond: [
                    {
                      $in: [
                        '$status',
                        [TASK_STATUS.PENDING, TASK_STATUS.ACKNOWLEDGED, TASK_STATUS.REJECTED],
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              submitted: { $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.SUBMITTED] }, 1, 0] } },
              overdue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ['$status', TASK_STATUS.COMPLETED] },
                        { $ne: ['$dueDate', null] },
                        { $lt: ['$dueDate', now] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]),
      ]);
      const callMap = Object.fromEntries(calls.map((c) => [String(c._id), c]));
      const taskMap = Object.fromEntries(tasks.map((t) => [String(t._id), t]));
      return {
        nhanVien: staff.map((s) => {
          const c = callMap[String(s._id)] || {};
          const t = taskMap[String(s._id)] || {};
          return {
            hoTen: s.fullName,
            hoSoDangChamSoc: c.open || 0,
            hoSoChoDuyetKetThuc: c.closing || 0,
            hoSoQuaHan: c.overdue || 0,
            hoSoDaKetThuc: c.closed || 0,
            viecDangLam: t.inProgress || 0,
            viecChoDuyet: t.submitted || 0,
            viecQuaHan: t.overdue || 0,
          };
        }),
      };
    },
  },
  {
    name: 'viec_cho_duyet',
    label: 'Nhiệm vụ nội bộ đang chờ duyệt',
    description: 'Các nhiệm vụ nhân viên đã nộp minh chứng và đang chờ người quản lý duyệt.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    allowed: (u) => can(u, 'tasks.manage'),
    async run() {
      const tasks = await NhiemVu.find({ status: TASK_STATUS.SUBMITTED })
        .populate('assignedTo', 'fullName')
        .sort({ submittedAt: 1 })
        .limit(MAX_ROWS)
        .select('title assignedTo submittedAt dueDate evidenceNote')
        .lean();
      return {
        danhSach: tasks.map((t) => ({
          tieuDe: t.title,
          nguoiThucHien: t.assignedTo?.fullName,
          ngayNop: fmtDate(t.submittedAt),
          hanChot: fmtDate(t.dueDate),
          ghiChuMinhChung: (t.evidenceNote || '').slice(0, 200) || null,
        })),
      };
    },
  },
  {
    name: 'lop_phu_trach_cua_toi',
    label: 'Các lớp hành chính tôi đang phụ trách',
    description:
      'Lớp hành chính nhân viên đang phụ trách (sĩ số, phụ trách từ ngày nào), số hồ sơ chăm sóc đang mở và các lớp đã từng phụ trách.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    allowed: isStaff,
    async run(user) {
      const history = await LichSuPhanCong.find({ staffId: user.id })
        .sort({ startedAt: -1 })
        .lean();
      const current = history.filter((h) => h.active);
      const counts = await SinhVien.aggregate([
        { $match: { classCode: { $in: current.map((h) => h.classCode) } } },
        { $group: { _id: '$classCode', n: { $sum: 1 } } },
      ]);
      const countMap = Object.fromEntries(counts.map((c) => [c._id, c.n]));
      const open = await HoSoChamSoc.countDocuments({
        assignedStaffId: user.id,
        status: { $in: [...OPEN_CARE_STATUSES] },
      });
      return {
        dangPhuTrach: current.map((h) => ({
          lop: h.classCode,
          siSo: countMap[h.classCode] || 0,
          tuNgay: fmtDate(h.startedAt),
        })),
        hoSoChamSocDangMo: open,
        daTungPhuTrach: history
          .filter((h) => !h.active)
          .slice(0, 15)
          .map((h) => ({
            lop: h.classCode,
            tu: fmtDate(h.startedAt),
            den: fmtDate(h.endedAt),
            lyDo: h.endReason,
          })),
      };
    },
  },
  {
    name: 'phan_cong_lop',
    label: 'Phân công lớp hành chính và hồ sơ chờ chỉ đạo',
    description:
      'Lớp nào do nhân viên nào phụ trách, lớp nào chưa có người phụ trách, số hồ sơ chăm sóc đang chờ chỉ đạo, và lịch sử chuyển lớp gần đây.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    allowed: (u) => can(u, 'classes.assign') || can(u, 'care.manage'),
    async run() {
      const [classes, active, queue, recent] = await Promise.all([
        SinhVien.aggregate([
          { $match: { classCode: { $nin: ['', null] } } },
          { $group: { _id: { $toUpper: '$classCode' }, n: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
        LichSuPhanCong.find({ active: true }).lean(),
        HoSoChamSoc.countDocuments({ status: CARE_STATUS.AWAITING }),
        LichSuPhanCong.find({ active: false }).sort({ endedAt: -1 }).limit(10).lean(),
      ]);
      const owner = new Map(active.map((a) => [a.classCode, a]));
      return {
        lop: classes.map((c) => ({
          lop: c._id,
          siSo: c.n,
          nhanVienPhuTrach: owner.get(c._id)?.staffName || 'CHƯA PHÂN CÔNG',
          tuNgay: fmtDate(owner.get(c._id)?.startedAt),
        })),
        hoSoChoChiDao: queue,
        chuyenLopGanDay: recent.map((r) => ({
          lop: r.classCode,
          nhanVienCu: r.staffName,
          ketThuc: fmtDate(r.endedAt),
          lyDo: r.endReason,
        })),
      };
    },
  },
  {
    name: 'cau_hinh_ket_noi',
    label: 'Tình trạng cấu hình API (AI, tổng đài, email)',
    description:
      'Các khóa API tích hợp đã được cấu hình chưa và lấy từ đâu (giao diện quản trị hay file .env). Không bao giờ trả về giá trị bí mật.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    allowed: (u) => u.role === 'admin',
    async run() {
      const status = {
        none: 'Chưa cấu hình',
        database: 'Đã cấu hình trên giao diện',
        env: 'Đang dùng giá trị trong .env',
      };
      return {
        ketNoi: describeIntegrations().map((i) => ({
          nhom: i.group,
          muc: i.label,
          trangThai: status[i.source],
        })),
      };
    },
  },
  {
    name: 'goi_dich_vu',
    label: 'Tình trạng gói dịch vụ của hệ thống',
    description: 'Gói đang dùng, ngày hết hạn và số ngày còn lại của hệ thống.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    allowed: (u) => u.role === 'admin',
    async run() {
      const s = await getSubscription();
      return {
        goi: s.isTrial ? 'Dùng thử' : s.plan,
        conHieuLuc: s.active,
        hetHan: fmtDate(s.expiresAt),
        soNgayConLai: s.daysLeft,
      };
    },
  },
];

// ============================ Role profiles ============================
// Vai trò chính, hướng dẫn trang chức năng và câu hỏi gợi ý hiển thị trên giao diện.
const ROLE_PROFILES = {
  teacher: {
    focus:
      'Hỗ trợ giảng viên: nắm lịch dạy và giờ mở điểm danh, theo dõi tiết nghỉ và mức cảnh báo của sinh viên lớp mình, gợi ý cách nhắc nhở và trao đổi với sinh viên.',
    pages:
      '"Điểm danh" (chỉ mở trong giờ học theo thời khóa biểu, sửa được đến hết ngày; sau khi lưu có thể chọn gọi cho sinh viên vắng hoặc bỏ qua; xem lịch sử và thống kê tiết nghỉ), "Hồ sơ chăm sóc" (đề xuất chăm sóc sinh viên có dấu hiệu bỏ học và xem tiến độ hồ sơ mình đề xuất), "Thời khóa biểu", "Lịch sử cuộc gọi" (chỉ nghe lại ghi âm cuộc gọi của mình).',
    suggestions: [
      'Hôm nay tôi có lớp nào, mấy giờ được điểm danh?',
      'Sinh viên nào trong các lớp của tôi đã chạm mức cảnh báo?',
      'Gợi ý cách nhắc nhở một sinh viên hay vắng học',
    ],
    actionSuggestions: ['Mở trang thời khóa biểu'],
  },
  staff: {
    focus:
      'Hỗ trợ nhân viên chăm sóc sinh viên (CSSV): làm các hồ sơ chăm sóc được giao theo chỉ đạo của cấp quản lý — ưu tiên hồ sơ gấp, chuẩn bị nội dung cuộc gọi, tìm hiểu nguyên nhân, đề xuất hướng giải quyết, báo khó khăn, theo dõi nhiệm vụ được giao.',
    pages:
      '"Hồ sơ chăm sóc" (hồ sơ được giao: các bước chăm sóc, gọi điện, nguyên nhân, hướng giải quyết, trao đổi với cấp quản lý, đề nghị kết thúc), "Giao việc" (xác nhận và nộp minh chứng), "Báo cáo" (chỉ lớp mình phụ trách), "Lịch sử cuộc gọi" (chỉ nghe lại ghi âm của mình).',
    suggestions: [
      'Hôm nay tôi nên ưu tiên hồ sơ chăm sóc nào?',
      'Lớp tôi phụ trách có sinh viên nào chạm mức cảnh báo?',
      'Soạn kịch bản gọi cho sinh viên nghỉ học nhiều',
    ],
    actionSuggestions: [
      'Giúp tôi ghi nguyên nhân và hướng giải quyết vào hồ sơ của một sinh viên',
      'Xác nhận tôi đã nhận việc mới nhất',
    ],
  },
  manager: {
    focus:
      'Hỗ trợ Trưởng phòng / Phó hiệu trưởng: tổng quan chuyên cần toàn trường theo các mức cảnh báo, chỉ đạo nhân viên chăm sóc các hồ sơ chờ chỉ đạo, theo dõi hồ sơ đã chăm sóc tới đâu, duyệt kết thúc hồ sơ, phân lớp cho nhân viên CSSV, giao việc và giám sát tiến độ.',
    pages:
      '"Hồ sơ chăm sóc" (hồ sơ chờ chỉ đạo, đang chăm sóc, chờ duyệt kết thúc, lịch sử), "Quản lý" (giao việc, duyệt minh chứng, phân lớp CSSV & lịch sử phân công, học phần & thời khóa biểu, cấu hình mức cảnh báo, báo cáo), "Sinh viên", "Điểm danh" (sửa ngoài giờ khi cần), "Lịch sử cuộc gọi" (nghe lại mọi ghi âm).',
    suggestions: [
      'Tóm tắt tình hình chuyên cần theo từng mức cảnh báo',
      'Lớp nào chưa có nhân viên phụ trách? Còn bao nhiêu hồ sơ chờ chỉ đạo?',
      'Nhân viên nào đang quá tải hoặc chậm tiến độ?',
    ],
    actionSuggestions: [
      'Giao việc tổng hợp danh sách SV nguy cơ cấm thi cho nhân viên ít việc nhất, hạn thứ 6',
      'Giao lớp chưa có người phụ trách cho nhân viên đang ít việc nhất',
    ],
  },
  admin: {
    focus:
      'Hỗ trợ Quản trị viên hệ thống: tài khoản, phân quyền, cấu hình hệ thống / API / giao diện, gói dịch vụ. Admin được xem dữ liệu nghiệp vụ để hỗ trợ kỹ thuật nhưng không thao tác nghiệp vụ (giao việc, cảnh báo, phân lớp thuộc Trưởng phòng).',
    pages:
      '"Quản trị" (tài khoản, phân quyền, cấu hình hệ thống, cấu hình API, giao diện web), "Gói dịch vụ"; xem (chỉ đọc) "Sinh viên", "Hồ sơ chăm sóc", "Báo cáo".',
    suggestions: [
      'Các kết nối API (AI, tổng đài, email) đã cấu hình đủ chưa?',
      'Gói dịch vụ còn bao nhiêu ngày?',
      'Báo cáo nhanh tình hình hệ thống hôm nay',
    ],
  },
};

// Look-up tools plus the actions this user may ask AI Care to prepare (see dichVuAiThaoTac).
const toolsFor = (user) => [...TOOLS.filter((t) => t.allowed(user)), ...actionTools(user)];

function profileFor(user) {
  const profile = ROLE_PROFILES[user.role] || ROLE_PROFILES.staff;
  return {
    name: 'AI Care',
    role: user.role,
    roleLabel: ROLE_LABEL[user.role] || user.role,
    focus: profile.focus,
    capabilities: toolsFor(user).map((t) => t.label),
    suggestions: [...profile.suggestions, ...(profile.actionSuggestions || [])],
  };
}

/**
 * System prompt with the school's current rules (warning levels configured by the manager,
 * attendance window, class assignment), rebuilt on every request so AI Care always knows the
 * latest configuration.
 */
async function systemPromptFor(user) {
  const profile = ROLE_PROFILES[user.role] || ROLE_PROFILES.staff;
  const levels = await getWarningLevels();
  return `Bạn là AI Care — trợ lý AI của hệ thống ITC SinhVien Care (quản lý điểm danh và chăm sóc sinh viên của một trường cao đẳng tại Việt Nam).

Hôm nay: ${new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' })} (khi cần ngày cụ thể, quy đổi "thứ 6 này", "tuần sau"... sang YYYY-MM-DD).
Người đang trò chuyện: ${user.fullName} — vai trò ${ROLE_LABEL[user.role] || user.role}.
Nhiệm vụ của bạn với vai trò này: ${profile.focus}
Các trang chức năng người dùng này có thể mở: ${profile.pages}

Quy định hiện hành của trường (theo cấu hình mới nhất):
- Phân vai: Admin quản trị hệ thống (tài khoản, phân quyền, cấu hình, API, giao diện) và chỉ xem dữ liệu nghiệp vụ. Trưởng phòng / Phó hiệu trưởng chỉ đạo chăm sóc, duyệt kết thúc hồ sơ, giao việc, phân lớp cho nhân viên CSSV, cấu hình mức cảnh báo. Nhân viên CSSV làm các hồ sơ chăm sóc được giao và xem được sinh viên các lớp mình phụ trách; khi chuyển lớp, lịch sử phân công vẫn được lưu. Giảng viên điểm danh học phần mình dạy, có thể gọi cho sinh viên vắng (không bắt buộc) và đề xuất chăm sóc.
- Hồ sơ chăm sóc: khi sinh viên chạm một mức cảnh báo vắng, hệ thống mở hồ sơ và mặc định giao cho nhân viên phụ trách lớp hành chính của sinh viên (lớp chưa có người phụ trách thì chờ Trưởng phòng / PHT chỉ đạo). Giảng viên, nhân viên cũng có thể đề xuất mở hồ sơ cho sinh viên có dấu hiệu bỏ học; hồ sơ đề xuất chờ cấp quản lý chỉ đạo. Hồ sơ có các bước chăm sóc (mặc định, do quản lý tạo hoặc AI gợi ý), nguyên nhân, hướng giải quyết, trao đổi hai chiều và các cuộc gọi. Nhân viên đề nghị kết thúc kèm báo cáo kết quả, Trưởng phòng / PHT duyệt thì hồ sơ vào lịch sử (có thể kết thúc sớm).
- Gọi điện: trước mỗi cuộc gọi người gọi chọn có ghi âm hay không. Nhân viên và giảng viên chỉ nghe lại được ghi âm cuộc gọi của mình; Trưởng phòng / PHT nghe được mọi ghi âm.
- Điểm danh: giảng viên chỉ điểm danh được vào ngày có lịch học, từ ${ATTENDANCE_EARLY_MINUTES} phút trước giờ vào lớp đến hết giờ học; đã điểm danh thì được sửa đến hết ngày. Ngoài khung này phải nhờ Trưởng phòng (quyền điểm danh ngoài giờ).
- Vắng học được tính theo số tiết nghỉ không phép (mỗi buổi vắng = số tiết của buổi học), so với tổng số tiết của học phần.
- Các mức cảnh báo (từ nhẹ đến nặng) do Trưởng phòng / PHT cấu hình:
${describeLevels(levels)}

Nguyên tắc:
- Khi cần số liệu thật, hãy dùng công cụ được cung cấp. Công cụ đã giới hạn sẵn dữ liệu theo phạm vi quyền của người dùng; không bao giờ bịa số liệu, tên hay mã sinh viên.
- Khi nói về mức cảnh báo, dùng đúng tên mức ở trên; ưu tiên sinh viên ở mức nặng hơn.
- Nếu người dùng hỏi điều nằm ngoài quyền hoặc công cụ của họ, nói rõ là vai trò hiện tại không xem được và gợi ý liên hệ người phụ trách (Trưởng phòng cho nghiệp vụ, Quản trị viên cho hệ thống), thay vì đoán.
- Thao tác thay người dùng: nếu họ muốn làm một việc và bạn có công cụ thao tác tương ứng (cap_nhat_ho_so_cham_soc, xac_nhan_nhan_viec, giao_viec, duyet_nhiem_vu, phan_lop_cskh), hãy gọi công cụ đó để SOẠN thao tác. Công cụ không làm thay đổi gì: giao diện sẽ hiện thẻ Xác nhận / Hủy, và chỉ khi người dùng bấm Xác nhận thì thao tác mới chạy. Vì vậy tuyệt đối không nói là "đã làm xong"; hãy tóm tắt những gì sẽ thay đổi và nhắc bấm Xác nhận. Thiếu thông tin bắt buộc (vd tên nhân viên, MSSV, tiêu đề) thì hỏi lại, không tự bịa. Nếu công cụ báo lỗi hoặc nhiều kết quả khớp, nói lại cho người dùng.
- Khi người dùng muốn mở một trang, dùng công cụ mo_trang. Việc không có công cụ thao tác (vd điểm danh, nộp minh chứng kèm file) thì hướng dẫn mở đúng trang và các bước cần làm.
- Tôn trọng sinh viên: nhận xét mang tính hỗ trợ, không phán xét, không suy diễn hoàn cảnh cá nhân.
- Trả lời bằng tiếng Việt, ngắn gọn, rõ ràng; dùng gạch đầu dòng hoặc bảng markdown đơn giản khi liệt kê.`;
}

/**
 * Runs the tool the model asked for, re-checking permission on every call. Action tools only
 * prepare a proposal, collected in ctx.actions (ctx.navigate for page opening) for the UI.
 */
async function executeTool(user, name, input, ctx = { actions: [], navigate: null }) {
  const tool = TOOLS.find((t) => t.name === name);
  if (tool) {
    if (!tool.allowed(user)) return { loi: 'Công cụ không khả dụng cho vai trò của bạn' };
    return tool.run(user, input || {});
  }
  return (
    (await handleActionTool(user, name, input, ctx)) ?? {
      loi: 'Công cụ không khả dụng cho vai trò của bạn',
    }
  );
}

const toolDefinitions = (user) =>
  toolsFor(user).map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));

module.exports = { profileFor, systemPromptFor, toolDefinitions, executeTool };
