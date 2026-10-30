import {
  createAgentListingsClient,
  hasAgentApiKey,
  type AgentListingsQuery,
} from "./agent-client.js";
import { findDiscrepancies, type Discrepancy } from "./discrepancies.js";
import { filterRawListings } from "./filter.js";
import { loadFixture } from "./fixtures.js";
import { mergeListings } from "./merge.js";
import { normalizeListings } from "./normalize.js";
import { readListingsPayload } from "./payload.js";
import { fetchPublicListings } from "./public-client.js";
import {
  DISCLAIMER,
  FeedFileSchema,
  SCHEMA_VERSION,
  type FeedFile,
  type SourceMode,
} from "./schema.js";
import type { FetchLike } from "./http.js";

export interface LoadFeedOptions {
  apiKey?: string | null;
  /** Use recorded fixtures for both sources and do not call the network. */
  offline?: boolean;
  take?: number;
  type?: AgentListingsQuery["type"];
  deadline?: string;
  now?: Date;
  fetchImpl?: FetchLike;
  agentFixture?: unknown;
  publicFixture?: unknown;
}

const FIXTURE_WITH_LIVE_WARNING =
  "EARN_AGENT_API_KEY is unset, so agent-source rows are recorded sample fixtures merged with the live public feed. Those sample slugs are not live agent-endpoint results.";

export interface FeedReport {
  feed: FeedFile;
  discrepancies: Discrepancy[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

export async function loadFeed(options: LoadFeedOptions = {}): Promise<FeedFile> {
  const report = await loadFeedReport(options);
  return report.feed;
}

export async function loadFeedReport(options: LoadFeedOptions = {}): Promise<FeedReport> {
  const now = options.now ?? new Date();
  const take = options.take ?? 100;
  const offline = options.offline === true;
  const fetchImpl = options.fetchImpl;

  const agentFixture = options.agentFixture ?? (await loadFixture("agent"));
  const publicFixture = options.publicFixture ?? (await loadFixture("publicFeed"));

  const useLiveAgent = !offline && hasAgentApiKey(options.apiKey);
  const agentClient = await createAgentListingsClient({
    apiKey: useLiveAgent ? options.apiKey : undefined,
    fetchImpl,
    fixture: agentFixture,
  });

  let publicMode: SourceMode = "fixture";
  let publicPayload: unknown = publicFixture;
  const warnings: string[] = [];

  if (!offline) {
    try {
      publicPayload = await fetchPublicListings({ take, fetchImpl });
      publicMode = "live";
    } catch (error) {
      publicMode = "fixture";
      publicPayload = publicFixture;
      warnings.push(
        `Public listings cross-check failed (${errorMessage(error)}). Used recorded fixtures.`,
      );
    }
  }

  if (offline) {
    warnings.push(
      "Offline mode: both sources are recorded fixtures. Nothing was fetched from the network.",
    );
  }

  const agentPayload = await agentClient.fetchListings({
    take,
    type: options.type,
    deadline: options.deadline,
  });

  let agentRaw = readListingsPayload(agentPayload);
  let publicRaw = readListingsPayload(publicPayload);
  if (options.type) {
    const type = options.type;
    const matchesType = (row: unknown) =>
      row !== null &&
      typeof row === "object" &&
      (row as Record<string, unknown>).type === type;
    agentRaw = agentRaw.filter(matchesType);
    publicRaw = publicRaw.filter(matchesType);
  }

  const discrepancies = findDiscrepancies(agentRaw, publicRaw, now);
  const agentRows = filterRawListings(agentRaw);
  const publicRows = filterRawListings(publicRaw);

  const agentNormalized = normalizeListings(agentRows, now);
  const publicNormalized = normalizeListings(publicRows, now);
  if (agentClient.mode === "fixture" && publicMode === "live") {
    const liveSlugs = new Set(publicNormalized.listings.map((listing) => listing.slug));
    const sampleOnly = agentNormalized.listings
      .map((listing) => listing.slug)
      .filter((slug) => !liveSlugs.has(slug));
    const listed =
      sampleOnly.length > 0 ? ` Sample-only slugs: ${sampleOnly.join(", ")}.` : "";
    warnings.push(`${FIXTURE_WITH_LIVE_WARNING}${listed}`);
  }
  const prefer =
    agentClient.mode === "fixture" && publicMode === "live" ? "crossCheck" : "primary";
  const listings = mergeListings(
    agentNormalized.listings,
    publicNormalized.listings,
    prefer,
  );

  const feed = FeedFileSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    disclaimer: DISCLAIMER,
    sources: {
      agentApi: agentClient.mode,
      publicFeed: publicMode,
    },
    warnings,
    skipped: agentNormalized.skipped + publicNormalized.skipped,
    listings,
  });
  return { feed, discrepancies };
}
