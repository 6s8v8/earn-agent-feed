import { z } from "zod";

import { LISTING_URL_PREFIX } from "./constants.js";
import { normalizeListing } from "./normalize.js";
import { formatReward, markdownTable } from "./render.js";
import { DISCLAIMER, RewardSchema, SourceModeSchema, type SourceMode } from "./schema.js";

export const DISCREPANCY_SCHEMA_VERSION = 1 as const;

export const DiscrepancySchema = z
  .object({
    slug: z.string().min(1),
    title: z.string().min(1),
    type: z.string().min(1).nullable(),
    sponsor: z.string().min(1).nullable(),
    reward: RewardSchema.nullable(),
    deadline: z.string().datetime({ offset: true }).nullable(),
    agentAccess: z.enum(["AGENT_ALLOWED", "AGENT_ONLY"]),
    status: z.literal("OPEN"),
    url: z.string().url(),
  })
  .strict();

export const DiscrepancyFileSchema = z
  .object({
    schemaVersion: z.literal(DISCREPANCY_SCHEMA_VERSION),
    generatedAt: z.string().datetime({ offset: true }),
    disclaimer: z.literal(DISCLAIMER),
    sources: z
      .object({
        agentApi: SourceModeSchema,
        publicFeed: SourceModeSchema,
      })
      .strict(),
    discrepancies: z.array(DiscrepancySchema),
  })
  .strict();

export type Discrepancy = z.infer<typeof DiscrepancySchema>;
export type DiscrepancyFile = z.infer<typeof DiscrepancyFileSchema>;

