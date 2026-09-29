# Jev vs LLM

A small side-by-side demo. Send the same input and typed questions to
[Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) (TypeSafe AI's System One
decision model) and to a general-purpose LLM. Then compare what production code cares about:

| | Jev | LLM |
|---|---|---|
| Output | Typed answers (`choice`, `score`, `noul`) with probabilities | Text you ask to be JSON and then parse |
| Schema errors | Not possible, answers are constrained to your criteria | Counted per run: bad JSON, code fences, invented labels, missing keys |
| Consistency | Measured across N runs | Measured across N runs |
| Latency / cost | Median wall-clock, gateway-reported cost | Same |

Three built-in scenarios: support-ticket triage, AI-agent tool-call approval, and product-review
moderation. You can edit the input and the question JSON to try your own.

## How it works

Both models go through [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) with one key:

- Jev: `POST https://ai-gateway.vercel.sh/typesafe/v1/systemone` with `{ model, state, questions }`
- LLM: `POST https://ai-gateway.vercel.sh/v1/chat/completions` with a prompt built from the same
  questions (`lib/compare.js` → `buildLlmPrompt`), then validated against the allowed values

No dependencies and no build step. `index.html` is the whole UI; `api/compare.js` is the one
serverless function.

## Run locally

```bash
cp .env.example .env        # add your AI_GATEWAY_API_KEY
npm run dev                 # http://localhost:3000
npm test
```

## Deploy

```bash
vercel                      # then add AI_GATEWAY_API_KEY in project settings
```

On Vercel you can skip the key entirely: the function falls back to the project's
`VERCEL_OIDC_TOKEN`. `RATE_LIMIT` (default 20 requests per IP per 10 minutes) keeps a public demo
from draining credits. It's per instance, so treat it as a speed bump, not a guarantee.

## Caveats

- One prompt, default sampling settings. A tuned prompt, structured outputs, or temperature 0 will
  narrow the gap on schema errors. It won't give you calibrated probabilities.
- Latency includes network time from wherever the function runs.

## License

Apache-2.0
