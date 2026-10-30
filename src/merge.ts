import type { Listing } from "./schema.js";

export function compareListings(a: Listing, b: Listing): number {
  const deadlineDelta = Date.parse(a.deadline) - Date.parse(b.deadline);
  if (deadlineDelta !== 0) {
    return deadlineDelta;
  }
  if (a.reward.amount !== b.reward.amount) {
    return b.reward.amount - a.reward.amount;
  }
  return a.slug.localeCompare(b.slug);
}

function combine(preferred: Listing, fallback: Listing): Listing {
  return {
    slug: preferred.slug,
    title: preferred.title || fallback.title,
    type: preferred.type || fallback.type,
    sponsor: preferred.sponsor || fallback.sponsor,
    reward: preferred.reward,
    deadline: preferred.deadline || fallback.deadline,
    skills: preferred.skills.length > 0 ? preferred.skills : fallback.skills,
    agentAccess: preferred.agentAccess ?? fallback.agentAccess,
    status: preferred.status ?? fallback.status,
    url: preferred.url || fallback.url,
    fetchedAt: preferred.fetchedAt,
  };
}

/**
 * Union listings by slug.
 * `prefer` chooses which source wins when both have the same slug.
 * Empty skills and null access/status are filled from the other source.
 * The first occurrence of a slug in a source wins over later duplicates.
 */
export function mergeListings(
  primary: Listing[],
  crossCheck: Listing[],
  prefer: "primary" | "crossCheck",
): Listing[] {
  const bySlug = new Map<string, { primary?: Listing; crossCheck?: Listing }>();
  const order: string[] = [];

  const slot = (slug: string) => {
    const existing = bySlug.get(slug);
    if (existing) {
      return existing;
    }
    const created: { primary?: Listing; crossCheck?: Listing } = {};
    bySlug.set(slug, created);
    order.push(slug);
    return created;
  };

  for (const listing of primary) {
    const entry = slot(listing.slug);
    if (!entry.primary) {
      entry.primary = listing;
    }
  }
  for (const listing of crossCheck) {
    const entry = slot(listing.slug);
    if (!entry.crossCheck) {
      entry.crossCheck = listing;
    }
  }

  const merged = order.map((slug) => {
    const pair = bySlug.get(slug);
    if (!pair) {
      throw new Error(`Missing merged listing for slug ${slug}`);
    }
    if (pair.primary && pair.crossCheck) {
      return prefer === "primary"
        ? combine(pair.primary, pair.crossCheck)
        : combine(pair.crossCheck, pair.primary);
    }
    const only = pair.primary ?? pair.crossCheck;
    if (!only) {
      throw new Error(`Empty merged listing for slug ${slug}`);
    }
    return only;
  });

  return merged.sort(compareListings);
}
