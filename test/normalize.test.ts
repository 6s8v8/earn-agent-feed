import { describe, expect, it } from "vitest";

import { flattenSkills, normalizeListing } from "../src/normalize.js";

const now = new Date("2026-10-30T12:00:00.000Z");

describe("flattenSkills", () => {
  it("flattens Earn skill objects and plain strings without duplicates", () => {
    expect(
      flattenSkills([
        { skills: "Content", subskills: ["Research", "Writing"] },
        "Research",
        { skill: "Backend", subskills: ["Typescript"] },
      ]),
    ).toEqual(["Content", "Research", "Writing", "Backend", "Typescript"]);
  });

  it("returns an empty list when skills are absent", () => {
    expect(flattenSkills(undefined)).toEqual([]);
    expect(flattenSkills(null)).toEqual([]);
  });
});

describe("normalizeListing", () => {
  it("maps the public list shape onto the stable schema", () => {
    const listing = normalizeListing(
      {
        slug: "raptorx-research-challenge",
        title: "RaptorX Research Challenge",
        type: "bounty",
        rewardAmount: 125,
        token: "USDC",
        deadline: "2026-11-02T03:59:59.000Z",
        agentAccess: "AGENT_ALLOWED",
        status: "OPEN",
        sponsor: { name: "RaptorX Labs", slug: "raptorxlabs", logo: null },
        skills: [{ skills: "Content", subskills: ["Research"] }],
        _count: { Comments: 1, Submission: 2 },
      },
      now,
    );

    expect(listing).toEqual({
      slug: "raptorx-research-challenge",
      title: "RaptorX Research Challenge",
      type: "bounty",
      sponsor: "RaptorX Labs",
      reward: { amount: 125, token: "USDC" },
      deadline: "2026-11-02T03:59:59.000Z",
      skills: ["Content", "Research"],
      agentAccess: "AGENT_ALLOWED",
      status: "OPEN",
      url: "https://superteam.fun/earn/listing/raptorx-research-challenge",
      fetchedAt: "2026-10-30T12:00:00.000Z",
    });
  });

  it("accepts a string sponsor and an explicit https url", () => {
    const listing = normalizeListing(
      {
        slug: "plain",
        title: "Plain",
        type: "project",
        sponsor: "Plain Sponsor Name",
        reward: { amount: "15", token: "USDG" },
        deadline: "2026-12-05T12:00:00.000Z",
        url: "https://example.test/listing/plain",
      },
      now,
    );
    expect(listing?.sponsor).toBe("Plain Sponsor Name");
    expect(listing?.reward).toEqual({ amount: 15, token: "USDG" });
    expect(listing?.url).toBe("https://example.test/listing/plain");
    expect(listing?.agentAccess).toBeNull();
    expect(listing?.status).toBeNull();
    expect(listing?.skills).toEqual([]);
  });

  it("skips rows that cannot fill the schema", () => {
    expect(normalizeListing({ title: "no slug" }, now)).toBeNull();
    expect(
      normalizeListing(
        {
          slug: "no-reward",
          title: "No reward",
          type: "bounty",
          sponsor: "Sponsor",
          deadline: "2026-12-01T00:00:00.000Z",
        },
        now,
      ),
    ).toBeNull();
  });
});
