const mongoose = require('mongoose');
const { unitPlugin } = require('../utils/donVi');
const { SHIFT, SHIFTS, WEEKDAYS, DEFAULT_SCHEDULE_DAYS } = require('../utils/hangSo');

const TIME_PATTERN = /^$|^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const NhomHocPhanSchema = new mongoose.Schema(
  {
    courseCode: { type: String, default: '' },
    courseName: { type: String, default: '' },
    groupCode: { type: String, required: true, trim: true },
    shift: {
      type: String,
      enum: SHIFTS,
      default: SHIFT.MORNING,
    },
    scheduleDays: {
      type: [{ type: String, enum: WEEKDAYS }],
      default: () => [...DEFAULT_SCHEDULE_DAYS],
    },
    // Giờ học (HH:mm). Trống = giờ mặc định của ca (DEFAULT_SHIFT_TIMES).
    startTime: { type: String, default: '', match: TIME_PATTERN },
    endTime: { type: String, default: '', match: TIME_PATTERN },
    // Số tiết mỗi buổi và tổng số tiết của học phần (0 = tính từ lịch học).
    periodsPerSession: { type: Number, default: 0, min: 0, max: 20 },
    totalPeriods: { type: Number, default: 0, min: 0, max: 1000 },
    room: { type: String, default: 'A.101' },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung' },
    teacherName: { type: String, default: 'Giảng viên khoa CNTT' },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SinhVien' }],
  },
  { timestamps: true },
);

// Teachers see their own groups; removing a student updates every group that lists them.
// Group codes are unique within a unit.
NhomHocPhanSchema.index({ unitId: 1, groupCode: 1 }, { unique: true });
NhomHocPhanSchema.index({ teacherId: 1 });
NhomHocPhanSchema.index({ students: 1 });

// Belongs to one unit (đơn vị); see utils/donVi.js.
NhomHocPhanSchema.plugin(unitPlugin);

module.exports = mongoose.model('NhomHocPhan', NhomHocPhanSchema, 'nhom_hoc_phan');
