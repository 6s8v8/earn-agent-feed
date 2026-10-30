import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runCli } from "../src/cli.js";
import { PACKAGE_VERSION } from "../src/constants.js";
import { DiscrepancyFileSchema } from "../src/discrepancies.js";
import { DiffReportSchema } from "../src/diff.js";
import { FeedFileSchema, type Listing } from "../src/schema.js";

const now = new Date("2026-10-30T00:00:00.000Z");

describe("earn-watch fetch", () => {
  it("writes listings.json and shortlist.md from fixtures without a network call", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "earn-feed-"));
    const logs: string[] = [];
    const code = await runCli(["fetch", "--out", out, "--offline"], {
      stdout: (message) => logs.push(message),
      stderr: (message) => logs.push(message),
      env: {},
      now,
      fetchImpl: async () => {
        throw new Error("network should not be used");
      },
    });
    expect(code).toBe(0);
    const json = JSON.parse(await readFile(path.join(out, "listings.json"), "utf8")) as unknown;
    const feed = FeedFileSchema.parse(json);
    expect(feed.listings.length).toBeGreaterThan(0);
    expect(feed.sources).toEqual({ agentApi: "fixture", publicFeed: "fixture" });
    const markdown = await readFile(path.join(out, "shortlist.md"), "utf8");
    expect(markdown).toContain("Not affiliated with Superteam");
    expect(markdown).toContain("twitter-post-about-nft-locks-on-streamflow");
    expect(logs.join("\n")).toContain("agent API: fixture");
    expect(JSON.stringify(json)).not.toContain("EARN_AGENT_API_KEY");
  });

  it("fails closed when --out is missing and when --take is invalid", async () => {
    const errors: string[] = [];
    const missing = await runCli(["fetch"], {
      stderr: (message) => errors.push(message),
      env: {},
    });
    expect(missing).toBe(1);
    expect(errors.join("\n")).toMatch(/--out/);

    const badTake = await runCli(["fetch", "--out", "feed", "--take", "0"], {
      stderr: (message) => errors.push(message),
      env: {},
    });
    expect(badTake).toBe(1);
    expect(errors.join("\n")).toMatch(/--take/);
  });

  it("does not print an API key that was present in the environment", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "earn-feed-"));
    const secret = "test-key-not-a-secret";
    const logs: string[] = [];
    const code = await runCli(["fetch", "--out", out, "--offline"], {
      stdout: (message) => logs.push(message),
      stderr: (message) => logs.push(message),
      env: { EARN_AGENT_API_KEY: secret },
      now,
      fetchImpl: async () => {
        throw new Error("network should not be used");
      },
    });
    expect(code).toBe(0);
    const json = await readFile(path.join(out, "listings.json"), "utf8");
    const markdown = await readFile(path.join(out, "shortlist.md"), "utf8");
    expect(json).not.toContain(secret);
    expect(markdown).not.toContain(secret);
    expect(logs.join("\n")).not.toContain(secret);
    for (const name of [
      "feed.xml",
      "discrepancies.md",
      "discrepancies.json",
      "diff.md",
      "diff.json",
      "snapshot.json",
    ]) {
      const text = await readFile(path.join(out, name), "utf8");
      expect(text).not.toContain(secret);
    }
  });

  it("prints 0.2.0", async () => {
    const logs: string[] = [];
    const code = await runCli(["--version"], {
      stdout: (message) => logs.push(message),
      env: {},
    });
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain(PACKAGE_VERSION);
    expect(PACKAGE_VERSION).toBe("0.2.0");
  });
});

