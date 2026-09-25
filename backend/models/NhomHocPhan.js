const mongoose = require('mongoose');
const { SHIFT, SHIFTS, WEEKDAYS, DEFAULT_SCHEDULE_DAYS } = require('../utils/hangSo');

const TIME_PATTERN = /^$|^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const NhomHocPhanSchema = new mongoose.Schema(
  {
    courseCode: { type: String, default: '' },
    courseName: { type: String, default: '' },
    groupCode: { type: String, required: true, unique: true, trim: true },
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

module.exports = mongoose.model('NhomHocPhan', NhomHocPhanSchema, 'nhom_hoc_phan');
