function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status =
    error.status ||
    (error.name === 'ValidationError' || error.name === 'CastError'
      ? 400
      : error.code === 11000
        ? 409
        : 500);
  if (status >= 500) console.error('Request failed:', error.name);
  const message =
    status >= 500 ? 'Lỗi máy chủ nội bộ' : status === 409 ? 'Dữ liệu đã tồn tại' : error.message;
  res.status(status).json({ message });
}
module.exports = errorHandler;
