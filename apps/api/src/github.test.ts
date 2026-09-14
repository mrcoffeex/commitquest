import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GITHUB_IDENTITY_SCOPES,
  GITHUB_PRIVATE_REPO_SCOPE,
  buildGithubOauthScopes,
  createOauthState,
  oauthStateMatches,
  pickGithubEmail,
  playerFromGithub,
  verifyOauthState,
} from "./github.js";

describe("buildGithubOauthScopes", () => {
  it("requests identity scopes by default", () => {
    assert.equal(buildGithubOauthScopes(), GITHUB_IDENTITY_SCOPES.join(" "));
  });

  it("adds repo only when requested for private-repo access", () => {
    const scopes = buildGithubOauthScopes({ requestRepo: true }).split(" ");
    assert.deepEqual(new Set(scopes), new Set([...GITHUB_IDENTITY_SCOPES, GITHUB_PRIVATE_REPO_SCOPE]));
  });

  it("merges extra scopes from env-style strings", () => {
    const scopes = buildGithubOauthScopes({ extra: "read:org, workflow" }).split(" ");
    assert.ok(scopes.includes("read:user"));
    assert.ok(scopes.includes("user:email"));
    assert.ok(scopes.includes("read:org"));
    assert.ok(scopes.includes("workflow"));
  });
});

describe("pickGithubEmail", () => {
  it("prefers the public profile email", () => {
    assert.equal(
      pickGithubEmail("shown@example.com", [{ email: "hidden@example.com", primary: true, verified: true }]),
      "shown@example.com",
    );
  });

  it("falls back to the verified primary email", () => {
    assert.equal(
      pickGithubEmail(undefined, [
        { email: "old@example.com", verified: false },
        { email: "primary@example.com", primary: true, verified: true },
      ]),
      "primary@example.com",
    );
  });
});

describe("playerFromGithub", () => {
  it("stores githubId + githubLogin from the GitHub profile", () => {
    const player = playerFromGithub({
      id: 42,
      login: "octocat",
      name: "The Octocat",
      email: "octocat@github.com",
      avatar_url: "https://github.com/octocat.png",
    });
    assert.deepEqual(player, {
      githubId: "42",
      githubLogin: "octocat",
      login: "octocat",
      name: "The Octocat",
      email: "octocat@github.com",
      avatarUrl: "https://github.com/octocat.png",
    });
  });
});

describe("oauthStateMatches", () => {
  it("rejects missing or mismatched CSRF state", () => {
    assert.equal(oauthStateMatches(undefined, "abc"), false);
    assert.equal(oauthStateMatches("abc", "xyz"), false);
    assert.equal(oauthStateMatches("abc", "abc"), true);
  });
});

describe("verifyOauthState", () => {
  it("accepts a fresh HMAC state and rejects extras", () => {
    const secret = "test-secret";
    const now = 1_700_000_000_000;
    const state = createOauthState(secret, now);
    assert.equal(verifyOauthState(secret, state, now + 1000), true);
    assert.equal(verifyOauthState("other", state, now + 1000), false);
    assert.equal(verifyOauthState(secret, state, now + 11 * 60 * 1000), false);
    assert.equal(verifyOauthState(secret, "nope", now), false);
  });
});
