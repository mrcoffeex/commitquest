import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env") });

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "dev-commitquest-internal-change-me";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INTERNAL_SECRET}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export type CharacterPayload = {
  character: {
    id: string;
    displayName: string;
    color: string;
    level: number;
    stats: Record<string, number>;
    weapons: { name: string; stats: Record<string, number>; effects: { id: string }[] }[];
    emotes: string[];
    focusSession: boolean;
    user?: { login: string };
  };
};

export function loadCharacter(id: string) {
  return api<CharacterPayload>(`/api/internal/character/${id}`);
}

export function reportDuel(body: unknown) {
  return api("/api/internal/duel-result", { method: "POST", body: JSON.stringify(body) });
}

export function reportBossHit(body: unknown) {
  return api("/api/internal/boss-hit", { method: "POST", body: JSON.stringify(body) });
}

export function reportDuck(characterId: string) {
  return api("/api/internal/talk-duck", { method: "POST", body: JSON.stringify({ characterId }) });
}

export function reportDeath(characterId: string) {
  return api("/api/internal/death", { method: "POST", body: JSON.stringify({ characterId }) });
}
