const mongoose = require('mongoose');
const { unitPlugin } = require('../utils/donVi');
const { PARENT_ALERT_STATUSES } = require('../utils/hangSo');

// One Zalo message to a student's parent about too many absences in one week: what was sent,
// to whom, and whether it went through (the report Trưởng phòng / PHT reads).
const ThongBaoPhuHuynhSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'SinhVien', required: true },
    weekStart: { type: String, required: true }, // Monday, YYYY-MM-DD
    weekEnd: { type: String, required: true }, // Sunday
    absentCount: { type: Number, required: true },
    courses: [
      {
        _id: false,
        groupCode: String,
        courseName: String,
        count: Number,
        teacherName: String,
        teacherPhone: String,
      },
    ],
    staffName: { type: String, default: '' },
    staffPhone: { type: String, default: '' },
    parentPhone: { type: String, default: '' },
    content: { type: String, default: '' }, // the message as the parent reads it
    status: { type: String, enum: PARENT_ALERT_STATUSES, required: true },
    error: { type: String, default: '' },
    msgId: { type: String, default: '' },
    sentAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// At most one message per student per week.
ThongBaoPhuHuynhSchema.index({ unitId: 1, studentId: 1, weekStart: 1 }, { unique: true });
ThongBaoPhuHuynhSchema.index({ createdAt: -1 });

ThongBaoPhuHuynhSchema.plugin(unitPlugin);

module.exports = mongoose.model('ThongBaoPhuHuynh', ThongBaoPhuHuynhSchema, 'thong_bao_phu_huynh');
