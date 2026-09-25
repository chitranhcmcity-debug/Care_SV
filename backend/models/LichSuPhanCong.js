const mongoose = require('mongoose');

// Lịch sử phân công lớp hành chính cho nhân viên CSKH. Bản ghi đang hiệu lực có active = true;
// mỗi lần giao / chuyển / thu hồi lớp đóng bản ghi cũ và (nếu có người nhận) mở bản ghi mới.
const LichSuPhanCongSchema = new mongoose.Schema(
  {
    classCode: { type: String, required: true, trim: true, uppercase: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', required: true },
    staffName: { type: String, default: '' }, // giữ tên kể cả khi tài khoản bị xóa
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', default: null },
    startedAt: { type: Date, default: Date.now },
    active: { type: Boolean, default: true },
    endedAt: { type: Date, default: null },
    endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', default: null },
    endReason: { type: String, default: '' },
  },
  { timestamps: true },
);
LichSuPhanCongSchema.index({ classCode: 1, startedAt: -1 });
LichSuPhanCongSchema.index({ staffId: 1, startedAt: -1 });
// Mỗi lớp chỉ có tối đa một nhân viên phụ trách tại một thời điểm.
LichSuPhanCongSchema.index(
  { classCode: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);

module.exports = mongoose.model('LichSuPhanCong', LichSuPhanCongSchema, 'lich_su_phan_cong');
