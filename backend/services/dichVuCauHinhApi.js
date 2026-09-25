// Khóa API tích hợp do Admin cấu hình trên giao diện (ChatGPT (OpenAI), Gemini, Stringee, SMTP).
// Giá trị lưu trong CaiDatHeThong.integrations, mã hóa AES-256-GCM bằng khóa suy ra từ
// CONFIG_SECRET (hoặc JWT_SECRET). Khi nạp, giá trị trong database được phủ lên process.env nên
// các dịch vụ hiện có đọc process.env như cũ; xóa giá trị trong database thì quay về giá trị .env.
// Khóa PayOS là của nhà cung cấp phần mềm nên không nằm ở đây.
const crypto = require('node:crypto');
const CaiDatHeThong = require('../models/CaiDatHeThong');
const { assert } = require('../utils/kiemTra');

const CATALOG = Object.freeze([
  {
    key: 'AI_PROVIDER',
    group: 'Trợ lý AI',
    label: 'Nhà cung cấp (openai hoặc gemini)',
    placeholder: 'Tự động: OpenAI nếu có key, không thì Gemini',
    allowed: ['openai', 'gemini'],
  },
  { key: 'OPENAI_API_KEY', group: 'Trợ lý AI (ChatGPT (OpenAI))', label: 'API key', secret: true },
  {
    key: 'OPENAI_MODEL',
    group: 'Trợ lý AI (ChatGPT (OpenAI))',
    label: 'Model',
    placeholder: 'gpt-4.1-mini',
  },
  {
    key: 'OPENAI_BASE_URL',
    group: 'Trợ lý AI (ChatGPT (OpenAI))',
    label: 'Địa chỉ API (Base URL)',
    placeholder: 'https://api.openai.com/v1',
  },
  { key: 'GEMINI_API_KEY', group: 'Trợ lý AI (Gemini)', label: 'API key', secret: true },
  {
    key: 'GEMINI_MODEL',
    group: 'Trợ lý AI (Gemini)',
    label: 'Model',
    placeholder: 'gemini-2.5-flash',
  },
  { key: 'STRINGEE_KEY_SID', group: 'Tổng đài Stringee', label: 'Key SID' },
  { key: 'STRINGEE_KEY_SECRET', group: 'Tổng đài Stringee', label: 'Key Secret', secret: true },
  { key: 'STRINGEE_HOTLINE', group: 'Tổng đài Stringee', label: 'Số hotline' },
  { key: 'SMTP_HOST', group: 'Email (SMTP)', label: 'Máy chủ', placeholder: 'smtp.gmail.com' },
  { key: 'SMTP_PORT', group: 'Email (SMTP)', label: 'Cổng', placeholder: '587' },
  { key: 'SMTP_USER', group: 'Email (SMTP)', label: 'Tài khoản' },
  { key: 'SMTP_PASS', group: 'Email (SMTP)', label: 'Mật khẩu ứng dụng', secret: true },
]);
const KEYS = CATALOG.map((c) => c.key);

// Values from .env captured before any database overlay, so clearing restores them.
const envDefaults = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
let applied = {};

function cipherKey() {
  const secret = process.env.CONFIG_SECRET || process.env.JWT_SECRET || '';
  return crypto.createHash('sha256').update(`care-sv-integrations:${secret}`).digest();
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', cipherKey(), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

function decrypt(payload) {
  try {
    const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', cipherKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null; // secret changed or data corrupted: fall back to .env
  }
}

const mask = (value) => (value.length <= 8 ? '••••' : `${value.slice(0, 4)}••••${value.slice(-4)}`);

async function storedValues() {
  const settings = await CaiDatHeThong.findOne().select('integrations').lean();
  const raw = settings?.integrations || {};
  return Object.fromEntries(
    KEYS.filter((k) => typeof raw[k] === 'string')
      .map((k) => [k, decrypt(raw[k])])
      .filter(([, v]) => v !== null),
  );
}

/** Loads database values over process.env (called at startup and after every save). */
async function applyIntegrations() {
  const values = await storedValues();
  for (const key of KEYS) {
    if (values[key]) process.env[key] = values[key];
    else if (envDefaults[key] === undefined) delete process.env[key];
    else process.env[key] = envDefaults[key];
  }
  applied = values;
}

/** Catalog with each value's source; secrets are masked, never returned in clear. */
function describeIntegrations() {
  return CATALOG.map((item) => {
    const fromDb = applied[item.key];
    const value = fromDb ?? envDefaults[item.key] ?? '';
    return {
      ...item,
      secret: Boolean(item.secret),
      source: fromDb ? 'database' : value ? 'env' : 'none',
      value: value ? (item.secret ? mask(value) : value) : '',
    };
  });
}

/**
 * values: { KEY: string | null }. A non-empty string sets the key, '' or null removes the
 * database value (falls back to .env), keys left out are unchanged.
 */
async function updateIntegrations(values) {
  assert(values && typeof values === 'object' && !Array.isArray(values), 'Dữ liệu không hợp lệ');
  const settings = (await CaiDatHeThong.findOne()) || new CaiDatHeThong();
  const next = { ...(settings.integrations || {}) };
  for (const [key, value] of Object.entries(values)) {
    assert(KEYS.includes(key), `Khóa cấu hình không hợp lệ: ${key}`);
    assert(value === null || typeof value === 'string', `Giá trị ${key} không hợp lệ`);
    const trimmed = (value || '').trim();
    assert(trimmed.length <= 500, `Giá trị ${key} quá dài`);
    const { allowed } = CATALOG.find((c) => c.key === key);
    assert(
      !trimmed || !allowed || allowed.includes(trimmed.toLowerCase()),
      `Giá trị ${key} phải là: ${allowed?.join(', ')}`,
    );
    if (trimmed) next[key] = encrypt(trimmed);
    else delete next[key];
  }
  settings.integrations = next;
  settings.markModified('integrations');
  await settings.save();
  await applyIntegrations();
  return describeIntegrations();
}

module.exports = { applyIntegrations, describeIntegrations, updateIntegrations };
