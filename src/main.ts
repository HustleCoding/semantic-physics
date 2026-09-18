import { createUi } from "./ui";
import { judgeAndSpawn } from "./spawn";
import { PhysicsWorld } from "./world";

const style = document.createElement("style");
style.textContent = `
  :root { color: #e7eefc; background: #080d19; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; min-width: 1100px; background: radial-gradient(circle at 50% -10%, #18294d 0, #080d19 52%); }
  button, input { font: inherit; }
  .shell { width: min(1420px, calc(100vw - 56px)); margin: 0 auto; padding: 38px 0 24px; }
  .hero { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: 28px; }
  .eyebrow { color:#70a7ff; font: 600 11px ui-monospace, monospace; letter-spacing:.16em; margin-bottom: 10px; }
  h1 { font-size: clamp(38px, 5vw, 68px); line-height:.98; letter-spacing:-.065em; margin:0; font-weight:800; }
  h1 span { color:#7c9cff; }
  .hero p { color:#90a0bd; margin:14px 0 0; font-size:15px; }
  .live-pill { color:#89e0b7; border:1px solid #245640; background:#11291f; padding:8px 11px; border-radius:999px; font:600 10px ui-monospace, monospace; letter-spacing:.1em; }
  .live-pill i { display:inline-block; width:7px; height:7px; background:#62e69d; border-radius:50%; margin-right:7px; box-shadow:0 0 10px #62e69d; }
  .controls { margin-bottom:20px; }
  form { display:flex; max-width:720px; }
  input { flex:1; border:1px solid #273959; background:#0c1526; color:#eef5ff; padding:14px 17px; border-radius:10px 0 0 10px; outline:none; }
  input:focus { border-color:#6c96f8; box-shadow:0 0 0 3px #6c96f81c; }
  form button { border:0; border-radius:0 10px 10px 0; background:#7599ff; color:#071022; font-weight:750; padding:0 20px; cursor:pointer; }
  form button span { opacity:.5; margin-left:10px; }
  .presets { display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; }
  .chip { color:#9caccc; border:1px solid #22314d; background:#0d172a; padding:6px 10px; border-radius:999px; cursor:pointer; font-size:12px; }
  .chip:hover { color:#eaf1ff; border-color:#6388e8; }
  .layout { display:grid; grid-template-columns:minmax(700px, 960px) 310px; gap:16px; align-items:start; }
  .stage-wrap { position:relative; overflow:hidden; border:1px solid #253755; border-radius:14px; background:#080d19; box-shadow:0 20px 60px #0005; }
  canvas { display:block; width:100%; height:auto; aspect-ratio:16/10; cursor:grab; }
  canvas:active { cursor:grabbing; }
  .legend { position:absolute; bottom:12px; left:14px; display:flex; gap:14px; color:#9eacc6; font:11px ui-monospace, monospace; }
  .legend-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:5px; }
  .blue { background:#4299d2; } .orange { background:#f07546; } .purple { background:#a675eb; }
  .inspector { min-height:600px; border:1px solid #253755; border-radius:14px; background:#0b1424; padding:17px; overflow:hidden; }
  .inspector-head { display:flex; justify-content:space-between; color:#8596b7; font:600 10px ui-monospace, monospace; letter-spacing:.08em; padding-bottom:14px; border-bottom:1px solid #20314c; }
  #object-count { color:#6f85ad; }
  .metrics { padding:14px 0; border-bottom:1px solid #20314c; }
  .empty { color:#687b9d; font-size:12px; line-height:1.5; }
  .metric-card { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .metric-card b { color:#f3f6ff; font-size:18px; }
  .metric-card span { color:#83a5d4; font:11px ui-monospace, monospace; text-align:right; }
  .badges { display:flex; gap:6px; margin-top:9px; }
  .badge { color:#8ee1bc; background:#153326; border:1px solid #276247; border-radius:999px; padding:4px 7px; font:10px ui-monospace, monospace; }
  .badge.muted { color:#9caccc; background:#121e33; border-color:#273958; }
  .answers-title { color:#6f85ad; font:600 10px ui-monospace, monospace; letter-spacing:.1em; margin:16px 0 10px; }
  .answer-row { display:grid; grid-template-columns:1fr auto; gap:8px; padding:5px 0; border-bottom:1px solid #14233a; color:#a9b8d2; font-size:11px; }
  .answer-row b { color:#e8efff; font:600 11px ui-monospace, monospace; }
  .answer-row small { color:#657c9e; grid-column:1 / -1; font-size:9px; }
  footer { display:flex; justify-content:space-between; color:#5d7194; font:11px ui-monospace, monospace; padding:13px 3px 0; }
  .toast { position:fixed; right:24px; bottom:24px; background:#542b36; border:1px solid #b45d71; color:#ffe8ec; padding:12px 15px; border-radius:9px; box-shadow:0 8px 25px #0008; font-size:13px; }
  @media (max-width:1180px) { body { min-width:0; } .shell { width:calc(100vw - 26px); } .layout { grid-template-columns:1fr; } .inspector { min-height:0; } }
`;
document.head.append(style);

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
