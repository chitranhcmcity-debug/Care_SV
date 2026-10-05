const { assert } = require('../utils/kiemTra');
const { getRolePermissions, setRolePermissions } = require('../services/dichVuPhanQuyen');
const {
  PERMISSIONS,
  PERMISSION_KEYS,
  CONFIGURABLE_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_LABEL,
} = require('../utils/hangSo');

const catalog = () => ({
  permissions: PERMISSIONS.map(({ key, group, label, description, onlyRoles }) => ({
    key,
    group,
    label,
    description,
    onlyRoles: onlyRoles ?? null,
  })),
  roles: CONFIGURABLE_ROLES.map((role) => ({ role, label: ROLE_LABEL[role] })),
  defaults: DEFAULT_ROLE_PERMISSIONS,
});

async function getMatrix(req, res, next) {
  try {
    res.json({ ...catalog(), matrix: await getRolePermissions() });
  } catch (error) {
    next(error);
  }
}

async function updateMatrix(req, res, next) {
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
}

module.exports = { getMatrix, updateMatrix };
