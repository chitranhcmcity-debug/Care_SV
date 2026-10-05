const mongoose = require('mongoose');
const { unitPlugin } = require('../utils/donVi');

const NguoiDungSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // SĐT phụ huynh có thể gọi lại (hiển thị cho nhân viên khi gọi).
    phone: { type: String, default: '', trim: true },
    tokenVersion: { type: Number, default: 0 },
    password: { type: String, required: true },
    // manager = Trưởng phòng / Phó hiệu trưởng
    role: { type: String, enum: ['admin', 'manager', 'staff', 'teacher'], default: 'staff' },
    // Tự đăng ký: 'pending' = đang chờ Trưởng phòng / PHT duyệt,
    // 'awaiting_key' = đã duyệt, key kích hoạt đã gửi email và phải nhập khi đăng nhập.
    // 'unverified' là trạng thái cũ qua link email; các tài khoản này được xem như 'pending'.
    // 'awaiting_payment' = Trưởng phòng / PHT tự đăng ký nhưng chưa thanh toán gói.
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending', 'awaiting_key', 'unverified', 'awaiting_payment'],
      default: 'active',
    },
    // Token và key dùng một lần được lưu dạng băm SHA-256, không bao giờ lưu dạng thô.
    verifyTokenHash: { type: String, default: null },
    verifyTokenExpires: { type: Date, default: null },
    activationKeyHash: { type: String, default: null },
    activationKeyExpires: { type: Date, default: null },
    // Gói riêng của Trưởng phòng / PHT tự đăng ký; null = không có gói riêng (do admin tạo).
    // Quá ngày này tài khoản không đăng nhập được cho đến khi gia hạn.
    accessExpiresAt: { type: Date, default: null },
    accessPlan: { type: String, default: '' },
    // Ngày hết hạn mà mỗi lần nhắc đã gửi gần nhất, để mỗi lần nhắc chỉ gửi một lần.
    renewalReminderFor: { type: Date, default: null },
    expiredNoticeFor: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', default: null },
    resetTokenHash: { type: String, default: null },
    resetTokenExpires: { type: Date, default: null },
    // Lớp hành chính đang phụ trách (nhân viên CSSV); lịch sử ở LichSuPhanCong.
    managedClasses: [{ type: String }],
    // Lần gần nhất người dùng xem từng loại công việc (chuông hoặc trang của nó); việc mới hơn là chưa xem.
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

// unitId: đơn vị mà tài khoản làm việc (trưởng phòng sở hữu đơn vị riêng; admin không có).
NguoiDungSchema.plugin(unitPlugin);

module.exports = mongoose.model('NguoiDung', NguoiDungSchema, 'nguoi_dung');
