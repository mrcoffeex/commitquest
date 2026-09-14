const API_URL = process.env.API_URL ?? "http://localhost:3001";

export type SessionPlayer = {
  user: { id: string; login: string; githubLogin?: string; githubId?: string };
  character: { id: string; displayName: string } | null;
};

/** Verify the same JWT the web client stores (cookie / Authorization) before a room join. */
export async function authenticateJoin(options: { token?: string; characterId?: string }): Promise<SessionPlayer> {
  const token = options.token;
  if (!token) throw new Error("missing session token");
  const res = await fetch(`${API_URL}/api/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error("invalid session");
  const me = (await res.json()) as SessionPlayer;
  if (options.characterId && me.character?.id && me.character.id !== options.characterId) {
    throw new Error("character mismatch");
  }
  return me;
}
