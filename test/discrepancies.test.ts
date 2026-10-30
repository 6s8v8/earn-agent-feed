import { describe, expect, it } from "vitest";

import { findDiscrepancies, renderDiscrepancies } from "../src/discrepancies.js";
import { loadFixture } from "../src/fixtures.js";
import type { FetchLike } from "../src/http.js";
import { loadFeedReport } from "../src/load-feed.js";

const now = new Date("2026-10-30T00:00:00.000Z");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const openRow = {
  slug: "public-only",
  title: "Public only",
  type: "bounty",
  sponsor: "Streamflow",
  rewardAmount: 500,
  token: "USDC",
  deadline: "2026-11-02T00:00:00.000Z",
  agentAccess: "AGENT_ALLOWED",
  status: "OPEN",
};

describe("findDiscrepancies", () => {
  it("flags the recorded #1456 slug and ignores ineligible or shared rows", async () => {
    const agent = await loadFixture("agent");
    const publicFeed = await loadFixture("publicFeed");
    const gaps = findDiscrepancies(
      Array.isArray(agent) ? agent : [],
      Array.isArray(publicFeed) ? publicFeed : [],
      now,
    );
    expect(gaps.map((gap) => gap.slug)).toEqual([
      "twitter-post-about-nft-locks-on-streamflow",
    ]);
    expect(gaps[0]).toMatchObject({
      title: "Sample: NFT locks on Streamflow (issue 1456 shape)",
      sponsor: "Streamflow",
      type: "bounty",
      reward: { amount: 500, token: "USDC" },
      deadline: "2026-08-28T21:59:59.000Z",
      agentAccess: "AGENT_ALLOWED",
      status: "OPEN",
      url: "https://superteam.fun/earn/listing/twitter-post-about-nft-locks-on-streamflow",
    });
  });

  it("does not treat a slug as missing when the agent payload includes it as closed or human-only", () => {
    const agent = [
      { slug: "hidden", agentAccess: "HUMAN_ONLY", status: "CLOSED", title: "Hidden" },
    ];
    const publicRows = [
      { ...openRow, slug: "hidden", title: "Hidden on public" },
      { ...openRow, slug: "absent", title: "Absent" },
      { ...openRow, slug: "absent", title: "Absent duplicate" },
      { ...openRow, slug: "human", agentAccess: "HUMAN_ONLY" },
      { ...openRow, slug: "review", status: "REVIEW", agentAccess: "AGENT_ONLY" },
      { slug: "omitted", title: "Omitted fields", rewardAmount: 10, token: "USDC" },
    ];
    const gaps = findDiscrepancies(agent, publicRows, now);
    expect(gaps.map((gap) => gap.slug)).toEqual(["absent"]);
    expect(gaps[0]?.title).toBe("Absent");
  });

  it("keeps an eligible public row that cannot be fully normalized", () => {
    const gaps = findDiscrepancies(
      [],
      [
        {
          slug: "bare",
          title: "Bare",
          agentAccess: "AGENT_ONLY",
          status: "OPEN",
          sponsor: { name: "Plain Name" },
          deadline: "2026-11-03T00:00:00.000Z",
        },
      ],
      now,
    );
    expect(gaps).toEqual([
      {
        slug: "bare",
        title: "Bare",
        type: null,
        sponsor: "Plain Name",
        reward: null,
        deadline: "2026-11-03T00:00:00.000Z",
        agentAccess: "AGENT_ONLY",
        status: "OPEN",
        url: "https://superteam.fun/earn/listing/bare",
      },
    ]);
    const markdown = renderDiscrepancies({
      generatedAt: now.toISOString(),
      sources: { agentApi: "live", publicFeed: "live" },
      discrepancies: gaps,
    });
    expect(markdown).toContain("unknown");
    expect(markdown).toContain("https://github.com/SuperteamDAO/earn/issues/1456");
    expect(markdown).not.toContain("recorded agent fixture");
  });

  it("sorts by deadline and then reward", () => {
    const gaps = findDiscrepancies(
      [],
      [
        { ...openRow, slug: "later", deadline: "2026-12-01T00:00:00.000Z", rewardAmount: 1 },
        { ...openRow, slug: "sooner-small", deadline: "2026-11-01T00:00:00.000Z", rewardAmount: 10 },
        { ...openRow, slug: "sooner-large", deadline: "2026-11-01T00:00:00.000Z", rewardAmount: 90 },
      ],
      now,
    );
    expect(gaps.map((gap) => gap.slug)).toEqual(["sooner-large", "sooner-small", "later"]);
  });
});

describe("loadFeedReport discrepancies", () => {
  it("uses the fixture agent set offline, including enveloped payloads", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("network should not be used");
    };
    const agent = await loadFixture("agent");
    const publicFeed = await loadFixture("publicFeed");
    const report = await loadFeedReport({
      offline: true,
      now,
      fetchImpl,
      agentFixture: { listings: agent },
      publicFixture: { listings: publicFeed },
    });
    expect(report.discrepancies.map((gap) => gap.slug)).toEqual([
      "twitter-post-about-nft-locks-on-streamflow",
    ]);
    const markdown = renderDiscrepancies({
      generatedAt: report.feed.generatedAt,
      sources: report.feed.sources,
      discrepancies: report.discrepancies,
    });
    expect(markdown).toContain("recorded agent fixture");
    expect(markdown).toContain("twitter-post-about-nft-locks-on-streamflow");
    expect(markdown).not.toContain("sample-fields-omitted");
    expect(markdown).not.toContain("sample-human-only");
  });

  it("respects --type and drops the bounty-only fixture gap for projects", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("network should not be used");
    };
    const report = await loadFeedReport({
      offline: true,
      now,
      fetchImpl,
      type: "project",
    });
    expect(report.discrepancies).toEqual([]);
    expect(report.feed.listings.every((listing) => listing.type === "project")).toBe(true);
  });

  it("compares live payloads without printing the API key", async () => {
    const secret = "test-key-not-a-secret";
    const agent = await loadFixture("agent");
    const publicFeed = await loadFixture("publicFeed");
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes("/api/agents/")) {
        return jsonResponse(agent);
      }
      return jsonResponse(publicFeed);
    };
    const report = await loadFeedReport({ apiKey: secret, now, fetchImpl, take: 100 });
    expect(report.feed.sources).toEqual({ agentApi: "live", publicFeed: "live" });
    expect(report.discrepancies.map((gap) => gap.slug)).toEqual([
      "twitter-post-about-nft-locks-on-streamflow",
    ]);
    expect(JSON.stringify(report)).not.toContain(secret);
  });
});
