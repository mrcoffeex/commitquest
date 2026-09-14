import type { CommitXpInput, CommitXpResult, DiffFile } from "./types.js";

const NOISE_PATH_PARTS = [
  "node_modules/",
  "/node_modules",
  "vendor/",
  "/vendor/",
  "dist/",
  "build/",
  ".min.js",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "composer.lock",
  ".next/",
  "coverage/",
];

export function isNoisePath(filename: string): boolean {
  const lower = filename.replaceAll("\\", "/").toLowerCase();
  return NOISE_PATH_PARTS.some((part) => lower.includes(part));
}

export function filterDiffFiles(files: DiffFile[]): { kept: DiffFile[]; skipped: string[] } {
  const kept: DiffFile[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (isNoisePath(file.filename)) {
      skipped.push(file.filename);
    } else {
      kept.push(file);
    }
  }
  return { kept, skipped };
}

export function commitLineXp(additions: number, deletions: number): number {
  return Math.max(0, Math.floor(additions) - Math.floor(deletions));
}

export function computeCommitXp(input: CommitXpInput): CommitXpResult {
  let additions = Math.max(0, Math.floor(input.additions ?? 0));
  let deletions = Math.max(0, Math.floor(input.deletions ?? 0));
  let skippedFiles: string[] = [];

  if (input.files && input.files.length > 0) {
    const { kept, skipped } = filterDiffFiles(input.files);
    skippedFiles = skipped;
    additions = kept.reduce((sum, file) => sum + Math.max(0, file.additions), 0);
    deletions = kept.reduce((sum, file) => sum + Math.max(0, file.deletions), 0);
  }

  let xp = commitLineXp(additions, deletions);
  if (input.focusSession) {
    xp = Math.floor(xp * 1.1);
  }

  return {
    additions: Math.max(0, Math.floor(input.additions ?? additions)),
    deletions: Math.max(0, Math.floor(input.deletions ?? deletions)),
    filteredAdditions: additions,
    filteredDeletions: deletions,
    xp,
    skippedFiles,
  };
}

export function inferLanguage(files: DiffFile[] = [], fallback?: string): string | undefined {
  if (fallback) return fallback;
  const counts = new Map<string, number>();
  for (const file of files) {
    if (isNoisePath(file.filename)) continue;
    const lang = languageFromFilename(file.filename);
    if (!lang) continue;
    counts.set(lang, (counts.get(lang) ?? 0) + file.additions + file.deletions);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [lang, count] of counts) {
    if (count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }
  return best;
}

export function languageFromFilename(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript",
    js: "JavaScript",
    jsx: "JavaScript",
    py: "Python",
    rs: "Rust",
    go: "Go",
    rb: "Ruby",
    php: "PHP",
    java: "Java",
    kt: "Kotlin",
    cs: "C#",
    cpp: "C++",
    cc: "C++",
    c: "C",
    h: "C",
    swift: "Swift",
    dart: "Dart",
    vue: "Vue",
    svelte: "Svelte",
    md: "Markdown",
    css: "CSS",
    scss: "CSS",
    html: "HTML",
    json: "JSON",
    yml: "YAML",
    yaml: "YAML",
    sql: "SQL",
    sh: "Shell",
  };
  return ext ? map[ext] : undefined;
}

export function nextCommitStreak(lastCommitDate: Date | null | undefined, now = new Date()): number {
  if (!lastCommitDate) return 1;
  const last = utcDayKey(lastCommitDate);
  const today = utcDayKey(now);
  if (last === today) return 0; // caller keeps existing streak
  const yesterday = utcDayKey(new Date(now.getTime() - 86_400_000));
  if (last === yesterday) return -1; // caller increments
  return 1;
}

export function applyCommitStreak(currentStreak: number, lastCommitDate: Date | null | undefined, now = new Date()): {
  streak: number;
  lastCommitDate: Date;
} {
  const signal = nextCommitStreak(lastCommitDate, now);
  if (signal === 0) {
    return { streak: Math.max(1, currentStreak), lastCommitDate: now };
  }
  if (signal === -1) {
    return { streak: currentStreak + 1, lastCommitDate: now };
  }
  return { streak: 1, lastCommitDate: now };
}

export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function utcWeekKey(date = new Date()): string {
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
