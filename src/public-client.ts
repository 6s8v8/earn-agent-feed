import { PUBLIC_LISTINGS_URL, USER_AGENT } from "./constants.js";
import { defaultFetch, getJson, type FetchLike } from "./http.js";

export function publicListingsUrl(take: number): URL {
  const url = new URL(PUBLIC_LISTINGS_URL);
  url.searchParams.set("take", String(take));
  return url;
}

/**
 * Best-effort cross-check against the undocumented public listings feed.
 * Callers catch failures and fall back to recorded fixtures.
 */
export async function fetchPublicListings(options: {
  take: number;
  fetchImpl?: FetchLike;
}): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? defaultFetch();
  const url = publicListingsUrl(options.take);
  return getJson(fetchImpl, url, {
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  });
}
