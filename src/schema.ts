import { z } from "zod";

/** Stable schema version written into listings.json. */
export const SCHEMA_VERSION = 1 as const;

export const DISCLAIMER =
  "Unofficial feed. Not affiliated with Superteam. Listings may be stale. Verify each listing on https://earn.superteam.fun before acting on it.";

export const AgentAccessSchema = z.enum([
  "HUMAN_ONLY",
  "AGENT_ALLOWED",
  "AGENT_ONLY",
]);

export const ListingStatusSchema = z.enum([
  "OPEN",
  "REVIEW",
  "CLOSED",
  "VERIFYING",
  "VERIFY_FAIL",
]);

export const RewardSchema = z
  .object({
    amount: z.number().finite().nonnegative(),
    token: z.string().trim().min(1),
  })
  .strict();

export const ListingSchema = z
  .object({
    slug: z.string().trim().min(1),
    title: z.string().trim().min(1),
    type: z.string().trim().min(1),
    sponsor: z.string().trim().min(1),
    reward: RewardSchema,
    deadline: z.string().datetime({ offset: true }),
    skills: z.array(z.string().trim().min(1)),
    agentAccess: AgentAccessSchema.nullable(),
    status: ListingStatusSchema.nullable(),
    url: z.string().url(),
    fetchedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const SourceModeSchema = z.enum(["live", "fixture"]);

export const FeedFileSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    generatedAt: z.string().datetime({ offset: true }),
    disclaimer: z.literal(DISCLAIMER),
    sources: z
      .object({
        agentApi: SourceModeSchema,
        publicFeed: SourceModeSchema,
      })
      .strict(),
    warnings: z.array(z.string()),
    skipped: z.number().int().nonnegative(),
    listings: z.array(ListingSchema),
  })
  .strict();

export type AgentAccess = z.infer<typeof AgentAccessSchema>;
export type ListingStatus = z.infer<typeof ListingStatusSchema>;
export type Reward = z.infer<typeof RewardSchema>;
export type Listing = z.infer<typeof ListingSchema>;
export type SourceMode = z.infer<typeof SourceModeSchema>;
export type FeedFile = z.infer<typeof FeedFileSchema>;
