const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const sdkPath = require.resolve('openai');
const originalSdk = require(sdkPath);
const originalEnv = {
  key: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL,
  baseURL: process.env.OPENAI_BASE_URL,
  provider: process.env.AI_PROVIDER,
  geminiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
};
let requests, responses, keys, endpoints;
require.cache[sdkPath].exports = class {
  constructor({ apiKey, baseURL }) {
    endpoints.push(baseURL);
    keys.push(apiKey);
    const create = async (body) => {
      requests.push(structuredClone(body));
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    };
    this.responses = { create };
    this.chat = { completions: { create } };
  }
};
const ai = require('../services/dichVuTroLyAi');
const messages = [{ role: 'user', content: 'Xin chào' }];
const args = { system: 'Trợ lý sinh viên', messages };
const answer = { status: 'completed', output: [], output_text: 'Xin chào!' };
const call = (name = 'lookup', argumentsText = '{}') => ({
  type: 'function_call',
  call_id: 'call-1',
  name,
  arguments: argumentsText,
});
const toolArgs = {
  ...args,
  tools: [
    { name: 'lookup', description: 'Lookup', input_schema: { type: 'object', properties: {} } },
  ],
};
beforeEach(() => {
  requests = [];
  responses = [];
  keys = [];
  endpoints = [];
  delete process.env.OPENAI_BASE_URL;
  process.env.OPENAI_API_KEY = 'test-key';
  delete process.env.OPENAI_MODEL;
  delete process.env.AI_PROVIDER;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
});
after(() => {
  require.cache[sdkPath].exports = originalSdk;
  for (const [name, value] of [
    ['OPENAI_API_KEY', originalEnv.key],
    ['OPENAI_MODEL', originalEnv.model],
    ['OPENAI_BASE_URL', originalEnv.baseURL],
    ['AI_PROVIDER', originalEnv.provider],
    ['GEMINI_API_KEY', originalEnv.geminiKey],
    ['GEMINI_MODEL', originalEnv.geminiModel],
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});
test('missing key returns 503 without a request', async () => {
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(ai.chat(args), { status: 503 });
  assert.equal(requests.length, 0);
});
test('text request uses OpenAI configuration and supports live changes', async () => {
  responses.push(answer, answer);
  assert.equal(await ai.chat(args), 'Xin chào!');
  assert.equal(requests[0].model, 'gpt-4.1-mini');
  assert.equal(requests[0].store, false);
  assert.deepEqual(requests[0].input, messages);
  assert.equal(requests[0].instructions, args.system);
  process.env.OPENAI_API_KEY = 'rotated-test-key';
  process.env.OPENAI_MODEL = 'custom-model';
  await ai.chat(args);
  assert.equal(requests[1].model, 'custom-model');
  assert.ok(keys.includes('rotated-test-key'));
});
test('tool loop preserves output and returns matching call results', async () => {
  const output = [call()];
  responses.push({ status: 'completed', output }, answer);
  const executions = [];
  assert.equal(
    await ai.chatWithTools({
      ...toolArgs,
      execute: async (...input) => {
        executions.push(input);
        return { count: 3 };
      },
    }),
    'Xin chào!',
  );
  assert.deepEqual(executions, [['lookup', {}]]);
  assert.equal(requests[0].tools[0].strict, false);
  assert.deepEqual(requests[1].input, [
    ...messages,
    ...output,
    { type: 'function_call_output', call_id: 'call-1', output: '{"count":3}' },
  ]);
  assert.equal(messages.length, 1);
});
test('unknown tools and malformed arguments never execute', async () => {
  for (const item of [call('forbidden'), call('lookup', '{')]) {
    responses.push({ status: 'completed', output: [item] }, answer);
    await ai.chatWithTools({ ...toolArgs, execute: () => assert.fail('must not execute') });
    assert.ok(JSON.parse(requests.at(-1).input.at(-1).output).error);
  }
});
test('tool errors are returned to the model and loops are bounded', async () => {
  responses.push({ status: 'completed', output: [call()] }, answer);
  await ai.chatWithTools({
    ...toolArgs,
    execute: () => {
      throw new Error('Access denied');
    },
  });
  assert.match(requests[1].input.at(-1).output, /Access denied/);
  responses.push({ status: 'completed', output: [call()] });
  await assert.rejects(ai.chatWithTools({ ...toolArgs, maxTurns: 1, execute: async () => ({}) }), {
    status: 422,
  });
});
test('SDK failures, refusals, incomplete and empty responses fail cleanly', async () => {
  responses.push(new Error('secret-key'));
  await assert.rejects(
    ai.chat(args),
    (error) => error.status === 502 && !error.message.includes('secret-key'),
  );
  responses.push({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] });
  await assert.rejects(ai.chat(args), { status: 422 });
  responses.push({ status: 'incomplete', output: [] });
  await assert.rejects(ai.chat(args), { status: 502 });
  responses.push({ ...answer, output_text: '' });
  await assert.rejects(ai.chat(args), { status: 502 });
});

test('changing base URL refreshes client and clearing restores OpenAI', async () => {
  responses.push(answer, answer);
  process.env.OPENAI_BASE_URL = 'http://localhost:55797/v1/';
  await ai.chat(args);
  assert.equal(endpoints.at(-1), 'http://localhost:55797/v1');
  delete process.env.OPENAI_BASE_URL;
  await ai.chat(args);
  assert.equal(endpoints.at(-1), 'https://api.openai.com/v1');
});
test('invalid base URL fails before sending credentials', async () => {
  for (const url of ['bad-url', 'file:///tmp', 'https://user:password@example.com/v1']) {
    process.env.OPENAI_BASE_URL = url;
    await assert.rejects(ai.chat(args), { status: 503 });
  }
  assert.equal(requests.length, 0);
});

const geminiAnswer = (message, finish_reason = 'stop') => ({
  choices: [{ finish_reason, message: { role: 'assistant', ...message } }],
});
const useGemini = () => {
  delete process.env.OPENAI_API_KEY;
  process.env.GEMINI_API_KEY = 'gemini-key';
};
test('Gemini is used when only its key is set, or when chosen explicitly', async () => {
  useGemini();
  responses.push(geminiAnswer({ content: 'Chào bạn' }));
  assert.equal(await ai.chat(args), 'Chào bạn');
  assert.equal(endpoints.at(-1), 'https://generativelanguage.googleapis.com/v1beta/openai');
  assert.equal(keys.at(-1), 'gemini-key');
  assert.equal(requests[0].model, 'gemini-2.5-flash');
  assert.deepEqual(requests[0].messages, [{ role: 'system', content: args.system }, ...messages]);
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.AI_PROVIDER = 'Gemini';
  process.env.GEMINI_MODEL = 'gemini-2.5-pro';
  responses.push(geminiAnswer({ content: 'OK' }));
  await ai.chat(args);
  assert.equal(requests[1].model, 'gemini-2.5-pro');
  process.env.AI_PROVIDER = 'openai';
  responses.push(answer);
  await ai.chat(args);
  assert.equal(endpoints.at(-1), 'https://api.openai.com/v1');
});
test('Gemini missing key returns 503 without a request', async () => {
  delete process.env.OPENAI_API_KEY;
  process.env.AI_PROVIDER = 'gemini';
  await assert.rejects(ai.chat(args), { status: 503 });
  assert.equal(requests.length, 0);
});
test('Gemini tool loop sends the assistant turn and tool results back', async () => {
  useGemini();
  const toolCall = { id: 't1', type: 'function', function: { name: 'lookup', arguments: '{}' } };
  const forbidden = { id: 't2', type: 'function', function: { name: 'drop', arguments: '{}' } };
  responses.push(
    geminiAnswer({ content: null, tool_calls: [toolCall, forbidden] }, 'tool_calls'),
    geminiAnswer({ content: 'Có 3 sinh viên' }),
  );
  const executions = [];
  const reply = await ai.chatWithTools({
    ...toolArgs,
    execute: async (...input) => {
      executions.push(input);
      return { count: 3 };
    },
  });
  assert.equal(reply, 'Có 3 sinh viên');
  assert.deepEqual(executions, [['lookup', {}]]);
  assert.equal(requests[0].tools[0].function.name, 'lookup');
  const sent = requests[1].messages;
  assert.deepEqual(sent.at(-3).tool_calls, [toolCall, forbidden]);
  assert.deepEqual(sent.at(-2), { role: 'tool', tool_call_id: 't1', content: '{"count":3}' });
  assert.ok(JSON.parse(sent.at(-1).content).error);
});
test('Gemini failures, filtered and truncated answers fail cleanly', async () => {
  useGemini();
  responses.push(new Error('gemini-key'));
  await assert.rejects(
    ai.chat(args),
    (error) => error.status === 502 && !error.message.includes('gemini-key'),
  );
  responses.push(geminiAnswer({ content: '' }, 'content_filter'));
  await assert.rejects(ai.chat(args), { status: 422 });
  responses.push(geminiAnswer({ content: 'nửa câu' }, 'length'));
  await assert.rejects(ai.chat(args), { status: 502 });
  responses.push(geminiAnswer({ content: '' }));
  await assert.rejects(ai.chat(args), { status: 502 });
});
