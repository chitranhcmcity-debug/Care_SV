// Thời khóa biểu, số tiết và mức cảnh báo vắng.
// - Giờ học / số tiết của một học phần (có giá trị mặc định theo ca).
// - Khung giờ giảng viên được điểm danh (trong giờ học, được sửa đến hết ngày).
// - Quy đổi buổi vắng → tiết nghỉ → % tổng số tiết, và xếp mức cảnh báo do Trưởng phòng / PHT
//   cấu hình (tên, ngưỡng, màu, có phải mức cấm thi hay không).
const { settingsUnit, loadUnitConfig } = require('./dichVuCauHinhDonVi');
const { dateKey } = require('../utils/kiemTra');
const {
  WEEKDAY_INDEX,
  DEFAULT_SHIFT_TIMES,
  DEFAULT_PERIODS_PER_SESSION,
  ATTENDANCE_EARLY_MINUTES,
  DEFAULT_WARNING_LEVELS,
} = require('../utils/hangSo');

const CACHE_MS = 30 * 1000;
// Theo từng đơn vị: { [unitId]: { levels, expires } }.
const cache = new Map();

const plain = (level) => ({
  name: level.name,
  unit: level.unit,
  threshold: level.threshold,
  color: level.color,
  examBan: Boolean(level.examBan),
});

/** Các mức cảnh báo của đơn vị, nhẹ nhất trước (mặc định cho đến khi trưởng phòng lưu mức riêng). */
async function getWarningLevels() {
  const key = String(await settingsUnit());
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.levels;
  const stored = (await loadUnitConfig()).warningLevels;
  const levels = (Array.isArray(stored) && stored.length ? stored : DEFAULT_WARNING_LEVELS).map(
    plain,
  );
  cache.set(key, { levels, expires: Date.now() + CACHE_MS });
  return levels;
}

function clearWarningCache() {
  cache.clear();
}

// ------------------------------- Thời khóa biểu -------------------------------

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Giờ học của một học phần (của riêng nó, hoặc mặc định theo ca). */
function classHours(group) {
  const fallback = DEFAULT_SHIFT_TIMES[group.shift] || DEFAULT_SHIFT_TIMES.sang;
  return {
    startTime: group.startTime || fallback.startTime,
    endTime: group.endTime || fallback.endTime,
  };
}

/** Mọi ngày học theo lịch giữa startDate và endDate (rỗng khi không có startDate). */
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

/** Học phần có buổi học vào `date` hay không (thứ nằm trong lịch, trong khoảng ngày bắt đầu/kết thúc). */
function hasClassOn(group, date) {
  const weekday = date.getDay();
  if (!(group.scheduleDays || []).some((d) => WEEKDAY_INDEX[d] === weekday)) return false;
  const day = dateKey(date);
  if (group.startDate && day < dateKey(group.startDate)) return false;
  if (group.endDate && day > dateKey(group.endDate)) return false;
  return true;
}

/**
 * Khi nào giảng viên được điểm danh cho `group` ngay lúc này:
 * - chỉ vào ngày có lịch học;
 * - bản ghi đầu tiên từ ATTENDANCE_EARLY_MINUTES trước giờ học đến khi hết giờ học;
 * - sau khi hết giờ học, buổi đó được chốt (khóa), dù đã điểm danh hay chưa.
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
  if (minutes > toMinutes(endTime))
    return {
      ...base,
      open: false,
      locked: true,
      reason: hasRecordToday
        ? `Buổi học đã kết thúc lúc ${endTime}, điểm danh đã được chốt.`
        : `Đã hết giờ học (${startTime}–${endTime}) mà chưa điểm danh; buổi này đã được chốt.`,
    };
  return {
    ...base,
    open: true,
    reason: hasRecordToday
      ? `Được sửa điểm danh đến khi hết giờ học (${endTime}).`
      : 'Đang trong giờ học.',
  };
}

// ------------------------------- Số tiết & cảnh báo -------------------------------

/** Số tiết mỗi buổi và tổng số tiết của một học phần (totalPeriods là null khi chưa biết). */
function periodInfo(group) {
  const periodsPerSession = group.periodsPerSession || DEFAULT_PERIODS_PER_SESSION;
  const planned = scheduledDates(group).length * periodsPerSession;
  const totalPeriods = group.totalPeriods || planned || null;
  return { periodsPerSession, totalPeriods };
}

/** Mức cao nhất đạt được (các mức xếp từ nhẹ nhất → nặng nhất), hoặc null. */
function levelFor(absentPeriods, percent, levels) {
  let reached = null;
  for (const level of levels) {
    const value = level.unit === 'percent' ? percent : absentPeriods;
    if (value !== null && value >= level.threshold) reached = level;
  }
  return reached;
}

/** Số liệu vắng và mức cảnh báo cho `absentSessions` buổi vắng không phép trong `group`. */
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

/** Danh sách quy tắc dễ đọc cho prompt và báo cáo. */
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
