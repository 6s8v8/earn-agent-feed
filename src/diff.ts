import { z } from "zod";

import { compareListings } from "./merge.js";
import { formatReward, markdownTable } from "./render.js";
import {
  DISCLAIMER,
  ListingSchema,
  RewardSchema,
  type FeedFile,
  type Listing,
  type Reward,
} from "./schema.js";

/** Remaining time strictly under this window is reported as deadline < 72h. */
export const DEADLINE_WITHIN_72H_MS = 72 * 60 * 60 * 1000;

export const DIFF_SCHEMA_VERSION = 1 as const;

export const ListingChangeSchema = z
  .object({
    slug: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url(),
    deadlineChanged: z.boolean(),
    rewardChanged: z.boolean(),
    previousDeadline: z.string().datetime({ offset: true }),
    currentDeadline: z.string().datetime({ offset: true }),
    previousReward: RewardSchema,
    currentReward: RewardSchema,
  })
  .strict();

export const DiffReportSchema = z
  .object({
    schemaVersion: z.literal(DIFF_SCHEMA_VERSION),
    generatedAt: z.string().datetime({ offset: true }),
    comparedTo: z.string().datetime({ offset: true }).nullable(),
    baseline: z.boolean(),
    snapshotError: z.string().min(1).nullable(),
    new: z.array(ListingSchema),
    changed: z.array(ListingChangeSchema),
    closed: z.array(ListingSchema),
    deadlineWithin72h: z.array(ListingSchema),
  })
  .strict();

export type ListingChange = z.infer<typeof ListingChangeSchema>;
export type DiffReport = z.infer<typeof DiffReportSchema>;

export function isDeadlineWithin72h(deadline: string, now: Date): boolean {
  const at = Date.parse(deadline);
  if (Number.isNaN(at)) {
    return false;
  }
  return at - now.getTime() < DEADLINE_WITHIN_72H_MS;
}

function indexBySlug(listings: Listing[]): Map<string, Listing> {
  const map = new Map<string, Listing>();
  for (const listing of listings) {
    if (!map.has(listing.slug)) {
      map.set(listing.slug, listing);
    }
  }
  return map;
}

function deadlinesDiffer(previous: string, current: string): boolean {
  const previousAt = Date.parse(previous);
  const currentAt = Date.parse(current);
  if (Number.isNaN(previousAt) || Number.isNaN(currentAt)) {
    return previous !== current;
  }
  return previousAt !== currentAt;
}

function rewardsDiffer(previous: Reward, current: Reward): boolean {
  return previous.amount !== current.amount || previous.token !== current.token;
}

function byListingOrder(listings: Listing[]): Listing[] {
  return [...listings].sort(compareListings);
}

function sortChanges(changes: ListingChange[]): ListingChange[] {
  return [...changes].sort((a, b) => {
    const deadlineDelta = Date.parse(a.currentDeadline) - Date.parse(b.currentDeadline);
    if (deadlineDelta !== 0) {
      return deadlineDelta;
    }
    if (a.currentReward.amount !== b.currentReward.amount) {
      return b.currentReward.amount - a.currentReward.amount;
    }
    return a.slug.localeCompare(b.slug);
  });
}

export interface DiffOptions {
  /** Set when snapshot.json existed but could not be used. Forces a baseline. */
  snapshotError?: string | null;
}

/**
 * Compare the current feed to the previous snapshot.
 * A missing or unreadable snapshot is a baseline: new, changed, and closed
 * stay empty, and deadline < 72h is still computed from the current feed.
 * Changed means deadline or reward (amount or token) differs.
 */
