import { STAT_NAMES } from "@commitquest/shared";
import { api, type CharacterView, type QuestRow } from "./api.js";

let character: CharacterView | null = null;

export function currentCharacter() {
  return character;
}

export function toast(message: string) {
  const el = document.getElementById("toast");
  if (el) el.textContent = message;
}

export function setPrompt(message: string) {
  const el = document.getElementById("prompt");
  if (el) el.textContent = message;
}

export function setHp(hp: number, max: number) {
  const fill = document.getElementById("hp-fill");
  const label = document.getElementById("hp-label");
  if (fill) fill.style.width = `${max ? (100 * hp) / max : 0}%`;
  if (label) label.textContent = `${Math.ceil(hp)}/${Math.ceil(max)}`;
}

export async function refreshHud() {
  const me = await api.me();
  character = me.character;
  const identity = document.getElementById("identity");
  if (identity) identity.textContent = `${me.user.login} / ${me.character?.displayName ?? "no character"}`;
  if (!me.character) return me;
  const p = me.character.progress;
  const xpFill = document.getElementById("xp-fill");
  const xpLabel = document.getElementById("xp-label");
  if (xpFill) xpFill.style.width = `${p.xpToNext ? (100 * p.currentXp) / p.xpToNext : 0}%`;
  if (xpLabel) xpLabel.textContent = `${p.currentXp}/${p.xpToNext}`;
  setText("lvl", String(me.character.level));
  setText("bits", String(me.character.bits));
  setText("streak", String(me.character.commitStreak));
  const focus = document.getElementById("focus-btn");
  if (focus) focus.textContent = `Focus: ${me.character.focusSession ? "on" : "off"}`;
  await renderQuests();
  return me;
}

async function renderQuests() {
  const box = document.getElementById("quests");
  if (!box) return;
  const data = await api.quests();
  const rows = [...data.daily.slice(0, 3), ...data.weekly.slice(0, 2)];
  box.innerHTML = rows
    .map(
      (q) => `
      <div class="quest">
        <b>${q.title}</b>
        <span>${q.progress}/${q.target} ${q.claimed ? "claimed" : q.completed ? "ready" : ""}</span>
        ${q.completed && !q.claimed ? `<button data-claim="${q.id}">Claim</button>` : ""}
      </div>`,
    )
    .join("");
  box.querySelectorAll<HTMLButtonElement>("[data-claim]").forEach((btn) => {
    btn.onclick = async () => {
      await api.claim(btn.dataset.claim ?? "");
      toast("Quest claimed.");
      await refreshHud();
    };
  });
}

export function bindHud(handlers: { duel: (spectate?: boolean) => void }) {
  document.getElementById("focus-btn")?.addEventListener("click", async () => {
    if (!character) return;
    await api.patchCharacter({ focusSession: !character.focusSession });
    await refreshHud();
  });
  document.getElementById("duel-btn")?.addEventListener("click", () => handlers.duel(false));
  document.getElementById("spectate-btn")?.addEventListener("click", () => handlers.duel(true));
  document.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach((btn) => {
    btn.onclick = () => openPanel(btn.dataset.panel ?? "");
  });
  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    const map: Record<string, string> = { c: "character", j: "quests", k: "shop", l: "leaderboard", m: "matches" };
    const panel = map[event.key.toLowerCase()];
    if (panel) openPanel(panel);
    if (event.key.toLowerCase() === "q") handlers.duel(false);
    if (event.key === "Escape") closePanel();
  });
}

export function closePanel() {
  const panel = document.getElementById("panel");
  if (panel) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
  }
}

