const jwt = require('jsonwebtoken');
const NguoiDung = require('../models/NguoiDung');
const { getJwtSecret } = require('../utils/moiTruong');
const { permissionsForRole, can } = require('../services/dichVuPhanQuyen');
const { runInUnit, unitOf } = require('../utils/donVi');
async function verifyToken(req, res, next) {
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
  if (!match) return res.status(401).json({ message: 'Authentication required' });
  let decoded;
  try {
    decoded = jwt.verify(match[1], getJwtSecret(), { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
  }
  try {
    if (decoded.purpose || !decoded.id || !/^[a-f\d]{24}$/i.test(decoded.id))
      return res.status(401).json({ message: 'Invalid token' });
    // Chạy ở mọi request: object thường là đủ (không cần Mongoose document).
    const user = await NguoiDung.findById(decoded.id)
      .select('-password -verifyTokenHash -resetTokenHash -activationKeyHash')
      .lean();
    if (
      !user ||
      user.status !== 'active' ||
      (decoded.tokenVersion || 0) !== (user.tokenVersion || 0)
    )
      return res.status(401).json({ message: 'Session revoked' });
    // Trưởng phòng / PHT có gói riêng đã hết sẽ bị đăng xuất cho đến khi gia hạn.
    if (user.accessExpiresAt && new Date(user.accessExpiresAt).getTime() <= Date.now())
      return res.status(401).json({
        code: 'ACCOUNT_EXPIRED',
        message: 'Gói dịch vụ của tài khoản đã hết hạn. Hãy gia hạn để tiếp tục sử dụng.',
      });
    // Quyền được đọc trực tiếp, nên thay đổi ở ma trận có hiệu lực mà không cần đăng nhập lại.
    req.user = {
      ...user,
      id: String(user._id),
      permissions: await permissionsForRole(user.role),
    };
    // Mọi thứ phía sau chạy trong đơn vị của người dùng: truy vấn chỉ thấy dữ liệu của đơn vị đó.
    runInUnit(unitOf(user), next);
  } catch (error) {
    next(error);
  }
}
const requireRoles =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({ message: 'Access denied' });
    next();
  };
// Cho qua khi người dùng có bất kỳ quyền nào trong danh sách (PERMISSIONS ở utils/hangSo.js).
const requirePermission =
  (...permissions) =>
  (req, res, next) => {
    if (!permissions.some((permission) => can(req.user, permission)))
      return res.status(403).json({ message: 'Bạn không có quyền sử dụng chức năng này' });
    next();
  };
const requireAdmin = requireRoles('admin');
const requireSignedIn = requireRoles('admin', 'manager', 'staff', 'teacher');
// Thao tác nghiệp vụ (gọi điện, sửa dữ liệu sinh viên): admin chỉ được xem dữ liệu nghiệp vụ.
const requireOperator = requireRoles('manager', 'staff', 'teacher');
module.exports = {
  verifyToken,
  requireAdmin,
  requireSignedIn,
  requireOperator,
  requireRoles,
  requirePermission,
};
