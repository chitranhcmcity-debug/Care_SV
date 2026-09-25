const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const sdkPath = require.resolve('openai');
const originalSdk = require(sdkPath);
const originalEnv = { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL };
let requests, responses, keys;
require.cache[sdkPath].exports = class {
  constructor({ apiKey }) {
    keys.push(apiKey);
    this.responses = {
      create: async (body) => {
        requests.push(structuredClone(body));
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return response;
      },
    };
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
  process.env.OPENAI_API_KEY = 'test-key';
  delete process.env.OPENAI_MODEL;
});
after(() => {
  require.cache[sdkPath].exports = originalSdk;
  for (const [name, value] of [
    ['OPENAI_API_KEY', originalEnv.key],
    ['OPENAI_MODEL', originalEnv.model],
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
