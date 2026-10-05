const mongoose = require('mongoose');
const { unitPlugin } = require('../utils/donVi');

const SinhVienSchema = new mongoose.Schema(
  {
    studentCode: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    classCode: { type: String, required: true, trim: true, uppercase: true },
    dob: { type: String, default: '' },
    major: { type: String, default: '' },
    phone: { type: String, default: '' },
    parentPhone: { type: String, default: '' },
    courseGroups: [{ type: String }],
    tags: [{ type: String }],
  },
  { timestamps: true },
);

// Sinh viên được liệt kê và đếm theo lớp sinh hoạt.
SinhVienSchema.index({ classCode: 1 });
// Mã sinh viên là duy nhất trong một đơn vị.
SinhVienSchema.index({ unitId: 1, studentCode: 1 }, { unique: true });

// Thuộc về một đơn vị; xem utils/donVi.js.
SinhVienSchema.plugin(unitPlugin);

module.exports = mongoose.model('SinhVien', SinhVienSchema, 'sinh_vien');
