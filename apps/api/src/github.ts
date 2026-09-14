import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env.js";
import type { DiffFile } from "@commitquest/shared";

/** Identity scopes required for player login (GitHub id, login, name, email, avatar). */
export const GITHUB_IDENTITY_SCOPES = ["read:user", "user:email"] as const;
export const GITHUB_PRIVATE_REPO_SCOPE = "repo";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type GithubEmail = {
  email: string;
  primary?: boolean;
  verified?: boolean;
  visibility?: string | null;
};

export type GithubUser = {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
};

export type GithubPlayerProfile = {
  githubId: string;
  githubLogin: string;
  login: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
};

export function buildGithubOauthScopes(options: { extra?: string; requestRepo?: boolean } = {}): string {
  const scopes = new Set<string>(GITHUB_IDENTITY_SCOPES);
  if (options.requestRepo) scopes.add(GITHUB_PRIVATE_REPO_SCOPE);
  for (const part of (options.extra ?? "").split(/[\s,]+/)) {
    if (part) scopes.add(part);
  }
  return [...scopes].join(" ");
}

export function githubOauthScopeString(): string {
  return buildGithubOauthScopes({
    extra: env.githubOauthScopes,
    requestRepo: env.githubRequestRepoScope,
  });
}

export function createOauthState(secret: string, now = Date.now()): string {
  const nonce = randomBytes(16).toString("hex");
  const exp = now + OAUTH_STATE_TTL_MS;
  const payload = `${nonce}.${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function oauthStateMatches(expected: string | undefined, received: string | undefined): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** HMAC-signed state so CSRF works even when authorize is proxied on :5173 and callback hits :3001. */
export function verifyOauthState(secret: string, state: string | undefined, now = Date.now()): boolean {
  if (!state) return false;
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, expRaw, sig] = parts;
  if (!nonce || !expRaw || !sig) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < now) return false;
  const expected = createHmac("sha256", secret).update(`${nonce}.${expRaw}`).digest("hex");
  return oauthStateMatches(expected, sig);
}

export function pickGithubEmail(profileEmail: string | null | undefined, emails: GithubEmail[]): string | undefined {
  if (profileEmail) return profileEmail;
  const verifiedPrimary = emails.find((e) => e.primary && e.verified);
  if (verifiedPrimary) return verifiedPrimary.email;
  const verified = emails.find((e) => e.verified);
  if (verified) return verified.email;
  return emails[0]?.email;
}

export function playerFromGithub(gh: GithubUser, email?: string): GithubPlayerProfile {
  const githubLogin = gh.login;
  return {
    githubId: String(gh.id),
    githubLogin,
    login: githubLogin,
    name: gh.name?.trim() || undefined,
    email: email ?? gh.email ?? undefined,
    avatarUrl: gh.avatar_url ?? undefined,
  };
}

export function sessionCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function verifyGithubSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature || !env.githubWebhookSecret) return false;
  const digest = `sha256=${createHmac("sha256", env.githubWebhookSecret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function exchangeGithubCode(code: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.githubClientId,
      client_secret: env.githubClientSecret,
      code,
      redirect_uri: env.githubCallbackUrl,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(data.error ?? "GitHub token exchange failed");
  return data.access_token;
}

function githubHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}`, "User-Agent": "commitquest", Accept: "application/vnd.github+json" };
}

export async function fetchGithubUser(accessToken: string): Promise<GithubUser> {
  const res = await fetch("https://api.github.com/user", { headers: githubHeaders(accessToken) });
  if (!res.ok) throw new Error("GitHub user fetch failed");
  return (await res.json()) as GithubUser;
}

export async function fetchGithubEmails(accessToken: string): Promise<GithubEmail[]> {
  const res = await fetch("https://api.github.com/user/emails", { headers: githubHeaders(accessToken) });
  if (!res.ok) return [];
  const data = (await res.json()) as GithubEmail[] | { message?: string };
  return Array.isArray(data) ? data : [];
}

export async function fetchGithubProfile(accessToken: string): Promise<GithubPlayerProfile> {
  const gh = await fetchGithubUser(accessToken);
  const emails = gh.email ? [] : await fetchGithubEmails(accessToken);
  return playerFromGithub(gh, pickGithubEmail(gh.email, emails));
}

export async function fetchCommitDiff(repoFullName: string, sha: string): Promise<DiffFile[] | null> {
  const headers: Record<string, string> = { "User-Agent": "commitquest", Accept: "application/vnd.github+json" };
  if (env.githubToken) headers.Authorization = `Bearer ${env.githubToken}`;
  const res = await fetch(`https://api.github.com/repos/${repoFullName}/commits/${sha}`, { headers });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    files?: { filename: string; additions: number; deletions: number }[];
  };
  return (data.files ?? []).map((f) => ({
    filename: f.filename,
    additions: f.additions,
    deletions: f.deletions,
  }));
}

export type PushPayload = {
  repository?: { full_name?: string };
  commits?: {
    id: string;
    added?: string[];
    removed?: string[];
    modified?: string[];
    author?: { username?: string; name?: string };
  }[];
  pusher?: { name?: string };
};

export function estimateFilesFromPush(commit: NonNullable<PushPayload["commits"]>[number]): DiffFile[] {
  const files: DiffFile[] = [];
  for (const filename of commit.added ?? []) files.push({ filename, additions: 8, deletions: 0 });
  for (const filename of commit.modified ?? []) files.push({ filename, additions: 4, deletions: 2 });
  for (const filename of commit.removed ?? []) files.push({ filename, additions: 0, deletions: 4 });
  return files;
}
