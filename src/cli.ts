#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Command, CommanderError } from "commander";

import {
  PUBLIC_FEED_DEFAULT_TAKE,
  PUBLIC_FEED_MAX_TAKE,
} from "./constants.js";
import { diffListings } from "./diff.js";
import { loadFeedReport } from "./load-feed.js";
import { readSnapshot } from "./snapshot.js";
import { writeSite } from "./site.js";
import { writeWatchOutput } from "./write-feed.js";

const LISTING_TYPES = ["bounty", "project", "hackathon"] as const;
type ListingType = (typeof LISTING_TYPES)[number];

export interface CliIO {
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: import("./http.js").FetchLike;
  now?: Date;
}

function readVersion(): string {
  const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: string };
  return pkg.version ?? "0.2.0";
}

export function parseTake(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid --take value: ${value}`);
  }
  const take = Number(value);
  if (take < 1 || take > PUBLIC_FEED_MAX_TAKE) {
    throw new Error(`--take must be an integer from 1 to ${PUBLIC_FEED_MAX_TAKE}`);
  }
  return take;
}

function parseType(value: string | undefined): ListingType | undefined {
  if (value === undefined) {
    return undefined;
  }
  if ((LISTING_TYPES as readonly string[]).includes(value)) {
    return value as ListingType;
  }
  throw new Error(`--type must be one of ${LISTING_TYPES.join(", ")}`);
}

export async function runCli(argv: string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((message: string) => console.log(message));
  const stderr = io.stderr ?? ((message: string) => console.error(message));
  const env = io.env ?? process.env;

  const program = new Command();
  program
    .name("earn-watch")
    .description(
      "Read-only discovery feed for agent-eligible Superteam Earn listings.",
    )
    .version(readVersion())
    .exitOverride()
    .configureOutput({
      writeOut: (text) => stdout(text.trimEnd()),
      writeErr: (text) => stderr(text.trimEnd()),
    });

  program
    .command("fetch")
    .description(
      "Fetch listings and write listings.json, shortlist.md, feed.xml, discrepancies.md, discrepancies.json, and a snapshot diff",
    )
    .requiredOption("--out <dir>", "directory for listings, shortlist, RSS, discrepancies, and snapshot")
    .option(
      "--take <n>",
      "page size for the public listings cross-check (agent API is clamped to 50)",
      String(PUBLIC_FEED_DEFAULT_TAKE),
    )
    .option(
      "--type <type>",
      "optional type filter: bounty, project, or hackathon",
    )
    .option("--offline", "use recorded fixtures only and do not call the network")
    .action(async (opts: { out: string; take: string; type?: string; offline?: boolean }) => {
      const take = parseTake(opts.take);
      const type = parseType(opts.type);
      const now = io.now ?? new Date();
      const snapshot = await readSnapshot(opts.out);
      let snapshotError: string | null = null;
      if (snapshot.status === "invalid") {
        snapshotError = snapshot.message;
        stderr(`Ignoring snapshot.json: ${snapshot.message}`);
      }
      const report = await loadFeedReport({
        apiKey: env.EARN_AGENT_API_KEY,
        offline: opts.offline === true,
        take,
        type,
        now,
        fetchImpl: io.fetchImpl,
      });
      const diff = diffListings(
        snapshot.status === "ok" ? snapshot.feed : null,
        report.feed,
        now,
        { snapshotError },
      );
      const written = await writeWatchOutput(opts.out, {
        feed: report.feed,
        discrepancies: report.discrepancies,
        diff,
      });
      stdout(
        [
          `Wrote ${report.feed.listings.length} listings`,
          written.jsonPath,
          written.markdownPath,
          written.rssPath,
          written.discrepanciesPath,
          written.discrepanciesJsonPath,
          written.diffMarkdownPath,
          written.diffJsonPath,
          written.snapshotPath,
          `agent API: ${report.feed.sources.agentApi}`,
          `public feed: ${report.feed.sources.publicFeed}`,
          `diff: new ${diff.new.length}, changed ${diff.changed.length}, closed ${diff.closed.length}, deadline < 72h ${diff.deadlineWithin72h.length}`,
          `discrepancies: ${report.discrepancies.length}`,
        ].join("\n"),
      );
    });

  program
    .command("site")
    .description(
      "Build index.html and discrepancies.html from feed.xml, shortlist.md, diff.json, and discrepancies.json",
    )
    .requiredOption("--in <dir>", "directory that contains feed.xml and shortlist.md")
    .option("--out <dir>", "directory for the HTML (defaults to --in)")
    .action(async (opts: { in: string; out?: string }) => {
      const written = await writeSite(opts.in, opts.out ?? opts.in);
      stdout(
        [
          written.indexPath,
          written.discrepanciesPath,
          `listings: ${written.opportunities}`,
          `discrepancies: ${written.discrepancies}`,
          `opportunities marked new since last snapshot: ${written.opportunitiesNew}`,
          `discrepancies marked new since last snapshot: ${written.discrepanciesNew}`,
        ].join("\n"),
      );
    });

  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    const secret = env.EARN_AGENT_API_KEY?.trim();
    stderr(secret ? message.split(secret).join("[redacted]") : message);
    return 1;
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exitCode = 1;
    });
}
