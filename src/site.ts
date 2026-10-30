import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { LISTING_URL_PREFIX, PACKAGE_VERSION } from "./constants.js";
import {
  DiscrepancyFileSchema,
  type Discrepancy,
  type DiscrepancyFile,
} from "./discrepancies.js";
import { DiffReportSchema, type DiffReport } from "./diff.js";
import { DISCLAIMER } from "./schema.js";

const SHORTLIST_HEADERS = [
  "Deadline (UTC)",
  "Reward",
  "Title",
  "Sponsor",
  "Type",
  "Access",
  "Status",
  "Skills",
  "URL",
] as const;

const LINKED_FILES = [
  "feed.xml",
  "shortlist.md",
  "listings.json",
  "discrepancies.json",
  "discrepancies.md",
  "diff.json",
  "diff.md",
] as const;

export interface SiteRenderInput {
  feedXml: string;
  shortlistMarkdown: string;
  diff?: DiffReport | null;
  discrepancies?: DiscrepancyFile | null;
}

export interface SiteRender {
  indexHtml: string;
  discrepanciesHtml: string;
  opportunities: number;
  opportunitiesNew: number;
  discrepancies: number;
  discrepanciesNew: number;
}

export interface SiteWriteResult extends SiteRender {
  indexPath: string;
  discrepanciesPath: string;
}

interface ShortlistRow {
  deadline: string;
  reward: string;
  title: string;
  sponsor: string;
  type: string;
  access: string;
  status: string;
  skills: string;
  url: string;
}

interface ParsedShortlist {
  generatedAt: string | null;
  listingCount: number | null;
  sources: string | null;
  warnings: string[];
  rows: ShortlistRow[];
}

interface RssItem {
  title: string;
  link: string;
  description: string;
  category: string;
}

interface ParsedRss {
  lastBuildDate: string | null;
  items: RssItem[];
}

interface Opportunity {
  slug: string;
  title: string;
  url: string;
  deadline: string;
  reward: string;
  sponsor: string;
  type: string;
  access: string;
  status: string;
  skills: string;
  isNew: boolean;
}

interface ParsedDescription {
  reward: string;
  deadline: string;
  sponsor: string;
  type: string;
  access: string;
  status: string;
  skills: string;
}

const SITE_CSS = `
    :root { color-scheme: light dark; }
    body { font-family: "Segoe UI", system-ui, sans-serif; line-height: 1.5; margin: 0 auto; max-width: 72rem; padding: 1.5rem; }
    header, footer { margin-bottom: 1.5rem; }
    h1 { font-size: 1.6rem; margin: 0.2rem 0 0.8rem; }
    nav { display: flex; flex-wrap: wrap; gap: 0.8rem; }
    nav a[aria-current="page"] { font-weight: 700; }
    .eyebrow, .meta, footer { color: CanvasText; }
    .disclaimer, .empty, .note { max-width: 48rem; }
    .counts { display: flex; flex-wrap: wrap; gap: 0.4rem 1.2rem; padding: 0; }
    .counts li { list-style: none; }
    .table-wrap { overflow-x: auto; }
    table { border-collapse: collapse; width: max-content; min-width: 100%; margin: 1rem 0 2rem; }
    th, td { border-bottom: 1px solid color-mix(in srgb, CanvasText 25%, transparent); padding: 0.4rem 0.5rem; text-align: left; vertical-align: top; white-space: nowrap; }
    .new { font-size: 0.75rem; letter-spacing: 0.03em; text-transform: uppercase; white-space: nowrap; }
    .warnings { padding-left: 1.2rem; }
`.trim();

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function safeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function link(url: string, text: string): string {
  const safe = safeHttpUrl(url);
  const label = escapeHtml(text);
  if (!safe) {
    return label;
  }
  return `<a href="${escapeHtml(safe)}">${label}</a>`;
}

function newBadge(isNew: boolean): string {
  if (!isNew) {
    return "";
  }
  return ` <strong class="new">New since last snapshot</strong>`;
}

function display(value: string | null | undefined): string {
  return value && value.length > 0 ? value : "unknown";
}

function rewardText(reward: { amount: number; token: string } | null): string {
  return reward ? `${reward.amount} ${reward.token}` : "unknown";
}

function splitMarkdownRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return [];
  }
  const inner = trimmed.slice(1, -1);
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    const next = inner[index + 1];
    if (char === "\\" && next === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char ?? "";
  }
  cells.push(current.trim());
  return cells;
}

function isSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function sameHeaders(cells: string[]): boolean {
  if (cells.length !== SHORTLIST_HEADERS.length) {
    return false;
  }
  return SHORTLIST_HEADERS.every((header, index) => cells[index] === header);
}

function rowFromCells(cells: string[]): ShortlistRow {
  if (cells.length !== SHORTLIST_HEADERS.length) {
    throw new Error("shortlist.md table row does not have the expected columns");
  }
  return {
    deadline: cells[0] ?? "",
    reward: cells[1] ?? "",
    title: cells[2] ?? "",
    sponsor: cells[3] ?? "",
    type: cells[4] ?? "",
    access: cells[5] ?? "",
    status: cells[6] ?? "",
    skills: cells[7] ?? "",
    url: cells[8] ?? "",
  };
}

function parseShortlist(markdown: string): ParsedShortlist {
  const generatedAt = /^Generated: (\S+)/m.exec(markdown)?.[1] ?? null;
  const listingCountText = /^Listings: (\d+)/m.exec(markdown)?.[1] ?? null;
  const listingCount = listingCountText === null ? null : Number(listingCountText);
  const sources = /^Sources: (.+)$/m.exec(markdown)?.[1] ?? null;
  const warnings: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("> ")) {
      warnings.push(line.slice(2).trim());
    }
  }

  const lines = markdown.split(/\r?\n/);
  let headerIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line && sameHeaders(splitMarkdownRow(line))) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex < 0) {
    throw new Error("shortlist.md has no opportunities table");
  }

  const rows: ShortlistRow[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim().startsWith("|")) {
      break;
    }
    const cells = splitMarkdownRow(line);
    if (isSeparator(cells)) {
      continue;
    }
    rows.push(rowFromCells(cells));
  }

  if (listingCount !== null && listingCount !== rows.length) {
    warnings.push(
      `shortlist.md says Listings: ${listingCount}, and the table has ${rows.length} rows.`,
    );
  }

  return { generatedAt, listingCount, sources, warnings, rows };
}

function tagText(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(block);
  const raw = match?.[1];
  if (raw === undefined) {
    return null;
  }
  return decodeXml(raw.trim());
}

function parseFeedXml(xml: string): ParsedRss {
  if (!xml.includes("<rss")) {
    throw new Error("feed.xml is not an RSS document");
  }
  const items: RssItem[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = match[1] ?? "";
    const title = tagText(block, "title");
    const link = tagText(block, "link");
    if (!title || !link) {
      throw new Error("feed.xml item is missing a title or link");
    }
    items.push({
      title,
      link,
      description: tagText(block, "description") ?? "",
      category: tagText(block, "category") ?? "",
    });
  }
  return {
    lastBuildDate: tagText(xml, "lastBuildDate"),
    items,
  };
}

function parseItemDescription(description: string): ParsedDescription | null {
  const match =
    /^(?<reward>.+?)\. Deadline (?<deadline>\S+)\. Sponsor (?<sponsor>.*?)\. Type (?<type>\S+)\. Access (?<access>\S+)\. Status (?<status>\S+)\. Skills (?<skills>.*)\.$/.exec(
      description,
    );
  const groups = match?.groups;
  if (!groups?.reward || !groups.deadline || groups.sponsor === undefined) {
    return null;
  }
  return {
    reward: groups.reward,
    deadline: groups.deadline,
    sponsor: groups.sponsor,
    type: groups.type ?? "unknown",
    access: groups.access ?? "unknown",
    status: groups.status ?? "unknown",
    skills: groups.skills ?? "",
  };
}

