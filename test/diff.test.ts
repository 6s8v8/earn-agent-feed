import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEADLINE_WITHIN_72H_MS,
  diffListings,
  isDeadlineWithin72h,
  renderDiff,
} from "../src/diff.js";
import { readSnapshot, writeSnapshot } from "../src/snapshot.js";
import { DISCLAIMER, type FeedFile, type Listing } from "../src/schema.js";

const generatedAt = "2026-10-30T00:00:00.000Z";
const now = new Date(generatedAt);

function listing(overrides: Partial<Listing> = {}): Listing {
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

function feed(listings: Listing[], at = generatedAt): FeedFile {
  return {
    schemaVersion: 1,
    generatedAt: at,
    disclaimer: DISCLAIMER,
    sources: { agentApi: "fixture", publicFeed: "fixture" },
    warnings: [],
    skipped: 0,
    listings,
  };
}

function section(markdown: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start < 0) {
    throw new Error(`missing heading ${marker}`);
  }
  const rest = markdown.slice(start);
  const next = rest.indexOf("\n## ", marker.length);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("isDeadlineWithin72h", () => {
  it("includes overdue rows and rows strictly inside the window", () => {
    expect(isDeadlineWithin72h("2026-10-29T00:00:00.000Z", now)).toBe(true);
    const inside = new Date(now.getTime() + DEADLINE_WITHIN_72H_MS - 1).toISOString();
    const edge = new Date(now.getTime() + DEADLINE_WITHIN_72H_MS).toISOString();
    expect(isDeadlineWithin72h(inside, now)).toBe(true);
    expect(isDeadlineWithin72h(edge, now)).toBe(false);
    expect(isDeadlineWithin72h("2026-12-01T00:00:00.000Z", now)).toBe(false);
    expect(isDeadlineWithin72h("not-a-date", now)).toBe(false);
  });
});

describe("diffListings", () => {
  it("treats a missing snapshot as a baseline and still flags deadline < 72h", () => {
    const edge = new Date(now.getTime() + DEADLINE_WITHIN_72H_MS).toISOString();
    const inside = new Date(now.getTime() + DEADLINE_WITHIN_72H_MS - 1).toISOString();
    const report = diffListings(
      null,
      feed([
        listing({ slug: "edge", title: "Edge", deadline: edge, url: "https://superteam.fun/earn/listing/edge" }),
        listing({
          slug: "inside",
          title: "Inside",
          deadline: inside,
          url: "https://superteam.fun/earn/listing/inside",
        }),
        listing({
          slug: "overdue",
          title: "Overdue",
          deadline: "2026-10-29T00:00:00.000Z",
          url: "https://superteam.fun/earn/listing/overdue",
        }),
        listing({ slug: "later", title: "Later", deadline: "2026-12-01T00:00:00.000Z" }),
      ]),
      now,
    );
    expect(report.baseline).toBe(true);
    expect(report.comparedTo).toBeNull();
    expect(report.snapshotError).toBeNull();
    expect(report.new).toEqual([]);
    expect(report.changed).toEqual([]);
    expect(report.closed).toEqual([]);
    expect(report.deadlineWithin72h.map((item) => item.slug)).toEqual(["overdue", "inside"]);

    const markdown = renderDiff(report);
    expect(markdown).toContain(DISCLAIMER);
    expect(markdown).toContain(
      "Previous snapshot: none. This fetch is the baseline written to snapshot.json.",
    );
    expect(section(markdown, "New (0)")).toContain("None.");
    expect(section(markdown, "Deadline within 72 hours (2)")).toContain("overdue");
    expect(section(markdown, "Deadline within 72 hours (2)")).not.toContain("later");
  });

  it("reports new, deadline or reward changes, and closed slugs", () => {
    const previous = feed(
      [
        listing({
          slug: "shared",
          title: "Shared bounty",
          deadline: "2026-12-01T00:00:00.000Z",
          reward: { amount: 500, token: "USDC" },
          url: "https://superteam.fun/earn/listing/shared",
        }),
        listing({
          slug: "same",
          title: "Old title",
          sponsor: "Old sponsor",
          skills: ["Content"],
          deadline: "2026-12-15T00:00:00.000Z",
          reward: { amount: 10, token: "USDC" },
          url: "https://superteam.fun/earn/listing/same",
        }),
        listing({
          slug: "gone-small",
          title: "Gone small",
          deadline: "2026-11-02T00:00:00.000Z",
          reward: { amount: 20, token: "USDC" },
          url: "https://superteam.fun/earn/listing/gone-small",
        }),
        listing({
          slug: "gone-large",
          title: "Gone large",
          deadline: "2026-11-02T00:00:00.000Z",
          reward: { amount: 90, token: "USDC" },
          url: "https://superteam.fun/earn/listing/gone-large",
        }),
      ],
      "2026-10-29T00:00:00.000Z",
    );
    const current = feed([
      listing({
        slug: "shared",
        title: "Shared bounty",
        deadline: "2026-12-03T00:00:00.000Z",
        reward: { amount: 800, token: "USDC" },
        url: "https://superteam.fun/earn/listing/shared",
      }),
      listing({
        slug: "same",
        title: "New title",
        sponsor: "New sponsor",
        skills: ["Writing"],
        deadline: "2026-12-15T00:00:00.000+00:00",
        reward: { amount: 10, token: "USDC" },
        url: "https://superteam.fun/earn/listing/same",
      }),
      listing({
        slug: "fresh-small",
        title: "Fresh small",
        deadline: "2026-10-30T12:00:00.000Z",
        reward: { amount: 5, token: "USDC" },
        url: "https://superteam.fun/earn/listing/fresh-small",
      }),
      listing({
        slug: "fresh-large",
        title: "Fresh large",
        deadline: "2026-10-30T12:00:00.000Z",
        reward: { amount: 50, token: "USDC" },
        url: "https://superteam.fun/earn/listing/fresh-large",
      }),
      listing({
        slug: "token-only",
        title: "Token only",
        deadline: "2026-12-20T00:00:00.000Z",
        reward: { amount: 15, token: "USDG" },
        url: "https://superteam.fun/earn/listing/token-only",
      }),
    ]);
    const previousWithToken = feed(
      [
        ...previous.listings,
        listing({
          slug: "token-only",
          title: "Token only",
          deadline: "2026-12-20T00:00:00.000Z",
          reward: { amount: 15, token: "USDC" },
          url: "https://superteam.fun/earn/listing/token-only",
        }),
      ],
      previous.generatedAt,
    );

    const report = diffListings(previousWithToken, current, now);
    expect(report.baseline).toBe(false);
    expect(report.comparedTo).toBe("2026-10-29T00:00:00.000Z");
    expect(report.new.map((item) => item.slug)).toEqual(["fresh-large", "fresh-small"]);
    expect(report.closed.map((item) => item.slug)).toEqual(["gone-large", "gone-small"]);
    expect(report.changed.map((item) => item.slug)).toEqual(["shared", "token-only"]);
    const shared = report.changed.find((item) => item.slug === "shared");
    expect(shared).toMatchObject({
      deadlineChanged: true,
      rewardChanged: true,
      previousDeadline: "2026-12-01T00:00:00.000Z",
      currentDeadline: "2026-12-03T00:00:00.000Z",
      previousReward: { amount: 500, token: "USDC" },
      currentReward: { amount: 800, token: "USDC" },
    });
    const tokenOnly = report.changed.find((item) => item.slug === "token-only");
    expect(tokenOnly).toMatchObject({ deadlineChanged: false, rewardChanged: true });
    expect(report.deadlineWithin72h.map((item) => item.slug)).toEqual([
      "fresh-large",
      "fresh-small",
    ]);

    const markdown = renderDiff(report);
    expect(markdown).toContain("Previous snapshot: 2026-10-29T00:00:00.000Z");
    expect(section(markdown, "Changed (2)")).toContain(
      "2026-12-01T00:00:00.000Z -> 2026-12-03T00:00:00.000Z",
    );
    expect(section(markdown, "Changed (2)")).toContain("500 USDC -> 800 USDC");
    expect(section(markdown, "Changed (2)")).toContain("deadline, reward");
    expect(section(markdown, "Changed (2)")).toContain("15 USDC -> 15 USDG");
    expect(section(markdown, "Changed (2)")).toContain("| reward |");
    expect(section(markdown, "New (2)")).toContain("fresh-large");
    expect(section(markdown, "New (2)")).not.toContain("same");
    expect(section(markdown, "Closed (2)")).toContain("gone-large");
    expect(section(markdown, "Closed (2)")).not.toContain("shared");
  });

  it("ignores an unreadable snapshot and records a new baseline", () => {
    const previous = feed(
      [listing({ slug: "gone", title: "Gone", url: "https://superteam.fun/earn/listing/gone" })],
      "2026-10-29T00:00:00.000Z",
    );
    const current = feed([listing({ slug: "kept", title: "Kept" })]);
    const report = diffListings(previous, current, now, {
      snapshotError: "snapshot.json is not valid JSON",
    });
    expect(report.baseline).toBe(true);
    expect(report.comparedTo).toBeNull();
    expect(report.new).toEqual([]);
    expect(report.closed).toEqual([]);
    expect(renderDiff(report)).toContain(
      "Previous snapshot: unreadable (snapshot.json is not valid JSON). This fetch is the baseline written to snapshot.json.",
    );
  });
});

describe("snapshot.json", () => {
  it("round-trips a feed and rejects a file that is not a feed", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "earn-snapshot-"));
    expect((await readSnapshot(dir)).status).toBe("missing");

    await writeFile(path.join(dir, "snapshot.json"), "[]\n", "utf8");
    const invalid = await readSnapshot(dir);
    expect(invalid).toEqual({
      status: "invalid",
      message: "snapshot.json does not match the listings feed schema",
    });

    await writeFile(path.join(dir, "snapshot.json"), "{", "utf8");
    const broken = await readSnapshot(dir);
    expect(broken).toEqual({
      status: "invalid",
      message: "snapshot.json is not valid JSON",
    });

    const original = feed([listing()]);
    await writeSnapshot(dir, original);
    const loaded = await readSnapshot(dir);
    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") {
      expect(loaded.feed).toEqual(original);
    }
    const text = await readFile(path.join(dir, "snapshot.json"), "utf8");
    expect(text.endsWith("\n")).toBe(true);
  });
});
