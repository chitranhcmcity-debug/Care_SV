const mongoose = require('mongoose');
const { unitPlugin } = require('../utils/donVi');

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

// Lịch sử và thống kê điểm danh nạp mọi buổi của một học phần.
DiemDanhSchema.index({ courseGroupId: 1 });

// Thuộc về một đơn vị; xem utils/donVi.js.
DiemDanhSchema.plugin(unitPlugin);

module.exports = mongoose.model('DiemDanh', DiemDanhSchema, 'diem_danh');
