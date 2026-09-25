const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { ensureInitialAdmin } = require('../scripts/taoTaiKhoanQuanTri');
const { getUploadDir } = require('../utils/moiTruong');

test('first admin is created from the environment once, and only while no admin exists', async () => {
  const database = await MongoMemoryServer.create();
  try {
    await mongoose.connect(database.getUri());
    assert.equal((await ensureInitialAdmin({})).reason, 'not-configured');
    await assert.rejects(ensureInitialAdmin({ ADMIN_EMAIL: 'root', ADMIN_PASSWORD: 'short' }));

    const env = { ADMIN_EMAIL: ' Root@ITC.edu.vn ', ADMIN_PASSWORD: 'a-long-admin-password' };
    const first = await ensureInitialAdmin(env);
    assert.equal(first.created, true);
    assert.equal(first.user.email, 'root@itc.edu.vn');
    assert.equal(first.user.role, 'admin');
    assert.equal(await bcrypt.compare(env.ADMIN_PASSWORD, first.user.password), true);

    // Later restarts leave the existing admin (and its password) alone.
    const again = await ensureInitialAdmin({ ...env, ADMIN_PASSWORD: 'another-long-password' });
    assert.equal(again.reason, 'exists');
    const stored = await mongoose.model('NguoiDung').findById(first.user._id);
    assert.equal(stored.password, first.user.password);
  } finally {
    await mongoose.disconnect();
    await database.stop();
  }
});

test('upload directory follows UPLOAD_DIR, then the Railway volume, then the local default', () => {
  const saved = { UPLOAD_DIR: process.env.UPLOAD_DIR, VOL: process.env.RAILWAY_VOLUME_MOUNT_PATH };
  try {
    delete process.env.UPLOAD_DIR;
    delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
    assert.equal(getUploadDir(), path.join(__dirname, '..', 'uploads'));
    process.env.RAILWAY_VOLUME_MOUNT_PATH = '/data';
    assert.equal(getUploadDir(), path.join('/data', 'uploads'));
    process.env.UPLOAD_DIR = '/srv/files';
    assert.equal(getUploadDir(), path.resolve('/srv/files'));
  } finally {
    for (const [key, value] of [
      ['UPLOAD_DIR', saved.UPLOAD_DIR],
      ['RAILWAY_VOLUME_MOUNT_PATH', saved.VOL],
    ])
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});