export async function openPanel(kind: string) {
  const panel = document.getElementById("panel");
  if (!panel) return;
  panel.classList.remove("hidden");
  if (kind === "character") {
    const me = await api.me();
    const c = me.character;
    if (!c) return;
    panel.innerHTML = `
      <h2>${c.displayName}</h2>
      <p class="muted">${c.deathRule}</p>
      <p>K/D ${c.kills}/${c.deaths} · W/L ${c.wins}/${c.losses} · Best hit ${c.highestDamage}</p>
      <p>Unspent points: <b>${c.unspentStatPoints}</b></p>
      <div class="stat-grid">
        ${STAT_NAMES.map((s) => `<div class="row"><span>${s}</span><span>${c.stats[s] ?? 0} <button data-stat="${s}">+</button></span></div>`).join("")}
      </div>
      <h3>Language affinity</h3>
      <p>${Object.entries(c.languageAffinity).map(([k, v]) => `${k} ${v}`).join(" · ") || "none yet"}</p>
      <h3>Weapons</h3>
      ${c.weapons.map((w) => `<div class="row"><span>${w.name} (lv ${w.grantedAtLevel})</span><span>${w.effects.map((e) => e.name).join(", ")}</span></div>`).join("") || "<p>None yet — drop every 10 levels.</p>"}
      <button id="close-panel">Close</button>`;
    panel.querySelectorAll<HTMLButtonElement>("[data-stat]").forEach((btn) => {
      btn.onclick = async () => {
        await api.alloc(btn.dataset.stat ?? "");
        await refreshHud();
        openPanel("character");
      };
    });
  } else if (kind === "simulate") {
    panel.innerHTML = `
      <h2>Simulate a commit</h2>
      <p class="muted">+1 XP per line added, −1 per line removed, floor 0. Noise paths are skipped.</p>
      <div class="row"><label>Additions</label><input id="sim-add" type="number" value="40" /></div>
      <div class="row"><label>Deletions</label><input id="sim-del" type="number" value="8" /></div>
      <div class="row"><label>Language</label><input id="sim-lang" value="TypeScript" /></div>
      <button id="sim-go">Push it</button>
      <button id="close-panel">Close</button>`;
    document.getElementById("sim-go")!.onclick = async () => {
      const result = await api.simulate({
        additions: Number((document.getElementById("sim-add") as HTMLInputElement).value),
        deletions: Number((document.getElementById("sim-del") as HTMLInputElement).value),
        language: (document.getElementById("sim-lang") as HTMLInputElement).value,
        files: [
          { filename: "src/game.ts", additions: 30, deletions: 4 },
          { filename: "node_modules/noise.js", additions: 999, deletions: 0 },
        ],
      });
      toast(`Commit XP +${(result as { computed?: { xp?: number } }).computed?.xp ?? 0}`);
      await refreshHud();
    };
  } else if (kind === "shop") {
    const shop = await api.shop();
    panel.innerHTML = `
      <h2>Bits shop</h2>
      ${shop.items.map((item) => `<div class="row"><div><b>${item.name}</b><div class="muted">${item.description}</div></div><button data-buy="${item.id}">${item.cost} Bits</button></div>`).join("")}
      <button id="close-panel">Close</button>`;
    panel.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await api.buy(btn.dataset.buy ?? "");
          toast("Purchased.");
          await refreshHud();
        } catch (error) {
          toast(error instanceof Error ? error.message : "Nope");
        }
      };
    });
  } else if (kind === "leaderboard") {
    const board = await api.leaderboard();
    panel.innerHTML = `
      <h2>Leaderboard</h2>
      <div class="row"><input id="board-org" placeholder="opt-in org" /><input id="board-repo" placeholder="repo" /><button id="board-join">Opt in</button></div>
      ${board.entries.map((e) => `<div class="row"><span>#${e.rank} ${e.displayName}</span><span>lv ${e.level} · ${e.totalXp} XP · ${e.wins}W</span></div>`).join("")}
      <button id="close-panel">Close</button>`;
    document.getElementById("board-join")!.onclick = async () => {
      const org = (document.getElementById("board-org") as HTMLInputElement).value;
      const repo = (document.getElementById("board-repo") as HTMLInputElement).value;
      await api.boards(org, repo || undefined);
      toast(`Opted into ${org}${repo ? "/" + repo : ""}`);
    };
  } else if (kind === "matches") {
    const data = await api.matches();
    panel.innerHTML = `
      <h2>Match history</h2>
      ${data.matches.map((m) => `<div class="row"><span>${m.mode} ${new Date(m.startedAt).toLocaleString()}</span><span>${m.participants.map((p) => `${p.displayName}${p.isBot ? " (bot)" : ""} ${p.won ? "W" : "L"} ${p.xpDelta}XP`).join(" / ")}</span></div>`).join("") || "<p>No matches yet.</p>"}
      <button id="close-panel">Close</button>`;
  } else if (kind === "quests") {
    const data = await api.quests();
    const block = (title: string, rows: QuestRow[]) =>
      `<h3>${title}</h3>` +
      rows
        .map(
          (q) =>
            `<div class="row"><div><b>${q.title}</b><div class="muted">${q.description}</div></div><span>${q.progress}/${q.target} · ${q.xpReward} XP / ${q.bitsReward} Bits ${q.completed && !q.claimed ? `<button data-claim="${q.id}">Claim</button>` : ""}</span></div>`,
        )
        .join("");
    panel.innerHTML = `<h2>Quest log</h2>${block("Daily", data.daily)}${block("Weekly", data.weekly)}<button id="close-panel">Close</button>`;
    panel.querySelectorAll<HTMLButtonElement>("[data-claim]").forEach((btn) => {
      btn.onclick = async () => {
        await api.claim(btn.dataset.claim ?? "");
        await refreshHud();
        openPanel("quests");
      };
    });
  }
  document.getElementById("close-panel")?.addEventListener("click", closePanel);
}

function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
