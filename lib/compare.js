/**
 * Core logic: send the same state + typed questions to Jev (a System One
 * evaluation model) and to a general-purpose LLM, then measure what an app
 * actually cares about: latency, cost, schema validity, and run-to-run stability.
 */

export const GATEWAY = 'https://ai-gateway.vercel.sh';
export const JEV_MODEL = 'typesafe-ai/jev';
export const LLM_MODELS = [
  'anthropic/claude-haiku-4.5',
  'openai/gpt-5-mini',
  'google/gemini-2.5-flash-lite',
  'meta/llama-3.1-8b',
];
export const MAX_RUNS = 5;
const TIMEOUT_MS = 45_000;

/** Allowed answer values per question type, in the shape we ask the LLM to emit. */
export function allowedValues(q) {
  if (q.type === 'noul') return [true, false];
  if (q.type === 'choice') return Object.keys(q.criteria);
  if (q.type === 'score') return q.criteria.map((_, i) => i);
  throw new Error(`unknown question type: ${q.type}`);
}

/** Build the prompt a developer would realistically write to get the same answers from an LLM. */
export function buildLlmPrompt(state, questions) {
  const lines = Object.entries(questions).map(([id, q]) => {
    if (q.type === 'noul') return `- "${id}" (boolean true/false): ${q.instructions}`;
    if (q.type === 'choice') {
      const opts = Object.entries(q.criteria).map(([k, v]) => `"${k}" = ${v}`).join('; ');
      return `- "${id}" (one of: ${opts}): ${q.instructions}`;
    }
    const scale = q.criteria.map((label, i) => `${i} = ${label}`).join('; ');
    return `- "${id}" (integer ${scale}): ${q.instructions}`;
  });
  const stateText = typeof state === 'string' ? state : JSON.stringify(state, null, 2);
  return [
    'You are a classifier inside a software system. Read the input and answer every question.',
    'Respond with ONLY a JSON object mapping each question id to its answer. No prose, no code fences.',
    '',
    'Questions:',
    ...lines,
    '',
    'Input:',
    stateText,
  ].join('\n');
}

/** Parse and schema-check raw LLM text. Returns { answers, errors }. */
export function validateLlmOutput(text, questions) {
  const errors = [];
  const cleaned = String(text ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { answers: {}, errors: ['response is not valid JSON'] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { answers: {}, errors: ['response is not a JSON object'] };
  }
  if (cleaned !== String(text ?? '').trim()) errors.push('wrapped output in code fences');

  const answers = {};
  for (const [id, q] of Object.entries(questions)) {
    if (!(id in parsed)) {
      errors.push(`missing "${id}"`);
      continue;
    }
    const value = parsed[id];
    if (!allowedValues(q).includes(value)) {
      errors.push(`"${id}" = ${JSON.stringify(value)} is not an allowed value`);
      continue;
    }
    answers[id] = value;
  }
  for (const id of Object.keys(parsed)) {
    if (!(id in questions)) errors.push(`invented extra key "${id}"`);
  }
  return { answers, errors };
}

/** Collapse a Jev answer to the same discrete value the LLM is asked for. */
export function jevDiscrete(q, a) {
  if (!a) return undefined;
  if (q.type === 'noul') return a.noul >= 0.5;
  if (q.type === 'choice') return a.choice;
  return Math.round(a.score);
}

/** Fraction of runs that agree with the most common answer, per question. */
export function agreement(runs, questions) {
  const out = {};
  for (const id of Object.keys(questions)) {
    const values = runs.map((r) => JSON.stringify(r?.[id]));
    if (values.length === 0) continue;
    const counts = values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map());
    out[id] = Math.max(...counts.values()) / values.length;
  }
  return out;
}

