import { createUi } from "./ui";
import { judgeAndSpawn } from "./spawn";
import { PhysicsWorld } from "./world";
import "./styles.css";

const canvas = document.createElement("canvas");
canvas.id = "world-canvas";
canvas.setAttribute("aria-label", "Semantic Physics sandbox");
const world = new PhysicsWorld(canvas);
const ui = createUi(async (noun) => {
  try {
    const result = await judgeAndSpawn(world, noun);
    ui.showSpawn({ noun, response: result.response, latencyMs: result.latencyMs, cost: result.cost });
    updateShareUrl(noun);
  } catch (error) {
    ui.showError(error instanceof Error ? error.message : "Could not spawn object");
  }
});
const canvasTarget = document.querySelector(".stage-wrap");
if (canvasTarget) canvasTarget.querySelector(".canvas-slot")?.append(canvas);
world.start();
setInterval(() => ui.setObjectCount(world.objects.size), 500);

function updateShareUrl(noun: string) {
  const params = new URLSearchParams(location.search);
  const current = params.get("scene")?.split(",").filter(Boolean) || [];
  if (!current.includes(noun.toLowerCase())) current.push(noun.toLowerCase());
  params.set("scene", current.join(","));
  history.replaceState({}, "", `${location.pathname}?${params.toString()}`);
}

const scene = new URLSearchParams(location.search).get("scene");
if (scene) {
  for (const noun of scene.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 10)) {
    void (async () => {
      try {
        const result = await judgeAndSpawn(world, noun);
        ui.showSpawn({ noun, response: result.response, latencyMs: result.latencyMs, cost: result.cost });
      } catch (error) {
        ui.showError(error instanceof Error ? error.message : "Could not load shared scene");
      }
    })();
  }
}
