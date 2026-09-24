// Minimal PayOS client over its REST API (https://payos.vn/docs/api/).
// Every request and webhook is signed with HMAC-SHA256 using the channel's checksum key.
const crypto = require('crypto');

const API_BASE = 'https://api-merchant.payos.vn';
const REQUEST_TIMEOUT_MS = 15000;

function credentials() {
  const { PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY } = process.env;
  if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY) return null;
  return { clientId: PAYOS_CLIENT_ID, apiKey: PAYOS_API_KEY, checksumKey: PAYOS_CHECKSUM_KEY };
}

const isConfigured = () => credentials() !== null;

function requireCredentials() {
  const creds = credentials();
  if (!creds)
    throw Object.assign(
      new Error('Chưa cấu hình PayOS (PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY).'),
      { status: 503 },
    );
  return creds;
}

const hmac = (key, text) => crypto.createHmac('sha256', key).update(text).digest('hex');

// Constant-time comparison of two hex signatures.
function sameSignature(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// PayOS's canonical form for signing an object: keys sorted, "key=value" joined by "&",
// null/undefined as empty strings, arrays of objects as JSON with sorted keys.
const sortKeys = (obj) =>
  Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map((k) => [k, obj[k]]),
  );
function canonicalize(data) {
  return Object.keys(data)
    .sort()
    .map((key) => {
      let value = data[key];
      if (Array.isArray(value))
        value = JSON.stringify(value.map((v) => (v && typeof v === 'object' ? sortKeys(v) : v)));
      if (value === null || value === undefined || value === 'null' || value === 'undefined')
        value = '';
      return `${key}=${value}`;
    })
    .join('&');
}

async function call(method, path, body) {
  const { clientId, apiKey } = requireCredentials();
  let response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers: {
        'x-client-id': clientId,
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw Object.assign(new Error(`Không kết nối được PayOS: ${error.message}`), { status: 502 });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code !== '00' || !payload.data) {
    throw Object.assign(
      new Error(`PayOS từ chối yêu cầu: ${payload.desc || response.statusText || 'không rõ lỗi'}`),
      { status: 502 },
    );
  }
  return payload.data;
}

/**
 * Creates a payment link. `description` must be ≤ 25 characters, unaccented.
 * Returns { checkoutUrl, qrCode, paymentLinkId, ... }.
 */
function createPaymentLink({
  orderCode,
  amount,
  description,
  returnUrl,
  cancelUrl,
  items,
  expiredAt,
}) {
  const { checksumKey } = requireCredentials();
  // Only these five fields are covered by the create signature, in this exact order.
  const signature = hmac(
    checksumKey,
    `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`,
  );
  return call('POST', '/v2/payment-requests', {
    orderCode,
    amount,
    description,
    returnUrl,
    cancelUrl,
    items,
    expiredAt,
    signature,
  });
}

/** Current state of a payment link: { status: 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED' | ... }. */
const getPaymentInfo = (orderCode) => call('GET', `/v2/payment-requests/${orderCode}`);

/**
 * Checks a webhook body's signature and returns its `data`, or null when the body is
 * malformed or the signature does not match (i.e. it did not come from PayOS).
 */
function verifyWebhook(body) {
  const creds = credentials();
  if (!creds || !body || typeof body !== 'object') return null;
  const { data, signature } = body;
  if (!data || typeof data !== 'object' || typeof signature !== 'string') return null;
  return sameSignature(hmac(creds.checksumKey, canonicalize(data)), signature) ? data : null;
}

module.exports = {
  isConfigured,
  createPaymentLink,
  getPaymentInfo,
  verifyWebhook,
  // exported for tests
  canonicalize,
  hmac,
};
