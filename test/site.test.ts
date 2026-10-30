import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runCli } from "../src/cli.js";
import { buildDiscrepancyFile, type Discrepancy } from "../src/discrepancies.js";
import { diffListings } from "../src/diff.js";
import { renderShortlist } from "../src/render.js";
import { renderRss } from "../src/rss.js";
import { DISCLAIMER, FeedFileSchema, type FeedFile, type Listing } from "../src/schema.js";
import { renderSite, writeSite } from "../src/site.js";

const originalFetch = globalThis.fetch;
const generatedAt = "2026-10-30T00:00:00.000Z";
const now = new Date(generatedAt);

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

function feed(listings: Listing[], at = generatedAt): FeedFile {
  return {
    schemaVersion: 1,
    generatedAt: at,
    disclaimer: DISCLAIMER,
    sources: { agentApi: "fixture", publicFeed: "fixture" },
    warnings: ["Offline mode: recorded fixtures only."],
    skipped: 0,
    listings,
  };
}

const sooner = listing({
  slug: "sooner",
  title: "Sooner",
  deadline: "2026-11-01T00:00:00.000Z",
  reward: { amount: 40, token: "USDC" },
  skills: ["Content", "Research"],
  url: "https://superteam.fun/earn/listing/sooner",
});

const later = listing({
  slug: "later",
  title: `Later & <script>alert("x")</script>`,
  deadline: "2026-12-02T00:00:00.000Z",
  url: "https://superteam.fun/earn/listing/later",
});

function gapDiscrepancy(): Discrepancy {
  return {
    slug: later.slug,
    title: later.title,
    type: later.type,
    sponsor: later.sponsor,
    reward: later.reward,
    deadline: later.deadline,
    agentAccess: "AGENT_ALLOWED",
    status: "OPEN",
    url: later.url,
  };
}

