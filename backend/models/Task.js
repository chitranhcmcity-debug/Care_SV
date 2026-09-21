const mongoose = require('mongoose');
const { TASK_STATUS, TASK_STATUSES } = require('../constants/taskStatus');

const EvidenceFileSchema = new mongoose.Schema(
  {
    storedName: { type: String, required: true }, // random name on disk, never user input
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: true },
);

const TaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date, default: null },
    status: { type: String, enum: TASK_STATUSES, default: TASK_STATUS.PENDING },

    // Evidence the assignee submits — every field optional, they can mix and match.
    evidenceNote: { type: String, default: '' },
    evidenceLink: { type: String, default: '' },
    evidenceFiles: { type: [EvidenceFileSchema], default: [] },

    reviewNote: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    acknowledgedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

TaskSchema.index({ assignedTo: 1, status: 1 });

module.exports = mongoose.model('Task', TaskSchema);
