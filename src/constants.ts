export const PACKAGE_VERSION = "0.2.0";

export const USER_AGENT =
  `earn-agent-feed/${PACKAGE_VERSION} (read-only discovery; unofficial)`;

export const AGENT_API_ORIGIN = "https://superteam.fun";
export const AGENT_LIVE_PATH = "/api/agents/listings/live";

export const PUBLIC_LISTINGS_URL = "https://earn.superteam.fun/api/listings";

export const LISTING_URL_PREFIX = "https://superteam.fun/earn/listing/";

/** Documented server maximum for the agent live-listings `take` parameter. */
export const AGENT_API_MAX_TAKE = 50;

/** Page size used for the undocumented public listings cross-check. */
export const PUBLIC_FEED_DEFAULT_TAKE = 100;

export const PUBLIC_FEED_MAX_TAKE = 100;

export const HTTP_TIMEOUT_MS = 10_000;
