import { Body } from "matter-js";
import type { AnswerMap, InteractionResponse, PhysicsObject } from "./types";
import { probability, THRESHOLDS } from "./mapping";
import { stick, type PhysicsWorld } from "./world";

type InteractionPayload = { a: string; b: string; answers: AnswerMap };

export class InteractionController {
  private readonly cache = new Map<string, InteractionPayload>();
  private readonly pending = new Map<string, Promise<InteractionPayload>>();
  private readonly seen = new Set<string>();

  constructor(private readonly world: PhysicsWorld) {}

  onCollision(bodyA: Matter.Body, bodyB: Matter.Body) {
    const a = this.world.objects.get(bodyA.id);
    const b = this.world.objects.get(bodyB.id);
    if (!a || !b || a.state.dead || b.state.dead || a.clusterId === b.clusterId) return;
    const key = [a.id, b.id].sort().join("|");
    if (this.seen.has(key)) return;
    this.seen.add(key);
    void this.fetch(a.noun, b.noun).then((result) => this.apply(a, b, result.answers));
  }

  private async fetch(a: string, b: string): Promise<InteractionPayload> {
    const key = [a, b].sort().join("|");
    const cached = this.cache.get(key);
    if (cached) return cached;
    const active = this.pending.get(key);
    if (active) return active;
    const request = fetch("/api/interact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a, b }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Interaction failed (${response.status})`);
        return (await response.json()) as InteractionResponse;
      })
      .then((response) => {
        const payload = { a, b, answers: response.answers };
        this.cache.set(key, payload);
        return payload;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }

  private apply(a: PhysicsObject, b: PhysicsObject, answers: AnswerMap) {
    if (a.state.dead || b.state.dead) return;
    if (probability(answers, "a_eats_b") > THRESHOLDS.interaction) {
      this.world.remove(b, true);
      return;
    }
    if (probability(answers, "b_eats_a") > THRESHOLDS.interaction) {
      this.world.remove(a, true);
      return;
    }
    if (probability(answers, "a_dissolves_b") > THRESHOLDS.interaction) {
      this.world.remove(b, true);
    } else if (probability(answers, "b_dissolves_a") > THRESHOLDS.interaction) {
      this.world.remove(a, true);
    }
    if (probability(answers, "stick_together") > THRESHOLDS.interaction) stick(a, b, this.world);
    if (probability(answers, "ignite") > THRESHOLDS.interaction) {
      if (probability(a.answers, "flammable") > THRESHOLDS.flammable) a.state.burning = true;
      if (probability(b.answers, "flammable") > THRESHOLDS.flammable) b.state.burning = true;
    }
    this.flee(a, b, probability(answers, "a_scared_of_b"));
    this.flee(b, a, probability(answers, "b_scared_of_a"));
  }

  private flee(fleeing: PhysicsObject, threat: PhysicsObject, chance: number) {
    if (chance <= THRESHOLDS.interaction) return;
    const away = {
      x: fleeing.body.position.x - threat.body.position.x,
      y: fleeing.body.position.y - threat.body.position.y,
    };
    const length = Math.max(1, Math.hypot(away.x, away.y));
    Body.applyForce(fleeing.body, fleeing.body.position, {
      x: away.x / length * 0.045 * fleeing.body.mass,
      y: away.y / length * 0.045 * fleeing.body.mass - 0.012 * fleeing.body.mass,
    });
  }
}