describe("renderSite", () => {
  it("builds both pages from feed.xml and shortlist.md without a network call", () => {
    globalThis.fetch = (() => {
      throw new Error("network should not be used");
    }) as typeof fetch;
    const secret = "site-secret-should-not-leak";
    const previous = process.env.EARN_AGENT_API_KEY;
    process.env.EARN_AGENT_API_KEY = secret;
    try {
      const current = feed([sooner, later]);
      const previousFeed = feed([sooner], "2026-10-29T00:00:00.000Z");
      const diff = diffListings(previousFeed, current, now);
      const discrepancies = buildDiscrepancyFile({
        generatedAt,
        sources: current.sources,
        discrepancies: [gapDiscrepancy()],
      });
      const input = {
        feedXml: renderRss(current),
        shortlistMarkdown: renderShortlist(current),
        diff,
        discrepancies,
      };
      const first = renderSite(input);
      const second = renderSite(input);
      expect(second).toEqual(first);
      expect(first.opportunities).toBe(2);
      expect(first.opportunitiesNew).toBe(1);
      expect(first.discrepancies).toBe(1);
      expect(first.discrepanciesNew).toBe(1);
      expect(first.indexHtml.indexOf("Sooner")).toBeLessThan(first.indexHtml.indexOf("Later"));
      expect(first.indexHtml).toContain("Content, Research");
      expect(first.indexHtml).toContain("Last updated:");
      expect(first.indexHtml).toContain(generatedAt);
      expect(first.indexHtml).toContain("Fri, 30 Oct 2026 00:00:00 GMT");
      expect(first.indexHtml).toContain("Opportunities marked new since last snapshot: 1");
      expect(first.indexHtml).toContain("href=\"listings.json\"");
      expect(first.indexHtml).toContain("href=\"feed.xml\"");
      expect(first.indexHtml).toContain("Offline mode: recorded fixtures only.");
      expect(first.indexHtml).not.toContain("<script>");
      expect(first.indexHtml).toContain("&lt;script&gt;");
      expect(first.indexHtml).not.toContain(secret);
      expect(first.discrepanciesHtml).toContain(`<strong class="new">New since last snapshot</strong>`);
      expect(first.discrepanciesHtml).toContain("Discrepancies marked new since last snapshot: 1");
      expect(first.discrepanciesHtml).toContain("https://github.com/SuperteamDAO/earn/issues/1456");
      expect(first.discrepanciesHtml).not.toContain("<script>");
      expect(first.discrepanciesHtml).not.toContain(secret);
      const titleAt = first.discrepanciesHtml.indexOf("Later");
      expect(titleAt).toBeGreaterThan(0);
      expect(first.discrepanciesHtml.slice(titleAt, titleAt + 120)).toContain(
        "New since last snapshot",
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (previous === undefined) {
        delete process.env.EARN_AGENT_API_KEY;
      } else {
        process.env.EARN_AGENT_API_KEY = previous;
      }
    }
  });

  it("renders an empty discrepancy dashboard and a baseline with no new badges", () => {
    const current = feed([sooner]);
    const rendered = renderSite({
      feedXml: renderRss(current),
      shortlistMarkdown: renderShortlist(current),
      diff: diffListings(null, current, now),
      discrepancies: buildDiscrepancyFile({
        generatedAt,
        sources: current.sources,
        discrepancies: [],
      }),
    });
    expect(rendered.discrepancies).toBe(0);
    expect(rendered.discrepanciesNew).toBe(0);
    expect(rendered.opportunitiesNew).toBe(0);
    expect(rendered.discrepanciesHtml).toContain(
      "No public-feed discrepancies in this snapshot.",
    );
    expect(rendered.discrepanciesHtml).toContain("This build is a baseline.");
    expect(rendered.discrepanciesHtml).not.toContain(`<strong class="new">`);
    expect(rendered.indexHtml).not.toContain(`<strong class="new">`);
    expect(rendered.indexHtml).toContain(
      "Opportunities marked new since last snapshot: 0. No row in this table is new since the last snapshot.",
    );
  });

  it("states when discrepancies.json and diff.json were not provided", () => {
    const rendered = renderSite({
      feedXml: renderRss(feed([])),
      shortlistMarkdown: renderShortlist(feed([])),
    });
    expect(rendered.opportunities).toBe(0);
    expect(rendered.indexHtml).toContain("No agent-eligible listings in this snapshot.");
    expect(rendered.discrepanciesHtml).toContain("discrepancies.json was not provided.");
    expect(rendered.discrepanciesHtml).toContain("diff.json was not provided. No row is marked new.");
  });
});

describe("writeSite", () => {
  it("writes HTML from the fetch directory and does not call the network", async () => {
    const input = await mkdtemp(path.join(tmpdir(), "earn-site-"));
    const current = feed([sooner, later]);
    await writeFile(path.join(input, "feed.xml"), renderRss(current), "utf8");
    await writeFile(path.join(input, "shortlist.md"), renderShortlist(current), "utf8");
    await writeFile(
      path.join(input, "diff.json"),
      `${JSON.stringify(diffListings(feed([sooner], "2026-10-29T00:00:00.000Z"), current, now), null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(input, "discrepancies.json"),
      `${JSON.stringify(
        buildDiscrepancyFile({
          generatedAt,
          sources: current.sources,
          discrepancies: [gapDiscrepancy()],
        }),
        null,
        2,
      )}\n`,
      "utf8",
    );
    const out = await mkdtemp(path.join(tmpdir(), "earn-site-out-"));
    globalThis.fetch = (() => {
      throw new Error("network should not be used");
    }) as typeof fetch;
    try {
      const written = await writeSite(input, out);
      expect(written.discrepanciesNew).toBe(1);
      const html = await readFile(written.discrepanciesPath, "utf8");
      expect(html).toContain(`<strong class="new">New since last snapshot</strong>`);
      const copied = await readFile(path.join(out, "feed.xml"), "utf8");
      expect(copied).toContain("<rss");
      const shortlist = await readFile(path.join(out, "shortlist.md"), "utf8");
      expect(shortlist).toContain("Sooner");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects an unreadable diff.json", async () => {
    const input = await mkdtemp(path.join(tmpdir(), "earn-site-bad-diff-"));
    await writeFile(path.join(input, "feed.xml"), "<rss></rss>\n", "utf8");
    await writeFile(
      path.join(input, "shortlist.md"),
      renderShortlist(feed([])),
      "utf8",
    );
    await writeFile(path.join(input, "diff.json"), "{}\n", "utf8");
    await expect(writeSite(input, input)).rejects.toThrow(
      "diff.json does not match the diff schema",
    );
  });
});

describe("earn-watch site", () => {
  const offlineFetch = async () => {
    throw new Error("network should not be used");
  };

  it("requires --in", async () => {
    const errors: string[] = [];
    const code = await runCli(["site"], {
      stderr: (message) => errors.push(message),
      env: {},
      fetchImpl: offlineFetch,
    });
    expect(code).toBe(1);
    expect(errors.join("\n")).toMatch(/--in/);
  });

  it("builds the offline fixture site and marks a discrepancy that the next diff calls new", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "earn-site-cli-"));
    const logs: string[] = [];
    const secret = "cli-site-secret-should-not-leak";
    const io = {
      stdout: (message: string) => logs.push(message),
      stderr: (message: string) => logs.push(message),
      env: { EARN_AGENT_API_KEY: secret },
      now,
      fetchImpl: offlineFetch,
    };
    expect(await runCli(["fetch", "--out", out, "--offline"], io)).toBe(0);
    expect(await runCli(["site", "--in", out], io)).toBe(0);
    const index = await readFile(path.join(out, "index.html"), "utf8");
    const dashboard = await readFile(path.join(out, "discrepancies.html"), "utf8");
    expect(index).toContain("twitter-post-about-nft-locks-on-streamflow");
    expect(index).toContain("Offline mode");
    expect(dashboard).toContain("twitter-post-about-nft-locks-on-streamflow");
    expect(dashboard).toContain("This build is a baseline.");
    expect(dashboard).not.toContain(`<strong class="new">`);
    expect(index).not.toContain(secret);
    expect(dashboard).not.toContain(secret);
    expect(logs.join("\n")).not.toContain(secret);

    const snapshotPath = path.join(out, "snapshot.json");
    const snapshot = FeedFileSchema.parse(
      JSON.parse(await readFile(snapshotPath, "utf8")) as unknown,
    );
    await writeFile(
      snapshotPath,
      `${JSON.stringify(
        {
          ...snapshot,
          listings: snapshot.listings.filter(
            (row) => row.slug !== "twitter-post-about-nft-locks-on-streamflow",
          ),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    expect(await runCli(["fetch", "--out", out, "--offline"], io)).toBe(0);
    expect(await runCli(["site", "--in", out], io)).toBe(0);
    const nextDashboard = await readFile(path.join(out, "discrepancies.html"), "utf8");
    const nextIndex = await readFile(path.join(out, "index.html"), "utf8");
    expect(nextDashboard).toContain("Discrepancies marked new since last snapshot: 1");
    expect(nextIndex).toContain("Opportunities marked new since last snapshot: 1");
    const title = "Sample: NFT locks on Streamflow (issue 1456 shape)";
    const titleAt = nextDashboard.indexOf(title);
    expect(titleAt).toBeGreaterThan(0);
    expect(nextDashboard.slice(titleAt, titleAt + title.length + 80)).toContain(
      "New since last snapshot",
    );
    expect(nextDashboard).not.toContain(secret);
  });
});
