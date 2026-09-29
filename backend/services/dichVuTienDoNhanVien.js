// Theo dõi tiến độ & năng lực nhân viên: số liệu khách quan từ công việc được giao (NhiemVu) và
// hồ sơ chăm sóc sinh viên (HoSoChamSoc). Dùng cho tab "Tiến độ nhân viên" và AI đánh giá.
const NhiemVu = require('../models/NhiemVu');
const HoSoChamSoc = require('../models/HoSoChamSoc');
const NguoiDung = require('../models/NguoiDung');
const {
  TASK_STATUS,
  OPEN_TASK_STATUSES,
  CARE_STATUS,
  TASK_CATEGORIES,
} = require('../utils/hangSo');

const DAY_MS = 24 * 60 * 60 * 1000;

// KPI tham khảo (0–100): trọng số của từng thành phần; thành phần chưa có dữ liệu được bỏ qua và
// trọng số còn lại được chia lại, để nhân viên mới không bị điểm thấp chỉ vì chưa có việc.
const KPI_WEIGHTS = Object.freeze({
  completion: 0.3, // hoàn thành / (hoàn thành + quá hạn chưa xong)
  onTime: 0.25, // việc có hạn chót được nộp đúng hạn
  quality: 0.25, // điểm chất lượng trung bình người duyệt chấm (1–5)
  care: 0.2, // các bước chăm sóc đã hoàn thành trong hồ sơ được giao
});

function kpiRating(score) {
  if (score === null) return 'Chưa đủ dữ liệu';
  if (score >= 85) return 'Xuất sắc';
  if (score >= 70) return 'Tốt';
  if (score >= 50) return 'Đạt';
  return 'Cần cải thiện';
}

const ratio = (part, whole) => (whole > 0 ? part / whole : null);
const round = (value, digits = 1) =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;
const average = (values) =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

// The due date is a calendar day: work handed in any time that day is on time.
const deadlineOf = (task) => new Date(task.dueDate).getTime() + DAY_MS;

function isOverdue(task, now) {
  return (
    Boolean(task.dueDate) && OPEN_TASK_STATUSES.includes(task.status) && deadlineOf(task) < now
  );
}

