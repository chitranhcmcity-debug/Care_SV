const Anthropic = require('@anthropic-ai/sdk');
const { assert } = require('../utils/kiemTra');

// Key and model are read per call: an admin can change them in the UI (dichVuCauHinhApi).
const model = () => process.env.AI_MODEL || 'claude-opus-5';
let client = null;
let clientKey = '';

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient() {
  if (!client || clientKey !== process.env.ANTHROPIC_API_KEY) {
    clientKey = process.env.ANTHROPIC_API_KEY;
    client = new Anthropic({ apiKey: clientKey });
  }
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
    'Trợ lý AI chưa được cấu hình. Quản trị viên cần nhập API key Claude trong Quản trị → Cấu hình API.',
    503,
  );
  let response;
  try {
    response = await getClient().messages.create({
      model: model(),
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

/**
 * Chat with client-side tools: loops while Claude asks for tools, running each through
 * `execute(name, input)` (which must enforce the caller's permissions), and returns the final text.
 */
async function chatWithTools({ system, messages, tools, execute, maxTurns = 6, effort = 'low' }) {
  assert(
    isConfigured(),
    'Trợ lý AI chưa được cấu hình. Quản trị viên cần nhập API key Claude trong Quản trị → Cấu hình API.',
    503,
  );
  const history = [...messages];
  for (let turn = 0; turn < maxTurns; turn++) {
    let response;
    try {
      response = await getClient().messages.create({
        model: model(),
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        output_config: { effort },
        system,
        tools,
        messages: history,
      });
    } catch (error) {
      throw Object.assign(new Error(`Lỗi gọi trợ lý AI: ${error.message}`), { status: 502 });
    }
    if (response.stop_reason === 'refusal') {
      throw Object.assign(new Error('Trợ lý AI từ chối yêu cầu này.'), { status: 422 });
    }
    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !toolUses.length) {
      return response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
    }
    // Keep the whole assistant turn (thinking + tool_use blocks), then answer every tool call
    // in a single user message.
    history.push({ role: 'assistant', content: response.content });
    const results = await Promise.all(
      toolUses.map(async (block) => {
        try {
          const output = await execute(block.name, block.input);
          return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(output) };
        } catch (error) {
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Lỗi khi truy vấn dữ liệu: ${error.message}`,
            is_error: true,
          };
        }
      }),
    );
    history.push({ role: 'user', content: results });
  }
  throw Object.assign(new Error('Trợ lý AI cần quá nhiều bước, vui lòng hỏi cụ thể hơn.'), {
    status: 422,
  });
}

module.exports = { chat, chatWithTools };
