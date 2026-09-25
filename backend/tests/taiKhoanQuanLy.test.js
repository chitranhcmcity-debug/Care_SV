const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createManagerAccount } = require('../scripts/taoTaiKhoanQuanLy');

test('creates an active manager once and preserves existing credentials on rerun', async () => {
  const database = await MongoMemoryServer.create();
  try {
    await mongoose.connect(database.getUri());
    await assert.rejects(createManagerAccount('short'));
    const first = await createManagerAccount('manager-test-password');
    assert.equal(first.created, true);
    assert.equal(first.user.role, 'manager');
    assert.equal(first.user.status, 'active');
    assert.equal(await bcrypt.compare('manager-test-password', first.user.password), true);
    const second = await createManagerAccount('different-password');
    assert.equal(second.created, false);
    assert.equal(String(second.user._id), String(first.user._id));
    assert.equal(second.user.password, first.user.password);
  } finally {
    await mongoose.disconnect();
    await database.stop();
  }
});
