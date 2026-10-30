import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildDiscrepancyFile,
  renderDiscrepancies,
  type Discrepancy,
} from "./discrepancies.js";
import { DiffReportSchema, renderDiff, type DiffReport } from "./diff.js";
import { renderShortlist } from "./render.js";
import { renderRss } from "./rss.js";
import { FeedFileSchema, type FeedFile } from "./schema.js";
import { writeSnapshot } from "./snapshot.js";

export async function writeFeed(
  outDir: string,
  feed: FeedFile,
): Promise<{ jsonPath: string; markdownPath: string }> {
  const parsed = FeedFileSchema.parse(feed);
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "listings.json");
  const markdownPath = path.join(outDir, "shortlist.md");
  await writeFile(jsonPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderShortlist(parsed), "utf8");
  return { jsonPath, markdownPath };
}

export interface WatchOutput {
  feed: FeedFile;
  discrepancies: Discrepancy[];
  diff: DiffReport;
}

export interface WatchOutputPaths {
  jsonPath: string;
  markdownPath: string;
  rssPath: string;
  discrepanciesPath: string;
  discrepanciesJsonPath: string;
  diffMarkdownPath: string;
  diffJsonPath: string;
  snapshotPath: string;
}

export async function writeWatchOutput(
  outDir: string,
  output: WatchOutput,
): Promise<WatchOutputPaths> {
  const written = await writeFeed(outDir, output.feed);
  const rssPath = path.join(outDir, "feed.xml");
  const discrepanciesPath = path.join(outDir, "discrepancies.md");
  const discrepanciesJsonPath = path.join(outDir, "discrepancies.json");
  const diffMarkdownPath = path.join(outDir, "diff.md");
  const diffJsonPath = path.join(outDir, "diff.json");
  await writeFile(rssPath, renderRss(output.feed), "utf8");
  const discrepancyFile = buildDiscrepancyFile({
    generatedAt: output.feed.generatedAt,
    sources: output.feed.sources,
    discrepancies: output.discrepancies,
  });
  await writeFile(
    discrepanciesPath,
    renderDiscrepancies({
      generatedAt: output.feed.generatedAt,
      sources: output.feed.sources,
      discrepancies: output.discrepancies,
    }),
    "utf8",
  );
  await writeFile(
    discrepanciesJsonPath,
    `${JSON.stringify(discrepancyFile, null, 2)}\n`,
    "utf8",
  );
  await writeFile(diffMarkdownPath, renderDiff(output.diff), "utf8");
  const diffJson = DiffReportSchema.parse(output.diff);
  await writeFile(diffJsonPath, `${JSON.stringify(diffJson, null, 2)}\n`, "utf8");
  const snapshotPath = await writeSnapshot(outDir, output.feed);
  return {
    ...written,
    rssPath,
    discrepanciesPath,
    discrepanciesJsonPath,
    diffMarkdownPath,
    diffJsonPath,
    snapshotPath,
  };
}
