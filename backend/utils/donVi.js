// Đơn vị (unit): mỗi Trưởng phòng / PHT sở hữu một đơn vị với sinh viên, lớp,
// điểm danh, hồ sơ chăm sóc, cuộc gọi, nhiệm vụ, nhân viên và cài đặt. Request đã đăng nhập chạy trong
// đơn vị của nó (do verifyToken đặt), và unitPlugin bên dưới giới hạn mọi truy vấn của một model nghiệp vụ vào
// đơn vị đó và đóng dấu đơn vị lên tài liệu mới. Admin và công việc hệ thống (khởi động, webhook,
// nhắc việc) chạy không có đơn vị và thấy mọi đơn vị.
const { AsyncLocalStorage } = require('node:async_hooks');
const mongoose = require('mongoose');

const storage = new AsyncLocalStorage();

/** Chạy fn trong một đơn vị (null = mọi đơn vị). */
const runInUnit = (unitId, fn) => storage.run({ unitId: unitId ? String(unitId) : null }, fn);

/** Đơn vị của request hiện tại, hoặc null ngoài request (admin, công việc hệ thống). */
const currentUnit = () => storage.getStore()?.unitId ?? null;

/**
 * Đơn vị mà người dùng làm việc (unitId của quản lý là _id của chính họ). Admin không có; tài khoản
 * chưa thuộc đơn vị nào (chỉ trước khi chuyển đổi lúc khởi động chạy) cũng không bị giới hạn.
 */
const unitOf = (user) =>
  user && user.role !== 'admin' && user.unitId ? String(user.unitId) : null;

/**
 * Bọc một middleware tiếp tục từ callback của stream (multer), nơi đơn vị của request
 * sẽ bị mất, để các handler phía sau vẫn chạy trong đơn vị.
 */
const keepUnit = (middleware) => (req, res, next) => {
  const unitId = currentUnit();
  middleware(req, res, (error) => runInUnit(unitId, () => next(error)));
};

const QUERY_HOOKS = [
  'countDocuments',
  'deleteMany',
  'deleteOne',
  'distinct',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'updateMany',
  'updateOne',
];

/** Thêm `unitId` vào schema và giới hạn mọi truy vấn cùng tài liệu mới vào đơn vị hiện tại. */
function unitPlugin(schema) {
  schema.add({
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', default: null, index: true },
  });
  schema.pre(QUERY_HOOKS, function () {
    const unitId = currentUnit();
    if (unitId) this.where({ unitId });
  });
  schema.pre('aggregate', function () {
    const unitId = currentUnit();
    if (unitId)
      this.pipeline().unshift({ $match: { unitId: new mongoose.Types.ObjectId(unitId) } });
  });
  schema.pre('validate', function () {
    const unitId = currentUnit();
    if (unitId && this.isNew && !this.unitId) this.unitId = unitId;
  });
  schema.pre('insertMany', function (docs) {
    const unitId = currentUnit();
    const list = Array.isArray(docs) ? docs : [docs];
    if (unitId) for (const doc of list) if (doc && !doc.unitId) doc.unitId = unitId;
  });
}

module.exports = { runInUnit, currentUnit, unitOf, keepUnit, unitPlugin };
