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
module.exports = { getJwtSecret, getConfig };
