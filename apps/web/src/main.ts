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
    loginEl.hidden = true;
    appEl.hidden = false;
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

api.config()
  .then((cfg) => {
    const github = document.getElementById("github-btn") as HTMLAnchorElement;
    if (!cfg.githubEnabled) github.style.display = "none";
    if (!cfg.authMock) {
      (document.getElementById("mock-form") as HTMLFormElement).hidden = true;
    }
  })
  .catch(() => toast("API offline"));

if (getToken()) enter();
