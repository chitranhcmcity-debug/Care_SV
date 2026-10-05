// Tổng đài đám mây Stringee: trình duyệt (WebRTC) → gọi số điện thoại, ghi âm phía máy chủ.
// Tài liệu: https://developer.stringee.com — access token, SCCO answer_url, REST API.
// Mọi thứ ở đây không hoạt động cho đến khi đặt STRINGEE_KEY_SID / STRINGEE_KEY_SECRET / STRINGEE_HOTLINE.
const jwt = require('jsonwebtoken');

const REST_BASE = 'https://api.stringee.com/v1';
const REQUEST_TIMEOUT_MS = 20000;

function config() {
  const { STRINGEE_KEY_SID, STRINGEE_KEY_SECRET, STRINGEE_HOTLINE } = process.env;
  if (!STRINGEE_KEY_SID || !STRINGEE_KEY_SECRET || !STRINGEE_HOTLINE) return null;
  return {
    keySid: STRINGEE_KEY_SID,
    keySecret: STRINGEE_KEY_SECRET,
    hotline: toInternational(STRINGEE_HOTLINE),
  };
}
const isConfigured = () => config() !== null;

/** "0912 345 678" / "+84912345678" → "84912345678" (định dạng Stringee gọi). */
function toInternational(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('84')) return digits;
  if (digits.startsWith('0')) return '84' + digits.slice(1);
  return digits;
}

// Token Stringee là JWT HS256 ký bằng secret của API key, với content type tùy chỉnh.
function sign(payload, keySid, keySecret, ttlSec) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { jti: `${keySid}-${now}`, iss: keySid, exp: now + ttlSec, ...payload },
    keySecret,
    {
      algorithm: 'HS256',
      header: { typ: 'JWT', alg: 'HS256', cty: 'stringee-api;v=1' },
    },
  );
}

/** Token ngắn hạn để SDK trình duyệt kết nối với tư cách `userId`. */
function clientToken(userId) {
  const c = config();
  return sign({ userId: String(userId) }, c.keySid, c.keySecret, 60 * 60);
}

const restToken = () => {
  const c = config();
  return sign({ rest_api: true }, c.keySid, c.keySecret, 5 * 60);
};

/**
 * SCCO cho answer_url: ghi âm cuộc gọi, rồi nối trình duyệt với số bên ngoài.
 * Chỉ được gọi sau khi bản ghi cuộc gọi đã được kiểm tra, nên không thể gọi số tùy ý.
 */
/** SCCO cho cuộc gọi đi: kết nối tới `to`, chỉ ghi âm khi người gọi đã chọn. */
function recordAndConnect({ to, eventUrl, record = true }) {
  const c = config();
  return [
    ...(record ? [{ action: 'record', eventUrl, format: 'mp3' }] : []),
    {
      action: 'connect',
      from: { type: 'external', number: c.hotline, alias: c.hotline },
      to: { type: 'external', number: toInternational(to), alias: toInternational(to) },
      customData: '',
      timeout: 45,
      maxConnectTime: -1,
      peerToPeerCall: false,
    },
  ];
}

/** Tải bản ghi âm của cuộc gọi (mp3). Trả về { buffer, mimeType } hoặc null nếu chưa sẵn sàng. */
async function downloadRecording(stringeeCallId) {
  if (!isConfigured() || !stringeeCallId) return null;
  let response;
  try {
    response = await fetch(`${REST_BASE}/call/recording/${encodeURIComponent(stringeeCallId)}`, {
      headers: { 'X-STRINGEE-AUTH': restToken() },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw Object.assign(new Error(`Không kết nối được Stringee: ${error.message}`), {
      status: 502,
    });
  }
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.startsWith('audio/')) return null; // chưa ghi âm / chưa sẵn sàng
  return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: type.split(';')[0] };
}

module.exports = {
  isConfigured,
  toInternational,
  clientToken,
  hotline: () => config()?.hotline || '',
  recordAndConnect,
  downloadRecording,
};
