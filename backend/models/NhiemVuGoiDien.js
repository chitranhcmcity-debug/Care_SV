const { CALL_STATUS, CALL_STATUSES } = require('../utils/hangSo');
const mongoose = require('mongoose');

const NhiemVuGoiDienSchema = new mongoose.Schema(
  {
    attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiemDanh' },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'SinhVien', required: true },
    courseGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'NhomHocPhan', required: true },
    assignedStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', required: true },
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

module.exports = mongoose.model('NhiemVuGoiDien', NhiemVuGoiDienSchema, 'nhiem_vu_goi_dien');
