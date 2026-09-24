const { isSubscriptionActive } = require('../services/dichVuGoiDichVu');

// Blocks business APIs once the subscription has expired. Sign-in, settings and billing
// stay open (they are mounted without this) so an admin can always log in and renew.
async function requireActiveSubscription(req, res, next) {
  try {
    if (await isSubscriptionActive()) return next();
    res.status(402).json({
      message: 'Gói sử dụng hệ thống đã hết hạn. Quản trị viên vui lòng gia hạn để tiếp tục.',
      code: 'SUBSCRIPTION_EXPIRED',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { requireActiveSubscription };
