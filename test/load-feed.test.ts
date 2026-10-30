import { describe, expect, it } from "vitest";

import { agentLiveUrl, createAgentListingsClient } from "../src/agent-client.js";
import { loadFixture } from "../src/fixtures.js";
import type { FetchLike } from "../src/http.js";
import { loadFeed } from "../src/load-feed.js";
import { publicListingsUrl } from "../src/public-client.js";
import { USER_AGENT } from "../src/constants.js";

const now = new Date("2026-10-30T00:00:00.000Z");
const SECRET = "test-key-not-a-secret";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("agent client", () => {
  it("builds the official live URL and clamps take to 50", () => {
    const url = agentLiveUrl({ take: 100, type: "bounty" });
    expect(url.origin).toBe("https://superteam.fun");
    expect(url.pathname).toBe("/api/agents/listings/live");
    expect(url.searchParams.get("take")).toBe("50");
    expect(url.searchParams.get("type")).toBe("bounty");
  });

  it("does not call fetch when the API key is unset", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      throw new Error("network should not be used");
    };
    const client = await createAgentListingsClient({
      apiKey: "   ",
      fetchImpl,
      fixture: [{ slug: "from-fixture" }],
    });
    expect(client.mode).toBe("fixture");
    await expect(client.fetchListings({ take: 100 })).resolves.toEqual([
      { slug: "from-fixture" },
    ]);
    expect(calls).toBe(0);
  });

  it("sends the bearer token only on the live client", async () => {
    const seen: { url: string; authorization: string | undefined; userAgent: string | undefined }[] =
      [];
    const fetchImpl: FetchLike = async (input, init) => {
      const headers = init?.headers ?? {};
      seen.push({
        url: String(input),
        authorization: headers.Authorization,
        userAgent: headers["User-Agent"],
      });
      return jsonResponse([]);
    };
    const client = await createAgentListingsClient({
      apiKey: SECRET,
      fetchImpl,
    });
    expect(client.mode).toBe("live");
    await client.fetchListings({ take: 20 });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://superteam.fun/api/agents/listings/live?take=20");
    expect(seen[0]?.authorization).toBe(`Bearer ${SECRET}`);
    expect(seen[0]?.userAgent).toBe(USER_AGENT);
  });
});

describe("loadFeed", () => {
  it("stays on fixtures offline and never calls fetch", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("offline fetch was called");
    };
    const feed = await loadFeed({ offline: true, now, fetchImpl });
    expect(feed.sources).toEqual({ agentApi: "fixture", publicFeed: "fixture" });
    expect(feed.listings.map((listing) => listing.slug)).toEqual([
      "sample-stale-open-listing",
      "twitter-post-about-nft-locks-on-streamflow",
      "sample-agent-only-integration-notes",
      "sample-fields-omitted",
      "sample-document-agent-discovery-gap",
    ]);
    const shared = feed.listings.find(
      (listing) => listing.slug === "sample-document-agent-discovery-gap",
    );
    expect(shared?.reward.amount).toBe(500);
    expect(shared?.sponsor).toBe("Sample Sponsor");
    expect(shared?.skills).toEqual(["Content", "Research", "Writing"]);
    expect(feed.listings.some((listing) => listing.slug.includes("human-only"))).toBe(false);
    expect(feed.listings.some((listing) => listing.slug === "sample-closed-agent-bounty")).toBe(
      false,
    );
    expect(feed.listings.some((listing) => listing.slug === "sample-review-status")).toBe(false);
    const omitted = feed.listings.find((listing) => listing.slug === "sample-fields-omitted");
    expect(omitted?.agentAccess).toBeNull();
    expect(omitted?.status).toBeNull();
    expect(omitted?.sponsor).toBe("Plain Sponsor Name");
  });

  it("skips the live agent API when the key is unset and falls back if the public feed fails", async () => {
    const urls: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      urls.push(String(input));
      throw new Error("network down");
    };
    const feed = await loadFeed({ apiKey: undefined, now, fetchImpl, take: 100 });
    expect(urls).toEqual([publicListingsUrl(100).toString()]);
    expect(urls.some((url) => url.includes("/api/agents"))).toBe(false);
    expect(feed.sources).toEqual({ agentApi: "fixture", publicFeed: "fixture" });
    expect(feed.warnings.some((warning) => warning.includes("Public listings cross-check failed"))).toBe(
      true,
    );
    expect(JSON.stringify(feed)).not.toContain(SECRET);
  });

  it("uses the live agent API when a key is set and does not leak the key", async () => {
    const agentFixture = await loadFixture("agent");
    const publicFixture = await loadFixture("publicFeed");
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input);
      if (url.startsWith("https://superteam.fun/api/agents/listings/live")) {
        return jsonResponse(agentFixture);
      }
      if (url.startsWith("https://earn.superteam.fun/api/listings")) {
        return jsonResponse(publicFixture);
      }
      throw new Error(`unexpected url ${url}`);
    };
    const feed = await loadFeed({ apiKey: SECRET, now, fetchImpl, take: 100 });
    expect(feed.sources).toEqual({ agentApi: "live", publicFeed: "live" });
    const serialized = JSON.stringify(feed);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain("Bearer");
    const shared = feed.listings.find(
      (listing) => listing.slug === "sample-document-agent-discovery-gap",
    );
    expect(shared?.reward.amount).toBe(500);
  });

  it("prefers live public fields over fixture agent rows when the key is unset", async () => {
    const publicFixture = await loadFixture("publicFeed");
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input);
      expect(url.startsWith("https://earn.superteam.fun/api/listings?take=")).toBe(true);
      return jsonResponse({ listings: publicFixture });
    };
    const feed = await loadFeed({ now, fetchImpl });
    expect(feed.sources.agentApi).toBe("fixture");
    expect(feed.sources.publicFeed).toBe("live");
    expect(feed.warnings.some((warning) => warning.includes("recorded sample fixtures"))).toBe(
      true,
    );
    expect(feed.warnings.some((warning) => warning.includes("sample-stale-open-listing"))).toBe(
      true,
    );
    expect(
      feed.warnings.some((warning) => warning.includes("sample-document-agent-discovery-gap")),
    ).toBe(false);
    const shared = feed.listings.find(
      (listing) => listing.slug === "sample-document-agent-discovery-gap",
    );
    expect(shared?.reward.amount).toBe(999);
    expect(shared?.sponsor).toBe("Public Feed Sponsor");
    expect(shared?.skills).toEqual(["Content", "Research", "Writing"]);
  });

  it("surfaces agent API failures instead of silently using fixtures", async () => {
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes("/api/agents/")) {
        return jsonResponse({ error: "nope" }, 401);
      }
      return jsonResponse([]);
    };
    await expect(loadFeed({ apiKey: SECRET, now, fetchImpl })).rejects.toThrow(/HTTP 401/);
  });
});
