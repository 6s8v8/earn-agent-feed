import { describe, expect, it } from "vitest";

import { renderRss } from "../src/rss.js";
import { DISCLAIMER, type FeedFile, type Listing } from "../src/schema.js";

const generatedAt = "2026-10-30T00:00:00.000Z";

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
    fetchedAt: generatedAt,
    ...overrides,
  };
}

function feed(listings: Listing[]): FeedFile {
  return {
    schemaVersion: 1,
    generatedAt,
    disclaimer: DISCLAIMER,
    sources: { agentApi: "fixture", publicFeed: "fixture" },
    warnings: ["Offline mode."],
    skipped: 0,
    listings,
  };
}

describe("renderRss", () => {
  it("writes RSS 2.0 sorted by deadline and escapes text", () => {
    const xml = renderRss(
      feed([
        listing({
          slug: "later",
          title: "Later & <sooner>",
          deadline: "2026-12-02T00:00:00.000Z",
          url: "https://superteam.fun/earn/listing/later",
        }),
        listing({
          slug: "sooner",
          title: "Sooner",
          deadline: "2026-11-01T00:00:00.000Z",
          reward: { amount: 40, token: "USDC" },
          skills: ["Content", "Research"],
          url: "https://superteam.fun/earn/listing/sooner",
        }),
      ]),
    );
    expect(xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`)).toBe(true);
    expect(xml).toContain(`<rss version="2.0">`);
    expect(xml).toContain("<generator>earn-agent-feed/0.2.0</generator>");
    expect(xml).toContain("<lastBuildDate>Fri, 30 Oct 2026 00:00:00 GMT</lastBuildDate>");
    expect(xml).toContain("Offline mode.");
    expect(xml).toContain(DISCLAIMER);
    expect(xml.indexOf("Sooner")).toBeLessThan(xml.indexOf("Later &amp; &lt;sooner&gt;"));
    expect(xml).not.toContain("Later & <sooner>");
    expect(xml).toContain(
      `<guid isPermaLink="true">https://superteam.fun/earn/listing/sooner</guid>`,
    );
    expect(xml).toContain("40 USDC");
    expect(xml).toContain("Skills Content, Research.");
    expect(xml.endsWith("</rss>\n")).toBe(true);
  });
});
