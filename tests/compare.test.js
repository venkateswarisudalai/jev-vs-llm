import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agreement,
  buildLlmPrompt,
  compare,
  jevDiscrete,
  median,
  tokenCost,
  validateLlmOutput,
  validateRequest,
  write,
} from '../lib/compare.js';
import { SORT } from '../lib/examples.js';

const questions = {
  department: {
    type: 'choice',
    instructions: 'Which team should handle this ticket?',
    criteria: { billing: 'Charges', account: 'Sign-in', technical: 'Bugs', sales: 'Pricing' },
  },
  urgent: { type: 'noul', instructions: 'Does this need a response today?' },
  frustration: {
    type: 'score',
    instructions: 'How frustrated is the customer?',
    criteria: ['Calm', 'Mildly annoyed', 'Frustrated', 'Very angry'],
  },
};

test('buildLlmPrompt lists every question with its allowed values', () => {
  const p = buildLlmPrompt('hello', questions);
  assert.match(p, /"department" \(one of: "billing"/);
  assert.match(p, /"urgent" \(boolean true\/false\)/);
  assert.match(p, /"frustration" \(integer 0 = Calm; 1 = Mildly annoyed/);
  assert.match(p, /Input:\nhello$/);
});

test('buildLlmPrompt serializes object state', () => {
  assert.match(buildLlmPrompt({ a: 1 }, questions), /"a": 1/);
});

test('validateLlmOutput accepts a clean answer', () => {
  const r = validateLlmOutput('{"department":"billing","urgent":true,"frustration":2}', questions);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.answers, { department: 'billing', urgent: true, frustration: 2 });
});

test('validateLlmOutput flags fences, bad values, missing and extra keys', () => {
  const r = validateLlmOutput(
    '```json\n{"department":"Billing","frustration":"high","reason":"x"}\n```',
    questions,
  );
  assert.deepEqual(r.answers, {});
  assert.deepEqual(r.errors, [
    'wrapped output in code fences',
    '"department" = "Billing" is not an allowed value',
    'missing "urgent"',
    '"frustration" = "high" is not an allowed value',
    'invented extra key "reason"',
  ]);
});

test('validateLlmOutput rejects prose', () => {
  const r = validateLlmOutput('Sure! Here is the answer: billing', questions);
  assert.deepEqual(r.errors, ['response is not valid JSON']);
});

test('jevDiscrete maps each answer type', () => {
  assert.equal(jevDiscrete(questions.urgent, { noul: 0.93 }), true);
  assert.equal(jevDiscrete(questions.urgent, { noul: 0.2 }), false);
  assert.equal(jevDiscrete(questions.department, { choice: 'account' }), 'account');
  assert.equal(jevDiscrete(questions.frustration, { score: 2.4 }), 2);
  assert.equal(jevDiscrete(questions.frustration, undefined), undefined);
});

test('agreement is the share of runs matching the most common answer', () => {
  const runs = [{ d: 'a' }, { d: 'a' }, { d: 'b' }, { d: 'a' }];
  assert.deepEqual(agreement(runs, { d: {} }), { d: 0.75 });
});

test('median and tokenCost', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
  assert.equal(tokenCost({ input: '0.000001', output: '0.000005' }, 100, 10), 0.00015);
  assert.equal(tokenCost(undefined, 1, 1), null);
});

test('validateRequest guards input', () => {
  const ok = { state: 'x', questions, llmModel: 'anthropic/claude-haiku-4.5' };
  assert.equal(validateRequest(ok), null);
  assert.equal(validateRequest({ ...ok, state: ' ' }), 'state is required');
  assert.match(validateRequest({ ...ok, llmModel: 'evil/model' }), /llmModel must be/);
  assert.match(validateRequest({ ...ok, questions: { 'bad id': questions.urgent } }), /bad question id/);
  assert.match(validateRequest({ ...ok, questions: { x: { type: 'nope', instructions: 'y' } } }), /unknown type/);
});

