const mongoose = require('mongoose');

const NguoiDungSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    tokenVersion: { type: Number, default: 0 },
    password: { type: String, required: true },
    // manager = Trưởng phòng / Phó hiệu trưởng
    role: { type: String, enum: ['admin', 'manager', 'staff', 'teacher'], default: 'staff' },
    // Self sign-up: 'pending' = waiting for a Trưởng phòng / PHT to approve,
    // 'awaiting_key' = approved, the activation key was emailed and must be entered at login.
    // 'unverified' is the old email-link state; such accounts are treated as 'pending'.
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending', 'awaiting_key', 'unverified'],
      default: 'active',
    },
    // One-time tokens and keys are stored as SHA-256 hashes, never in plain text.
    verifyTokenHash: { type: String, default: null },
    verifyTokenExpires: { type: Date, default: null },
    activationKeyHash: { type: String, default: null },
    activationKeyExpires: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', default: null },
    resetTokenHash: { type: String, default: null },
    resetTokenExpires: { type: Date, default: null },
    // Lớp hành chính đang phụ trách (nhân viên CSKH); lịch sử ở LichSuPhanCong.
    managedClasses: [{ type: String }],
    // When the user last looked at each kind of work (bell or its page); newer work is unseen.
    notificationsSeen: {
      care: { type: Date, default: null },
      tasks: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

NguoiDungSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.password;
    delete ret.tokenVersion;
    delete ret.verifyTokenHash;
    delete ret.verifyTokenExpires;
    delete ret.activationKeyHash;
    delete ret.activationKeyExpires;
    delete ret.resetTokenHash;
    delete ret.resetTokenExpires;
    return ret;
  },
});

module.exports = mongoose.model('NguoiDung', NguoiDungSchema, 'nguoi_dung');
