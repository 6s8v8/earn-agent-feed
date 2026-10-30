import { LISTING_URL_PREFIX } from "./constants.js";
import { ListingSchema, type Listing } from "./schema.js";

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

function readSponsor(raw: Record<string, unknown>): string | null {
  const direct = nonEmptyString(raw.sponsor);
  if (direct) {
    return direct;
  }
  const sponsor = asRecord(raw.sponsor);
  if (sponsor) {
    const name = nonEmptyString(sponsor.name);
    if (name) {
      return name;
    }
  }
  return nonEmptyString(raw.sponsorName);
}

function readReward(
  raw: Record<string, unknown>,
): { amount: number; token: string } | null {
  const reward = asRecord(raw.reward);
  const amountValue = raw.rewardAmount ?? reward?.amount;
  const tokenValue = raw.token ?? reward?.token;
  const amount =
    typeof amountValue === "number"
      ? amountValue
      : typeof amountValue === "string" && amountValue.trim()
        ? Number(amountValue)
        : Number.NaN;
  const token = nonEmptyString(tokenValue);
  if (!Number.isFinite(amount) || amount < 0 || !token) {
    return null;
  }
  return { amount, token };
}

function pushSkill(out: string[], seen: Set<string>, value: string): void {
  const trimmed = value.trim();
  if (!trimmed || seen.has(trimmed)) {
    return;
  }
  seen.add(trimmed);
  out.push(trimmed);
}

/** Flatten Earn `{ skills, subskills }` objects, plain strings, or a mix. */
export function flattenSkills(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === "string") {
      pushSkill(out, seen, item);
      continue;
    }
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    const parent =
      nonEmptyString(record.skills) ??
      nonEmptyString(record.skill) ??
      nonEmptyString(record.name);
    if (parent) {
      pushSkill(out, seen, parent);
    }
    if (Array.isArray(record.subskills)) {
      for (const sub of record.subskills) {
        if (typeof sub === "string") {
          pushSkill(out, seen, sub);
        }
      }
    }
  }
  return out;
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

function readUrl(raw: Record<string, unknown>, slug: string): string {
  const explicit = nonEmptyString(raw.url);
  if (explicit && /^https:\/\//.test(explicit)) {
    return explicit;
  }
  return `${LISTING_URL_PREFIX}${encodeURIComponent(slug)}`;
}

function readEnum(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return nonEmptyString(value);
}

/**
 * Map one raw Earn listing into the stable schema.
 * Returns null when a required field cannot be read.
 */
export function normalizeListing(raw: unknown, fetchedAt: Date): Listing | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const slug = nonEmptyString(record.slug);
  const title = nonEmptyString(record.title);
  const type = nonEmptyString(record.type);
  const sponsor = readSponsor(record);
  const reward = readReward(record);
  const deadline = readDeadline(record.deadline);
  if (!slug || !title || !type || !sponsor || !reward || !deadline) {
    return null;
  }

  const candidate = {
    slug,
    title,
    type,
    sponsor,
    reward,
    deadline,
    skills: flattenSkills(record.skills),
    agentAccess: readEnum(record.agentAccess),
    status: readEnum(record.status),
    url: readUrl(record, slug),
    fetchedAt: fetchedAt.toISOString(),
  };

  const parsed = ListingSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function normalizeListings(
  rows: unknown[],
  fetchedAt: Date,
): { listings: Listing[]; skipped: number } {
  const listings: Listing[] = [];
  let skipped = 0;
  for (const row of rows) {
    const listing = normalizeListing(row, fetchedAt);
    if (listing) {
      listings.push(listing);
    } else {
      skipped += 1;
    }
  }
  return { listings, skipped };
}