/** Metrics for one staff member from their tasks and care cases (both already period-filtered). */
function summarize(tasks, cases, now = Date.now()) {
  const byStatus = Object.fromEntries(Object.values(TASK_STATUS).map((s) => [s, 0]));
  const byCategory = {};
  for (const task of tasks) {
    byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
    const category = TASK_CATEGORIES.includes(task.category) ? task.category : 'khac';
    byCategory[category] ??= { total: 0, completed: 0 };
    byCategory[category].total++;
    if (task.status === TASK_STATUS.COMPLETED) byCategory[category].completed++;
  }

  const completed = tasks.filter((t) => t.status === TASK_STATUS.COMPLETED);
  const overdue = tasks.filter((t) => isOverdue(t, now));
  const inProgress = tasks.filter((t) =>
    [TASK_STATUS.ACKNOWLEDGED, TASK_STATUS.REJECTED].includes(t.status),
  );
  // Handed in on time = the (last) submission reached the reviewer before the deadline passed.
  const completedWithDue = completed.filter((t) => t.dueDate);
  const onTime = completedWithDue.filter(
    (t) => new Date(t.submittedAt ?? t.completedAt).getTime() <= deadlineOf(t),
  );
  const scores = completed.map((t) => t.reviewScore).filter((s) => typeof s === 'number');
  const completionDays = completed
    .filter((t) => t.completedAt && t.createdAt)
    .map((t) => (new Date(t.completedAt) - new Date(t.createdAt)) / DAY_MS);

  const caseCount = (status) => cases.filter((c) => c.status === status).length;
  const stepsTotal = cases.reduce((sum, c) => sum + (c.steps?.length ?? 0), 0);
  const stepsDone = cases.reduce((sum, c) => sum + (c.steps?.filter((s) => s.done).length ?? 0), 0);

  const rates = {
    completion: ratio(completed.length, completed.length + overdue.length),
    onTime: ratio(onTime.length, completedWithDue.length),
    quality: scores.length ? (average(scores) - 1) / 4 : null,
    care: ratio(stepsDone, stepsTotal),
  };
  const parts = Object.entries(KPI_WEIGHTS).filter(([key]) => rates[key] !== null);
  const weightSum = parts.reduce((sum, [, w]) => sum + w, 0);
  const kpiScore = weightSum
    ? Math.round((parts.reduce((sum, [key, w]) => sum + rates[key] * w, 0) / weightSum) * 100)
    : null;

  return {
    tasks: {
      total: tasks.length,
      byStatus,
      open: tasks.filter((t) => OPEN_TASK_STATUSES.includes(t.status)).length,
      waitingReview: byStatus[TASK_STATUS.SUBMITTED],
      completed: completed.length,
      overdue: overdue.length,
      completedOnTime: onTime.length,
      completedLate: completedWithDue.length - onTime.length,
      urgentOpen: tasks.filter(
        (t) => OPEN_TASK_STATUSES.includes(t.status) && ['cao', 'khan_cap'].includes(t.priority),
      ).length,
      avgProgress: round(average(inProgress.map((t) => t.progress ?? 0)), 0),
      avgScore: round(average(scores)),
      scoredCount: scores.length,
      reworkCount: tasks.reduce((sum, t) => sum + (t.reworkCount ?? 0), 0),
      avgCompletionDays: round(average(completionDays)),
      byCategory,
    },
    care: {
      total: cases.length,
      inProgress: caseCount(CARE_STATUS.IN_PROGRESS),
      closing: caseCount(CARE_STATUS.CLOSING),
      closed: caseCount(CARE_STATUS.CLOSED),
      improved: cases.filter((c) => ['tien_bo', 'on_dinh'].includes(c.closing?.result)).length,
      stepsDone,
      stepsTotal,
    },
    rates: Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, round(v && v * 100, 0)])),
    kpiScore,
    kpiRating: kpiRating(kpiScore),
  };
}

function periodFilter(from, to) {
  if (!from && !to) return {};
  const range = {};
  if (from) range.$gte = from;
  if (to) range.$lt = new Date(to.getTime() + DAY_MS); // `to` is inclusive (a calendar day)
  return { createdAt: range };
}

/**
 * Progress of every staff member (or just `staffId`) over tasks created in [from, to].
 * Active staff are always listed; disabled ones only while they still have work in the period.
 */
async function staffProgress({ from = null, to = null, staffId = null } = {}) {
  const userFilter = { role: 'staff' };
  if (staffId) userFilter._id = staffId;
  const staffList = await NguoiDung.find(userFilter).select('fullName email status').lean();
  const ids = staffList.map((s) => s._id);
  const period = periodFilter(from, to);
  const [tasks, cases] = await Promise.all([
    NhiemVu.find({ assignedTo: { $in: ids }, ...period })
      .select(
        'assignedTo status category priority dueDate progress reviewScore reworkCount submittedAt completedAt createdAt',
      )
      .lean(),
    HoSoChamSoc.find({ assignedStaffId: { $in: ids }, ...period })
      .select('assignedStaffId status steps.done closing.result')
      .lean(),
  ]);
  const group = (list, key) => {
    const map = new Map();
    for (const item of list) {
      const id = String(item[key]);
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(item);
    }
    return map;
  };
  const tasksByStaff = group(tasks, 'assignedTo');
  const casesByStaff = group(cases, 'assignedStaffId');
  const now = Date.now();

  return staffList
    .map((s) => ({
      staff: { _id: s._id, fullName: s.fullName, email: s.email, status: s.status },
      ...summarize(
        tasksByStaff.get(String(s._id)) ?? [],
        casesByStaff.get(String(s._id)) ?? [],
        now,
      ),
    }))
    .filter((row) => row.staff.status === 'active' || row.tasks.total || row.care.total)
    .sort((a, b) => (b.kpiScore ?? -1) - (a.kpiScore ?? -1) || b.tasks.total - a.tasks.total);
}

module.exports = { staffProgress, summarize, KPI_WEIGHTS, kpiRating };
