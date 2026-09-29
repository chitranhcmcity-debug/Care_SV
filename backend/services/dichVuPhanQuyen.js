const CaiDatHeThong = require('../models/CaiDatHeThong');
const {
  PERMISSION_KEYS,
  permissionAppliesTo,
  CONFIGURABLE_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  ADMIN_PERMISSIONS,
  LEGACY_PERMISSIONS,
} = require('../utils/hangSo');

// Every authenticated request reads the matrix, so keep it in memory briefly. Saving through
// setRolePermissions clears it at once; the TTL covers edits made by another server instance.
const CACHE_MS = 30 * 1000;
let cache = null;

/**
 * A matrix saved before a key existed grants that key from the old keys it replaced
 * (LEGACY_PERMISSIONS), so upgrading keeps every role's rights. Once saved again it holds the
 * new keys and is left alone.
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

/** Stored matrix merged over the defaults, with unknown or non-applicable keys dropped. */
function normalize(rawStored) {
  const stored = upgrade(rawStored);
  return Object.fromEntries(
    CONFIGURABLE_ROLES.map((role) => {
      const list = Array.isArray(stored?.[role]) ? stored[role] : DEFAULT_ROLE_PERMISSIONS[role];
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

/** Permission keys held by a role; the admin has a fixed, view-only set (see ADMIN_PERMISSIONS). */
async function permissionsForRole(role) {
  if (role === 'admin') return [...ADMIN_PERMISSIONS];
  return (await getRolePermissions())[role] ?? [];
}

/** Sync check on a req.user that verifyToken already loaded `permissions` into. */
const can = (user, permission) => Boolean(user?.permissions?.includes(permission));

module.exports = { getRolePermissions, setRolePermissions, permissionsForRole, can };
