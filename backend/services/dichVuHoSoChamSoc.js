// Hồ sơ chăm sóc sinh viên: mở hồ sơ khi sinh viên chạm mức cảnh báo vắng hoặc được đề xuất,
// mặc định giao cho nhân viên phụ trách lớp hành chính (trừ khi cấp quản lý chỉ đạo khác).
const HoSoChamSoc = require('../models/HoSoChamSoc');
const DiemDanh = require('../models/DiemDanh');
const SinhVien = require('../models/SinhVien');
const { staffForClass } = require('./dichVuPhanCongLop');
const { getWarningLevels, periodInfo, evaluate } = require('./dichVuCanhBao');
const {
  CARE_STATUS,
  OPEN_CARE_STATUSES,
  DEFAULT_CARE_STEPS,
  CARE_SOURCE_LABEL,
} = require('../utils/hangSo');

const defaultSteps = () => DEFAULT_CARE_STEPS.map((title) => ({ title, source: 'mac_dinh' }));

const event = (text, authorId = null) => ({ kind: 'su_kien', text, authorId });

/** Hồ sơ đang mở của sinh viên, nếu có. */
const openCaseOf = (studentId) =>
  HoSoChamSoc.findOne({ studentId, status: { $in: OPEN_CARE_STATUSES } });

/**
 * Mở hồ sơ cho `student` trừ khi đã có hồ sơ đang mở (khi đó trả về hồ sơ đó với created: false).
 * Khi có `assignedStaff`, hồ sơ bắt đầu ở trạng thái đang chăm sóc dưới người đó. Nếu không, cảnh báo
 * được gửi tới nhân viên phụ trách lớp của sinh viên, còn đề xuất (hoặc lớp chưa có
 * người phụ trách) sẽ chờ chỉ đạo của quản lý.
 */
async function openCase({
  student,
  source,
  reason = '',
  warning = null,
  by = null,
  assignedStaff = null,
  directive = '',
  dueDate = null,
}) {
  const existing = await openCaseOf(student._id);
  if (existing) return { careCase: existing, created: false };

  const owner =
    assignedStaff || (source === 'canh_bao' ? await staffForClass(student.classCode) : null);
  const notes = [
    event(`Mở hồ sơ: ${CARE_SOURCE_LABEL[source]}${reason ? ` — ${reason}` : ''}`, by),
  ];
  if (owner)
    notes.push(
      event(
        assignedStaff
          ? `Chỉ đạo ${owner.fullName} chăm sóc`
          : `Tự động giao cho ${owner.fullName} (nhân viên phụ trách lớp ${student.classCode})`,
        assignedStaff ? by : null,
      ),
    );
  if (directive) notes.push({ kind: 'chi_dao', text: directive, authorId: by });

  try {
    const careCase = await HoSoChamSoc.create({
      studentId: student._id,
      source,
      reason,
      warning: warning ?? undefined,
      proposedBy: source === 'canh_bao' ? null : by,
      status: owner ? CARE_STATUS.IN_PROGRESS : CARE_STATUS.AWAITING,
      assignedStaffId: owner?._id ?? null,
      directedBy: assignedStaff ? by : null,
      directedAt: owner ? new Date() : null,
      directive,
      dueDate,
      steps: defaultSteps(),
      notes,
    });
    return { careCase, created: true };
  } catch (error) {
    // Request khác vừa mở một hồ sơ cùng lúc (mỗi sinh viên chỉ một hồ sơ đang mở).
    if (error?.code === 11000) return { careCase: await openCaseOf(student._id), created: false };
    throw error;
  }
}

/**
 * Sau khi lưu điểm danh: mọi sinh viên vắng vừa đạt mức cảnh báo trong
 * học phần đó sẽ có hồ sơ chăm sóc (nếu chưa có hồ sơ đang mở).
 */
async function openCasesForWarnings(group, absentStudentIds) {
  if (!absentStudentIds.length) return [];
  const [levels, sessions] = await Promise.all([
    getWarningLevels(),
    DiemDanh.find({ courseGroupId: group._id, absentStudents: { $in: absentStudentIds } })
      .select('absentStudents')
      .lean(),
  ]);
  const counts = new Map();
  for (const s of sessions)
    for (const sid of s.absentStudents) counts.set(String(sid), (counts.get(String(sid)) || 0) + 1);

  const info = periodInfo(group);
  const opened = [];
  for (const sid of absentStudentIds) {
    const result = evaluate(counts.get(String(sid)) || 0, info, levels);
    if (!result.warningLevel) continue;
    if (await openCaseOf(sid)) continue;
    const student = await SinhVien.findById(sid);
    if (!student) continue;
    const { careCase, created } = await openCase({
      student,
      source: 'canh_bao',
      reason: `${result.warningLevel.name}: nghỉ ${result.absentPeriods} tiết học phần ${group.groupCode}${
        result.absentPercent !== null ? ` (${result.absentPercent}%)` : ''
      }`,
      warning: {
        level: result.warningLevel.name,
        color: result.warningLevel.color,
        groupCode: group.groupCode,
        absentPeriods: result.absentPeriods,
        absentPercent: result.absentPercent,
      },
    });
    if (created)
      opened.push({
        caseId: careCase._id,
        studentName: student.fullName,
        studentCode: student.studentCode,
        level: result.warningLevel.name,
      });
  }
  return opened;
}

/**
 * Khi một lớp đổi người phụ trách, các hồ sơ đang mở của người cũ chuyển theo lớp;
 * nếu không ai nhận thì quay về trạng thái chờ chỉ đạo.
 */
async function moveClassCases(studentIds, fromStaffId, toStaff) {
  if (!studentIds.length || !fromStaffId) return 0;
  const cases = await HoSoChamSoc.find({
    studentId: { $in: studentIds },
    assignedStaffId: fromStaffId,
    status: { $in: OPEN_CARE_STATUSES },
  });
  for (const c of cases) handOver(c, toStaff, 'Chuyển theo phân công lớp');
  await Promise.all(cases.map((c) => c.save()));
  return cases.length;
}

/** Mọi hồ sơ đang mở của một nhân viên (tài khoản bị khóa / xóa) quay về quản lý. */
async function releaseStaffCases(staffId) {
  const cases = await HoSoChamSoc.find({
    assignedStaffId: staffId,
    status: { $in: OPEN_CARE_STATUSES },
  });
  for (const c of cases) handOver(c, null, 'Nhân viên không còn hoạt động');
  await Promise.all(cases.map((c) => c.save()));
  return cases.length;
}

function handOver(careCase, staff, why) {
  careCase.assignedStaffId = staff?._id ?? null;
  if (!staff) careCase.status = CARE_STATUS.AWAITING;
  careCase.notes.push(
    event(staff ? `${why}: giao cho ${staff.fullName}` : `${why}: chờ cấp quản lý chỉ đạo`),
  );
}

module.exports = {
  defaultSteps,
  openCaseOf,
  openCase,
  openCasesForWarnings,
  moveClassCases,
  releaseStaffCases,
};
