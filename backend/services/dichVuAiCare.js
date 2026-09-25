// AI Care — trợ lý AI dùng chung cho mọi vai trò. Mỗi người dùng chỉ được trao những công cụ
// (tra cứu dữ liệu) mà quyền của họ cho phép, và mỗi công cụ tự giới hạn dữ liệu theo phạm vi
// của người hỏi (giảng viên: học phần mình dạy; CSKH: sinh viên mình phụ trách...).
// Không gửi số điện thoại hay dữ liệu liên lạc của sinh viên cho mô hình.
const mongoose = require('mongoose');
const SinhVien = require('../models/SinhVien');
const NhomHocPhan = require('../models/NhomHocPhan');
const DiemDanh = require('../models/DiemDanh');
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
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
const {
  ROLE_LABEL,
  OPEN_CALL_STATUSES,
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
 * the user may not see attendance at all. Teachers: groups they teach. CSKH: students of their
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
      const latestCalls = await NhiemVuGoiDien.find({
        studentId: { $in: rows.map((r) => r._id.student) },
      })
        .sort({ createdAt: -1 })
        .select('studentId courseGroupId status absenceReasonCategory')
        .lean();
      const callKey = (g, s) => `${g}:${s}`;
      const callMap = {};
      for (const c of latestCalls) {
        const key = callKey(c.courseGroupId, c.studentId);
        if (!callMap[key]) callMap[key] = c;
      }
      return {
        cacMucCanhBao: describeLevels(levels),
        danhSach: rows.map((r) => {
          const s = studentMap[String(r._id.student)];
          const g = groupMap[String(r._id.group)];
          const call = callMap[callKey(r._id.group, r._id.student)];
          return {
            mssv: s?.studentCode,
            hoTen: s?.fullName,
            lop: s?.classCode,
            hocPhan: `${g?.courseName || ''} (${g?.groupCode})`,
            soBuoiVang: r.absent,
            soTietNghi: r.absentPeriods,
            phanTramTongTiet: r.absentPercent,
            mucCanhBao: warningText(r),
            chamSocGanNhat: call
              ? `${toLabel(call.status)}${call.absenceReasonCategory ? ` — ${call.absenceReasonCategory}` : ''}`
              : 'Chưa có nhiệm vụ gọi',
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
              NhiemVuGoiDien.find({ studentId: s._id })
                .sort({ createdAt: -1 })
                .limit(5)
                .select(
                  'status callNote absenceReasonCategory absenceDate callbackDate callAttempts',
                )
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
              lichSuChamSoc: calls.map((c) => ({
                ngayVang: fmtDate(c.absenceDate),
                trangThai: toLabel(c.status),
                lyDo: c.absenceReasonCategory || null,
                ghiChu: c.callNote || null,
                soLanGoi: c.callAttempts,
                henGoiLai: fmtDate(c.callbackDate),
              })),
            };
          }),
        ),
      };
    },
  },
  {
    name: 'nhiem_vu_goi_dien_cua_toi',
    label: 'Danh sách cuộc gọi chăm sóc cần xử lý của tôi',
    description:
      'Nhiệm vụ gọi điện chưa hoàn tất được giao cho chính người dùng, ưu tiên các cuộc đến hạn gọi lại.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    allowed: (u) => u.role === 'staff' && can(u, 'callTasks.update'),
    async run(user) {
      const now = new Date();
      const tasks = await NhiemVuGoiDien.find({
        assignedStaffId: user.id,
        status: { $in: OPEN_CALL_STATUSES },
      })
        .populate('studentId', 'studentCode fullName classCode')
        .populate('courseGroupId', 'groupCode courseName')
        .sort({ absenceDate: 1 })
        .lean();
      const due = (t) => Boolean(t.callbackDate && new Date(t.callbackDate) <= now);
      tasks.sort((a, b) => Number(due(b)) - Number(due(a)));
      return {
        tongSo: tasks.length,
        denHanGoiLai: tasks.filter(due).length,
        danhSach: tasks.slice(0, MAX_ROWS).map((t) => ({
          mssv: t.studentId?.studentCode,
          hoTen: t.studentId?.fullName,
          lop: t.studentId?.classCode,
          hocPhan: t.courseGroupId?.courseName,
          ngayVang: fmtDate(t.absenceDate),
          trangThai: toLabel(t.status),
          soLanGoi: t.callAttempts,
          henGoiLai: fmtDate(t.callbackDate),
          denHanGoiLai: due(t),
          ghiChu: t.callNote || null,
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
      'Tổng số sinh viên, học phần, nhân viên, buổi điểm danh, nhiệm vụ gọi điện và nhiệm vụ nội bộ theo trạng thái.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    allowed: (u) => can(u, 'reports.view') || can(u, 'ai.chat'),
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
        byStatus(NhiemVuGoiDien),
        byStatus(NhiemVu),
        NhiemVuGoiDien.countDocuments({
          assignedStaffId: null,
          status: { $in: OPEN_CALL_STATUSES },
        }),
        getWarningLevels(),
      ]);
      return {
        sinhVien,
        hocPhan,
        nhanVienCSKH: nhanVien,
        giangVien,
        buoiDiemDanh,
        nhiemVuGoiDien: goiDien,
        nhiemVuNoiBo: noiBo,
        cuocGoiTrongHangChoChuaPhanCong: hangCho,
        cacMucCanhBao: describeLevels(levels),
      };
    },
  },
  {
    name: 'ly_do_vang_pho_bien',
    label: 'Phân tích lý do vắng học',
    description: 'Thống kê lý do vắng đã ghi nhận qua các cuộc gọi chăm sóc (theo nhóm lý do).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    allowed: (u) => can(u, 'reports.view'),
    async run() {
      const rows = await NhiemVuGoiDien.aggregate([
        { $match: { absenceReasonCategory: { $nin: ['', null] } } },
        { $group: { _id: '$absenceReasonCategory', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]);
      return { lyDo: rows.map((r) => ({ lyDo: r._id, soLan: r.count })) };
    },
  },
  {
    name: 'khoi_luong_nhan_vien',
    label: 'Khối lượng công việc và tiến độ nhân viên CSKH',
    description:
      'Theo từng nhân viên CSKH: số cuộc gọi đang mở, đến hạn gọi lại, đã liên hệ, và nhiệm vụ nội bộ đang làm / chờ duyệt / quá hạn.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    allowed: (u) => can(u, 'tasks.manage') || can(u, 'callTasks.viewAll'),
    async run() {
      const now = new Date();
      const [staff, calls, tasks] = await Promise.all([
        NguoiDung.find({ role: 'staff', status: 'active' }).select('fullName').lean(),
        NhiemVuGoiDien.aggregate([
          {
            $group: {
              _id: '$assignedStaffId',
              open: { $sum: { $cond: [{ $in: ['$status', OPEN_CALL_STATUSES] }, 1, 0] } },
              contacted: { $sum: { $cond: [{ $in: ['$status', OPEN_CALL_STATUSES] }, 0, 1] } },
              callbackDue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $in: ['$status', OPEN_CALL_STATUSES] },
                        { $ne: ['$callbackDate', null] },
                        { $lte: ['$callbackDate', now] },
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
            cuocGoiDangMo: c.open || 0,
            denHanGoiLai: c.callbackDue || 0,
            daLienHe: c.contacted || 0,
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
      'Lớp hành chính nhân viên đang phụ trách (sĩ số, phụ trách từ ngày nào), tổng cuộc gọi đang mở và các lớp đã từng phụ trách.',
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
      const open = await NhiemVuGoiDien.countDocuments({
        assignedStaffId: user.id,
        status: { $in: OPEN_CALL_STATUSES },
      });
      return {
        dangPhuTrach: current.map((h) => ({
          lop: h.classCode,
          siSo: countMap[h.classCode] || 0,
          tuNgay: fmtDate(h.startedAt),
        })),
        tongCuocGoiDangMo: open,
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
    label: 'Phân công lớp hành chính và hàng chờ chưa phân công',
    description:
      'Lớp nào do nhân viên nào phụ trách, lớp nào chưa có người phụ trách, số cuộc gọi đang nằm trong hàng chờ chưa phân công, và lịch sử chuyển lớp gần đây.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    allowed: (u) => can(u, 'classes.assign') || can(u, 'callTasks.viewAll'),
    async run() {
      const [classes, active, queue, recent] = await Promise.all([
        SinhVien.aggregate([
          { $match: { classCode: { $nin: ['', null] } } },
          { $group: { _id: { $toUpper: '$classCode' }, n: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
        LichSuPhanCong.find({ active: true }).lean(),
        NhiemVuGoiDien.countDocuments({
          assignedStaffId: null,
          status: { $in: OPEN_CALL_STATUSES },
        }),
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
        cuocGoiTrongHangCho: queue,
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
      '"Điểm danh" (chỉ mở trong giờ học theo thời khóa biểu, sửa được đến hết ngày; xem lịch sử và thống kê tiết nghỉ), "Thời khóa biểu", "Lịch sử cuộc gọi" (mọi cuộc gọi cho sinh viên đều được lưu).',
    suggestions: [
      'Hôm nay tôi có lớp nào, mấy giờ được điểm danh?',
      'Sinh viên nào trong các lớp của tôi đã chạm mức cảnh báo?',
      'Gợi ý cách nhắc nhở một sinh viên hay vắng học',
    ],
  },
  staff: {
    focus:
      'Hỗ trợ nhân viên chăm sóc sinh viên (CSKH) các lớp hành chính được phân công: sắp xếp thứ tự gọi điện theo mức cảnh báo, chuẩn bị nội dung cuộc gọi, ghi nhận kết quả, theo dõi nhiệm vụ được giao.',
    pages:
      '"Chăm sóc SV" (danh sách cuộc gọi của các lớp mình phụ trách, cập nhật trạng thái, hẹn gọi lại, gợi ý AI), "Giao việc" (xác nhận và nộp minh chứng), "Báo cáo" (chỉ lớp mình phụ trách), "Lịch sử cuộc gọi".',
    suggestions: [
      'Hôm nay tôi nên gọi cho ai trước?',
      'Lớp tôi phụ trách có sinh viên nào chạm mức cảnh báo?',
      'Soạn kịch bản gọi cho sinh viên sắp bị cấm thi',
    ],
  },
  manager: {
    focus:
      'Hỗ trợ Trưởng phòng / Phó hiệu trưởng: tổng quan chuyên cần toàn trường theo các mức cảnh báo, phân lớp cho nhân viên CSKH và xử lý hàng chờ chưa phân công, giao việc và giám sát tiến độ, gợi ý điều chỉnh mức cảnh báo.',
    pages:
      '"Quản lý" (giao việc, duyệt minh chứng, phân lớp CSKH & lịch sử phân công, học phần & thời khóa biểu, cấu hình mức cảnh báo, báo cáo), "Sinh viên", "Chăm sóc SV" (giám sát, hàng chờ), "Điểm danh" (sửa ngoài giờ khi cần), "Lịch sử cuộc gọi".',
    suggestions: [
      'Tóm tắt tình hình chuyên cần theo từng mức cảnh báo',
      'Lớp nào chưa có nhân viên phụ trách? Hàng chờ còn bao nhiêu cuộc gọi?',
      'Nhân viên nào đang quá tải hoặc chậm tiến độ?',
    ],
  },
  admin: {
    focus:
      'Hỗ trợ Quản trị viên hệ thống: tài khoản, phân quyền, cấu hình hệ thống / API / giao diện, gói dịch vụ. Admin được xem dữ liệu nghiệp vụ để hỗ trợ kỹ thuật nhưng không thao tác nghiệp vụ (giao việc, cảnh báo, phân lớp thuộc Trưởng phòng).',
    pages:
      '"Quản trị" (tài khoản, phân quyền, cấu hình hệ thống, cấu hình API, giao diện web), "Gói dịch vụ"; xem (chỉ đọc) "Sinh viên", "Chăm sóc SV", "Báo cáo".',
    suggestions: [
      'Các kết nối API (AI, tổng đài, email) đã cấu hình đủ chưa?',
      'Gói dịch vụ còn bao nhiêu ngày?',
      'Báo cáo nhanh tình hình hệ thống hôm nay',
    ],
  },
};

const toolsFor = (user) => TOOLS.filter((t) => t.allowed(user));

function profileFor(user) {
  const profile = ROLE_PROFILES[user.role] || ROLE_PROFILES.staff;
  return {
    name: 'AI Care',
    role: user.role,
    roleLabel: ROLE_LABEL[user.role] || user.role,
    focus: profile.focus,
    capabilities: toolsFor(user).map((t) => t.label),
    suggestions: profile.suggestions,
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

Người đang trò chuyện: ${user.fullName} — vai trò ${ROLE_LABEL[user.role] || user.role}.
Nhiệm vụ của bạn với vai trò này: ${profile.focus}
Các trang chức năng người dùng này có thể mở: ${profile.pages}

Quy định hiện hành của trường (theo cấu hình mới nhất):
- Phân vai: Admin quản trị hệ thống (tài khoản, phân quyền, cấu hình, API, giao diện) và chỉ xem dữ liệu nghiệp vụ. Trưởng phòng / Phó hiệu trưởng giao việc, phân lớp cho nhân viên CSKH, cấu hình mức cảnh báo. Nhân viên CSKH chăm sóc sinh viên theo lớp hành chính được phân công và chỉ xem được các lớp đó; khi chuyển lớp, lịch sử phân công vẫn được lưu. Giảng viên điểm danh học phần mình dạy và có thể gọi điện cho sinh viên (mọi cuộc gọi đều được lưu lịch sử).
- Điểm danh: giảng viên chỉ điểm danh được vào ngày có lịch học, từ ${ATTENDANCE_EARLY_MINUTES} phút trước giờ vào lớp đến hết giờ học; đã điểm danh thì được sửa đến hết ngày. Ngoài khung này phải nhờ Trưởng phòng (quyền điểm danh ngoài giờ).
- Vắng học được tính theo số tiết nghỉ không phép (mỗi buổi vắng = số tiết của buổi học), so với tổng số tiết của học phần.
- Các mức cảnh báo (từ nhẹ đến nặng) do Trưởng phòng / PHT cấu hình:
${describeLevels(levels)}
- Sinh viên vắng thuộc lớp chưa có nhân viên phụ trách sẽ vào hàng chờ của Trưởng phòng.

Nguyên tắc:
- Khi cần số liệu thật, hãy dùng công cụ được cung cấp. Công cụ đã giới hạn sẵn dữ liệu theo phạm vi quyền của người dùng; không bao giờ bịa số liệu, tên hay mã sinh viên.
- Khi nói về mức cảnh báo, dùng đúng tên mức ở trên; ưu tiên sinh viên ở mức nặng hơn.
- Nếu người dùng hỏi điều nằm ngoài quyền hoặc công cụ của họ, nói rõ là vai trò hiện tại không xem được và gợi ý liên hệ người phụ trách (Trưởng phòng cho nghiệp vụ, Quản trị viên cho hệ thống), thay vì đoán.
- Với việc cần thao tác (điểm danh, cập nhật cuộc gọi, duyệt nhiệm vụ...), bạn không tự thực hiện được: hướng dẫn người dùng mở đúng trang và các bước cần làm.
- Tôn trọng sinh viên: nhận xét mang tính hỗ trợ, không phán xét, không suy diễn hoàn cảnh cá nhân.
- Trả lời bằng tiếng Việt, ngắn gọn, rõ ràng; dùng gạch đầu dòng hoặc bảng markdown đơn giản khi liệt kê.`;
}

/** Runs the tool the model asked for, re-checking permission on every call. */
async function executeTool(user, name, input) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool || !tool.allowed(user)) return { loi: 'Công cụ không khả dụng cho vai trò của bạn' };
  return tool.run(user, input || {});
}

const toolDefinitions = (user) =>
  toolsFor(user).map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));

module.exports = { profileFor, systemPromptFor, toolDefinitions, executeTool };
