// Zalo ZNS (Zalo Notification Service): template messages sent to a phone number from the
// school's Zalo Official Account. https://developers.zalo.me/docs/zalo-notification-service
// The OA access token lasts about 25 hours and is renewed with the refresh token; Zalo returns
// a NEW refresh token on every renewal (the old one stops working), so it is saved straight back.
const { saveIntegrationValue } = require('./dichVuCauHinhApi');

const OAUTH_URL = 'https://oauth.zaloapp.com/v4/oa/access_token';
const SEND_URL = 'https://business.openapi.zalo.me/message/template';
const TIMEOUT_MS = 15000;

const env = (key) => (process.env[key] || '').trim();

const isConfigured = () =>
  Boolean(
    env('ZALO_APP_ID') &&
    env('ZALO_APP_SECRET') &&
    env('ZALO_OA_REFRESH_TOKEN') &&
    env('ZALO_ZNS_TEMPLATE_ID'),
  );

/** "0912 345 678" / "+84912345678" → "84912345678"; null when it is not a Vietnamese number. */
function toZaloPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const local = digits.startsWith('84') ? digits.slice(2) : digits.replace(/^0/, '');
  return /^[35789]\d{8}$/.test(local) ? `84${local}` : null;
}

let token = null; // { value, expires }
let renewing = null;

async function accessToken() {
  if (token && token.expires > Date.now()) return token.value;
  // One renewal at a time: a second one would use the refresh token the first just retired.
  renewing ??= (async () => {
    const response = await fetch(OAUTH_URL, {
      method: 'POST',
      headers: {
        secret_key: env('ZALO_APP_SECRET'),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        refresh_token: env('ZALO_OA_REFRESH_TOKEN'),
        app_id: env('ZALO_APP_ID'),
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await response.json().catch(() => ({}));
    if (!data.access_token)
      throw new Error(
        `Không lấy được access token Zalo: ${data.error_description || data.error_name || data.error || response.status}`,
      );
    if (data.refresh_token) await saveIntegrationValue('ZALO_OA_REFRESH_TOKEN', data.refresh_token);
    // Renew a few minutes early.
    const seconds = Number(data.expires_in) || 3600;
    token = { value: data.access_token, expires: Date.now() + (seconds - 300) * 1000 };
    return token.value;
  })().finally(() => {
    renewing = null;
  });
  return renewing;
}

/**
 * Sends the absence-warning template. templateData keys must match the template's parameters.
 * Returns { msgId } or throws with Zalo's reason.
 */
async function sendTemplate(phone, templateData, trackingId) {
  const to = toZaloPhone(phone);
  if (!to) throw new Error('Số điện thoại phụ huynh không hợp lệ');
  const body = {
    phone: to,
    template_id: env('ZALO_ZNS_TEMPLATE_ID'),
    template_data: templateData,
    tracking_id: String(trackingId),
  };
  // Development mode only delivers to the OA's admins: for trying the template out.
  if (env('ZALO_ZNS_MODE') === 'development') body.mode = 'development';
  const response = await fetch(SEND_URL, {
    method: 'POST',
    headers: { access_token: await accessToken(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await response.json().catch(() => ({}));
  if (data.error !== 0) {
    // Expired / revoked token: drop it so the next message renews it.
    if ([-124, -216].includes(data.error)) token = null;
    throw new Error(
      `Zalo từ chối (${data.error ?? response.status}): ${data.message || ''}`.trim(),
    );
  }
  return { msgId: data.data?.msg_id || '' };
}

module.exports = { isConfigured, sendTemplate, toZaloPhone };
