import { PACKAGE_VERSION } from "./constants.js";
import { compareListings } from "./merge.js";
import { formatReward } from "./render.js";
import type { FeedFile, Listing } from "./schema.js";

function stripXmlIncompatible(value: string): string {
  let cleaned = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    const illegal =
      code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f);
    if (!illegal) {
      cleaned += char;
    }
  }
  return cleaned;
}

function escapeXml(value: string): string {
  return stripXmlIncompatible(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(iso: string): string {
  return new Date(iso).toUTCString();
}

function channelDescription(feed: FeedFile): string {
  const warnings = feed.warnings.length > 0 ? ` ${feed.warnings.join(" ")}` : "";
  return `${feed.disclaimer} Sources: agent API ${feed.sources.agentApi}, public feed ${feed.sources.publicFeed}.${warnings}`;
}

function itemDescription(listing: Listing): string {
  const access = listing.agentAccess ?? "unspecified";
  const status = listing.status ?? "unspecified";
  const skills = listing.skills.length > 0 ? listing.skills.join(", ") : "none";
  return `${formatReward(listing.reward)}. Deadline ${listing.deadline}. Sponsor ${listing.sponsor}. Type ${listing.type}. Access ${access}. Status ${status}. Skills ${skills}.`;
}

/** RSS 2.0 feed. Item order matches the shortlist: soonest deadline first. */
export function renderRss(feed: FeedFile): string {
  const listings = [...feed.listings].sort(compareListings);
  const items = listings.map((listing) => {
    const link = escapeXml(listing.url);
    return [
      "    <item>",
      `      <title>${escapeXml(listing.title)}</title>`,
      `      <link>${link}</link>`,
      `      <guid isPermaLink="true">${link}</guid>`,
      `      <pubDate>${escapeXml(rfc822(feed.generatedAt))}</pubDate>`,
      `      <category>${escapeXml(listing.type)}</category>`,
      `      <description>${escapeXml(itemDescription(listing))}</description>`,
      "    </item>",
    ].join("\n");
  });

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0">`,
    `  <channel>`,
    `    <title>Agent-eligible Superteam Earn listings</title>`,
    `    <link>https://earn.superteam.fun</link>`,
    `    <description>${escapeXml(channelDescription(feed))}</description>`,
    `    <lastBuildDate>${escapeXml(rfc822(feed.generatedAt))}</lastBuildDate>`,
    `    <generator>earn-agent-feed/${PACKAGE_VERSION}</generator>`,
    ...items,
    `  </channel>`,
    `</rss>`,
    ``,
  ];
  return lines.join("\n");
}
