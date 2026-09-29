const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const originalEnv = { ...process.env };
delete process.env.RAILWAY_ENVIRONMENT_ID;
delete process.env.AI_DEPLOYMENT_PRESET;
delete process.env.CONFIG_SECRET;
process.env.JWT_SECRET = 'migration-test-secret';
process.env.OPENAI_API_KEY = 'trikun-deployment-test-key';
process.env.AI_PROVIDER = 'gemini';

const modelPath = require.resolve('../models/CaiDatHeThong');
const originalModel = require(modelPath);
let record;
let saves = 0;
class Settings {
  constructor() {
    this.integrations = {};
  }
  markModified() {}
  async save() {
    record = this;
    saves++;
  }
  static findOne() {
    return {
      then(resolve, reject) {
        return Promise.resolve(record).then(resolve, reject);
      },
      select() {
        return { lean: async () => record };
      },
    };
  }
}
require.cache[modelPath].exports = Settings;
const config = require('../services/dichVuCauHinhApi');

function encrypt(value) {
  const key = crypto
    .createHash('sha256')
    .update('care-sv-integrations:migration-test-secret')
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64')).join('.');
}

after(() => {
  require.cache[modelPath].exports = originalModel;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

test('Railway migration replaces persisted Gemini routing, preserves unrelated settings and runs once', async () => {
  record = new Settings();
  record.schoolName = 'Unchanged school';
  record.integrations = {
    AI_PROVIDER: encrypt('gemini'),
    OPENAI_API_MODE: encrypt('responses'),
    OPENAI_BASE_URL: encrypt('https://old.example/v1'),
    OPENAI_MODEL: encrypt('old-model'),
    OPENAI_API_KEY: encrypt('old-openai-key'),
    GEMINI_API_KEY: encrypt('google-only-key'),
    SMTP_PASS: encrypt('smtp-test-secret'),
  };
  const smtp = record.integrations.SMTP_PASS;
  const googleKey = record.integrations.GEMINI_API_KEY;
  await config.migrateAiToTrikun();
  assert.equal(saves, 0, 'local startup must not change settings');
  process.env.RAILWAY_ENVIRONMENT_ID = 'test-environment';
  await config.migrateAiToTrikun();
  await config.applyIntegrations();
  assert.equal(process.env.AI_PROVIDER, 'openai');
  assert.equal(process.env.OPENAI_API_MODE, 'chat');
  assert.equal(process.env.OPENAI_BASE_URL, 'https://api-trikun.up.railway.app/v1');
  assert.equal(process.env.OPENAI_MODEL, 'ag/gemini-3.7-flash-low');
  assert.equal(process.env.OPENAI_API_KEY, 'trikun-deployment-test-key');
  assert.notEqual(record.integrations.OPENAI_API_KEY, process.env.OPENAI_API_KEY);
  assert.equal(record.integrations.GEMINI_API_KEY, googleKey);
  assert.equal(record.integrations.SMTP_PASS, smtp);
  assert.equal(record.schoolName, 'Unchanged school');
  assert.equal(
    config.describeIntegrations().find((item) => item.key === 'AI_PROVIDER').value,
    'openai',
  );
  record.integrations.OPENAI_MODEL = encrypt('later-admin-choice');
  await config.migrateAiToTrikun();
  await config.applyIntegrations();
  assert.equal(process.env.OPENAI_MODEL, 'later-admin-choice');
  assert.equal(saves, 1);
});

test('deployment preset initializes settings when no settings record exists', async () => {
  delete process.env.RAILWAY_ENVIRONMENT_ID;
  process.env.AI_DEPLOYMENT_PRESET = 'trikun';
  record = null;
  await config.migrateAiToTrikun();
  await config.applyIntegrations();
  assert.equal(record.aiConfigurationVersion, 'trikun-gemini-3.7-v1');
  assert.equal(process.env.OPENAI_MODEL, 'ag/gemini-3.7-flash-low');
});