function slugFromUrl(url: string): string {
  if (!url.startsWith(LISTING_URL_PREFIX)) {
    return url;
  }
  const raw = url.slice(LISTING_URL_PREFIX.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function newSlugSet(diff: DiffReport | null): Set<string> {
  const slugs = new Set<string>();
  if (!diff) {
    return slugs;
  }
  for (const listing of diff.new) {
    slugs.add(listing.slug);
  }
  return slugs;
}

function buildOpportunities(
  rss: ParsedRss,
  shortlist: ParsedShortlist,
  fresh: ReadonlySet<string>,
): Opportunity[] {
  const byUrl = new Map<string, ShortlistRow>();
  for (const row of shortlist.rows) {
    if (!byUrl.has(row.url)) {
      byUrl.set(row.url, row);
    }
  }
  const seen = new Set<string>();
  const opportunities: Opportunity[] = [];
  for (const item of rss.items) {
    seen.add(item.link);
    const row = byUrl.get(item.link);
    const parsed = parseItemDescription(item.description);
    const url = row?.url ?? item.link;
    const slug = slugFromUrl(url);
    opportunities.push({
      slug,
      title: row?.title ?? item.title,
      url,
      deadline: row?.deadline || parsed?.deadline || "unknown",
      reward: row?.reward || parsed?.reward || "unknown",
      sponsor: row?.sponsor || parsed?.sponsor || "unknown",
      type: row?.type || parsed?.type || item.category || "unknown",
      access: row?.access || parsed?.access || "unknown",
      status: row?.status || parsed?.status || "unknown",
      skills: row?.skills || parsed?.skills || "none",
      isNew: fresh.has(slug),
    });
  }
  for (const row of shortlist.rows) {
    if (seen.has(row.url)) {
      continue;
    }
    const slug = slugFromUrl(row.url);
    opportunities.push({
      slug,
      title: row.title,
      url: row.url,
      deadline: row.deadline || "unknown",
      reward: row.reward || "unknown",
      sponsor: row.sponsor || "unknown",
      type: row.type || "unknown",
      access: row.access || "unknown",
      status: row.status || "unknown",
      skills: row.skills || "none",
      isNew: fresh.has(slug),
    });
  }
  return opportunities;
}

function diffSummary(diff: DiffReport | null): string {
  if (!diff) {
    return "diff.json was not provided. No row is marked new.";
  }
  const counts = `Diff: new ${diff.new.length}, changed ${diff.changed.length}, closed ${diff.closed.length}, deadline within 72 hours ${diff.deadlineWithin72h.length}.`;
  if (diff.baseline) {
    return `${counts} Previous snapshot: none. This build is a baseline.`;
  }
  if (diff.comparedTo) {
    return `${counts} Compared with snapshot ${diff.comparedTo}.`;
  }
  return counts;
}

function markedLine(label: string, count: number): string {
  if (count === 0) {
    return `${label}: 0. No row in this table is new since the last snapshot.`;
  }
  return `${label}: ${count}.`;
}

function htmlTable(headers: string[], rows: string[][]): string {
  const head = headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("\n");
  return `<div class="table-wrap"><table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table></div>`;
}

function page(options: {
  title: string;
  heading: string;
  current: "index" | "discrepancies";
  body: string;
}): string {
  const indexCurrent = options.current === "index" ? ` aria-current="page"` : "";
  const discrepancyCurrent = options.current === "discrepancies" ? ` aria-current="page"` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(options.title)}</title>
  <style>
${SITE_CSS}
  </style>
</head>
<body>
  <header>
    <p class="eyebrow">earn-agent-feed ${escapeHtml(PACKAGE_VERSION)}</p>
    <h1>${escapeHtml(options.heading)}</h1>
    <nav>
      <a href="index.html"${indexCurrent}>Opportunities</a>
      <a href="discrepancies.html"${discrepancyCurrent}>Discrepancies</a>
      <a href="listings.json">listings.json</a>
      <a href="shortlist.md">shortlist.md</a>
      <a href="feed.xml">feed.xml</a>
      <a href="discrepancies.json">discrepancies.json</a>
      <a href="diff.json">diff.json</a>
    </nav>
  </header>
  ${options.body}
  <footer>
    <p class="disclaimer">${escapeHtml(DISCLAIMER)}</p>
    <p>Unofficial static site generated by earn-agent-feed/${escapeHtml(PACKAGE_VERSION)}. This page does not submit work and does not register an agent.</p>
  </footer>
</body>
</html>
`;
}

function lastUpdated(shortlist: ParsedShortlist, rss: ParsedRss): string {
  const parts: string[] = [];
  if (shortlist.generatedAt) {
    parts.push(
      `<time datetime="${escapeHtml(shortlist.generatedAt)}">${escapeHtml(shortlist.generatedAt)}</time>`,
    );
  }
  if (rss.lastBuildDate) {
    parts.push(`RSS lastBuildDate ${escapeHtml(rss.lastBuildDate)}`);
  }
  if (parts.length === 0) {
    return `<p class="meta">Last updated: unknown</p>`;
  }
  return `<p class="meta">Last updated: ${parts.join(". ")}</p>`;
}

function warningList(warnings: string[]): string {
  if (warnings.length === 0) {
    return "";
  }
  const items = warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
  return `<ul class="warnings">${items}</ul>`;
}

function opportunityRows(opportunities: Opportunity[]): string[][] {
  return opportunities.map((row) => [
    escapeHtml(row.deadline),
    escapeHtml(row.reward),
    `${escapeHtml(row.title)}${newBadge(row.isNew)}`,
    escapeHtml(row.sponsor),
    escapeHtml(row.type),
    escapeHtml(row.access),
    escapeHtml(row.skills || "none"),
    link(row.url, "Open"),
  ]);
}

function discrepancyRows(rows: Discrepancy[], fresh: ReadonlySet<string>): string[][] {
  return rows.map((row) => [
    escapeHtml(row.slug),
    escapeHtml(display(row.deadline)),
    escapeHtml(rewardText(row.reward)),
    `${escapeHtml(row.title)}${newBadge(fresh.has(row.slug))}`,
    escapeHtml(display(row.sponsor)),
    escapeHtml(display(row.type)),
    escapeHtml(row.agentAccess),
    link(row.url, "Open"),
  ]);
}

/**
 * Build the opportunities index and the discrepancy dashboard from the
 * fetch artifacts. `diff.new` is the M1 listing diff: slugs absent from the
 * previous snapshot. This function does not read the environment and does
 * not call the network.
 */
export function renderSite(input: SiteRenderInput): SiteRender {
  const rss = parseFeedXml(input.feedXml);
  const shortlist = parseShortlist(input.shortlistMarkdown);
  const diff = input.diff ?? null;
  const discrepancyFile = input.discrepancies ?? null;
  const fresh = newSlugSet(diff);
  const opportunities = buildOpportunities(rss, shortlist, fresh);
  const discrepancies = discrepancyFile?.discrepancies ?? [];
  const opportunitiesNew = opportunities.filter((row) => row.isNew).length;
  const discrepanciesNew = discrepancies.filter((row) => fresh.has(row.slug)).length;
  const summary = diffSummary(diff);
  const updated = lastUpdated(shortlist, rss);
  const warnings = warningList(shortlist.warnings);
  const sources = shortlist.sources
    ? `<p class="meta">Sources: ${escapeHtml(shortlist.sources)}</p>`
    : "";

  const opportunityBody =
    opportunities.length === 0
      ? `<p class="empty">No agent-eligible listings in this snapshot.</p>`
      : htmlTable(
          ["Deadline (UTC)", "Reward", "Title", "Sponsor", "Type", "Access", "Skills", "Link"],
          opportunityRows(opportunities),
        );

  const discrepancyBody = discrepancyTable(discrepancyFile, discrepancies, fresh);

  const indexHtml = page({
    title: "Agent-eligible Superteam Earn listings",
    heading: "Agent-eligible opportunities",
    current: "index",
    body: [
      `<p class="disclaimer">${escapeHtml(DISCLAIMER)}</p>`,
      updated,
      sources,
      warnings,
      `<ul class="counts">`,
      `<li>Opportunities: ${opportunities.length}</li>`,
      `<li>RSS items: ${rss.items.length}</li>`,
      `<li>Shortlist rows: ${shortlist.rows.length}</li>`,
      `<li>Discrepancies: ${discrepancies.length}</li>`,
      `</ul>`,
      `<p class="note">${escapeHtml(summary)}</p>`,
      `<p class="note">${escapeHtml(markedLine("Opportunities marked new since last snapshot", opportunitiesNew))}</p>`,
      `<p class="note">New since last snapshot reuses the M1 diff (<code>diff.json</code> field <code>new</code>).</p>`,
      opportunityBody,
    ].join("\n"),
  });

  const discrepanciesHtml = page({
    title: "Public feed discrepancies",
    heading: "Discrepancy dashboard",
    current: "discrepancies",
    body: [
      `<p class="disclaimer">${escapeHtml(DISCLAIMER)}</p>`,
      updated,
      discrepancyFile
        ? `<p class="meta">Sources: agent API ${escapeHtml(discrepancyFile.sources.agentApi)}, public feed ${escapeHtml(discrepancyFile.sources.publicFeed)}</p>`
        : "",
      `<p>These rows are OPEN and agent-eligible (<code>AGENT_ALLOWED</code> or <code>AGENT_ONLY</code>) on the public listings feed, and the slug is missing from the agent source. This is the gap reported in <a href="https://github.com/SuperteamDAO/earn/issues/1456">SuperteamDAO/earn #1456</a>.</p>`,
      `<p class="note">A row is marked &quot;New since last snapshot&quot; when its slug is in <code>diff.json</code> <code>new</code>. That list is the M1 diff: listings in this fetch that were absent from the previous snapshot. An empty discrepancy list is a valid snapshot.</p>`,
      `<p class="note">${escapeHtml(summary)}</p>`,
      `<p class="note">${escapeHtml(markedLine("Discrepancies marked new since last snapshot", discrepanciesNew))}</p>`,
      discrepancyBody,
    ].join("\n"),
  });

  return {
    indexHtml,
    discrepanciesHtml,
    opportunities: opportunities.length,
    opportunitiesNew,
    discrepancies: discrepancies.length,
    discrepanciesNew,
  };
}

