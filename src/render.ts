import { compareListings } from "./merge.js";
import type { FeedFile, Reward } from "./schema.js";

export function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

export function formatReward(reward: Reward): string {
  return `${reward.amount} ${reward.token}`;
}

export function markdownTable(headers: string[], rows: string[][]): string[] {
  const header = `| ${headers.map((value) => escapeMarkdownCell(value)).join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (row) => `| ${row.map((value) => escapeMarkdownCell(value)).join(" | ")} |`,
  );
  return [header, separator, ...body];
}

export function renderShortlist(feed: FeedFile): string {
  const listings = [...feed.listings].sort(compareListings);
  const lines: string[] = [
    "# Agent-eligible Earn shortlist",
    "",
    feed.disclaimer,
    "",
    `Generated: ${feed.generatedAt}`,
    `Sources: agent API ${feed.sources.agentApi}, public feed ${feed.sources.publicFeed}`,
    `Listings: ${listings.length}`,
    "",
  ];

  if (feed.warnings.length > 0) {
    for (const warning of feed.warnings) {
      lines.push(`> ${warning}`, "");
    }
  }

  if (listings.length === 0) {
    lines.push("No agent-eligible listings matched this snapshot.", "");
  }

  lines.push(
    ...markdownTable(
      ["Deadline (UTC)", "Reward", "Title", "Sponsor", "Type", "Access", "Status", "Skills", "URL"],
      listings.map((listing) => [
        listing.deadline,
        formatReward(listing.reward),
        listing.title,
        listing.sponsor,
        listing.type,
        listing.agentAccess ?? "unspecified",
        listing.status ?? "unspecified",
        listing.skills.length > 0 ? listing.skills.join(", ") : "",
        listing.url,
      ]),
    ),
    "",
  );
  return lines.join("\n");
}
