const mongoose = require('mongoose');
const { SHIFT, SHIFTS, WEEKDAYS, DEFAULT_SCHEDULE_DAYS } = require('../utils/hangSo');

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
