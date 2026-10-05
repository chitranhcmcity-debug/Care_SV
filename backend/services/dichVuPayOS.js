// Client PayOS tối giản trên REST API của nó (https://payos.vn/docs/api/).
// Mọi request và webhook đều được ký HMAC-SHA256 bằng checksum key của kênh.
const crypto = require('crypto');

const API_BASE = 'https://api-merchant.payos.vn';
const REQUEST_TIMEOUT_MS = 15000;

function credentials() {
  // Trim: khóa dán vào trang quản trị hosting thường dính thêm khoảng trắng hoặc xuống dòng,
  // khiến PayOS báo chữ ký không hợp lệ.
  const [PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY] = [
    process.env.PAYOS_CLIENT_ID,
    process.env.PAYOS_API_KEY,
    process.env.PAYOS_CHECKSUM_KEY,
  ].map((v) => (v || '').trim());
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

// So sánh thời gian hằng số hai chữ ký hex.
function sameSignature(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// Dạng chuẩn PayOS dùng để ký một object: sắp xếp khóa, nối "key=value" bằng "&",
// null/undefined thành chuỗi rỗng, mảng object thành JSON với khóa đã sắp xếp.
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
 * Tạo link thanh toán. `description` phải ≤ 25 ký tự, không dấu.
 * Trả về { checkoutUrl, qrCode, paymentLinkId, ... }.
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
  // Chỉ năm trường này nằm trong chữ ký khi tạo, theo đúng thứ tự này.
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

/** Trạng thái hiện tại của link thanh toán: { status: 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED' | ... }. */
const getPaymentInfo = (orderCode) => call('GET', `/v2/payment-requests/${orderCode}`);

/**
 * Kiểm tra chữ ký của body webhook và trả về `data`, hoặc null khi body
 * sai định dạng hoặc chữ ký không khớp (tức là không đến từ PayOS).
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
  // xuất ra cho test
  canonicalize,
  hmac,
};
