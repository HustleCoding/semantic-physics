import { describe, expect, it } from "vitest";
import app from "../worker";

class MemoryKV {
  private values = new Map<string, string>();

  async get<T>(key: string, _format: "json") {
    const value = this.values.get(key);
    return value ? JSON.parse(value) as T : null;
  }

  async put(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("Semantic Physics worker", () => {
  it("rejects malformed object names", async () => {
    const response = await app.request("/api/judge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ object: "anvil!" }),
    });
    expect(response.status).toBe(400);
  });

  it("uses mock mode without a TypeSafe key", async () => {
    const response = await app.request("/api/judge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ object: "rubber duck" }),
    }, { TYPESAFE_API_KEY: "" });
    const body = await response.json() as { mock: boolean; answers: { floats: { noul: number } } };
    expect(response.status).toBe(200);
    expect(body.mock).toBe(true);
    expect(body.answers.floats.noul).toBeGreaterThan(0.5);
  });

  it("returns cached answers on the second request", async () => {
    const env = { JUDGE_CACHE: new MemoryKV() };
    const init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ object: "anvil" }),
    };
    const first = await app.request("/api/judge", init, env);
    const second = await app.request("/api/judge", init, env);
    const body = await second.json() as { cached: boolean };
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(body.cached).toBe(true);
  });
});
