const path = require('node:path');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('JWT_SECRET must contain at least 32 characters.');
  return secret;
}
function getConfig() {
  getJwtSecret();
  const port = Number(process.env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be between 1 and 65535.');
  const useMemoryDatabase = process.env.USE_MEMORY_DB === 'true';
  const seedDemo = process.env.SEED_DEMO === 'true';
  if (process.env.NODE_ENV === 'production' && (useMemoryDatabase || seedDemo))
    throw new Error('Demo data and temporary databases are disabled in production.');
  if (!useMemoryDatabase && !process.env.MONGO_URI) throw new Error('MONGO_URI is required.');
  return { port, useMemoryDatabase, seedDemo, mongoUri: process.env.MONGO_URI };
}
// Base URL of the web app, used for links in emails and PayOS return pages. Never derived
// from request headers: a spoofed Origin would let an attacker receive someone else's token.
const getAppUrl = () => (process.env.APP_URL || 'http://localhost:4201').replace(/\/+$/, '');
// Uploaded files (call recordings, task evidence). On Railway, attach a Volume: its mount path is
// picked up automatically so files survive redeploys; UPLOAD_DIR overrides everything.
function getUploadDir() {
  if (process.env.UPLOAD_DIR) return path.resolve(process.env.UPLOAD_DIR);
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH)
    return path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'uploads');
  return path.join(__dirname, '..', 'uploads');
}
module.exports = { getJwtSecret, getConfig, getAppUrl, getUploadDir };
