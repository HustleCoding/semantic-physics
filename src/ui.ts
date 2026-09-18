import type { Answer, JudgeResponse, PhysicsObject } from "./types";

export type UiController = {
  showSpawn(result: { noun: string; response: JudgeResponse; latencyMs: number; cost: number }): void;
  showError(message: string): void;
};

const PRESETS = ["rubber duck", "anvil", "ice cube", "cat", "candle", "balloon", "sugar cube", "magnet", "bomb", "jelly"];

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function answerLine(key: string, answer: Answer) {
  if (answer.type === "noul") return `<div class="answer-row"><span>${key}</span><b>${percent(answer.noul)}</b></div>`;
  if (answer.type === "score") {
    const legend = answer.legend?.[String(Math.round(answer.score))] || answer.legend?.[String(answer.score)] || "";
    return `<div class="answer-row answer-score"><span>${key} <small>${legend}</small></span><b>${answer.score.toFixed(2)}</b></div>`;
  }
  const probabilities = Object.entries(answer.probabilities || {}).map(([name, value]) => `${name} ${percent(value)}`).join(" · ");
  return `<div class="answer-row answer-choice"><span>${key}</span><b>${answer.choice}</b><small>${probabilities}</small></div>`;
}

export function createUi(onSubmit: (noun: string) => void): UiController {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) throw new Error("Missing app root");
  root.innerHTML = `
    <main class="shell">
      <header class="hero">
        <div>
          <div class="eyebrow">TYPESAFE × MATTER.JS</div>
          <h1>Semantic <span>Physics</span></h1>
          <p>Type a noun. Jev decides what it is. Physics takes it from there.</p>
        </div>
        <div class="live-pill"><i></i>LIVE SANDBOX</div>
      </header>
      <section class="controls">
        <form id="spawn-form">
          <input id="noun-input" maxlength="40" autocomplete="off" placeholder="rubber duck, anvil, or anything..." aria-label="Object noun" />
          <button type="submit">Spawn <span>↵</span></button>
        </form>
        <div class="presets">${PRESETS.map((preset) => `<button type="button" class="chip" data-noun="${preset}">${preset}</button>`).join("")}</div>
      </section>
      <section class="layout">
        <div class="stage-wrap">
          <div class="canvas-slot"></div>
          <div class="legend"><span><i class="legend-dot blue"></i>water</span><span><i class="legend-dot orange"></i>fire</span><span><i class="legend-dot purple"></i>heat lamp</span></div>
        </div>
        <aside class="inspector">
          <div class="inspector-head"><span>WHY THIS BEHAVES</span><span id="object-count">0 objects</span></div>
          <div id="metrics" class="metrics"><div class="empty">Spawn an object to inspect Jev's answers.</div></div>
          <div id="answer-list" class="answer-list"></div>
        </aside>
      </section>
      <footer><span>Jev returns typed probabilities, not generated text.</span><span>Drag objects · collide them · see what happens</span></footer>
    </main>
  `;
  const form = root.querySelector<HTMLFormElement>("#spawn-form") as HTMLFormElement;
  const input = root.querySelector<HTMLInputElement>("#noun-input") as HTMLInputElement;
  const metrics = root.querySelector<HTMLDivElement>("#metrics") as HTMLDivElement;
  const answers = root.querySelector<HTMLDivElement>("#answer-list") as HTMLDivElement;
  const objectCount = root.querySelector<HTMLSpanElement>("#object-count") as HTMLSpanElement;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const noun = input.value.trim();
    if (!noun) return;
    input.value = "";
    onSubmit(noun);
  });
  root.querySelectorAll<HTMLButtonElement>("[data-noun]").forEach((chip) => {
    chip.addEventListener("click", () => onSubmit(chip.dataset.noun || ""));
  });
  return {
    showSpawn(result) {
      const mode = result.response.mock ? "mock" : result.response.cached ? "cached" : "live";
      const usage = result.response.usage?.input_tokens ? `${result.response.usage.input_tokens} input tok` : "no usage";
      metrics.innerHTML = `<div class="metric-card"><b>${result.noun}</b><span>${Math.round(result.latencyMs)}ms · $${result.cost.toFixed(6)}</span></div><div class="badges"><span class="badge">${mode}</span><span class="badge muted">${usage}</span></div>`;
      answers.innerHTML = `<div class="answers-title">RAW ANSWERS</div>${Object.entries(result.response.answers).map(([key, answer]) => answerLine(key, answer)).join("")}`;
      objectCount.textContent = `${document.querySelectorAll(".answer-row").length ? "inspecting" : "0 objects"}`;
    },
    showError(message) {
      const toast = document.createElement("div");
      toast.className = "toast";
      toast.textContent = message;
      document.body.append(toast);
      setTimeout(() => toast.remove(), 4000);
    },
  };
}

export function updateObjectCount(controller: UiController, objects: PhysicsObject[]) {
  void controller;
  void objects;
}
