const mongoose = require('mongoose');
const { unitPlugin } = require('../utils/donVi');
const { TASK_STATUS, TASK_STATUSES, TASK_CATEGORIES, TASK_PRIORITIES } = require('../utils/hangSo');

const EvidenceFileSchema = new mongoose.Schema(
  {
    storedName: { type: String, required: true }, // random name on disk, never user input
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: true },
);

// One progress report from the assignee; the task keeps the latest percent in `progress`.
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

    // Progress the assignee reports while working (0–100); submitting evidence sets 100.
    progress: { type: Number, default: 0, min: 0, max: 100 },
    progressLog: { type: [ProgressEntrySchema], default: [] },

    // Evidence the assignee submits — every field optional, they can mix and match.
    evidenceNote: { type: String, default: '' },
    evidenceLink: { type: String, default: '' },
    evidenceFiles: { type: [EvidenceFileSchema], default: [] },

    reviewNote: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', default: null },
    // Quality score (1–5) the reviewer gives when approving; null = not scored.
    reviewScore: { type: Number, default: null, min: 1, max: 5 },
    // Times the work was sent back for rework.
    reworkCount: { type: Number, default: 0 },

    acknowledgedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

NhiemVuSchema.index({ assignedTo: 1, status: 1 });

// Belongs to one unit (đơn vị); see utils/donVi.js.
NhiemVuSchema.plugin(unitPlugin);

module.exports = mongoose.model('NhiemVu', NhiemVuSchema, 'nhiem_vu');
