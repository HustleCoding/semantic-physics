import {
  Bodies,
  Composite,
  Constraint,
  Engine,
  Events,
  Mouse,
  MouseConstraint,
  Runner,
  Vector,
} from "matter-js";
import type { AnswerMap, PhysicsObject } from "./types";
import { physicsParameters, materialColor, THRESHOLDS } from "./mapping";
import { tickBehaviors, type BehaviorContext } from "./behaviors";
import { InteractionController } from "./interactions";

export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 600;
export const ZONES = {
  water: { x: 0, y: 470, width: 380, height: 130 },
  fire: { x: 760, y: 540, width: 200, height: 60 },
  magnet: { x: 930, y: 200, width: 30, height: 80 },
  heat: { x: 400, y: 0, width: 160, height: 120 },
} as const;

export type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };

export class PhysicsWorld {
  readonly engine = Engine.create({ gravity: { x: 0, y: 0.9, scale: 0.001 } });
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly particles: Particle[] = [];
  readonly objects = new Map<number, PhysicsObject>();
  readonly interaction: InteractionController;
  private runner = Runner.create();
  private lastTime = performance.now();
  private animation = 0;
  private objectCounter = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = WORLD_WIDTH;
    this.canvas.height = WORLD_HEIGHT;
    this.ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.interaction = new InteractionController(this);
    this.setupArena();
    this.setupMouse();
    Events.on(this.engine, "collisionStart", (event) => {
      for (const pair of event.pairs) this.interaction.onCollision(pair.bodyA, pair.bodyB);
    });
  }

  start() {
    Runner.run(this.runner, this.engine);
    this.lastTime = performance.now();
    const loop = (time: number) => {
      const dt = Math.min(0.05, (time - this.lastTime) / 1000);
      this.lastTime = time;
      this.update(dt);
      this.draw();
      this.animation = requestAnimationFrame(loop);
    };
    this.animation = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.animation);
    Runner.stop(this.runner);
  }

  spawn(noun: string, answers: AnswerMap): PhysicsObject[] {
    const params = physicsParameters(answers);
    const material = params.material;
    const color = materialColor(material, noun);
    const id = `${Date.now()}-${this.objectCounter++}`;
    const x = 200 + Math.random() * 560;
    const y = 60;
    if (params.flags.liquid > THRESHOLDS.liquid) {
      return Array.from({ length: 8 }, (_, i) => {
        const body = Bodies.circle(x + (i % 4) * 9 - 14, y + Math.floor(i / 4) * 9, Math.max(5, params.radius / 4), {
          restitution: params.restitution,
          friction: params.friction,
          frictionStatic: params.frictionStatic,
          density: params.mass / 10000,
          label: noun,
        });
        const object = this.makeObject(`${id}-${i}`, noun, body, answers, material, color, id);
        Composite.add(this.engine.world, body);
        this.objects.set(body.id, object);
        return object;
      });
    }
    const body = this.makeBody(params.shape, x, y, params.radius, noun, params);
    Composite.add(this.engine.world, body);
    const object = this.makeObject(id, noun, body, answers, material, color);
    this.objects.set(body.id, object);
    return [object];
  }

  remove(object: PhysicsObject, burst = false) {
    if (object.state.dead) return;
    object.state.dead = true;
    if (burst) this.emitBurst(object.body.position.x, object.body.position.y, object.color, 16);
    Composite.remove(this.engine.world, object.body);
    this.objects.delete(object.body.id);
  }

  emitBurst(x: number, y: number, color: string, amount: number) {
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.5 + Math.random() * 0.8, color });
    }
  }

  objectsNear(point: Vector, radius: number) {
    return [...this.objects.values()].filter((object) => Vector.magnitude(Vector.sub(object.body.position, point)) < radius);
  }

  private makeBody(shape: ReturnType<typeof physicsParameters>["shape"], x: number, y: number, radius: number, label: string, params: ReturnType<typeof physicsParameters>) {
    const options = {
      restitution: params.restitution,
      friction: params.friction,
      frictionStatic: params.frictionStatic,
      density: params.mass / 10000,
      label,
    };
    if (shape === "rod") return Bodies.rectangle(x, y, radius * 2.6, Math.max(10, radius / 2), options);
    if (shape === "box") return Bodies.rectangle(x, y, radius * 1.65, radius * 1.65, options);
    if (shape === "irregular") return Bodies.polygon(x, y, 6, radius, options);
    return Bodies.circle(x, y, radius, options);
  }

  private makeObject(id: string, noun: string, body: Matter.Body, answers: AnswerMap, material: PhysicsObject["material"], color: string, clusterId?: string): PhysicsObject {
    const parameters = physicsParameters(answers);
    return {
      id,
      noun,
      body,
      answers,
      material,
      color,
      clusterId,
      baseMass: parameters.mass,
      state: {
        burning: false,
        burnTime: 0,
        inWaterTime: 0,
        inHeatTime: 0,
        gasTime: 0,
        melted: false,
        dead: false,
        nextHop: 0.8 + Math.random() * 1.2,
        interactionKeys: new Set(),
      },
    };
  }

  private setupArena() {
    const wallOptions = { isStatic: true, label: "wall", restitution: 0.2 };
    Composite.add(this.engine.world, [
      Bodies.rectangle(WORLD_WIDTH / 2, -10, WORLD_WIDTH, 20, wallOptions),
      Bodies.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT + 10, WORLD_WIDTH, 20, wallOptions),
      Bodies.rectangle(-10, WORLD_HEIGHT / 2, 20, WORLD_HEIGHT, wallOptions),
      Bodies.rectangle(WORLD_WIDTH + 10, WORLD_HEIGHT / 2, 20, WORLD_HEIGHT, wallOptions),
      Bodies.rectangle(945, 240, 30, 80, { ...wallOptions, label: "magnet-zone" }),
    ]);
  }

  private setupMouse() {
    const mouse = Mouse.create(this.canvas);
    const constraint = MouseConstraint.create(this.engine, {
      mouse,
      constraint: { stiffness: 0.2, render: { visible: false } },
    });
    Composite.add(this.engine.world, constraint);
    this.canvas.addEventListener("mouseleave", () => {
      mouse.button = -1;
    });
  }

  private update(dt: number) {
    const context: BehaviorContext = {
      world: this,
      dt,
      now: performance.now() / 1000,
    };
    tickBehaviors(context);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.life -= dt;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.06;
      if (particle.life <= 0) this.particles.splice(i, 1);
    }
  }

  private draw() {
    const { ctx } = this;
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    ctx.fillStyle = "#080d19";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.drawZones();
    for (const object of this.objects.values()) this.drawObject(object);
    for (const particle of this.particles) {
      ctx.globalAlpha = Math.max(0, particle.life);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawZones() {
    const { ctx } = this;
    ctx.fillStyle = "rgba(56, 163, 218, .22)";
    ctx.fillRect(ZONES.water.x, ZONES.water.y, ZONES.water.width, ZONES.water.height);
    ctx.fillStyle = "rgba(255, 99, 34, .17)";
    ctx.fillRect(ZONES.fire.x, ZONES.fire.y, ZONES.fire.width, ZONES.fire.height);
    ctx.fillStyle = "rgba(157, 104, 255, .12)";
    ctx.fillRect(ZONES.heat.x, ZONES.heat.y, ZONES.heat.width, ZONES.heat.height);
    ctx.fillStyle = "#7ac8ff";
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText("WATER", 12, 492);
    ctx.fillStyle = "#ff8f45";
    ctx.fillText("FIRE", 782, 578);
    ctx.fillStyle = "#d7bcff";
    ctx.fillText("HEAT LAMP", 425, 22);
    ctx.fillStyle = "#5e9dff";
    ctx.fillRect(ZONES.magnet.x, ZONES.magnet.y, ZONES.magnet.width, ZONES.magnet.height);
    ctx.fillStyle = "#dff0ff";
    ctx.fillText("MAGNET", 890, 195);
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  private drawObject(object: PhysicsObject) {
    const { ctx } = this;
    const vertices = object.body.vertices;
    ctx.save();
    ctx.translate(object.body.position.x, object.body.position.y);
    ctx.rotate(object.body.angle);
    ctx.beginPath();
    ctx.moveTo(vertices[0].x - object.body.position.x, vertices[0].y - object.body.position.y);
    for (const vertex of vertices.slice(1)) ctx.lineTo(vertex.x - object.body.position.x, vertex.y - object.body.position.y);
    ctx.closePath();
    ctx.fillStyle = object.state.burning ? "#ff6b35" : object.color;
    ctx.globalAlpha = object.material === "gas" ? Math.max(0.1, 1 - object.state.gasTime / THRESHOLDS.gasDuration) : object.material === "liquid" ? 0.72 : 0.94;
    ctx.shadowColor = object.material === "energy" ? "#ff8f45" : "transparent";
    ctx.shadowBlur = object.material === "energy" ? 18 : 0;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.45)";
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#e7eefc";
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(object.noun, object.body.position.x, object.body.position.y - 14);
    ctx.textAlign = "left";
  }
}

export function stick(a: PhysicsObject, b: PhysicsObject, world: PhysicsWorld) {
  Composite.add(world.engine.world, Constraint.create({
    bodyA: a.body,
    bodyB: b.body,
    length: 0,
    stiffness: 0.85,
    damping: 0.08,
  }));
}
