const mongoose = require('mongoose');
const { unitPlugin } = require('../utils/donVi');
const { TASK_STATUS, TASK_STATUSES, TASK_CATEGORIES, TASK_PRIORITIES } = require('../utils/hangSo');

const EvidenceFileSchema = new mongoose.Schema(
  {
    storedName: { type: String, required: true }, // tên ngẫu nhiên trên đĩa, không bao giờ lấy từ dữ liệu người dùng
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: true },
);

// Một báo cáo tiến độ của người được giao; nhiệm vụ giữ phần trăm mới nhất trong `progress`.
const ProgressEntrySchema = new mongoose.Schema(
  {
    percent: { type: Number, required: true, min: 0, max: 100 },
    note: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const NhiemVuSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', required: true },
    dueDate: { type: Date, default: null },
    status: { type: String, enum: TASK_STATUSES, default: TASK_STATUS.PENDING },
    category: { type: String, enum: TASK_CATEGORIES, default: 'khac' },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'trung_binh' },

    // Tiến độ người được giao báo trong lúc làm (0–100); nộp minh chứng thì đặt 100.
    progress: { type: Number, default: 0, min: 0, max: 100 },
    progressLog: { type: [ProgressEntrySchema], default: [] },

    // Minh chứng người được giao nộp — mọi trường đều tùy chọn, có thể kết hợp tùy ý.
    evidenceNote: { type: String, default: '' },
    evidenceLink: { type: String, default: '' },
    evidenceFiles: { type: [EvidenceFileSchema], default: [] },

    reviewNote: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', default: null },
    // Điểm chất lượng (1–5) người duyệt chấm khi phê duyệt; null = chưa chấm.
    reviewScore: { type: Number, default: null, min: 1, max: 5 },
    // Số lần công việc bị trả lại để làm lại.
    reworkCount: { type: Number, default: 0 },

    acknowledgedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

NhiemVuSchema.index({ assignedTo: 1, status: 1 });

// Thuộc về một đơn vị; xem utils/donVi.js.
NhiemVuSchema.plugin(unitPlugin);

module.exports = mongoose.model('NhiemVu', NhiemVuSchema, 'nhiem_vu');
