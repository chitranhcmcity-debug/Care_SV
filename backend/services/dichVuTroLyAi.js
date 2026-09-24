const Anthropic = require('@anthropic-ai/sdk');
const { assert } = require('../utils/kiemTra');

const MODEL = process.env.AI_MODEL || 'claude-opus-5';
let client = null;

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Single call to Claude. Every /api/ai/* route builds its own system + messages
 * from DB data and goes through this one function, so the model/config/error
 * handling only lives in one place.
 */
async function chat({ system, messages, maxTokens = 1024, effort = 'low' }) {
  assert(
    isConfigured(),
    'Trợ lý AI chưa được cấu hình. Vui lòng thêm ANTHROPIC_API_KEY vào backend/.env.',
    503,
  );
  let response;
  try {
    response = await getClient().messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort },
      system,
      messages,
    });
  } catch (error) {
    // Surface Anthropic SDK errors as a clean 502 instead of a raw 500 stack trace.
    throw Object.assign(new Error(`Lỗi gọi trợ lý AI: ${error.message}`), { status: 502 });
  }
  if (response.stop_reason === 'refusal') {
    throw Object.assign(new Error('Trợ lý AI từ chối yêu cầu này.'), { status: 422 });
  }
  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text : '';
}

module.exports = { chat };
