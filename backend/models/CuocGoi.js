const mongoose = require('mongoose');

// One call placed from the app (by phone dialer or through the Stringee switchboard).
const RecordingSchema = new mongoose.Schema(
  {
    storedName: { type: String, required: true }, // random name on disk, never user input
    originalName: { type: String, default: '' },
    mimeType: { type: String, required: true },
    size: { type: Number, default: 0 },
    source: { type: String, enum: ['tai_len', 'stringee'], required: true },
    savedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const CuocGoiSchema = new mongoose.Schema(
  {
    callerId: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', required: true },
    callerRole: { type: String, required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'SinhVien', required: true },
    target: { type: String, enum: ['sinh_vien', 'phu_huynh'], required: true },
    phoneNumber: { type: String, required: true },
    // dien_thoai = opened the device's dialer (tel:); stringee = browser call via switchboard.
    method: { type: String, enum: ['dien_thoai', 'stringee'], required: true },
    // Where the call was started from, when relevant.
    callTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'NhiemVuGoiDien', default: null },
    courseGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'NhomHocPhan', default: null },
    status: { type: String, enum: ['dang_goi', 'ket_thuc'], default: 'dang_goi' },
    outcome: {
      type: String,
      enum: ['', 'nghe_may', 'khong_nghe_may', 'may_ban', 'sai_so'],
      default: '',
    },
    note: { type: String, default: '', maxlength: 2000 },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    durationSec: { type: Number, default: 0, min: 0 },
    stringeeCallId: { type: String, default: '' },
    recording: { type: RecordingSchema, default: null },
  },
  { timestamps: true },
);

CuocGoiSchema.index({ callerId: 1, createdAt: -1 });
CuocGoiSchema.index({ studentId: 1, createdAt: -1 });

module.exports = mongoose.model('CuocGoi', CuocGoiSchema, 'cuoc_goi');
