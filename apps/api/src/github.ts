import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env.js";
import type { DiffFile } from "@commitquest/shared";

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

export async function fetchGithubUser(accessToken: string) {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "commitquest" },
  });
  if (!res.ok) throw new Error("GitHub user fetch failed");
  return (await res.json()) as {
    id: number;
    login: string;
    email?: string;
    avatar_url?: string;
  };
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
