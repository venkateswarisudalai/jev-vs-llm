# Jev vs LLM

**Live demo: https://jev-vs-llm.vercel.app**

Two kinds of AI, each shown doing the job it's best at:

- **Jev is a sorter.** Give it a message and some boxes (happy / sad / angry) and it picks the
  right box fast, with a "how sure" percentage for every box.
  [Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) is TypeSafe AI's
  System One decision model.
- **An LLM is a writer.** Ask for a poem or a bedtime story and it writes new words. Jev can't
  do that.

The sorting demo sends the same message to both, so you can compare their answers and speed.

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
4. **Play:** type any message into the sorting box, or anything you want written into the
   writing box. To sort into different boxes, edit `lib/examples.js`. Each question is one of:
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