function discrepancyTable(
  file: DiscrepancyFile | null,
  rows: Discrepancy[],
  fresh: ReadonlySet<string>,
): string {
  if (!file) {
    return `<p class="empty">discrepancies.json was not provided.</p>`;
  }
  if (rows.length === 0) {
    return `<p class="empty">No public-feed discrepancies in this snapshot.</p>`;
  }
  return htmlTable(
    ["Slug", "Deadline (UTC)", "Reward", "Title", "Sponsor", "Type", "Access", "Link"],
    discrepancyRows(rows, fresh),
  );
}

async function readRequired(dir: string, name: string): Promise<string> {
  try {
    const text = await readFile(path.join(dir, name), "utf8");
    return text.replace(/^\uFEFF/, "");
  } catch (error) {
    if (isEnoent(error)) {
      throw new Error(`${name} is missing from ${dir}`, { cause: error });
    }
    throw error;
  }
}

async function readOptional(dir: string, name: string): Promise<string | null> {
  try {
    const text = await readFile(path.join(dir, name), "utf8");
    return text.replace(/^\uFEFF/, "");
  } catch (error) {
    if (isEnoent(error)) {
      return null;
    }
    throw error;
  }
}

async function readDiff(dir: string): Promise<DiffReport | null> {
  const text = await readOptional(dir, "diff.json");
  if (text === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("diff.json is not valid JSON");
  }
  const result = DiffReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("diff.json does not match the diff schema");
  }
  return result.data;
}