test('compare runs both sides N times and summarizes', async () => {
  let llmCall = 0;
  const fakeFetch = async (url) => {
    const body = (b) => ({ ok: true, json: async () => b });
    if (url.endsWith('/v1/models')) {
      return body({ data: [{ id: 'anthropic/claude-haiku-4.5', pricing: { input: '0.000001', output: '0.000005' } }] });
    }
    if (url.endsWith('/systemone')) {
      return body({
        answers: {
          department: { type: 'choice', choice: 'billing', confidence: 0.8, probabilities: { billing: 0.9 } },
          urgent: { type: 'noul', noul: 0.97 },
          frustration: { type: 'score', score: 2.1, probabilities: { 2: 0.9 } },
        },
        usage: { input_tokens: 300, output_tokens: 0 },
        provider_metadata: { gateway: { cost: '0.0000126' } },
      });
    }
    llmCall += 1;
    const content = llmCall === 2
      ? 'The department is billing.'
      : `{"department":"${llmCall === 3 ? 'account' : 'billing'}","urgent":true,"frustration":2}`;
    return body({ choices: [{ message: { content } }], usage: { prompt_tokens: 200, completion_tokens: 20 } });
  };

  const r = await compare({
    state: 'x', questions, llmModel: 'anthropic/claude-haiku-4.5', runs: 3, apiKey: 'k', fetchImpl: fakeFetch,
  });
  assert.equal(r.runs, 3);
  assert.equal(r.jev.runs.length, 3);
  assert.equal(r.jev.schemaErrorRuns, 0);
  assert.equal(r.jev.avgCostUsd, 0.0000126);
  assert.deepEqual(r.jev.agreement, { department: 1, urgent: 1, frustration: 1 });
  assert.equal(r.llm.schemaErrorRuns, 1);
  assert.equal(r.llm.agreement.department, 1 / 3);
  assert.ok(Math.abs(r.llm.avgCostUsd - 0.0003) < 1e-12);
});

test('compare clamps runs and reports upstream failures', async () => {
  const failing = async (url) =>
    url.endsWith('/v1/models')
      ? { ok: true, json: async () => ({ data: [] }) }
      : { ok: false, status: 401, json: async () => ({ message: 'bad key' }) };
  const r = await compare({
    state: 'x', questions, llmModel: 'openai/gpt-5-mini', runs: 99, apiKey: 'k', fetchImpl: failing,
  });
  assert.equal(r.runs, 5);
  assert.equal(r.jev.failures.length, 5);
  assert.equal(r.llm.failures[0], 'bad key');
  assert.equal(r.llm.medianLatencyMs, null);
});

test('the page\'s sort example is a valid request', () => {
  const body = { state: SORT.examples[0], questions: SORT.question, llmModel: 'anthropic/claude-haiku-4.5' };
  assert.equal(validateRequest(body), null);
});

test('write mode validates its prompt', () => {
  const ok = { mode: 'write', prompt: 'a poem', llmModel: 'anthropic/claude-haiku-4.5' };
  assert.equal(validateRequest(ok), null);
  assert.equal(validateRequest({ ...ok, prompt: '' }), 'prompt is required');
  assert.match(validateRequest({ ...ok, prompt: 'x'.repeat(1001) }), /too long/);
  assert.match(validateRequest({ ...ok, llmModel: 'nope' }), /llmModel must be/);
});

test('write returns the LLM text, latency and cost', async () => {
  const fakeFetch = async (url) => ({
    ok: true,
    json: async () =>
      url.endsWith('/v1/models')
        ? { data: [{ id: 'anthropic/claude-haiku-4.5', pricing: { input: '0.000001', output: '0.000005' } }] }
        : { choices: [{ message: { content: 'A puppy!' } }], usage: { prompt_tokens: 10, completion_tokens: 10 } },
  });
  const r = await write({ prompt: 'poem', model: 'anthropic/claude-haiku-4.5', apiKey: 'k', fetchImpl: fakeFetch });
  assert.equal(r.text, 'A puppy!');
  assert.ok(r.latencyMs >= 0);
  assert.ok(Math.abs(r.costUsd - 0.00006) < 1e-12);
});
