import { describe, expect, it } from "vitest";
import { physicsParameters } from "../src/mapping";
import type { AnswerMap } from "../src/types";

function answers(overrides: Partial<AnswerMap> = {}): AnswerMap {
  return {
    floats: { type: "noul", noul: 0 },
    bouncy: { type: "noul", noul: 0 },
    sticky: { type: "noul", noul: 0 },
    weight: { type: "score", score: 1 },
    size: { type: "score", score: 1 },
    hardness: { type: "score", score: 2 },
    roundness: { type: "score", score: 2 },
    material: { type: "choice", choice: "plastic", probabilities: { plastic: 1 } },
    ...overrides,
  };
}

describe("physics mapping", () => {
  it("maps a heavy anvil to big mass and no float", () => {
    const params = physicsParameters(answers({
      floats: { type: "noul", noul: 0.01 },
      weight: { type: "score", score: 4 },
      material: { type: "choice", choice: "metal" },
    }));
    expect(params.mass).toBeGreaterThan(100);
    expect(params.flags.floats).toBeLessThan(0.5);
  });

  it("maps a duck to float and low mass", () => {
    const params = physicsParameters(answers({
      floats: { type: "noul", noul: 0.97 },
      weight: { type: "score", score: 1 },
      material: { type: "choice", choice: "organic" },
    }));
    expect(params.flags.floats).toBeGreaterThan(0.5);
    expect(params.mass).toBeLessThan(1);
  });

  it("maps a rod-like shape to a 4:1 rod kind", () => {
    const params = physicsParameters(answers({ roundness: { type: "score", score: 0.4 } }));
    expect(params.shape).toBe("rod");
  });

  it("lets sticky override restitution", () => {
    const params = physicsParameters(answers({
      bouncy: { type: "noul", noul: 0.99 },
      sticky: { type: "noul", noul: 0.8 },
    }));
    expect(params.restitution).toBe(0);
    expect(params.frictionStatic).toBe(10);
  });
});
