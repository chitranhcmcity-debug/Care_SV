function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status =
    error.status ||
    (['ValidationError', 'CastError', 'MulterError'].includes(error.name)
      ? 400
      : error.code === 11000
        ? 409
        : 500);
  if (status >= 500) console.error('Request failed:', error.name);
  // 502/503 là các mã có chủ đích, có thể hành động được do ta tự đặt (vd dịch vụ AI chưa
  // cấu hình hoặc lỗi phía upstream) — an toàn để hiển thị, khác với lỗi 500 trần bất ngờ.
  const message =
    status === 500 ? 'Lỗi máy chủ nội bộ' : status === 409 ? 'Dữ liệu đã tồn tại' : error.message;
  res.status(status).json({ message });
}
module.exports = errorHandler;
