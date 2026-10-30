import { describe, expect, it } from "vitest";

import { mergeListings } from "../src/merge.js";
import { renderShortlist } from "../src/render.js";
import { DISCLAIMER, type Listing } from "../src/schema.js";

const fetchedAt = "2026-10-30T00:00:00.000Z";

function listing(overrides: Partial<Listing>): Listing {
  return {
    slug: "alpha",
    title: "Alpha",
    type: "bounty",
    sponsor: "Sponsor",
    reward: { amount: 100, token: "USDC" },
    deadline: "2026-12-01T00:00:00.000Z",
    skills: [],
    agentAccess: "AGENT_ALLOWED",
    status: "OPEN",
    url: "https://superteam.fun/earn/listing/alpha",
    fetchedAt,
    ...overrides,
  };
}

describe("mergeListings", () => {
  it("sorts by deadline ascending and then reward descending", () => {
    const merged = mergeListings(
      [
        listing({ slug: "later", deadline: "2026-12-02T00:00:00.000Z", reward: { amount: 1, token: "USDC" } }),
        listing({ slug: "sooner-small", deadline: "2026-12-01T00:00:00.000Z", reward: { amount: 10, token: "USDC" } }),
      ],
      [
        listing({ slug: "sooner-large", deadline: "2026-12-01T00:00:00.000Z", reward: { amount: 90, token: "USDC" } }),
      ],
      "primary",
    );
    expect(merged.map((item) => item.slug)).toEqual([
      "sooner-large",
      "sooner-small",
      "later",
    ]);
  });

  it("prefers the primary record and fills empty skills from the cross-check", () => {
    const merged = mergeListings(
      [
        listing({
          slug: "shared",
          reward: { amount: 500, token: "USDC" },
          sponsor: "Agent Sponsor",
          skills: [],
        }),
      ],
      [
        listing({
          slug: "shared",
          reward: { amount: 999, token: "USDC" },
          sponsor: "Public Sponsor",
          skills: ["Content", "Research"],
        }),
        listing({ slug: "public-only", title: "Only on the public feed" }),
      ],
      "primary",
    );
    const shared = merged.find((item) => item.slug === "shared");
    expect(shared?.reward.amount).toBe(500);
    expect(shared?.sponsor).toBe("Agent Sponsor");
    expect(shared?.skills).toEqual(["Content", "Research"]);
    expect(merged.map((item) => item.slug)).toContain("public-only");
  });

  it("lets the cross-check win when that source is preferred", () => {
    const merged = mergeListings(
      [listing({ slug: "shared", reward: { amount: 500, token: "USDC" }, skills: ["Content"] })],
      [listing({ slug: "shared", reward: { amount: 999, token: "USDC" }, skills: [] })],
      "crossCheck",
    );
    expect(merged[0]?.reward.amount).toBe(999);
    expect(merged[0]?.skills).toEqual(["Content"]);
  });
});

describe("renderShortlist", () => {
  it("escapes table pipes and includes the disclaimer", () => {
    const markdown = renderShortlist({
      schemaVersion: 1,
      generatedAt: fetchedAt,
      disclaimer: DISCLAIMER,
      sources: { agentApi: "fixture", publicFeed: "fixture" },
      warnings: ["Sample warning"],
      skipped: 0,
      listings: [listing({ title: "Design | build", skills: [] })],
    });
    expect(markdown).toContain(DISCLAIMER);
    expect(markdown).toContain("Design \\| build");
    expect(markdown).toContain("> Sample warning");
    expect(markdown).not.toContain("unspecified");
  });

  it("renders an empty snapshot without dropping the table header", () => {
    const markdown = renderShortlist({
      schemaVersion: 1,
      generatedAt: fetchedAt,
      disclaimer: DISCLAIMER,
      sources: { agentApi: "fixture", publicFeed: "live" },
      warnings: [],
      skipped: 0,
      listings: [],
    });
    expect(markdown).toContain("No agent-eligible listings matched this snapshot.");
    expect(markdown).toContain("| Deadline (UTC) | Reward |");
  });
});
