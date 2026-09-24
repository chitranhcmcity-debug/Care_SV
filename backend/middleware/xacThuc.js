const jwt = require('jsonwebtoken');
const NguoiDung = require('../models/NguoiDung');
const { getJwtSecret } = require('../utils/moiTruong');
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
    req.user = { ...user.toObject(), id: String(user._id) };
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
const requireAdmin = requireRoles('admin');
// Admin + Trưởng phòng/Phó hiệu trưởng: student records, task assignment, call overview.
const requireManagement = requireRoles('admin', 'manager');
// Everyone who may read the reports (teachers only see their own classes elsewhere).
const requireReportViewer = requireRoles('admin', 'manager', 'staff');
const requireSignedIn = requireRoles('admin', 'manager', 'staff', 'teacher');
module.exports = {
  verifyToken,
  requireAdmin,
  requireManagement,
  requireReportViewer,
  requireSignedIn,
  requireRoles,
};
