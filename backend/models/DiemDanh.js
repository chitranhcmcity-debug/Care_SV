const mongoose = require('mongoose');

const DiemDanhSchema = new mongoose.Schema(
  {
    courseGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'NhomHocPhan', required: true },
    sessionDay: { type: String },
    date: { type: Date, default: Date.now },
    absentStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SinhVien' }],
    excusedStudents: [
      {
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'SinhVien' },
        reason: { type: String, default: '' },
      },
    ],
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung' },
  },
  { timestamps: true },
);

DiemDanhSchema.index(
  { courseGroupId: 1, sessionDay: 1 },
  { unique: true, partialFilterExpression: { sessionDay: { $type: 'string' } } },
);

module.exports = mongoose.model('DiemDanh', DiemDanhSchema, 'diem_danh');
