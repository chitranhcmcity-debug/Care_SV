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
  // 502/503 are deliberate, actionable statuses we set ourselves (e.g. AI service not
  // configured or upstream failure) — safe to show, unlike an unexpected bare 500.
  const message =
    status === 500
      ? 'Lỗi máy chủ nội bộ'
      : status === 409
        ? 'Dữ liệu đã tồn tại'
        : error.message;
  res.status(status).json({ message });
}
module.exports = errorHandler;
