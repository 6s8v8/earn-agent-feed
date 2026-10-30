import { describe, expect, it } from "vitest";

import { DISCLAIMER, FeedFileSchema, ListingSchema, SCHEMA_VERSION } from "../src/schema.js";

const fetchedAt = "2026-10-30T00:00:00.000Z";

function listing(overrides: Record<string, unknown> = {}) {
  return {
    slug: "sample-bounty",
    title: "Sample bounty",
    type: "bounty",
    sponsor: "Sample Sponsor",
    reward: { amount: 100, token: "USDC" },
    deadline: "2026-12-01T00:00:00.000Z",
    skills: ["Content"],
    agentAccess: "AGENT_ALLOWED",
    status: "OPEN",
    url: "https://superteam.fun/earn/listing/sample-bounty",
    fetchedAt,
    ...overrides,
  };
}

describe("ListingSchema", () => {
  it("accepts a complete listing", () => {
    expect(ListingSchema.parse(listing())).toMatchObject({
      slug: "sample-bounty",
      reward: { amount: 100, token: "USDC" },
    });
  });

  it("allows null access and status when the source omitted them", () => {
    const parsed = ListingSchema.parse(
      listing({ agentAccess: null, status: null, skills: [] }),
    );
    expect(parsed.agentAccess).toBeNull();
    expect(parsed.status).toBeNull();
  });

  it("rejects a negative reward and an extra field", () => {
    expect(() => ListingSchema.parse(listing({ reward: { amount: -1, token: "USDC" } }))).toThrow();
    expect(() => ListingSchema.parse(listing({ id: "nope" }))).toThrow();
  });
});

describe("FeedFileSchema", () => {
  it("requires schema version 1", () => {
    const feed = FeedFileSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      generatedAt: fetchedAt,
      disclaimer: DISCLAIMER,
      sources: { agentApi: "fixture", publicFeed: "fixture" },
      warnings: [],
      skipped: 0,
      listings: [listing()],
    });
    expect(feed.schemaVersion).toBe(1);
    expect(feed.listings).toHaveLength(1);
  });
});
