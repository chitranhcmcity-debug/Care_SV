const jwt = require('jsonwebtoken');
const NguoiDung = require('../models/NguoiDung');
const { getJwtSecret } = require('../utils/moiTruong');
const { permissionsForRole, can } = require('../services/dichVuPhanQuyen');
async function verifyToken(req, res, next) {
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
  if (!match) return res.status(401).json({ message: 'Authentication required' });
  let decoded;
  try {
    decoded = jwt.verify(match[1], getJwtSecret(), { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ message: 'Đã tồn tại hoặc hết hạn' });
  }
  try {
    if (!decoded.id || !/^[a-f\d]{24}$/i.test(decoded.id))
      return res.status(401).json({ message: 'Invalid token' });
    const user = await NguoiDung.findById(decoded.id).select('-password');
    if (
      !user ||
      user.status !== 'active' ||
      (decoded.tokenVersion || 0) !== (user.tokenVersion || 0)
    )
      return res.status(401).json({ message: 'Session revoked' });
    // Permissions are read live, so a change in the matrix applies without signing in again.
    req.user = {
      ...user.toObject(),
      id: String(user._id),
      permissions: await permissionsForRole(user.role),
    };
    next();
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
// Passes when the user holds any of the given permissions (PERMISSIONS in utils/hangSo.js).
const requirePermission =
  (...permissions) =>
  (req, res, next) => {
    if (!permissions.some((permission) => can(req.user, permission)))
      return res.status(403).json({ message: 'Bạn không có quyền sử dụng chức năng này' });
    next();
  };
const requireAdmin = requireRoles('admin');
const requireSignedIn = requireRoles('admin', 'manager', 'staff', 'teacher');
// Business actions (calls, edits of student data): the admin only views business data.
const requireOperator = requireRoles('manager', 'staff', 'teacher');
module.exports = {
  verifyToken,
  requireAdmin,
  requireSignedIn,
  requireOperator,
  requireRoles,
  requirePermission,
};