export function diffListings(
  previous: FeedFile | null,
  current: FeedFile,
  now: Date,
  options: DiffOptions = {},
): DiffReport {
  const snapshotError = options.snapshotError ?? null;
  const prior = snapshotError ? null : previous;
  const currentBySlug = indexBySlug(current.listings);
  const added: Listing[] = [];
  const changed: ListingChange[] = [];
  const removed: Listing[] = [];

  if (prior) {
    const previousBySlug = indexBySlug(prior.listings);
    for (const listing of currentBySlug.values()) {
      const previousListing = previousBySlug.get(listing.slug);
      if (!previousListing) {
        added.push(listing);
        continue;
      }
      const deadlineChanged = deadlinesDiffer(previousListing.deadline, listing.deadline);
      const rewardChanged = rewardsDiffer(previousListing.reward, listing.reward);
      if (deadlineChanged || rewardChanged) {
        changed.push({
          slug: listing.slug,
          title: listing.title,
          url: listing.url,
          deadlineChanged,
          rewardChanged,
          previousDeadline: previousListing.deadline,
          currentDeadline: listing.deadline,
          previousReward: previousListing.reward,
          currentReward: listing.reward,
        });
      }
    }
    for (const listing of previousBySlug.values()) {
      if (!currentBySlug.has(listing.slug)) {
        removed.push(listing);
      }
    }
  }

  return DiffReportSchema.parse({
    schemaVersion: DIFF_SCHEMA_VERSION,
    generatedAt: current.generatedAt,
    comparedTo: prior?.generatedAt ?? null,
    baseline: prior === null,
    snapshotError,
    new: byListingOrder(added),
    changed: sortChanges(changed),
    closed: byListingOrder(removed),
    deadlineWithin72h: byListingOrder(
      [...currentBySlug.values()].filter((listing) =>
        isDeadlineWithin72h(listing.deadline, now),
      ),
    ),
  });
}

function previousLine(report: DiffReport): string {
  if (report.snapshotError) {
    return `Previous snapshot: unreadable (${report.snapshotError}). This fetch is the baseline written to snapshot.json.`;
  }
  if (report.baseline || report.comparedTo === null) {
    return "Previous snapshot: none. This fetch is the baseline written to snapshot.json.";
  }
  return `Previous snapshot: ${report.comparedTo}`;
}

function listingRows(listings: Listing[]): string[][] {
  return listings.map((listing) => [
    listing.deadline,
    formatReward(listing.reward),
    listing.title,
    listing.url,
  ]);
}

function listingSection(title: string, intro: string, listings: Listing[]): string[] {
  const lines = [`## ${title} (${listings.length})`, "", intro, ""];
  if (listings.length === 0) {
    lines.push("None.", "");
    return lines;
  }
  lines.push(
    ...markdownTable(["Deadline (UTC)", "Reward", "Title", "URL"], listingRows(listings)),
    "",
  );
  return lines;
}

function changedFields(change: ListingChange): string {
  const fields: string[] = [];
  if (change.deadlineChanged) {
    fields.push("deadline");
  }
  if (change.rewardChanged) {
    fields.push("reward");
  }
  return fields.join(", ");
}

function transition(changed: boolean, previous: string, current: string): string {
  if (!changed) {
    return current;
  }
  return `${previous} -> ${current}`;
}

function changedSection(changes: ListingChange[]): string[] {
  const lines = [
    `## Changed (${changes.length})`,
    "",
    "Deadline or reward differs from the previous snapshot. Title, sponsor, and skills edits are omitted.",
    "",
  ];
  if (changes.length === 0) {
    lines.push("None.", "");
    return lines;
  }
  lines.push(
    ...markdownTable(
      ["Slug", "Title", "Deadline", "Reward", "Changed", "URL"],
      changes.map((change) => [
        change.slug,
        change.title,
        transition(change.deadlineChanged, change.previousDeadline, change.currentDeadline),
        transition(
          change.rewardChanged,
          formatReward(change.previousReward),
          formatReward(change.currentReward),
        ),
        changedFields(change),
        change.url,
      ]),
    ),
    "",
  );
  return lines;
}

export function renderDiff(report: DiffReport): string {
  const lines = [
    "# Listing diff",
    "",
    DISCLAIMER,
    "",
    `Generated: ${report.generatedAt}`,
    previousLine(report),
    "",
    "New, changed, and closed compare this fetch with the previous snapshot. A listing can also appear under deadline within 72 hours.",
    "Deadline within 72 hours means the deadline is strictly less than 72 hours after this fetch, including deadlines that have already passed.",
    "",
    ...listingSection(
      "New",
      "In this fetch, missing from the previous snapshot.",
      report.new,
    ),
    ...changedSection(report.changed),
    ...listingSection(
      "Closed",
      "In the previous snapshot, missing from this fetch.",
      report.closed,
    ),
    ...listingSection(
      "Deadline within 72 hours",
      "Strictly under 72 hours from this fetch, including overdue rows.",
      report.deadlineWithin72h,
    ),
  ];
  return lines.join("\n");
}
