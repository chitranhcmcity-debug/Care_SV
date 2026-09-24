const mongoose = require('mongoose');
const { ORDER_STATUS, ORDER_STATUSES } = require('../utils/hangSo');

// One PayOS payment link for a subscription plan.
const DonThanhToanSchema = new mongoose.Schema(
  {
    orderCode: { type: Number, required: true, unique: true }, // PayOS order code
    planCode: { type: String, required: true },
    planName: { type: String, required: true },
    months: { type: Number, required: true },
    amount: { type: Number, required: true }, // VND
    status: { type: String, enum: ORDER_STATUSES, default: ORDER_STATUS.PENDING },
    checkoutUrl: { type: String, default: '' },
    paymentLinkId: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', required: true },
    paidAt: { type: Date, default: null },
    reference: { type: String, default: '' }, // bank transaction reference from PayOS
    // Subscription end date right after this order was applied (for the history table).
    extendedTo: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model('DonThanhToan', DonThanhToanSchema, 'don_thanh_toan');
