import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env") });

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://commitquest:commitquest@localhost:5432/commitquest",
  jwtSecret: process.env.JWT_SECRET ?? "dev-commitquest-jwt-change-me",
  internalSecret: process.env.INTERNAL_SECRET ?? "dev-commitquest-internal-change-me",
  authMock: (process.env.AUTH_MOCK ?? "true").toLowerCase() === "true",
  githubClientId: process.env.GITHUB_CLIENT_ID ?? "",
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
  githubCallbackUrl: process.env.GITHUB_CALLBACK_URL ?? "http://localhost:3001/api/auth/github/callback",
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "dev-webhook-secret",
  githubToken: process.env.GITHUB_TOKEN ?? "",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  port: Number(process.env.PORT ?? 3001),
};
