import type { AnswerMap, PhysicsMaterial } from "./types";

// ---- Mapping (code owns all math) ----
// weight score w in [0,4]: mass = 0.1 * 6^w  (0.1 .. ~130)
// size score s in [0,4]: radius px = 10 + 12*s  (10 .. 58)
// hardness h in [0,4]: friction = 0.9 - 0.18*h ; shatter threshold speed = 6 + 3*h (only used if fragile>0.5)
// restitution = bouncy>0.5 ? 0.85 : 0.1 + 0.1*(bouncy)  ; sticky>0.6 -> restitution 0, friction 1, frictionStatic 10
// roundness r: <0.75 rod (rect 4:1), <1.75 box (rect 1:1 rounded), <2.5 irregular (hexagon w/ jitter), else circle
// floats>0.5 -> buoyancy force in water = mass*g*1.6 ; else sink (density irrelevant; water just adds drag 0.05)
// flammable>0.5 & touches fire -> burning state: emit particles, lose 5% mass/s, after 6s -> ash (tiny gray, mass 0.1)
// magnetic>0.5 -> force toward magnet ∝ mass / dist^2 within 300px
// alive>0.6 -> random impulses every 0.8-2s (hop), flees per interaction questions
// melts>0.5 & within heat lamp zone for 3s -> body becomes liquid blob (restitution 0, friction 0.01, color desaturated)
// dissolves>0.5 & in water 4s -> shrink to 0 and remove
// explosive>0.6 & burning -> after 2s burst: remove body, apply radial impulse to neighbors
// liquid>0.6 at spawn -> spawn as cluster of 8 tiny circles (blob) instead of one body
// gas>0.6 at spawn -> negative gravity, fades out over 8s
// Thresholds are constants in one file so they can be tuned.

export const THRESHOLDS = {
  float: 0.5,
  flammable: 0.5,
  magnetic: 0.5,
  fragile: 0.5,
  bouncy: 0.5,
  sticky: 0.6,
  alive: 0.6,
  melts: 0.5,
  dissolves: 0.5,
  explosive: 0.6,
  liquid: 0.6,
  gas: 0.6,
  lighterThanAir: 0.6,
  interaction: 0.68,
  waterDrag: 0.05,
  burnDuration: 6,
  meltDuration: 3,
  dissolveDuration: 4,
  explosionDelay: 2,
  gasDuration: 8,
} as const;

export type ShapeKind = "rod" | "box" | "irregular" | "circle";

const NOULS = [
  "floats",
  "flammable",
  "magnetic",
  "fragile",
  "bouncy",
  "sticky",
  "alive",
  "melts",
  "dissolves",
  "conductive",
  "explosive",
  "edible",
  "liquid",
  "gas",
  "lighter_than_air",
] as const;

export function probability(answers: AnswerMap, key: string): number {
  const answer = answers[key];
  return answer?.type === "noul" ? answer.noul : 0;
}

export function score(answers: AnswerMap, key: string): number {
  const answer = answers[key];
  return answer?.type === "score" ? answer.score : 2;
}

export function choice(answers: AnswerMap): PhysicsMaterial {
  const answer = answers.material;
  if (answer?.type !== "choice") return "plastic";
  return (answer.choice as PhysicsMaterial) || "plastic";
}

export function materialColor(material: PhysicsMaterial, seed: string): string {
  const palette: Record<PhysicsMaterial, string> = {
    metal: "#8e99a8",
    wood: "#c48a4f",
    stone: "#a8a39a",
    plastic: hashColor(seed),
    organic: "#7fb27a",
    liquid: "#6fa8d6",
    gas: "#e6e9f0",
    energy: "#f0a03c",
  };
  return palette[material];
}

function hashColor(value: string): string {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 62% 66%)`;
}

export function physicsParameters(answers: AnswerMap) {
  const w = Math.max(0, Math.min(4, score(answers, "weight")));
  const s = Math.max(0, Math.min(4, score(answers, "size")));
  const h = Math.max(0, Math.min(4, score(answers, "hardness")));
  const r = Math.max(0, Math.min(4, score(answers, "roundness")));
  const bouncy = probability(answers, "bouncy");
  const sticky = probability(answers, "sticky");
  const shape: ShapeKind = r < 0.75 ? "rod" : r < 1.75 ? "box" : r < 2.5 ? "irregular" : "circle";

  return {
    mass: 0.1 * 6 ** w,
    radius: 10 + 12 * s,
    friction: 0.9 - 0.18 * h,
    shatterSpeed: 6 + 3 * h,
    restitution: sticky > THRESHOLDS.sticky ? 0 : bouncy > THRESHOLDS.bouncy ? 0.85 : 0.1 + 0.1 * bouncy,
    frictionStatic: sticky > THRESHOLDS.sticky ? 10 : 0.5,
    shape,
    material: choice(answers),
    flags: Object.fromEntries(NOULS.map((key) => [key, probability(answers, key)])) as Record<string, number>,
  };
}
