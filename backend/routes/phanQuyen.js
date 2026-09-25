const { assert } = require('../utils/kiemTra');
const express = require('express');
const router = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/xacThuc');
const { getRolePermissions, setRolePermissions } = require('../services/dichVuPhanQuyen');
const {
  PERMISSIONS,
  PERMISSION_KEYS,
  CONFIGURABLE_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_LABEL,
} = require('../utils/hangSo');

router.use(verifyToken, requireAdmin);

const catalog = () => ({
  permissions: PERMISSIONS.map(({ key, group, label, description }) => ({
    key,
    group,
    label,
    description,
  })),
  roles: CONFIGURABLE_ROLES.map((role) => ({ role, label: ROLE_LABEL[role] })),
  defaults: DEFAULT_ROLE_PERMISSIONS,
});

// GET /api/permissions (Admin) — permission catalogue, roles, defaults and the current matrix.
router.get('/', async (req, res, next) => {
  try {
    res.json({ ...catalog(), matrix: await getRolePermissions() });
  } catch (error) {
    next(error);
  }
});

// PUT /api/permissions (Admin) — body { matrix: { manager: [key], staff: [key], teacher: [key] } }.
// Takes effect on the next request of each user; no one has to sign in again.
router.put('/', async (req, res, next) => {
  try {
    const { matrix } = req.body ?? {};
    assert(
      matrix && typeof matrix === 'object' && !Array.isArray(matrix),
      'Dữ liệu phân quyền không hợp lệ',
    );
    for (const [role, keys] of Object.entries(matrix)) {
      assert(CONFIGURABLE_ROLES.includes(role), `Vai trò không hợp lệ: ${role}`);
      assert(
        Array.isArray(keys) && keys.every((key) => PERMISSION_KEYS.includes(key)),
        `Danh sách quyền của vai trò ${ROLE_LABEL[role]} không hợp lệ`,
      );
    }
    // Roles left out of the body keep their current permissions.
    const saved = await setRolePermissions({ ...(await getRolePermissions()), ...matrix });
    res.json({ message: 'Đã cập nhật phân quyền theo vai trò!', ...catalog(), matrix: saved });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
