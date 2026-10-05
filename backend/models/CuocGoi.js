const mongoose = require('mongoose');
const { unitPlugin } = require('../utils/donVi');

// Một cuộc gọi thực hiện từ ứng dụng (bằng bàn phím gọi điện hoặc qua tổng đài Stringee).
const RecordingSchema = new mongoose.Schema(
  {
    storedName: { type: String, required: true }, // tên ngẫu nhiên trên đĩa, không bao giờ lấy từ dữ liệu người dùng
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
    // dien_thoai = mở bàn phím gọi của thiết bị (tel:); stringee = gọi từ trình duyệt qua tổng đài.
    method: { type: String, enum: ['dien_thoai', 'stringee'], required: true },
    // Cuộc gọi bắt đầu từ đâu, nếu có.
    careCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'HoSoChamSoc', default: null },
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
    // Người gọi chọn ghi âm cuộc gọi này (hỏi trước mỗi cuộc gọi); nếu không thì không có ghi âm
    // nào được tạo, tải hay chấp nhận.
    record: { type: Boolean, default: false },
    stringeeCallId: { type: String, default: '' },
    recording: { type: RecordingSchema, default: null },
  },
  { timestamps: true },
);

CuocGoiSchema.index({ callerId: 1, createdAt: -1 });
CuocGoiSchema.index({ studentId: 1, createdAt: -1 });
CuocGoiSchema.index({ careCaseId: 1, createdAt: -1 });

// Thuộc về một đơn vị; xem utils/donVi.js.
CuocGoiSchema.plugin(unitPlugin);

module.exports = mongoose.model('CuocGoi', CuocGoiSchema, 'cuoc_goi');
