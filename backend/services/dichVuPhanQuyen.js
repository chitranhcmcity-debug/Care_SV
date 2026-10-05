const CaiDatHeThong = require('../models/CaiDatHeThong');
const {
  PERMISSION_KEYS,
  permissionAppliesTo,
  CONFIGURABLE_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  ADMIN_PERMISSIONS,
  LEGACY_PERMISSIONS,
  RENAMED_PERMISSIONS,
} = require('../utils/hangSo');

// Mọi request đã xác thực đều đọc ma trận, nên giữ trong bộ nhớ một lúc. Lưu qua
// setRolePermissions sẽ xóa cache ngay; TTL bao phủ các thay đổi từ máy chủ khác.
const CACHE_MS = 30 * 1000;
let cache = null;

/**
 * Ma trận lưu trước khi một khóa tồn tại sẽ cấp khóa đó từ các khóa cũ mà nó thay thế
 * (LEGACY_PERMISSIONS), nên nâng cấp vẫn giữ nguyên quyền của mọi vai trò. Khi đã lưu lại thì nó chứa
 * các khóa mới và được để yên.
 */
function upgrade(stored) {
  const lists = CONFIGURABLE_ROLES.map((role) => stored?.[role]).filter(Array.isArray);
  const isLegacy =
    lists.length && !lists.some((list) => list.some((key) => key in LEGACY_PERMISSIONS));
  if (!isLegacy) return stored;
  return Object.fromEntries(
    CONFIGURABLE_ROLES.map((role) => {
      const list = stored?.[role];
      if (!Array.isArray(list)) return [role, list];
      const added = Object.entries(LEGACY_PERMISSIONS)
        .filter(([, old]) => old.some((key) => list.includes(key)))
        .map(([key]) => key);
      return [role, [...list, ...added]];
    }),
  );
}

/** Ma trận đã lưu được gộp lên giá trị mặc định, bỏ các khóa không biết hoặc không áp dụng. */
function normalize(rawStored) {
  const stored = upgrade(rawStored);
  return Object.fromEntries(
    CONFIGURABLE_ROLES.map((role) => {
      const list = (
        Array.isArray(stored?.[role]) ? stored[role] : DEFAULT_ROLE_PERMISSIONS[role]
      ).map((key) => RENAMED_PERMISSIONS[key] ?? key);
      return [
        role,
        PERMISSION_KEYS.filter((key) => list.includes(key) && permissionAppliesTo(key, role)),
      ];
    }),
  );
}

async function getRolePermissions() {
  if (cache && cache.expires > Date.now()) return cache.matrix;
  const settings = await CaiDatHeThong.findOne().select('rolePermissions').lean();
  const matrix = normalize(settings?.rolePermissions);
  cache = { matrix, expires: Date.now() + CACHE_MS };
  return matrix;
}

async function setRolePermissions(matrix) {
  const clean = normalize(matrix);
  await CaiDatHeThong.findOneAndUpdate({}, { rolePermissions: clean }, { upsert: true });
  cache = null;
  return clean;
}

/** Các khóa quyền của một vai trò; admin có bộ cố định, chỉ xem (xem ADMIN_PERMISSIONS). */
async function permissionsForRole(role) {
  if (role === 'admin') return [...ADMIN_PERMISSIONS];
  return (await getRolePermissions())[role] ?? [];
}

/** Kiểm tra đồng bộ trên req.user mà verifyToken đã nạp sẵn `permissions`. */
const can = (user, permission) => Boolean(user?.permissions?.includes(permission));

module.exports = { getRolePermissions, setRolePermissions, permissionsForRole, can };
