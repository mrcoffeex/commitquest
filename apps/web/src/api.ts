export type Me = {
  user: { id: string; login: string; avatarUrl?: string };
  character: CharacterView | null;
};

export type CharacterView = {
  id: string;
  displayName: string;
  color: string;
  level: number;
  totalXp: number;
  unspentStatPoints: number;
  bits: number;
  stats: Record<string, number>;
  cosmetics: string[];
  emotes: string[];
  focusSession: boolean;
  commitStreak: number;
  languageAffinity: Record<string, number>;
  kills: number;
  deaths: number;
  highestDamage: number;
  wins: number;
  losses: number;
  weapons: { id: string; name: string; grantedAtLevel: number; stats: Record<string, number>; effects: { name: string; description: string }[] }[];
  progress: { level: number; currentXp: number; xpToNext: number; totalXp: number };
  deathRule: string;
};

const TOKEN_KEY = "cq_token";

export function getToken(): string | null {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("token");
  if (fromUrl) {
    localStorage.setItem(TOKEN_KEY, fromUrl);
    url.searchParams.delete("token");
    history.replaceState({}, "", url.pathname);
    return fromUrl;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data as T;
}

export const api = {
  config: () => req<{ authMock: boolean; githubEnabled: boolean }>("/api/auth/config"),
  mock: (login: string) => req<{ token: string }>("/api/auth/mock", { method: "POST", body: JSON.stringify({ login }) }),
  me: () => req<Me>("/api/me"),
  patchCharacter: (body: object) => req<{ character: CharacterView }>("/api/character", { method: "PATCH", body: JSON.stringify(body) }),
  alloc: (stat: string) => req<{ character: CharacterView }>("/api/character/stats", { method: "POST", body: JSON.stringify({ stat }) }),
  simulate: (body: object) => req<Record<string, unknown>>("/api/commits/simulate", { method: "POST", body: JSON.stringify(body) }),
  quests: () => req<{ daily: QuestRow[]; weekly: QuestRow[] }>("/api/quests"),
  claim: (id: string) => req<Record<string, unknown>>(`/api/quests/${id}/claim`, { method: "POST" }),
  shop: () => req<{ items: { id: string; name: string; description: string; cost: number }[] }>("/api/shop"),
  buy: (itemId: string) => req<Record<string, unknown>>("/api/shop/buy", { method: "POST", body: JSON.stringify({ itemId }) }),
  leaderboard: (query = "") => req<{ entries: Record<string, unknown>[] }>(`/api/leaderboard${query}`),
  matches: () => req<{ matches: MatchRow[] }>("/api/matches"),
  boards: (org: string, repo?: string) => req("/api/boards", { method: "POST", body: JSON.stringify({ org, repo }) }),
  profile: (id: string) => req<{ profile: CharacterView }>(`/api/profile/${id}`),
};

export type QuestRow = {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  bitsReward: number;
  xpReward: number;
};

export type MatchRow = {
  id: string;
  mode: string;
  winnerSide: number | null;
  startedAt: string;
  participants: { displayName: string; won: boolean; isBot: boolean; damageDealt: number; xpDelta: number; bitsDelta: number }[];
};
