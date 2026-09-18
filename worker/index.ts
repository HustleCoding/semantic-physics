import { Hono } from "hono";
import { cors } from "hono/cors";
import { INTERACTION_QUESTIONS, OBJECT_QUESTIONS } from "../shared/questions";

type JsonRecord = Record<string, unknown>;
type Answer = Record<string, unknown>;
type KVNamespaceLike = {
  get<T>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

export type Env = {
  TYPESAFE_API_KEY?: string;
  JUDGE_CACHE?: KVNamespaceLike;
};

const app = new Hono<{ Bindings: Env }>();
app.use("/api/*", cors());

const NOUN_PATTERN = /^[A-Za-z0-9 '-]{1,40}$/;
const CACHE_TTL = 60 * 60 * 24 * 30;
const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";

function validNoun(value: unknown): value is string {
  return typeof value === "string" && NOUN_PATTERN.test(value.trim());
}

function normalizeNoun(value: string) {
  return value.trim().toLowerCase();
}

function processKey(env: Env) {
  if ("TYPESAFE_API_KEY" in env) return env.TYPESAFE_API_KEY;
  if (env.TYPESAFE_API_KEY) return env.TYPESAFE_API_KEY;
  if (typeof globalThis === "object" && "process" in globalThis) {
    const process = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    return process?.env?.TYPESAFE_API_KEY;
  }
  return undefined;
}

async function readCache<T>(env: Env, key: string): Promise<T | undefined> {
  if (!env.JUDGE_CACHE) return undefined;
  return (await env.JUDGE_CACHE.get<T>(key, "json")) ?? undefined;
}

async function writeCache(env: Env, key: string, value: unknown) {
  if (!env.JUDGE_CACHE) return;
  await env.JUDGE_CACHE.put(key, JSON.stringify(value), { expirationTtl: CACHE_TTL });
}

function hash(value: string) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function randomFrom(seed: number, offset: number) {
  const value = Math.sin(seed * 0.0001 + offset * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function mockAnswers(object: string): JsonRecord {
  const lower = object.toLowerCase();
  const seed = hash(lower);
  const floats = /\b(duck|balloon|boat|leaf|feather|bubble|cork|paper)\b/.test(lower) ? 0.97 : /\b(anvil|rock|stone|brick|car|iron)\b/.test(lower) ? 0.03 : randomFrom(seed, 1);
  const magnetic = /\b(magnet|iron|steel|anvil)\b/.test(lower) ? 0.95 : randomFrom(seed, 2) * 0.55;
  const flammable = /\b(candle|paper|wood|match|bomb|gasoline|coal)\b/.test(lower) ? 0.88 : randomFrom(seed, 3) * 0.45;
  const alive = /\b(cat|dog|mouse|person|bird|fish|human|animal)\b/.test(lower) ? 0.95 : randomFrom(seed, 4) * 0.35;
  const liquid = /\b(water|oil|milk|juice|honey|gel|soup)\b/.test(lower) ? 0.93 : 0.04;
  const gas = /\b(air|smoke|steam|gas|helium|oxygen)\b/.test(lower) ? 0.95 : 0.02;
  const edible = /\b(sugar|food|apple|bread|cake|candy|milk|water)\b/.test(lower) ? 0.9 : 0.1;
  const explosive = /\b(bomb|firework|grenade|dynamite)\b/.test(lower) ? 0.95 : 0.02;
  const sticky = /\b(glue|honey|gum|jelly|tape|syrup)\b/.test(lower) ? 0.93 : 0.06;
  const melts = /\b(ice|candle|wax|chocolate|plastic|butter)\b/.test(lower) ? 0.86 : 0.12;
  const dissolves = /\b(sugar|salt|ice|paper|soap)\b/.test(lower) ? 0.82 : 0.08;
  const bouncy = /\b(ball|rubber|duck|balloon|jelly)\b/.test(lower) ? 0.92 : 0.08;
  const score = (value: number, confidence = 0.78): Answer => ({
    type: "score",
    score: Math.max(0, Math.min(4, value)),
    confidence,
    legend: {
      "0": "very low",
      "1": "low",
      "2": "medium",
      "3": "high",
      "4": "very high",
    },
    probabilities: { "0": value < 0.5 ? 0.8 : 0.05, "1": 0.1, "2": 0.1, "3": value > 2 ? 0.2 : 0, "4": value > 3 ? 0.65 : 0 },
  });
  const weight = /\b(anvil|boulder|car|elephant|piano|fridge)\b/.test(lower) ? 4 : /\b(duck|cat|book|bottle|candle)\b/.test(lower) ? 1 : Math.round(randomFrom(seed, 11) * 3);
  const size = /\b(car|tree|elephant|sofa|fridge)\b/.test(lower) ? 3 : /\b(duck|cat|candle|sugar|magnet)\b/.test(lower) ? 1 : Math.round(randomFrom(seed, 12) * 3);
  const hardness = /\b(anvil|metal|stone|rock|brick|glass)\b/.test(lower) ? 4 : /\b(ice|candle|jelly|rubber)\b/.test(lower) ? 1 : 2;
  const roundness = /\b(rod|pencil|stick|candle|snake)\b/.test(lower) ? 0.4 : /\b(ball|orange|bubble|duck)\b/.test(lower) ? 3 : 1.2;
  const material = /\b(anvil|magnet|metal|iron|steel)\b/.test(lower) ? "metal" : /\b(wood|paper|book|cork)\b/.test(lower) ? "wood" : /\b(stone|rock|brick|glass|ice)\b/.test(lower) ? "stone" : liquid > 0.6 ? "liquid" : gas > 0.6 ? "gas" : alive > 0.6 || edible > 0.6 ? "organic" : /\b(fire|light|electricity|bomb)\b/.test(lower) ? "energy" : "plastic";
  return {
    floats: { type: "noul", noul: floats },
    flammable: { type: "noul", noul: flammable },
    magnetic: { type: "noul", noul: magnetic },
    fragile: { type: "noul", noul: randomFrom(seed, 5) * 0.8 },
    bouncy: { type: "noul", noul: bouncy },
    sticky: { type: "noul", noul: sticky },
    alive: { type: "noul", noul: alive },
    melts: { type: "noul", noul: melts },
    dissolves: { type: "noul", noul: dissolves },
    conductive: { type: "noul", noul: material === "metal" ? 0.9 : 0.1 },
    explosive: { type: "noul", noul: explosive },
    edible: { type: "noul", noul: edible },
    liquid: { type: "noul", noul: liquid },
    gas: { type: "noul", noul: gas },
    weight: score(weight),
    size: score(size),
    hardness: score(hardness),
    roundness: score(roundness),
    material: { type: "choice", choice: material, confidence: 0.83, probabilities: { [material]: 0.83 } },
  };
}

function mockInteraction(a: string, b: string): JsonRecord {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  const animal = (value: string) => /\b(cat|dog|mouse|bird|fish|animal)\b/.test(value);
  return {
    a_eats_b: { type: "noul", noul: animal(left) && /\b(mouse|fish|bird)\b/.test(right) ? 0.9 : 0.03 },
    b_eats_a: { type: "noul", noul: animal(right) && /\b(mouse|fish|bird)\b/.test(left) ? 0.9 : 0.03 },
    a_dissolves_b: { type: "noul", noul: /\b(water|acid)\b/.test(left) && /\b(sugar|ice|paper)\b/.test(right) ? 0.9 : 0.02 },
    b_dissolves_a: { type: "noul", noul: /\b(water|acid)\b/.test(right) && /\b(sugar|ice|paper)\b/.test(left) ? 0.9 : 0.02 },
    stick_together: { type: "noul", noul: /\b(glue|tape|honey|gum)\b/.test(left + right) ? 0.9 : 0.04 },
    ignite: { type: "noul", noul: /\b(fire|flame|candle|match)\b/.test(left + right) ? 0.85 : 0.03 },
    a_scared_of_b: { type: "noul", noul: animal(left) && !animal(right) ? 0.22 : 0.04 },
    b_scared_of_a: { type: "noul", noul: animal(right) && !animal(left) ? 0.22 : 0.04 },
  };
}

function swapInteractionAnswers(answers: JsonRecord) {
  const output: JsonRecord = {};
  for (const [key, value] of Object.entries(answers)) {
    const swapped = key
      .replace(/^a_/, "__A__")
      .replace(/^b_/, "__B__")
      .replace(/__A__/, "b_")
      .replace(/__B__/, "a_");
    output[swapped] = value;
  }
  return output;
}

async function upstream(env: Env, state: JsonRecord, questions: unknown) {
  const key = processKey(env);
  if (!key) return { answers: state.object ? mockAnswers(String(state.object)) : mockInteraction(String(state.a), String(state.b)), usage: { input_tokens: 0, output_tokens: 0 }, model: "jev-mock", mock: true };
  const response = await fetch(TYPESAFE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ state, model: "jev-latest", questions }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message.slice(0, 400) || `TypeSafe upstream returned ${response.status}`);
  }
  return await response.json() as { answers: JsonRecord; usage?: JsonRecord; model?: string };
}

function errorMessage(error: unknown, env: Env) {
  const message = error instanceof Error ? error.message : "TypeSafe request failed";
  const key = processKey(env);
  return key ? message.replaceAll(key, "[redacted]") : message;
}

async function body(c: { req: { json: <T>() => Promise<T> } }) {
  try {
    return await c.req.json<JsonRecord>();
  } catch {
    return undefined;
  }
}

app.post("/api/judge", async (c) => {
  const input = await body(c);
  if (!input || !validNoun(input.object)) return c.json({ error: "object must be 1–40 characters: letters, digits, spaces, hyphens, or apostrophes" }, 400);
  const object = input.object.trim();
  const noun = normalizeNoun(object);
  const key = `judge:v1:${noun}`;
  const started = Date.now();
  const cached = await readCache<{ answers: JsonRecord; usage?: JsonRecord; model?: string; mock?: boolean }>(c.env, key);
  if (cached) return c.json({ object, ...cached, latencyMs: Date.now() - started, cached: true });
  try {
    const result = await upstream(c.env, { object }, OBJECT_QUESTIONS);
    const stored = { answers: result.answers, usage: result.usage, model: result.model, ...(result as { mock?: boolean }).mock ? { mock: true } : {} };
    await writeCache(c.env, key, stored);
    return c.json({ object, ...stored, latencyMs: Date.now() - started, cached: false });
  } catch (error) {
    return c.json({ error: errorMessage(error, c.env) }, 502);
  }
});

app.post("/api/interact", async (c) => {
  const input = await body(c);
  if (!input || !validNoun(input.a) || !validNoun(input.b)) return c.json({ error: "a and b must each be 1–40 characters: letters, digits, spaces, hyphens, or apostrophes" }, 400);
  const a = input.a.trim();
  const b = input.b.trim();
  const [sortedA, sortedB] = [a, b].sort((left, right) => left.localeCompare(right));
  const key = `interact:v1:${normalizeNoun(sortedA)}|${normalizeNoun(sortedB)}`;
  const started = Date.now();
  const cached = await readCache<{ a: string; b: string; answers: JsonRecord; usage?: JsonRecord; model?: string; mock?: boolean }>(c.env, key);
  const stored = cached ?? await (async () => {
    try {
      const result = await upstream(c.env, { a: sortedA, b: sortedB }, INTERACTION_QUESTIONS);
      const value = { a: sortedA, b: sortedB, answers: result.answers, usage: result.usage, model: result.model, ...(result as { mock?: boolean }).mock ? { mock: true } : {} };
      await writeCache(c.env, key, value);
      return value;
    } catch (error) {
      throw error;
    }
  })().catch((error) => ({ error: errorMessage(error, c.env) }));
  if ("error" in stored) return c.json({ error: stored.error }, 502);
  const reversed = a.toLowerCase() !== sortedA.toLowerCase();
  return c.json({ a, b, answers: reversed ? swapInteractionAnswers(stored.answers) : stored.answers, usage: stored.usage, model: stored.model, mock: stored.mock, latencyMs: Date.now() - started, cached: Boolean(cached) });
});

export default app;
export { app };