describe("earn-watch fetch M1 outputs", () => {
  const offlineFetch = async () => {
    throw new Error("network should not be used");
  };

  it("writes RSS, discrepancies, a baseline diff, and snapshot.json offline", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "earn-m1-"));
    const logs: string[] = [];
    const code = await runCli(["fetch", "--out", out, "--offline"], {
      stdout: (message) => logs.push(message),
      stderr: (message) => logs.push(message),
      env: {},
      now,
      fetchImpl: offlineFetch,
    });
    expect(code).toBe(0);
    const listingsText = await readFile(path.join(out, "listings.json"), "utf8");
    const snapshotText = await readFile(path.join(out, "snapshot.json"), "utf8");
    expect(snapshotText).toBe(listingsText);
    const feed = FeedFileSchema.parse(JSON.parse(listingsText) as unknown);
    expect(feed.schemaVersion).toBe(1);

    const rss = await readFile(path.join(out, "feed.xml"), "utf8");
    expect(rss).toContain(`<rss version="2.0">`);
    expect(rss).toContain("twitter-post-about-nft-locks-on-streamflow");

    const discrepancies = await readFile(path.join(out, "discrepancies.md"), "utf8");
    expect(discrepancies).toContain("twitter-post-about-nft-locks-on-streamflow");
    const discrepancyFile = DiscrepancyFileSchema.parse(
      JSON.parse(await readFile(path.join(out, "discrepancies.json"), "utf8")) as unknown,
    );
    expect(discrepancyFile.schemaVersion).toBe(1);
    expect(discrepancyFile.discrepancies.map((row) => row.slug)).toEqual([
      "twitter-post-about-nft-locks-on-streamflow",
    ]);
    expect(discrepancies).toContain("https://github.com/SuperteamDAO/earn/issues/1456");
    expect(discrepancies).not.toContain("sample-fields-omitted");
    expect(discrepancies).not.toContain("sample-human-only");
    expect(discrepancies).not.toContain("sample-document-agent-discovery-gap");

    const diff = DiffReportSchema.parse(
      JSON.parse(await readFile(path.join(out, "diff.json"), "utf8")) as unknown,
    );
    expect(diff.baseline).toBe(true);
    expect(diff.new).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.closed).toEqual([]);
    expect(diff.deadlineWithin72h.map((listing) => listing.slug)).toEqual([
      "sample-stale-open-listing",
      "twitter-post-about-nft-locks-on-streamflow",
    ]);
    const diffMarkdown = await readFile(path.join(out, "diff.md"), "utf8");
    expect(diffMarkdown).toContain("Previous snapshot: none");
    expect(logs.join("\n")).toContain("diff: new 0, changed 0, closed 0, deadline < 72h 2");
    expect(logs.join("\n")).toContain("discrepancies: 1");
  });

  it("diffs the next fetch against snapshot.json", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "earn-m1-diff-"));
    const io = {
      stdout: () => undefined,
      stderr: () => undefined,
      env: {},
      now,
      fetchImpl: offlineFetch,
    };
    expect(await runCli(["fetch", "--out", out, "--offline"], io)).toBe(0);

    const snapshotPath = path.join(out, "snapshot.json");
    const feed = FeedFileSchema.parse(JSON.parse(await readFile(snapshotPath, "utf8")) as unknown);
    const template = feed.listings.find(
      (listing) => listing.slug === "sample-agent-only-integration-notes",
    );
    expect(template).toBeDefined();
    if (!template) {
      return;
    }
    const rewritten = feed.listings
      .filter((listing) => listing.slug !== "sample-stale-open-listing")
      .map((listing) =>
        listing.slug === template.slug
          ? { ...listing, reward: { amount: 1, token: "USDC" } }
          : listing,
      );
    const extra: Listing = {
      ...template,
      slug: "gone-listing",
      title: "Gone listing",
      url: "https://superteam.fun/earn/listing/gone-listing",
    };
    await writeFile(
      snapshotPath,
      `${JSON.stringify({ ...feed, listings: [...rewritten, extra] }, null, 2)}\n`,
      "utf8",
    );

    expect(await runCli(["fetch", "--out", out, "--offline"], io)).toBe(0);
    const diff = DiffReportSchema.parse(
      JSON.parse(await readFile(path.join(out, "diff.json"), "utf8")) as unknown,
    );
    expect(diff.baseline).toBe(false);
    expect(diff.comparedTo).toBe(now.toISOString());
    expect(diff.new.map((listing) => listing.slug)).toEqual(["sample-stale-open-listing"]);
    expect(diff.closed.map((listing) => listing.slug)).toEqual(["gone-listing"]);
    expect(diff.changed.map((change) => change.slug)).toEqual([
      "sample-agent-only-integration-notes",
    ]);
    expect(diff.changed[0]).toMatchObject({
      deadlineChanged: false,
      rewardChanged: true,
      previousReward: { amount: 1, token: "USDC" },
      currentReward: { amount: 2000, token: "USDC" },
    });
    const markdown = await readFile(path.join(out, "diff.md"), "utf8");
    expect(markdown).toContain("1 USDC -> 2000 USDC");
    expect(markdown).toContain("sample-stale-open-listing");
    expect(markdown).toContain("gone-listing");
  });

  it("keeps fetching when snapshot.json cannot be parsed", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "earn-m1-bad-snapshot-"));
    await writeFile(path.join(out, "snapshot.json"), "[]\n", "utf8");
    const errors: string[] = [];
    const code = await runCli(["fetch", "--out", out, "--offline"], {
      stdout: () => undefined,
      stderr: (message) => errors.push(message),
      env: {},
      now,
      fetchImpl: offlineFetch,
    });
    expect(code).toBe(0);
    expect(errors.join("\n")).toContain(
      "Ignoring snapshot.json: snapshot.json does not match the listings feed schema",
    );
    const diff = DiffReportSchema.parse(
      JSON.parse(await readFile(path.join(out, "diff.json"), "utf8")) as unknown,
    );
    expect(diff.baseline).toBe(true);
    expect(diff.snapshotError).toBe("snapshot.json does not match the listings feed schema");
    const snapshot = FeedFileSchema.parse(
      JSON.parse(await readFile(path.join(out, "snapshot.json"), "utf8")) as unknown,
    );
    expect(snapshot.listings.length).toBeGreaterThan(0);
  });
});
