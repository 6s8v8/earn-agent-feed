/** Accept a bare array or an envelope with a `listings` array. */
export function readListingsPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload !== null && typeof payload === "object") {
    const listings = (payload as Record<string, unknown>).listings;
    if (Array.isArray(listings)) {
      return listings;
    }
  }
  throw new Error("Listings payload was not an array");
}
