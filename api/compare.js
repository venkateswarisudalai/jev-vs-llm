import { compare, validateRequest } from '../lib/compare.js';

// Best-effort per-instance rate limit so a public demo key isn't drained.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = Number(process.env.RATE_LIMIT ?? 20);
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_REQUESTS;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function POST(request) {
  const apiKey = process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey) return json({ error: 'server is missing AI_GATEWAY_API_KEY' }, 500);

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  if (rateLimited(ip)) return json({ error: 'rate limit hit, try again in a few minutes' }, 429);

  const body = await request.json().catch(() => null);
  const problem = validateRequest(body);
  if (problem) return json({ error: problem }, 400);

  try {
    return json(await compare({ ...body, apiKey }));
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}