export function median(nums) {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Token cost in USD from gateway per-token pricing. */
export function tokenCost(pricing, inputTokens = 0, outputTokens = 0) {
  if (!pricing) return null;
  return inputTokens * Number(pricing.input ?? 0) + outputTokens * Number(pricing.output ?? 0);
}

let pricingCache;
/** Public gateway model catalog -> { [modelId]: { input, output } } (per token, USD). */
export async function loadPricing(fetchImpl = fetch) {
  if (pricingCache) return pricingCache;
  const res = await fetchImpl(`${GATEWAY}/v1/models`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return {};
  const { data } = await res.json();
  pricingCache = Object.fromEntries(data.map((m) => [m.id, m.pricing]));
  return pricingCache;
}

async function postJson(fetchImpl, url, apiKey, body) {
  const t0 = performance.now();
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const latencyMs = Math.round(performance.now() - t0);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.message ?? json?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return { json, latencyMs };
}

export async function callJev({ state, questions, apiKey, fetchImpl = fetch }) {
  const { json, latencyMs } = await postJson(
    fetchImpl,
    `${GATEWAY}/typesafe/v1/systemone`,
    apiKey,
    { model: JEV_MODEL, state, questions },
  );
  const discrete = Object.fromEntries(
    Object.entries(questions).map(([id, q]) => [id, jevDiscrete(q, json.answers?.[id])]),
  );
  const gatewayCost = json.provider_metadata?.gateway?.cost;
  return {
    latencyMs,
    raw: json.answers,
    answers: discrete,
    errors: [],
    usage: json.usage,
    costUsd: gatewayCost != null ? Number(gatewayCost) : null,
  };
}

export async function callLlm({ state, questions, model, apiKey, fetchImpl = fetch }) {
  const prompt = buildLlmPrompt(state, questions);
  const { json, latencyMs } = await postJson(fetchImpl, `${GATEWAY}/v1/chat/completions`, apiKey, {
    model,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = json.choices?.[0]?.message?.content ?? '';
  const { answers, errors } = validateLlmOutput(text, questions);
  const gatewayCost = json.provider_metadata?.gateway?.cost;
  return {
    latencyMs,
    raw: text,
    answers,
    errors,
    usage: {
      input_tokens: json.usage?.prompt_tokens ?? 0,
      output_tokens: json.usage?.completion_tokens ?? 0,
    },
    costUsd: gatewayCost != null ? Number(gatewayCost) : null,
    prompt,
  };
}

function summarize(model, results, questions, pricing) {
  const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const failures = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
  for (const r of ok) {
    if (r.costUsd == null) {
      r.costUsd = tokenCost(pricing[model], r.usage?.input_tokens, r.usage?.output_tokens);
    }
  }
  const costs = ok.map((r) => r.costUsd).filter((c) => c != null);
  return {
    model,
    runs: ok,
    failures,
    medianLatencyMs: median(ok.map((r) => r.latencyMs)),
    avgCostUsd: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    schemaErrorRuns: ok.filter((r) => r.errors.length > 0).length,
    agreement: agreement(ok.map((r) => r.answers), questions),
  };
}

/** Run both sides `runs` times in parallel and return a side-by-side summary. */
export async function compare({ state, questions, llmModel, runs = 1, apiKey, fetchImpl = fetch }) {
  const n = Math.min(Math.max(1, Number(runs) || 1), MAX_RUNS);
  const times = Array.from({ length: n });
  const [pricing, jevResults, llmResults] = await Promise.all([
    loadPricing(fetchImpl).catch(() => ({})),
    Promise.allSettled(times.map(() => callJev({ state, questions, apiKey, fetchImpl }))),
    Promise.allSettled(
      times.map(() => callLlm({ state, questions, model: llmModel, apiKey, fetchImpl })),
    ),
  ]);
  return {
    runs: n,
    jev: summarize(JEV_MODEL, jevResults, questions, pricing),
    llm: summarize(llmModel, llmResults, questions, pricing),
  };
}

/** Reject malformed user-supplied scenarios before spending tokens on them. */
export function validateRequest(body) {
  const { state, questions, llmModel } = body ?? {};
  if (state == null || (typeof state === 'string' && !state.trim())) return 'state is required';
  if (JSON.stringify(state).length > 8000) return 'state is too long (8k chars max)';
  if (!questions || typeof questions !== 'object') return 'questions must be an object';
  const entries = Object.entries(questions);
  if (entries.length === 0 || entries.length > 8) return 'provide 1-8 questions';
  for (const [id, q] of entries) {
    if (!/^[a-z][a-z0-9_]{0,40}$/i.test(id)) return `bad question id "${id}"`;
    if (!q || typeof q.instructions !== 'string') return `"${id}" needs instructions`;
    if (q.type === 'choice' && (!q.criteria || typeof q.criteria !== 'object')) {
      return `"${id}" choice needs criteria object`;
    }
    if (q.type === 'score' && !Array.isArray(q.criteria)) return `"${id}" score needs criteria array`;
    if (!['noul', 'choice', 'score'].includes(q.type)) return `"${id}" has unknown type`;
  }
  if (!LLM_MODELS.includes(llmModel)) return `llmModel must be one of ${LLM_MODELS.join(', ')}`;
  return null;
}
