-- AlterTable
ALTER TABLE "User" ADD COLUMN "githubLogin" TEXT;
ALTER TABLE "User" ADD COLUMN "name" TEXT;

-- Backfill GitHub login from the existing handle
UPDATE "User" SET "githubLogin" = "login" WHERE "githubLogin" IS NULL;
