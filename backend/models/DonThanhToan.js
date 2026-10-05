const mongoose = require('mongoose');
const { ORDER_STATUS, ORDER_STATUSES } = require('../utils/hangSo');

// Một link thanh toán PayOS cho một gói: gói dùng chung của hệ thống, hoặc gói riêng của một tài khoản trưởng phòng.
const DonThanhToanSchema = new mongoose.Schema(
  {
    orderCode: { type: Number, required: true, unique: true }, // Mã đơn PayOS
    planCode: { type: String, required: true },
    planName: { type: String, required: true },
    months: { type: Number, required: true },
    amount: { type: Number, required: true }, // VND
    status: { type: String, enum: ORDER_STATUSES, default: ORDER_STATUS.PENDING },
    checkoutUrl: { type: String, default: '' },
    paymentLinkId: { type: String, default: '' },
    kind: { type: String, enum: ['system', 'account'], default: 'system' },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', required: true },
    paidAt: { type: Date, default: null },
    reference: { type: String, default: '' }, // mã tham chiếu giao dịch ngân hàng từ PayOS
    // Ngày hết hạn gói ngay sau khi đơn này được áp dụng (gói hệ thống hoặc gói riêng của tài khoản).
    extendedTo: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model('DonThanhToan', DonThanhToanSchema, 'don_thanh_toan');
