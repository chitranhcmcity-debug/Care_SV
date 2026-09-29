const { CALL_STATUS, CALL_STATUSES } = require('../utils/hangSo');
const mongoose = require('mongoose');

const NhiemVuGoiDienSchema = new mongoose.Schema(
  {
    attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiemDanh' },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'SinhVien', required: true },
    courseGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'NhomHocPhan', required: true },
    // null = lớp hành chính chưa có nhân viên phụ trách → hàng chờ của Trưởng phòng.
    assignedStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', default: null },
    absenceDate: { type: Date, required: true },
    status: {
      type: String,
      enum: CALL_STATUSES,
      default: CALL_STATUS.PENDING,
    },
    callNote: { type: String, default: '' },
    absenceReasonCategory: { type: String, default: '' },
    callbackDate: { type: Date, default: null },
    callAttempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

NhiemVuGoiDienSchema.index(
  { attendanceId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { attendanceId: { $type: 'objectId' } } },
);

// Call queues are read per student, per assigned staff member and per course group.
NhiemVuGoiDienSchema.index({ studentId: 1 });
NhiemVuGoiDienSchema.index({ assignedStaffId: 1, status: 1 });
NhiemVuGoiDienSchema.index({ courseGroupId: 1 });

module.exports = mongoose.model('NhiemVuGoiDien', NhiemVuGoiDienSchema, 'nhiem_vu_goi_dien');
