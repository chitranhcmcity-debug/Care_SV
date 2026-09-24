// Stringee cloud switchboard: browser (WebRTC) → phone number calls, recorded server-side.
// Docs: https://developer.stringee.com — access tokens, SCCO answer_url, REST API.
// Everything here is inert until STRINGEE_KEY_SID / STRINGEE_KEY_SECRET / STRINGEE_HOTLINE are set.
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

/** "0912 345 678" / "+84912345678" → "84912345678" (the format Stringee dials). */
function toInternational(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('84')) return digits;
  if (digits.startsWith('0')) return '84' + digits.slice(1);
  return digits;
}

// Stringee tokens are HS256 JWTs signed with the API key secret, with a custom content type.
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

/** Short-lived token the browser SDK uses to connect as `userId`. */
function clientToken(userId) {
  const c = config();
  return sign({ userId: String(userId) }, c.keySid, c.keySecret, 60 * 60);
}

const restToken = () => {
  const c = config();
  return sign({ rest_api: true }, c.keySid, c.keySecret, 5 * 60);
};

/**
 * SCCO for answer_url: record the call, then bridge the browser to the external number.
 * Only called after the call log was validated, so callers cannot dial arbitrary numbers.
 */
function recordAndConnect({ to, eventUrl }) {
  const c = config();
  return [
    { action: 'record', eventUrl, format: 'mp3' },
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

/** Downloads a call's recording (mp3). Returns { buffer, mimeType } or null if not ready. */
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
  if (!response.ok || !type.startsWith('audio/')) return null; // not recorded / not ready yet
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
