const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema(
  {
    courseGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseGroup', required: true },
    sessionDay: { type: String },
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
  { timestamps: true },
);

AttendanceSchema.index(
  { courseGroupId: 1, sessionDay: 1 },
  { unique: true, partialFilterExpression: { sessionDay: { $type: 'string' } } },
);

module.exports = mongoose.model('Attendance', AttendanceSchema);
