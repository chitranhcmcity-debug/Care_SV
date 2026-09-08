const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret } = require('../config/env');
async function verifyToken(req, res, next) {
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
  if (!match) return res.status(401).json({ message: 'Authentication required' });
  let decoded;
  try {
    decoded = jwt.verify(match[1], getJwtSecret(), { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
  try {
    if (!decoded.id || !/^[a-f\d]{24}$/i.test(decoded.id))
      return res.status(401).json({ message: 'Invalid token' });
    const user = await User.findById(decoded.id).select('-password');
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
const requireStaffOrAdmin = requireRoles('admin', 'staff', 'teacher');
module.exports = { verifyToken, requireAdmin, requireStaffOrAdmin, requireRoles };
