# Semantic Physics

Semantic Physics is a 2D Matter.js sandbox where every noun becomes a physical
object. Type “rubber duck”, “anvil”, “candle”, or any other supported noun and
the Cloudflare Worker asks TypeSafe's Jev model a batch of typed questions. The
frontend maps the returned probabilities to mass, shape, buoyancy, material,
burning, magnetism, melting, gas rise, collisions, and other behaviors.

## Jev integration

Jev returns structured `Choice`, `Score`, and `Noul` answers instead of
generated prose. `/api/judge` sends one batched request for the object's
physical properties. `/api/interact` is called once for the first collision of
each pair and answers questions such as “would A eat B?”, “do they stick?”, and
“would A flee?”. The Worker caches successful results in KV for 30 days. When
`TYPESAFE_API_KEY` is absent, deterministic mock answers keep local development
and tests useful.

## Local development

Requirements: Node.js 22+, pnpm, and (optionally) a TypeSafe API key.

```bash
pnpm install
pnpm dev:worker       # Wrangler on http://localhost:8787
pnpm dev              # Vite on http://localhost:5173
```

Set `TYPESAFE_API_KEY` in the Wrangler environment when using live Jev. Do not
commit `.dev.vars` or API keys. The frontend proxies `/api` to Wrangler.

## Scripts

* `pnpm dev` — Vite frontend
* `pnpm dev:worker` — Cloudflare Worker locally
* `pnpm lint` — TypeScript and ESLint
* `pnpm test` — Vitest unit/Worker tests
* `pnpm build` — produce `dist/`
* `pnpm deploy` — deploy with Wrangler

## Controls

Drag bodies with the pointer. The shareable `?scene=rubber%20duck,anvil`
parameter restores a scene. The “why” panel shows raw Jev answers, score
legends, latency, estimated input-token cost, and cache/mock status.

## Screenshot

<!-- screenshot placeholder: add a capture from /semantic-physics-shots/ -->

## Deployment notes

Create a KV namespace and replace the `TODO` IDs in `wrangler.toml` before a
production deploy. The Worker serves the Vite SPA through Workers Static
Assets.
