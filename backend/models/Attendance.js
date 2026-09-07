const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema(
  {
    courseGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseGroup', required: true },
    date: { type: Date, default: Date.now },
    absentStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
    excusedStudents: [
      {
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
        reason: { type: String, default: '' },
      },
    ],
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Attendance', AttendanceSchema);
