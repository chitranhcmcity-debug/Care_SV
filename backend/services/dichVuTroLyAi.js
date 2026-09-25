const OpenAI = require('openai');
const { assert } = require('../utils/kiemTra');

// Two providers: OpenAI (Responses API) and Gemini (Google's OpenAI-compatible Chat Completions
// endpoint, called through the same SDK). Configuration is read per call so admin changes take
// effect immediately.
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const openaiModel = () => process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini';
const geminiModel = () => process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
// Gemini 2.5 counts thinking tokens in max_tokens; keep thinking small and budget it on top.
const GEMINI_THINKING_TOKENS = 1024;

/** AI_PROVIDER picks one; left empty, OpenAI is used when its key is set, otherwise Gemini. */
function provider() {
  const chosen = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (chosen === 'openai' || chosen === 'gemini') return chosen;
  return !process.env.OPENAI_API_KEY?.trim() && process.env.GEMINI_API_KEY?.trim()
    ? 'gemini'
    : 'openai';
}

let client;
let clientKey;
let clientBaseURL;

function cachedClient(key, baseURL) {
  if (!client || clientKey !== key || clientBaseURL !== baseURL) {
    client = new OpenAI({ apiKey: key, baseURL });
    clientKey = key;
    clientBaseURL = baseURL;
  }
  return client;
}

function openaiClient() {
  const key = process.env.OPENAI_API_KEY?.trim();
  const baseURL =
    process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, '') || 'https://api.openai.com/v1';
  assert(
    key,
    'Trợ lý AI chưa được cấu hình. Quản trị viên cần nhập API key OpenAI trong Quản trị → Cấu hình API.',
    503,
  );
  if (baseURL !== clientBaseURL) {
    let url;
    try {
      url = new URL(baseURL);
    } catch {
      assert(false, 'Địa chỉ API AI không hợp lệ.', 503);
    }
    assert(
      ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash,
      'Địa chỉ API AI phải là URL HTTP hoặc HTTPS, không chứa thông tin đăng nhập, query hay fragment.',
      503,
    );
  }
  return cachedClient(key, baseURL);
}

function geminiClient() {
  const key = process.env.GEMINI_API_KEY?.trim();
  assert(
    key,
    'Trợ lý AI chưa được cấu hình. Quản trị viên cần nhập API key Gemini trong Quản trị → Cấu hình API.',
    503,
  );
  return cachedClient(key, GEMINI_BASE_URL);
}

const refused = () => Object.assign(new Error('Trợ lý AI từ chối yêu cầu này.'), { status: 422 });
const incomplete = () =>
  Object.assign(
    new Error('Trợ lý AI chưa hoàn tất câu trả lời. Vui lòng thử lại với câu hỏi ngắn hơn.'),
    { status: 502 },
  );
// Do not expose credentials or request details from SDK errors.
const callFailed = (name) =>
  Object.assign(
    new Error(`Lỗi gọi trợ lý AI ${name}. Vui lòng kiểm tra API key, model và hạn mức sử dụng.`),
    { status: 502 },
  );
const ensureText = (text) => {
  assert(text, 'Trợ lý AI không trả về nội dung. Vui lòng thử lại.', 502);
  return text;
};

// ---------------- OpenAI (Responses API) ----------------

async function createResponse(options) {
  const api = openaiClient();
  let response;
  try {
    response = await api.responses.create({ model: openaiModel(), store: false, ...options });
  } catch {
    throw callFailed('OpenAI');
  }
  if (response.output?.some((item) => item.content?.some((part) => part.type === 'refusal'))) {
    throw refused();
  }
  if (response.status !== 'completed') throw incomplete();
  return response;
}

const responseText = (response) => ensureText(response.output_text?.trim());

// ---------------- Gemini (Chat Completions) ----------------

async function createCompletion({ maxTokens, ...options }) {
  const api = geminiClient();
  let completion;
  try {
    completion = await api.chat.completions.create({
      model: geminiModel(),
      reasoning_effort: 'low',
      max_tokens: maxTokens + GEMINI_THINKING_TOKENS,
      ...options,
    });
  } catch {
    throw callFailed('Gemini');
  }
  const choice = completion.choices?.[0];
  if (choice?.finish_reason === 'content_filter') throw refused();
  if (choice?.finish_reason === 'length') throw incomplete();
  assert(choice?.message, 'Trợ lý AI không trả về nội dung. Vui lòng thử lại.', 502);
  return choice.message;
}

const messageText = (message) =>
  ensureText(typeof message.content === 'string' ? message.content.trim() : '');

// ---------------- Public API ----------------

async function chat({ system, messages, maxTokens = 1024 }) {
  if (provider() === 'gemini') {
    return messageText(
      await createCompletion({
        messages: [{ role: 'system', content: system }, ...messages],
        maxTokens,
      }),
    );
  }
  return responseText(
    await createResponse({ instructions: system, input: messages, max_output_tokens: maxTokens }),
  );
}

// execute(name, input) continues to enforce the caller's data permissions.
async function runTool(names, execute, name, argumentsText) {
  try {
    assert(names.has(name), 'Công cụ không được phép', 403);
    return JSON.stringify(await execute(name, JSON.parse(argumentsText || '{}'))) ?? 'null';
  } catch (error) {
    return JSON.stringify({ error: `Lỗi khi truy vấn dữ liệu: ${error.message}` });
  }
}

async function chatWithTools({ system, messages, tools, execute, maxTurns = 6 }) {
  const names = new Set(tools.map((tool) => tool.name));
  const gemini = provider() === 'gemini';
  const history = gemini ? [{ role: 'system', content: system }, ...messages] : [...messages];
  const functions = tools.map(({ name, description, input_schema }) =>
    gemini
      ? { type: 'function', function: { name, description, parameters: input_schema } }
      : // Existing tools have optional filters; preserve those schemas.
        { type: 'function', name, description, parameters: input_schema, strict: false },
  );
  for (let turn = 0; turn < maxTurns; turn++) {
    if (gemini) {
      const message = await createCompletion({
        messages: history,
        tools: functions,
        maxTokens: 16000,
      });
      const calls = message.tool_calls || [];
      if (!calls.length) return messageText(message);
      // Send the assistant turn back as-is (it carries Gemini's thought signatures).
      history.push(message);
      const results = await Promise.all(
        calls.map(async (call) => ({
          role: 'tool',
          tool_call_id: call.id,
          content: await runTool(names, execute, call.function?.name, call.function?.arguments),
        })),
      );
      history.push(...results);
      continue;
    }
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
      calls.map(async (call) => ({
        type: 'function_call_output',
        call_id: call.call_id,
        output: await runTool(names, execute, call.name, call.arguments),
      })),
    );
    history.push(...results);
  }
  throw Object.assign(new Error('Trợ lý AI cần quá nhiều bước, vui lòng hỏi cụ thể hơn.'), {
    status: 422,
  });
}

module.exports = { chat, chatWithTools };
