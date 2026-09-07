const mongoose = require('mongoose');

const CallTaskSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    courseGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseGroup', required: true },
    assignedStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    absenceDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['Chưa gọi', 'Không bắt máy', 'Đã liên hệ'],
      default: 'Chưa gọi',
    },
    callNote: { type: String, default: '' },
    absenceReasonCategory: { type: String, default: '' },
    callbackDate: { type: Date, default: null },
    callAttempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CallTask', CallTaskSchema);
