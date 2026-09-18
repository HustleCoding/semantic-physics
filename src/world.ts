import {
  Bodies,
  Body,
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
import { physicsParameters, materialColor, probability, THRESHOLDS } from "./mapping";
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
  private mouseConstraint?: MouseConstraint;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = WORLD_WIDTH;
    this.canvas.height = WORLD_HEIGHT;
    this.ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.interaction = new InteractionController(this);
    this.setupArena();
    this.setupMouse();
    Events.on(this.engine, "collisionStart", (event) => {
      for (const pair of event.pairs) {
        this.interaction.onCollision(pair.bodyA, pair.bodyB);
        this.checkShatter(pair.bodyA, pair.bodyB);
        this.checkShatter(pair.bodyB, pair.bodyA);
      }
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
        burned: false,
        burnTime: 0,
        inWaterTime: 0,
        inHeatTime: 0,
        gasTime: 0,
        melted: false,
        dead: false,
        spawnedAt: performance.now() / 1000,
        nextHop: 0.8 + Math.random() * 1.2,
        interactionKeys: new Set(),
      },
    };
  }

  private setupArena() {
    const wallOptions = { isStatic: true, label: "wall", restitution: 0.2 };
    Composite.add(this.engine.world, [
      Bodies.rectangle(WORLD_WIDTH / 2, -100, WORLD_WIDTH, 200, wallOptions),
      Bodies.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT + 100, WORLD_WIDTH, 200, wallOptions),
      Bodies.rectangle(-100, WORLD_HEIGHT / 2, 200, WORLD_HEIGHT, wallOptions),
      Bodies.rectangle(WORLD_WIDTH + 100, WORLD_HEIGHT / 2, 200, WORLD_HEIGHT, wallOptions),
      Bodies.rectangle(945, 240, 30, 80, { ...wallOptions, label: "magnet-zone" }),
    ]);
  }

  private setupMouse() {
    const mouse = Mouse.create(this.canvas);
    const constraint = MouseConstraint.create(this.engine, {
      mouse,
      constraint: { stiffness: 0.2, render: { visible: false } },
    });
    this.mouseConstraint = constraint;
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
    for (const object of this.objects.values()) {
      const { x, y } = object.body.position;
      if (x < 0 || x > WORLD_WIDTH || y < 0 || y > WORLD_HEIGHT) {
        Body.setPosition(object.body, {
          x: Math.max(0, Math.min(WORLD_WIDTH, x)),
          y: Math.max(0, Math.min(WORLD_HEIGHT, y)),
        });
        Body.setVelocity(object.body, { x: 0, y: 0 });
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.life -= dt;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.06;
      if (particle.life <= 0) this.particles.splice(i, 1);
    }
  }

  private checkShatter(body: Matter.Body, otherBody: Matter.Body) {
    const object = this.objects.get(body.id);
    if (!object || object.state.dead || probability(object.answers, "fragile") <= THRESHOLDS.fragile) return;
    if (this.mouseConstraint?.body === body) return;
    if (performance.now() / 1000 - object.state.spawnedAt <= 1.5) return;
    const relativeSpeed = Vector.magnitude(Vector.sub(body.velocity, otherBody.velocity));
    if (relativeSpeed > physicsParameters(object.answers).shatterSpeed) this.remove(object, true);
  }

  private draw() {
    const { ctx } = this;
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    ctx.fillStyle = "#f8f4ec";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    ctx.strokeStyle = "rgba(28,26,23,.06)";
    ctx.lineWidth = 1;
    for (let x = 40; x < WORLD_WIDTH; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD_HEIGHT);
      ctx.stroke();
    }
    for (let y = 40; y < WORLD_HEIGHT; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_WIDTH, y);
      ctx.stroke();
    }
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
    const t = performance.now() / 1000;
    const label = (text: string, x: number, y: number, color: string, align: CanvasTextAlign = "left") => {
      ctx.fillStyle = color;
      ctx.font = "500 10px 'JetBrains Mono', ui-monospace, monospace";
      ctx.textAlign = align;
      ctx.fillText(text.toUpperCase().split("").join("\u200a"), x, y);
      ctx.textAlign = "left";
    };

    // water: gradient body + animated surface
    const w = ZONES.water;
    const waterGradient = ctx.createLinearGradient(0, w.y, 0, w.y + w.height);
    waterGradient.addColorStop(0, "rgba(61,123,184,.30)");
    waterGradient.addColorStop(1, "rgba(61,123,184,.55)");
    ctx.fillStyle = waterGradient;
    ctx.beginPath();
    ctx.moveTo(w.x, w.y + w.height);
    for (let x = w.x; x <= w.x + w.width; x += 6) {
      ctx.lineTo(x, w.y + Math.sin(x / 28 + t * 2.2) * 2.5 + Math.sin(x / 11 - t * 3) * 1.2);
    }
    ctx.lineTo(w.x + w.width, w.y + w.height);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#3d7bb8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = w.x; x <= w.x + w.width; x += 6) {
      const y = w.y + Math.sin(x / 28 + t * 2.2) * 2.5 + Math.sin(x / 11 - t * 3) * 1.2;
      if (x === w.x) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    label("water", w.x + 12, w.y + 22, "#2d5f92");

    // fire: bed of embers + flickering flames
    const f = ZONES.fire;
    ctx.fillStyle = "#1c1a17";
    ctx.fillRect(f.x, f.y + f.height - 8, f.width, 8);
    for (let i = 0; i < 14; i++) {
      const fx = f.x + 8 + (i / 13) * (f.width - 16);
      const flicker = Math.sin(t * 7 + i * 1.7) * 0.5 + 0.5;
      const h = 24 + flicker * 26 + (i % 3) * 6;
      const half = 7 + (i % 2) * 3;
      const grad = ctx.createLinearGradient(0, f.y + f.height - 8, 0, f.y + f.height - 8 - h);
      grad.addColorStop(0, "rgba(217,84,43,.95)");
      grad.addColorStop(0.6, "rgba(240,160,60,.85)");
      grad.addColorStop(1, "rgba(255,220,120,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(fx - half, f.y + f.height - 8);
      ctx.quadraticCurveTo(fx - half * 0.4, f.y + f.height - 8 - h * 0.6, fx + Math.sin(t * 5 + i) * 3, f.y + f.height - 8 - h);
      ctx.quadraticCurveTo(fx + half * 0.4, f.y + f.height - 8 - h * 0.6, fx + half, f.y + f.height - 8);
      ctx.closePath();
      ctx.fill();
    }
    label("fire", f.x + f.width / 2, f.y + f.height - 14, "#f8f4ec", "center");

    // heat lamp: fixture + warm cone
    const h = ZONES.heat;
    const cx = h.x + h.width / 2;
    const cone = ctx.createLinearGradient(0, 0, 0, h.height);
    cone.addColorStop(0, "rgba(200,120,58,.35)");
    cone.addColorStop(1, "rgba(200,120,58,0)");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(cx - 22, 10);
    ctx.lineTo(cx + 22, 10);
    ctx.lineTo(h.x + h.width, h.height);
    ctx.lineTo(h.x, h.height);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1c1a17";
    ctx.fillRect(cx - 1.5, 0, 3, 8);
    ctx.beginPath();
    ctx.moveTo(cx - 24, 8);
    ctx.lineTo(cx + 24, 8);
    ctx.lineTo(cx + 16, 16);
    ctx.lineTo(cx - 16, 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255,205,120,${0.75 + Math.sin(t * 3) * 0.15})`;
    ctx.beginPath();
    ctx.arc(cx, 17, 5, 0, Math.PI * 2);
    ctx.fill();
    label("heat lamp", cx, h.height + 14, "#a15f2b", "center");

    // magnet: red/blue bar with ink outline
    const m = ZONES.magnet;
    ctx.fillStyle = "#d9542b";
    ctx.fillRect(m.x, m.y, m.width, m.height / 2);
    ctx.fillStyle = "#3d7bb8";
    ctx.fillRect(m.x, m.y + m.height / 2, m.width, m.height / 2);
    ctx.strokeStyle = "#1c1a17";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(m.x + 0.75, m.y + 0.75, m.width - 1.5, m.height - 1.5);
    ctx.fillStyle = "#f8f4ec";
    ctx.font = "700 12px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("N", m.x + m.width / 2, m.y + 25);
    ctx.fillText("S", m.x + m.width / 2, m.y + m.height - 15);
    ctx.textAlign = "left";
    ctx.strokeStyle = "rgba(28,26,23,.25)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(m.x + m.width / 2, m.y + m.height / 2, m.height / 2 + i * 12 + Math.sin(t * 2 + i) * 1.5, Math.PI * 0.6, Math.PI * 1.4);
      ctx.stroke();
    }
    label("magnet", m.x - 8, m.y + m.height / 2 + 4, "#4a453d", "right");

    // floor line
    ctx.strokeStyle = "#1c1a17";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, WORLD_HEIGHT - 0.75);
    ctx.lineTo(WORLD_WIDTH, WORLD_HEIGHT - 0.75);
    ctx.stroke();
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
    ctx.fillStyle = object.state.burning ? "#d9542b" : object.color;
    ctx.globalAlpha = object.material === "gas" ? Math.max(0.1, 1 - object.state.gasTime / THRESHOLDS.gasDuration) : object.material === "liquid" ? 0.7 : 1;
    ctx.shadowColor = object.state.burning || object.material === "energy" ? "rgba(217,84,43,.8)" : "rgba(28,26,23,.18)";
    ctx.shadowBlur = object.state.burning || object.material === "energy" ? 22 : 8;
    ctx.shadowOffsetY = object.state.burning ? 0 : 3;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.lineWidth = 1.75;
    ctx.strokeStyle = object.material === "gas" ? "rgba(28,26,23,.35)" : "#1c1a17";
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
    const radius = Math.max(...vertices.map((v) => Math.hypot(v.x - object.body.position.x, v.y - object.body.position.y)));
    ctx.fillStyle = "#1c1a17";
    ctx.font = "italic 13px 'Instrument Serif', Georgia, serif";
    ctx.textAlign = "center";
    const below = object.body.position.y + radius + 14;
    ctx.fillText(object.noun, object.body.position.x, below > WORLD_HEIGHT - 6 ? object.body.position.y - radius - 6 : below);
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
