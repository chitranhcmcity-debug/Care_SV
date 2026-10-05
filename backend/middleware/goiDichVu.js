const { isSubscriptionActive } = require('../services/dichVuGoiDichVu');

// Chặn các API nghiệp vụ khi gói dịch vụ đã hết hạn. Đăng nhập, cài đặt và thanh toán
// vẫn mở (chúng được gắn không qua middleware này) để Trưởng phòng / PHT luôn đăng nhập và gia hạn được.
async function requireActiveSubscription(req, res, next) {
  try {
    if (await isSubscriptionActive()) return next();
    res.status(402).json({
      message:
        'Gói sử dụng hệ thống đã hết hạn. Trưởng phòng / Phó hiệu trưởng vui lòng gia hạn để tiếp tục.',
      code: 'SUBSCRIPTION_EXPIRED',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { requireActiveSubscription };