async function readDiscrepancies(dir: string): Promise<DiscrepancyFile | null> {
  const text = await readOptional(dir, "discrepancies.json");
  if (text === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("discrepancies.json is not valid JSON");
  }
  const result = DiscrepancyFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("discrepancies.json does not match the discrepancy schema");
  }
  return result.data;
}

async function copyLinked(inputDir: string, outDir: string): Promise<void> {
  for (const name of LINKED_FILES) {
    const source = path.join(inputDir, name);
    try {
      await copyFile(source, path.join(outDir, name));
    } catch (error) {
      if (isEnoent(error) && name !== "feed.xml" && name !== "shortlist.md") {
        continue;
      }
      throw error;
    }
  }
}

/** Read fetch artifacts and write index.html plus discrepancies.html. */
export async function writeSite(inputDir: string, outDir: string): Promise<SiteWriteResult> {
  const feedXml = await readRequired(inputDir, "feed.xml");
  const shortlistMarkdown = await readRequired(inputDir, "shortlist.md");
  const diff = await readDiff(inputDir);
  const discrepancies = await readDiscrepancies(inputDir);
  const rendered = renderSite({
    feedXml,
    shortlistMarkdown,
    diff,
    discrepancies,
  });
  await mkdir(outDir, { recursive: true });
  if (path.resolve(inputDir) !== path.resolve(outDir)) {
    await copyLinked(inputDir, outDir);
  }
  const indexPath = path.join(outDir, "index.html");
  const discrepanciesPath = path.join(outDir, "discrepancies.html");
  await writeFile(indexPath, rendered.indexHtml, "utf8");
  await writeFile(discrepanciesPath, rendered.discrepanciesHtml, "utf8");
  return {
    ...rendered,
    indexPath,
    discrepanciesPath,
  };
}
