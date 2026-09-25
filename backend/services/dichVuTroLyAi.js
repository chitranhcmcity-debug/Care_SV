const OpenAI = require('openai');
const { assert } = require('../utils/kiemTra');

// Read configuration per call so admin changes take effect immediately.
const model = () => process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini';
let client;
let clientKey;

function getClient() {
  const key = process.env.OPENAI_API_KEY?.trim();
  assert(
    key,
    'Trợ lý AI chưa được cấu hình. Quản trị viên cần nhập API key OpenAI trong Quản trị → Cấu hình API.',
    503,
  );
  if (!client || clientKey !== key) {
    clientKey = key;
    client = new OpenAI({ apiKey: key });
  }
  return client;
}

async function createResponse(options) {
  const api = getClient();
  let response;
  try {
    response = await api.responses.create({ model: model(), store: false, ...options });
  } catch {
    // Do not expose credentials or request details from SDK errors.
    throw Object.assign(
      new Error('Lỗi gọi trợ lý AI OpenAI. Vui lòng kiểm tra API key, model và hạn mức sử dụng.'),
      { status: 502 },
    );
  }
  if (response.output?.some((item) => item.content?.some((part) => part.type === 'refusal'))) {
    throw Object.assign(new Error('Trợ lý AI từ chối yêu cầu này.'), { status: 422 });
  }
  if (response.status !== 'completed') {
    throw Object.assign(
      new Error('Trợ lý AI chưa hoàn tất câu trả lời. Vui lòng thử lại với câu hỏi ngắn hơn.'),
      { status: 502 },
    );
  }
  return response;
}

function responseText(response) {
  const text = response.output_text?.trim();
  assert(text, 'Trợ lý AI không trả về nội dung. Vui lòng thử lại.', 502);
  return text;
}

async function chat({ system, messages, maxTokens = 1024 }) {
  return responseText(
    await createResponse({ instructions: system, input: messages, max_output_tokens: maxTokens }),
  );
}

// execute(name, input) continues to enforce the caller's data permissions.
async function chatWithTools({ system, messages, tools, execute, maxTurns = 6 }) {
  const history = [...messages];
  const functions = tools.map(({ name, description, input_schema }) => ({
    type: 'function',
    name,
    description,
    parameters: input_schema,
    // Existing tools have optional filters; preserve those schemas.
    strict: false,
  }));
  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await createResponse({
      instructions: system,
      input: history,
      tools: functions,
      max_output_tokens: 16000,
    });
    const calls = response.output.filter((item) => item.type === 'function_call');
    if (!calls.length) return responseText(response);
    // Preserve all output items, including reasoning, before sending tool results.
    history.push(...response.output);
    const results = await Promise.all(
      calls.map(async (call) => {
        let output;
        try {
          assert(
            functions.some((tool) => tool.name === call.name),
            'Công cụ không được phép',
            403,
          );
          output = JSON.stringify(await execute(call.name, JSON.parse(call.arguments)));
        } catch (error) {
          output = JSON.stringify({ error: `Lỗi khi truy vấn dữ liệu: ${error.message}` });
        }
        return { type: 'function_call_output', call_id: call.call_id, output: output ?? 'null' };
      }),
    );
    history.push(...results);
  }
  throw Object.assign(new Error('Trợ lý AI cần quá nhiều bước, vui lòng hỏi cụ thể hơn.'), {
    status: 422,
  });
}

module.exports = { chat, chatWithTools };
