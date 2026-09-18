import { Body, Vector } from "matter-js";
import type { PhysicsObject } from "./types";
import { probability, score, THRESHOLDS } from "./mapping";
import { ZONES, type Particle, type PhysicsWorld } from "./world";

export type BehaviorContext = {
  world: PhysicsWorld;
  dt: number;
  now: number;
};

function inside(point: Vector, zone: { x: number; y: number; width: number; height: number }) {
  return point.x >= zone.x && point.x <= zone.x + zone.width && point.y >= zone.y && point.y <= zone.y + zone.height;
}

function emitFlame(world: PhysicsWorld, object: PhysicsObject) {
  const { x, y } = object.body.position;
  const particle: Particle = {
    x: x + (Math.random() - 0.5) * 12,
    y: y + (Math.random() - 0.5) * 12,
    vx: (Math.random() - 0.5) * 0.7,
    vy: -1 - Math.random() * 1.6,
    life: 0.3 + Math.random() * 0.5,
    color: Math.random() > 0.45 ? "#ffbd4a" : "#ff6842",
  };
  world.particles.push(particle);
}

function burn(object: PhysicsObject, context: BehaviorContext) {
  if (!object.state.burning) object.state.burning = true;
  object.state.burnTime += context.dt;
  if (Math.random() < context.dt * 16) emitFlame(context.world, object);
  Body.setMass(object.body, Math.max(0.1, object.body.mass * (1 - 0.05 * context.dt)));
  if (object.state.burnTime >= THRESHOLDS.burnDuration) {
    object.color = "#777984";
    object.material = "stone";
    Body.scale(object.body, 0.55, 0.55);
    Body.setMass(object.body, 0.1);
    object.state.burning = false;
    object.state.burnTime = 0;
  }
}

function explode(object: PhysicsObject, context: BehaviorContext) {
  if (object.state.burnTime < THRESHOLDS.explosionDelay) return;
  const position = object.body.position;
  for (const neighbor of context.world.objectsNear(position, 180)) {
    if (neighbor.id === object.id) continue;
    const offset = Vector.sub(neighbor.body.position, position);
    const distance = Math.max(30, Vector.magnitude(offset));
    Body.applyForce(neighbor.body, neighbor.body.position, Vector.mult(Vector.normalise(offset), 0.02 / distance));
  }
  context.world.remove(object, true);
}

function handleWater(object: PhysicsObject, context: BehaviorContext) {
  const inWater = inside(object.body.position, ZONES.water);
  if (!inWater) {
    object.state.inWaterTime = Math.max(0, object.state.inWaterTime - context.dt);
    return;
  }
  object.state.inWaterTime += context.dt;
  object.body.frictionAir = THRESHOLDS.waterDrag;
  Body.setVelocity(object.body, { x: object.body.velocity.x * 0.985, y: object.body.velocity.y * 0.985 });
  if (probability(object.answers, "floats") > THRESHOLDS.float) {
    Body.applyForce(object.body, object.body.position, { x: 0, y: -object.body.mass * context.world.engine.gravity.y * 0.0016 });
  }
  if (probability(object.answers, "dissolves") > THRESHOLDS.dissolves && object.state.inWaterTime >= THRESHOLDS.dissolveDuration) {
    context.world.remove(object, true);
  }
}

function handleHeat(object: PhysicsObject, context: BehaviorContext) {
  if (!inside(object.body.position, ZONES.heat)) {
    object.state.inHeatTime = Math.max(0, object.state.inHeatTime - context.dt);
    return;
  }
  object.state.inHeatTime += context.dt;
  if (probability(object.answers, "melts") > THRESHOLDS.melts && object.state.inHeatTime >= THRESHOLDS.meltDuration && !object.state.melted) {
    object.state.melted = true;
    object.color = "#91a6b8";
    object.body.restitution = 0;
    object.body.friction = 0.01;
    Body.scale(object.body, 0.85, 0.7);
  }
}

function handleMagnetism(object: PhysicsObject) {
  if (probability(object.answers, "magnetic") <= THRESHOLDS.magnetic) return;
  const magnet = { x: ZONES.magnet.x, y: ZONES.magnet.y + ZONES.magnet.height / 2 };
  const offset = Vector.sub(magnet, object.body.position);
  const distance = Vector.magnitude(offset);
  if (distance > 300 || distance < 1) return;
  Body.applyForce(object.body, object.body.position, Vector.mult(Vector.normalise(offset), object.body.mass / (distance * distance) * 0.22));
}

function handleGas(object: PhysicsObject, context: BehaviorContext) {
  if (probability(object.answers, "gas") <= THRESHOLDS.gas) return;
  object.state.gasTime += context.dt;
  Body.applyForce(object.body, object.body.position, { x: 0, y: -0.001 * object.body.mass });
  if (object.state.gasTime >= THRESHOLDS.gasDuration) context.world.remove(object);
}

function handleAlive(object: PhysicsObject, context: BehaviorContext) {
  if (probability(object.answers, "alive") <= THRESHOLDS.alive) return;
  object.state.nextHop -= context.dt;
  if (object.state.nextHop > 0) return;
  object.state.nextHop = 0.8 + Math.random() * 1.2;
  Body.applyForce(object.body, object.body.position, { x: (Math.random() - 0.5) * 0.018, y: -0.035 * object.body.mass });
}

export function tickBehaviors(context: BehaviorContext) {
  for (const object of [...context.world.objects.values()]) {
    if (object.state.dead) continue;
    const point = object.body.position;
    if (probability(object.answers, "flammable") > THRESHOLDS.flammable && inside(point, ZONES.fire)) burn(object, context);
    if (probability(object.answers, "explosive") > THRESHOLDS.explosive && object.state.burning) explode(object, context);
    handleWater(object, context);
    handleHeat(object, context);
    handleMagnetism(object);
    handleGas(object, context);
    handleAlive(object, context);
    if (probability(object.answers, "fragile") > THRESHOLDS.fragile && object.body.speed > 4 + 3 * score(object.answers, "hardness")) {
      context.world.remove(object, true);
    }
  }
}