export function buildDiscrepancyFile(input: {
  generatedAt: string;
  sources: { agentApi: SourceMode; publicFeed: SourceMode };
  discrepancies: Discrepancy[];
}): DiscrepancyFile {
  return DiscrepancyFileSchema.parse({
    schemaVersion: DISCREPANCY_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    disclaimer: DISCLAIMER,
    sources: input.sources,
    discrepancies: input.discrepancies,
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readSponsor(record: Record<string, unknown>): string | null {
  const direct = nonEmptyString(record.sponsor);
  if (direct) {
    return direct;
  }
  const sponsor = asRecord(record.sponsor);
  if (sponsor) {
    const name = nonEmptyString(sponsor.name);
    if (name) {
      return name;
    }
  }
  return nonEmptyString(record.sponsorName);
}

function readDeadline(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function readUrl(record: Record<string, unknown>, slug: string): string {
  const explicit = nonEmptyString(record.url);
  if (explicit && /^https:\/\//.test(explicit)) {
    return explicit;
  }
  return `${LISTING_URL_PREFIX}${encodeURIComponent(slug)}`;
}

function collectSlugs(rows: unknown[]): Set<string> {
  const slugs = new Set<string>();
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) {
      continue;
    }
    const slug = nonEmptyString(record.slug);
    if (slug) {
      slugs.add(slug);
    }
  }
  return slugs;
}

/**
 * OPEN + AGENT_ALLOWED/AGENT_ONLY on the public feed, absent from the agent
 * payload. Stricter than the shortlist filter: omitted access or status does
 * not count. A slug present anywhere in the agent payload is not missing,
 * including HUMAN_ONLY and CLOSED rows.
 */
function toDiscrepancy(row: unknown, fetchedAt: Date): Discrepancy | null {
  const record = asRecord(row);
  if (!record) {
    return null;
  }
  const agentAccess = record.agentAccess;
  if (agentAccess !== "AGENT_ALLOWED" && agentAccess !== "AGENT_ONLY") {
    return null;
  }
  if (record.status !== "OPEN") {
    return null;
  }
  const slug = nonEmptyString(record.slug);
  if (!slug) {
    return null;
  }

  const normalized = normalizeListing(row, fetchedAt);
  if (
    normalized &&
    (normalized.agentAccess === "AGENT_ALLOWED" || normalized.agentAccess === "AGENT_ONLY") &&
    normalized.status === "OPEN"
  ) {
    return {
      slug: normalized.slug,
      title: normalized.title,
      type: normalized.type,
      sponsor: normalized.sponsor,
      reward: normalized.reward,
      deadline: normalized.deadline,
      agentAccess,
      status: "OPEN",
      url: normalized.url,
    };
  }

  return {
    slug,
    title: nonEmptyString(record.title) ?? slug,
    type: nonEmptyString(record.type),
    sponsor: readSponsor(record),
    reward: null,
    deadline: readDeadline(record.deadline),
    agentAccess,
    status: "OPEN",
    url: readUrl(record, slug),
  };
}

function compareDiscrepancies(a: Discrepancy, b: Discrepancy): number {
  const aTime = a.deadline ? Date.parse(a.deadline) : Number.POSITIVE_INFINITY;
  const bTime = b.deadline ? Date.parse(b.deadline) : Number.POSITIVE_INFINITY;
  if (aTime !== bTime) {
    return aTime - bTime;
  }
  const aReward = a.reward?.amount ?? Number.NEGATIVE_INFINITY;
  const bReward = b.reward?.amount ?? Number.NEGATIVE_INFINITY;
  if (aReward !== bReward) {
    return bReward - aReward;
  }
  return a.slug.localeCompare(b.slug);
}

export function findDiscrepancies(
  agentRows: unknown[],
  publicRows: unknown[],
  fetchedAt: Date,
): Discrepancy[] {
  const agentSlugs = collectSlugs(agentRows);
  const found: Discrepancy[] = [];
  const seen = new Set<string>();
  for (const row of publicRows) {
    const discrepancy = toDiscrepancy(row, fetchedAt);
    if (!discrepancy || agentSlugs.has(discrepancy.slug) || seen.has(discrepancy.slug)) {
      continue;
    }
    seen.add(discrepancy.slug);
    found.push(discrepancy);
  }
  return found.sort(compareDiscrepancies);
}

function display(value: string | null): string {
  return value && value.length > 0 ? value : "unknown";
}

export function renderDiscrepancies(input: {
  generatedAt: string;
  sources: { agentApi: SourceMode; publicFeed: SourceMode };
  discrepancies: Discrepancy[];
}): string {
  const lines: string[] = [
    "# Public feed discrepancies",
    "",
    DISCLAIMER,
    "",
    `Generated: ${input.generatedAt}`,
    `Sources: agent API ${input.sources.agentApi}, public feed ${input.sources.publicFeed}`,
    "",
    "These rows are OPEN and agent-eligible (`AGENT_ALLOWED` or `AGENT_ONLY`) on the public listings feed, and the slug is missing from the agent source.",
    "The agent source is the live agent endpoint when `EARN_AGENT_API_KEY` is set, and `fixtures/agent-api-live.json` otherwise.",
    "This is the gap reported in SuperteamDAO/earn #1456: https://github.com/SuperteamDAO/earn/issues/1456",
    "",
  ];
  if (input.sources.agentApi === "fixture") {
    lines.push(
      "This run did not call the live agent endpoint. The list is relative to the recorded agent fixture.",
      "",
    );
  }
  lines.push(`## Missing from the agent source (${input.discrepancies.length})`, "");
  if (input.discrepancies.length === 0) {
    lines.push("None.", "");
    return lines.join("\n");
  }
  lines.push(
    ...markdownTable(
      ["Slug", "Deadline (UTC)", "Reward", "Title", "Sponsor", "Type", "Access", "URL"],
      input.discrepancies.map((row) => [
        row.slug,
        display(row.deadline),
        row.reward ? formatReward(row.reward) : "unknown",
        row.title,
        display(row.sponsor),
        display(row.type),
        row.agentAccess,
        row.url,
      ]),
    ),
    "",
  );
  return lines.join("\n");
}
