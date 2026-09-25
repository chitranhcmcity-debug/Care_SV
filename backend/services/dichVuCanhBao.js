// Thời khóa biểu, số tiết và mức cảnh báo vắng.
// - Giờ học / số tiết của một học phần (có giá trị mặc định theo ca).
// - Khung giờ giảng viên được điểm danh (trong giờ học, được sửa đến hết ngày).
// - Quy đổi buổi vắng → tiết nghỉ → % tổng số tiết, và xếp mức cảnh báo do Trưởng phòng / PHT
//   cấu hình (tên, ngưỡng, màu, có phải mức cấm thi hay không).
const CaiDatHeThong = require('../models/CaiDatHeThong');
const { dateKey } = require('../utils/kiemTra');
const {
  WEEKDAY_INDEX,
  DEFAULT_SHIFT_TIMES,
  DEFAULT_PERIODS_PER_SESSION,
  ATTENDANCE_EARLY_MINUTES,
  DEFAULT_WARNING_LEVELS,
} = require('../utils/hangSo');

const CACHE_MS = 30 * 1000;
let cache = null;

const plain = (level) => ({
  name: level.name,
  unit: level.unit,
  threshold: level.threshold,
  color: level.color,
  examBan: Boolean(level.examBan),
});

/** Configured warning levels, mildest first (defaults until a manager saves their own). */
async function getWarningLevels() {
  if (cache && cache.expires > Date.now()) return cache.levels;
  const settings = await CaiDatHeThong.findOne().select('warningLevels').lean();
  const stored = settings?.warningLevels;
  const levels = (Array.isArray(stored) && stored.length ? stored : DEFAULT_WARNING_LEVELS).map(
    plain,
  );
  cache = { levels, expires: Date.now() + CACHE_MS };
  return levels;
}

function clearWarningCache() {
  cache = null;
}

// ------------------------------- Timetable -------------------------------

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Class hours of a course group (its own, or the default of its shift). */
function classHours(group) {
  const fallback = DEFAULT_SHIFT_TIMES[group.shift] || DEFAULT_SHIFT_TIMES.sang;
  return {
    startTime: group.startTime || fallback.startTime,
    endTime: group.endTime || fallback.endTime,
  };
}

/** Every scheduled class date between startDate and endDate (empty when there is no startDate). */
function scheduledDates(group) {
  if (!group.startDate) return [];
  const days = (group.scheduleDays || [])
    .map((d) => WEEKDAY_INDEX[d])
    .filter((d) => d !== undefined);
  const cursor = new Date(group.startDate);
  cursor.setHours(12, 0, 0, 0);
  const end = group.endDate ? new Date(group.endDate) : new Date(cursor.getTime() + 90 * 864e5);
  end.setHours(23, 59, 59, 999);
  const dates = [];
  while (cursor <= end && dates.length < 400) {
    if (days.includes(cursor.getDay())) dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/** Whether the group has a class on `date` (weekday in the schedule, within start/end dates). */
function hasClassOn(group, date) {
  const weekday = date.getDay();
  if (!(group.scheduleDays || []).some((d) => WEEKDAY_INDEX[d] === weekday)) return false;
  const day = dateKey(date);
  if (group.startDate && day < dateKey(group.startDate)) return false;
  if (group.endDate && day > dateKey(group.endDate)) return false;
  return true;
}

/**
 * When a teacher may take attendance for `group` right now:
 * - only on a scheduled class day;
 * - the first record from ATTENDANCE_EARLY_MINUTES before class until the class ends;
 * - an existing record of today may be corrected until the end of that day.
 */
function attendanceWindow(group, { hasRecordToday = false, now = new Date() } = {}) {
  const { startTime, endTime } = classHours(group);
  const base = { startTime, endTime, today: dateKey(now) };
  if (!hasClassOn(group, now))
    return { ...base, open: false, reason: 'Hôm nay không có lịch học của học phần này.' };
  const minutes = now.getHours() * 60 + now.getMinutes();
  const opensAt = toMinutes(startTime) - ATTENDANCE_EARLY_MINUTES;
  if (minutes < opensAt)
    return { ...base, open: false, reason: `Chưa đến giờ học (mở điểm danh lúc ${startTime}).` };
  if (minutes > toMinutes(endTime) && !hasRecordToday)
    return {
      ...base,
      open: false,
      reason: `Đã hết giờ học (${startTime}–${endTime}) mà chưa điểm danh. Liên hệ Trưởng phòng để mở lại.`,
    };
  return {
    ...base,
    open: true,
    reason: hasRecordToday ? 'Được sửa điểm danh đến hết ngày hôm nay.' : 'Đang trong giờ học.',
  };
}

// ------------------------------- Periods & warnings -------------------------------

/** Periods per session and total periods of a group (totalPeriods null when unknown). */
function periodInfo(group) {
  const periodsPerSession = group.periodsPerSession || DEFAULT_PERIODS_PER_SESSION;
  const planned = scheduledDates(group).length * periodsPerSession;
  const totalPeriods = group.totalPeriods || planned || null;
  return { periodsPerSession, totalPeriods };
}

/** Highest level reached (levels are ordered mildest → most severe), or null. */
function levelFor(absentPeriods, percent, levels) {
  let reached = null;
  for (const level of levels) {
    const value = level.unit === 'percent' ? percent : absentPeriods;
    if (value !== null && value >= level.threshold) reached = level;
  }
  return reached;
}

/** Absence figures and warning level for `absentSessions` unexcused absences in `group`. */
function evaluate(absentSessions, info, levels) {
  const absentPeriods = absentSessions * info.periodsPerSession;
  const percent = info.totalPeriods
    ? Math.round((absentPeriods / info.totalPeriods) * 1000) / 10
    : null;
  const level = levelFor(absentPeriods, percent, levels);
  return {
    absentPeriods,
    absentPercent: percent,
    warningLevel: level,
    isAtRisk: Boolean(level?.examBan),
  };
}

/** Human-readable rule list for prompts and reports. */
const describeLevels = (levels) =>
  levels
    .map(
      (l, i) =>
        `${i + 1}. ${l.name} (màu ${l.color}): nghỉ từ ${l.threshold}${l.unit === 'percent' ? '% tổng số tiết' : ' tiết'} trở lên${l.examBan ? ' — CẤM THI' : ''}`,
    )
    .join('\n');

module.exports = {
  getWarningLevels,
  clearWarningCache,
  classHours,
  scheduledDates,
  hasClassOn,
  attendanceWindow,
  periodInfo,
  evaluate,
  describeLevels,
};
