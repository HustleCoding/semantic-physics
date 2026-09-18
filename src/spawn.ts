import type { AnswerMap, JudgeResponse, PhysicsObject } from "./types";
import type { PhysicsWorld } from "./world";

export type SpawnResult = {
  response: JudgeResponse;
  objects: PhysicsObject[];
  latencyMs: number;
  cost: number;
};

export async function judgeAndSpawn(world: PhysicsWorld, noun: string): Promise<SpawnResult> {
  const started = performance.now();
  const response = await fetch("/api/judge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ object: noun }),
  });
  const payload = (await response.json()) as JudgeResponse & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Could not judge ${noun}`);
  const latencyMs = Math.round(performance.now() - started);
  const inputTokens = payload.usage?.input_tokens ?? 0;
  const cost = inputTokens * 0.042 / 1_000_000;
  const objects = world.spawn(noun.trim(), payload.answers as AnswerMap);
  return { response: payload, objects, latencyMs, cost };
}
