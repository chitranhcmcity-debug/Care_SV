const OpenAI = require('openai');
const { assert } = require('../utils/kiemTra');

// OpenAI supports Responses or compatible Chat Completions proxies; Google's Gemini endpoint
// uses Chat Completions through the same SDK. Read configuration per call for live admin changes.
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const openaiModel = () => process.env.OPENAI_MODEL?.trim() || 'ag/gemini-3.7-flash-low';
const geminiModel = () => process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
// Gemini 2.5 counts thinking tokens in max_tokens; keep thinking small and budget it on top.
const GEMINI_THINKING_TOKENS = 1024;
const usesChatCompletions = () =>
  provider() === 'gemini' ||
  (process.env.OPENAI_API_MODE?.trim().toLowerCase() || 'chat') === 'chat';

/** Default to Trikun; Gemini must be selected explicitly. */
function provider() {
  const chosen = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (chosen === 'openai' || chosen === 'gemini') return chosen;
  return 'openai';
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
    process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, '') ||
    'https://api-trikun.up.railway.app/v1';
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
// The provider's HTTP status says what went wrong; tell the user that (never the key or the
// request itself) and log it so the cause shows up in the server logs.
function callFailed(name, error, model) {
  const status = error?.status;
  console.error(
    `[AI] ${name} (${model}) failed: status=${status ?? '-'} code=${error?.code ?? '-'} type=${error?.type ?? '-'} ${String(error?.message ?? '').slice(0, 300)}`,
  );
  const reason =
    status === 401 || status === 403
      ? `API key ${name} không hợp lệ hoặc không có quyền dùng model này.`
      : status === 429
        ? `${name} báo hết hạn mức / vượt giới hạn số lần gọi. Kiểm tra billing hoặc thử lại sau ít phút.`
        : status === 404
          ? `Không tìm thấy model "${model}" trên ${name}. Kiểm tra tên model trong Cấu hình API.`
          : status === 400
            ? `${name} từ chối yêu cầu (400): ${String(error?.message ?? '').slice(0, 160)}`
            : status
              ? `${name} đang lỗi (mã ${status}). Vui lòng thử lại sau.`
              : `Không kết nối được tới ${name}. Kiểm tra mạng của máy chủ hoặc địa chỉ API.`;
  return Object.assign(new Error(`Lỗi gọi trợ lý AI: ${reason}`), { status: 502 });
}
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
  } catch (error) {
    throw callFailed('OpenAI', error, openaiModel());
  }
  if (response.output?.some((item) => item.content?.some((part) => part.type === 'refusal'))) {
    throw refused();
  }
  if (response.status !== 'completed') throw incomplete();
  return response;
}

const responseText = (response) => ensureText(response.output_text?.trim());

// ---------------- Gemini / compatible proxies (Chat Completions) ----------------

async function createCompletion({ maxTokens, ...options }) {
  const gemini = provider() === 'gemini';
  const api = gemini ? geminiClient() : openaiClient();
  const model = gemini ? geminiModel() : openaiModel();
  let completion;
  try {
    completion = await api.chat.completions.create({
      model,
      // Some compatible proxies (e.g. Trikun) stream by default unless told otherwise, and the
      // SDK then cannot parse the reply as one JSON object.
      stream: false,
      ...(gemini ? { reasoning_effort: 'low' } : {}),
      max_tokens: maxTokens + (gemini ? GEMINI_THINKING_TOKENS : 0),
      ...options,
    });
  } catch (error) {
    throw callFailed(gemini ? 'Gemini' : 'API AI', error, model);
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
  if (usesChatCompletions()) {
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
  const completions = usesChatCompletions();
  const history = completions ? [{ role: 'system', content: system }, ...messages] : [...messages];
  const functions = tools.map(({ name, description, input_schema }) =>
    completions
      ? { type: 'function', function: { name, description, parameters: input_schema } }
      : // Existing tools have optional filters; preserve those schemas.
        { type: 'function', name, description, parameters: input_schema, strict: false },
  );
  for (let turn = 0; turn < maxTurns; turn++) {
    if (completions) {
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
