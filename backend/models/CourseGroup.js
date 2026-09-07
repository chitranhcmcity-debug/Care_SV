const mongoose = require('mongoose');

const CourseGroupSchema = new mongoose.Schema(
  {
    courseCode: { type: String, default: '' },
    courseName: { type: String, default: '' },
    groupCode: { type: String, required: true, unique: true, trim: true },
    shift: {
      type: String,
      enum: ['Sáng', 'Chiều', 'Tối'],
      default: 'Sáng',
    },
    scheduleDays: {
      type: [String],
      default: ['Thứ 2', 'Thứ 4', 'Thứ 6'],
    },
    room: { type: String, default: 'A.101' },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    teacherName: { type: String, default: 'Giảng viên khoa CNTT' },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('CourseGroup', CourseGroupSchema);
