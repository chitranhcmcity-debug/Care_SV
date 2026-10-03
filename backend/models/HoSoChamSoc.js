const mongoose = require('mongoose');
const { unitPlugin } = require('../utils/donVi');
const {
  CARE_STATUS,
  CARE_STATUSES,
  OPEN_CARE_STATUSES,
  CARE_SOURCES,
  CARE_RESULTS,
  CARE_NOTE_KINDS,
} = require('../utils/hangSo');

const { ObjectId } = mongoose.Schema.Types;

// One step of the care plan (e.g. "Tìm hiểu nguyên nhân"), ticked off by the staff member.
const StepSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 300 },
    // Who proposed it: the default template, a manager, the staff member or AI Care.
    source: { type: String, enum: ['mac_dinh', 'quan_ly', 'nhan_vien', 'ai'], default: 'mac_dinh' },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    note: { type: String, default: '', maxlength: 2000 },
  },
  { timestamps: true },
);

// The exchange between the staff member and the managers, plus system events and calls.
const NoteSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: CARE_NOTE_KINDS, required: true },
    authorId: { type: ObjectId, ref: 'NguoiDung', default: null },
    text: { type: String, default: '', maxlength: 4000 },
    callId: { type: ObjectId, ref: 'CuocGoi', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const HoSoChamSocSchema = new mongoose.Schema(
  {
    studentId: { type: ObjectId, ref: 'SinhVien', required: true },
    source: { type: String, enum: CARE_SOURCES, required: true },
    // Why the student needs care: the warning reached, or the proposer's words.
    reason: { type: String, default: '', maxlength: 2000 },
    warning: {
      level: { type: String, default: '' },
      color: { type: String, default: '' },
      groupCode: { type: String, default: '' },
      absentPeriods: { type: Number, default: 0 },
      absentPercent: { type: Number, default: null },
    },
    proposedBy: { type: ObjectId, ref: 'NguoiDung', default: null },
    status: { type: String, enum: CARE_STATUSES, default: CARE_STATUS.AWAITING },
    assignedStaffId: { type: ObjectId, ref: 'NguoiDung', default: null },
    directedBy: { type: ObjectId, ref: 'NguoiDung', default: null },
    directedAt: { type: Date, default: null },
    // The manager's instruction to the staff member, and the deadline if any.
    directive: { type: String, default: '', maxlength: 4000 },
    dueDate: { type: Date, default: null },
    // What the staff member found out and agreed with the student.
    cause: { type: String, default: '', maxlength: 2000 },
    solution: { type: String, default: '', maxlength: 2000 },
    steps: [StepSchema],
    notes: [NoteSchema],
    closing: {
      result: { type: String, enum: ['', ...CARE_RESULTS], default: '' },
      summary: { type: String, default: '', maxlength: 4000 },
      early: { type: Boolean, default: false },
      proposedBy: { type: ObjectId, ref: 'NguoiDung', default: null },
      proposedAt: { type: Date, default: null },
      approvedBy: { type: ObjectId, ref: 'NguoiDung', default: null },
      closedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

// A student has at most one open case; closed ones stay as history.
HoSoChamSocSchema.index(
  { studentId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: [...OPEN_CARE_STATUSES] } } },
);
HoSoChamSocSchema.index({ assignedStaffId: 1, status: 1 });
HoSoChamSocSchema.index({ status: 1, updatedAt: -1 });

// Belongs to one unit (đơn vị); see utils/donVi.js.
HoSoChamSocSchema.plugin(unitPlugin);

module.exports = mongoose.model('HoSoChamSoc', HoSoChamSocSchema, 'ho_so_cham_soc');
