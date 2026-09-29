# Jev vs LLM

**Live demo: https://jev-vs-llm.vercel.app**

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

## Try it yourself

You need Node 20+ and a Vercel AI Gateway key. There's nothing to `npm install`.

1. **Get a key.** Sign in at [vercel.com](https://vercel.com), open **AI Gateway → API Keys**, and
   create one (it starts with `vck_`). Vercel includes some free credits, and one key covers both Jev
   and every LLM in the dropdown. A 5-run comparison costs well under a cent.
2. **Clone and add the key:**
   ```bash
   git clone https://github.com/venkateswarisudalai/jev-vs-llm.git
   cd jev-vs-llm
   cp .env.example .env
   # open .env and paste your key after AI_GATEWAY_API_KEY=
   ```
3. **Run it:**
   ```bash
   npm run dev                 # open http://localhost:3000
   ```
4. **Play:** pick a scenario, pick an LLM, choose 5 runs, and click **Run both**. Then change the
   input text, or open **Questions** and write your own. Each question is one of:
   ```json
   {
     "urgent":     { "type": "noul",   "instructions": "Does this need a reply today?" },
     "team":       { "type": "choice", "instructions": "Who handles it?",
                     "criteria": { "billing": "Charges and refunds", "tech": "Bugs and outages" } },
     "anger":      { "type": "score",  "instructions": "How upset is the customer?",
                     "criteria": ["Calm", "Annoyed", "Furious"] }
   }
   ```
   `noul` is a yes/no probability, `choice` picks one key, and `score` rates on an ordered scale.

No clone? On the hosted demo, open **Use your own AI Gateway key**, paste your key, and it runs on
your credits instead of the shared key. The key stays in that browser tab and the server only
forwards it to Vercel.

Run the tests with `npm test`.

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
