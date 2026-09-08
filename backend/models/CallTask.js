const { CALL_STATUS, CALL_STATUSES } = require('../constants/callStatus');
const mongoose = require('mongoose');

const CallTaskSchema = new mongoose.Schema(
  {
    attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance' },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    courseGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseGroup', required: true },
    assignedStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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

CallTaskSchema.index(
  { attendanceId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { attendanceId: { $type: 'objectId' } } },
);

module.exports = mongoose.model('CallTask', CallTaskSchema);
