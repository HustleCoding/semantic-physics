import type { Answer, JudgeResponse } from "./types";

export type UiController = {
  showSpawn(result: { noun: string; response: JudgeResponse; latencyMs: number; cost: number }): void;
  showError(message: string): void;
  setObjectCount(count: number): void;
};

const PRESETS = ["rubber duck", "anvil", "ice cube", "cat", "candle", "balloon", "sugar cube", "magnet", "bomb", "jelly"];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function barRow(key: string, fraction: number, value: string, hot: boolean) {
  const row = el("div", `row${hot ? " hot" : ""}`);
  row.append(el("span", "k", key));
  const bar = el("div", "bar");
  const fill = el("i");
  fill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
  bar.append(fill);
  row.append(bar, el("span", "v", value));
  return row;
}

function renderAnswers(container: HTMLElement, answers: Record<string, Answer>) {
  container.replaceChildren();
  const entries = Object.entries(answers);
  const nouls = entries.filter(([, a]) => a.type === "noul");
  const scores = entries.filter(([, a]) => a.type === "score");
  const choices = entries.filter(([, a]) => a.type === "choice");

  if (choices.length) {
    container.append(el("div", "group-title", "Material"));
    for (const [, answer] of choices) {
      if (answer.type !== "choice") continue;
      const row = el("div", "choice-row");
      for (const [name, p] of Object.entries(answer.probabilities || {}).sort((x, y) => y[1] - x[1])) {
        row.append(el("span", name === answer.choice ? "pick" : "", `${name} ${percent(p)}`));
      }
      container.append(row);
    }
  }
  if (scores.length) {
    container.append(el("div", "group-title", "Scores"));
    for (const [key, answer] of scores) {
      if (answer.type !== "score") continue;
      const max = Math.max(1, Object.keys(answer.legend || {}).length - 1);
      container.append(barRow(key, answer.score / max, answer.score.toFixed(1), false));
      const legend = answer.legend?.[String(Math.round(answer.score))];
      if (legend) container.append(el("div", "legend-line", legend));
    }
  }
  if (nouls.length) {
    container.append(el("div", "group-title", "Is it…"));
    for (const [key, answer] of nouls.sort((x, y) => (y[1].type === "noul" ? y[1].noul : 0) - (x[1].type === "noul" ? x[1].noul : 0))) {
      if (answer.type !== "noul") continue;
      container.append(barRow(key, answer.noul, percent(answer.noul), answer.noul >= 0.5));
    }
  }
}

export function createUi(onSubmit: (noun: string) => void): UiController {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) throw new Error("Missing app root");
  root.innerHTML = `
    <main class="shell">
      <header class="top">
        <div class="brand">
          <h1>Semantic <em>Physics</em></h1>
          <p>Type a noun. Jev judges what it is. The world takes it from there.</p>
        </div>
        <div class="top-meta">
          <span id="mode-dot"><i class="dot"></i>jev-latest</span>
          <a href="https://docs.typesafe.ai" target="_blank" rel="noreferrer">typesafe.ai</a>
          <span>matter.js</span>
        </div>
      </header>
      <form id="spawn-form" class="prompt">
        <input id="noun-input" maxlength="40" autocomplete="off" autofocus placeholder="a rubber duck, an anvil, a sugar cube…" aria-label="Object noun" />
        <button type="submit">Spawn<kbd>↵</kbd></button>
      </form>
      <div class="presets"><span class="try">try</span>${PRESETS.map((preset) => `<button type="button" class="chip" data-noun="${preset}">${preset}</button>`).join("")}</div>
      <section class="layout">
        <div class="stage-wrap">
          <div class="canvas-slot"></div>
          <div class="stage-hint">drag things · let them collide</div>
        </div>
        <aside class="inspector">
          <div class="inspector-head"><span>Why it behaves</span><span id="object-count">empty</span></div>
          <div id="metrics"><div class="empty">Spawn something and Jev's answers show up here — no prose, just probabilities.</div></div>
          <div id="answer-list"></div>
        </aside>
      </section>
      <footer><span>Jev returns typed probabilities, not text. Code turns them into mass, buoyancy, fire.</span><span>~20 questions · one call · ~150ms</span></footer>
    </main>
  `;
  const form = root.querySelector<HTMLFormElement>("#spawn-form") as HTMLFormElement;
  const input = root.querySelector<HTMLInputElement>("#noun-input") as HTMLInputElement;
  const metrics = root.querySelector<HTMLDivElement>("#metrics") as HTMLDivElement;
  const answers = root.querySelector<HTMLDivElement>("#answer-list") as HTMLDivElement;
  const objectCount = root.querySelector<HTMLSpanElement>("#object-count") as HTMLSpanElement;
  const modeDot = root.querySelector<HTMLSpanElement>("#mode-dot") as HTMLSpanElement;
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
      modeDot.replaceChildren(el("i", `dot${mode === "mock" ? " mock" : ""}`), document.createTextNode(result.response.model || "jev-latest"));
      const meta = el("div", "meta");
      const tag = el("span", `tag ${mode === "mock" ? "mock" : "live"}`, mode);
      const latency = el("span");
      latency.append(el("b", "", `${Math.round(result.latencyMs)}ms`));
      const cost = el("span");
      cost.append(el("b", "", `$${result.cost.toFixed(6)}`));
      meta.append(tag, latency, cost);
      const tokens = result.response.usage?.input_tokens;
      if (tokens) meta.append(el("span", "", `${tokens} tok in`));
      metrics.replaceChildren(el("div", "subject", result.noun), meta);
      renderAnswers(answers, result.response.answers);
    },
    showError(message) {
      const toast = el("div", "toast", message);
      document.body.append(toast);
      setTimeout(() => toast.remove(), 4000);
    },
    setObjectCount(count) {
      objectCount.textContent = count === 0 ? "empty" : `${count} ${count === 1 ? "object" : "objects"}`;
    },
  };
}
