import {
  AGENT_API_MAX_TAKE,
  AGENT_API_ORIGIN,
  AGENT_LIVE_PATH,
  USER_AGENT,
} from "./constants.js";
import { loadFixture } from "./fixtures.js";
import { defaultFetch, getJson, redactSecret, type FetchLike } from "./http.js";

export interface AgentListingsQuery {
  take: number;
  type?: "bounty" | "project" | "hackathon";
  /** ISO-8601 lower bound. Passed through to the official agent API. */
  deadline?: string;
}

/**
 * Official agent listings client.
 * The CLI depends on this interface. The live implementation is used only
 * when a key is supplied. The fixture implementation never calls the network.
 */
export interface AgentListingsClient {
  readonly mode: "live" | "fixture";
  fetchListings(query: AgentListingsQuery): Promise<unknown>;
}

export class AgentApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentApiError";
  }
}

export function agentLiveUrl(query: AgentListingsQuery): URL {
  const url = new URL(AGENT_LIVE_PATH, AGENT_API_ORIGIN);
  const take = Math.min(Math.max(query.take, 1), AGENT_API_MAX_TAKE);
  url.searchParams.set("take", String(take));
  if (query.type) {
    url.searchParams.set("type", query.type);
  }
  if (query.deadline) {
    url.searchParams.set("deadline", query.deadline);
  }
  return url;
}

export class LiveAgentListingsClient implements AgentListingsClient {
  readonly mode = "live" as const;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike,
  ) {}

  async fetchListings(query: AgentListingsQuery): Promise<unknown> {
    const url = agentLiveUrl(query);
    try {
      return await getJson(this.fetchImpl, url, {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "User-Agent": USER_AGENT,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      throw new AgentApiError(redactSecret(message, this.apiKey));
    }
  }
}

export class FixtureAgentListingsClient implements AgentListingsClient {
  readonly mode = "fixture" as const;

  constructor(private readonly fixture: unknown) {}

  fetchListings(): Promise<unknown> {
    return Promise.resolve(this.fixture);
  }
}

export function hasAgentApiKey(apiKey: string | undefined | null): apiKey is string {
  return typeof apiKey === "string" && apiKey.trim().length > 0;
}

export async function createAgentListingsClient(options: {
  apiKey?: string | null;
  fetchImpl?: FetchLike;
  fixture?: unknown;
}): Promise<AgentListingsClient> {
  if (!hasAgentApiKey(options.apiKey)) {
    const fixture = options.fixture ?? (await loadFixture("agent"));
    return new FixtureAgentListingsClient(fixture);
  }
  return new LiveAgentListingsClient(
    options.apiKey.trim(),
    options.fetchImpl ?? defaultFetch(),
  );
}
