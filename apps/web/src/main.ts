import { api, getToken, setToken } from "./api.js";
import { bindHud, refreshHud, toast } from "./hud.js";
import { startGame } from "./game.js";

const loginEl = document.getElementById("login")!;
const appEl = document.getElementById("app")!;
const errorEl = document.getElementById("login-error")!;

async function enter(token?: string) {
  if (token) setToken(token);
  if (!getToken()) return;
  try {
    const me = await api.me();
    if (!me.character) throw new Error("No character on this account");
    api.session().catch(() => undefined);
    loginEl.hidden = true;
    appEl.hidden = false;
    const simulateBtn = document.getElementById("simulate-btn");
    if (simulateBtn) simulateBtn.hidden = !me.authMock;
    await refreshHud();
    const game = startGame(me.character.id);
    bindHud({
      duel: (spectate) => {
        const scene = game.scene.getScene("overworld") as { enterDuel?: (s?: boolean) => void };
        scene.enterDuel?.(Boolean(spectate));
      },
    });
  } catch (error) {
    errorEl.hidden = false;
    errorEl.textContent = error instanceof Error ? error.message : "Login failed";
  }
}

document.getElementById("mock-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const login = (document.getElementById("mock-login") as HTMLInputElement).value;
  try {
    const result = await api.mock(login);
    await enter(result.token);
  } catch (error) {
    errorEl.hidden = false;
    errorEl.textContent = error instanceof Error ? error.message : "Mock auth failed";
  }
});

const mockForm = document.getElementById("mock-form") as HTMLFormElement;
const devWrap = document.getElementById("dev-login-wrap");
document.getElementById("dev-login-toggle")?.addEventListener("click", () => {
  mockForm.hidden = !mockForm.hidden;
});

api.config()
  .then((cfg) => {
    const github = document.getElementById("github-btn") as HTMLAnchorElement;
    const hint = document.getElementById("github-hint");
    if (cfg.githubEnabled) {
      github.classList.remove("disabled");
      github.setAttribute("href", "/api/auth/github");
      if (hint) hint.hidden = true;
    } else {
      github.classList.add("disabled");
      github.addEventListener("click", (event) => {
        event.preventDefault();
        errorEl.hidden = false;
        errorEl.textContent =
          "GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, then restart the API.";
      });
    }
    if (cfg.authMock && devWrap) {
      devWrap.hidden = false;
    }
  })
  .catch(() => toast("API offline"));

if (getToken()) enter();
