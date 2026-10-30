# earn-agent-feed

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933)](package.json)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![CI](https://img.shields.io/badge/CI-lint%20%7C%20test%20%7C%20build%20%7C%20site-blue)](.github/workflows/ci.yml)

Read-only discovery feed for agent-eligible [Superteam Earn](https://earn.superteam.fun) listings.

Earn's agent skill tells agents to discover work with `GET https://superteam.fun/api/agents/listings/live`. [SuperteamDAO/earn #1456](https://github.com/SuperteamDAO/earn/issues/1456) reported that this endpoint returned only expired listings and left out an `OPEN` bounty with `agentAccess: AGENT_ALLOWED` that was visible on the public feed. An agent that followed the quick start could conclude that no work existed. Upstream later changed the deadline default ([#1470](https://github.com/SuperteamDAO/earn/pull/1470)). This project still cross-checks the official agent API against the public listings feed so that class of gap stays visible to humans and agents.

M0 fetches, filters, and normalizes. M1 (`v0.1.0`) diffs that feed against the previous snapshot, writes an RSS feed, and writes `discrepancies.md` for the #1456 class of gap. M2 (`v0.2.0`) builds a static site from `feed.xml` and `shortlist.md`: an opportunities index and a discrepancy dashboard. The dashboard marks a row when its slug is in the M1 diff's `new` list. A manual GitHub Pages workflow can publish that site after a person enables Pages. This repository does not enable Pages and does not change repository visibility.

**Unofficial. Not affiliated with Superteam.** Listings may be stale. Verify every row on [earn.superteam.fun](https://earn.superteam.fun) before acting on it. This tool does not submit work, does not open wallets, and does not trade.

`EARN_AGENT_API_KEY` is optional. Leave it unset and the agent source is the recorded fixture. The key is read from the environment only and is never written to the feed files. Do not commit it.

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
npm run build
node dist/cli.js fetch --offline --out ./feed
```

`--offline` uses the recorded fixtures in `fixtures/` and does not call the network. Drop it to attempt the public listings cross-check:

```bash
node dist/cli.js fetch --out ./feed
```

Run `fetch` again with the same `--out` directory. The second run reads `snapshot.json` from the first run and fills in new, changed, and closed.

The package name is `earn-agent-feed` (`v0.2.0`). Both bins call the same command:

```bash
earn-watch fetch --out ./feed
earn-agent-feed fetch --out ./feed
```

After a later npm publish, the same command is `npx earn-agent-feed fetch --out ./feed`.

### Options

| Flag | Meaning |
| --- | --- |
| `--out <dir>` | Directory for `listings.json`, `shortlist.md`, `feed.xml`, `discrepancies.md`, `discrepancies.json`, `diff.md`, `diff.json`, and `snapshot.json` (required) |
| `--take <n>` | Public-feed page size, 1–100. Default `100`. The agent API is clamped to 50, which is that endpoint's maximum. |
| `--type <type>` | Optional `bounty`, `project`, or `hackathon` filter |
| `--offline` | Recorded fixtures only. No network. |

## Static site

One command compiles the CLI, fetches the recorded fixtures, and writes the site into `public/`:

```bash
npm run build:site
```

That command does not call the network and does not read a key. It is the same path CI uses. Open `public/index.html` for the opportunities index and `public/discrepancies.html` for the discrepancy dashboard.

| File | Role |
| --- | --- |
| `public/index.html` | Opportunities from `feed.xml`, joined with the `shortlist.md` table. |
| `public/discrepancies.html` | Public-feed rows missing from the agent source. |
| `public/listings.json` | Normalized listings, schema version 1. |
| `public/feed.xml` | RSS 2.0. |
| `public/shortlist.md` | Markdown table of the same rows. |
| `public/discrepancies.json` | Discrepancy list, schema version 1. |
| `public/diff.json` | M1 diff. `new` is what the site treats as new since the last snapshot. |

The index follows item order in `feed.xml`. Shortlist columns fill in reward, deadline, sponsor, type, access, status, and skills. `diff.json` is the M1 diff, reused as-is: a row is marked **New since last snapshot** only when its slug is in `new`. The first build in a directory has no snapshot, so the diff is a baseline and nothing is marked new. A later `npm run build:site` keeps `public/snapshot.json` and diffs against it. Identical fixtures stay at new 0. An empty discrepancy list is a normal snapshot; the dashboard says so.

`public/` is generated. It is not committed.

To render HTML from a directory you already fetched:

```bash
node dist/cli.js site --in ./feed
```

`--out` defaults to `--in`. Pass another directory to write the HTML there and copy the feed files the pages link to.

## Consume the feed

The files above are the feed. Locally they live under `public/` after `npm run build:site`, or under the `--out` directory you passed to `fetch`. After a person enables GitHub Pages and runs the manual workflow, the same paths are served from the Pages site URL that GitHub prints. This repository does not turn that site on.

| Path | What it is |
| --- | --- |
| `index.html` | Opportunities index. Last updated, counts, and links to the files below. |
| `discrepancies.html` | Discrepancy dashboard, including the new-since-snapshot mark. |
| `listings.json` | Schema version 1. See the example under [What `fetch` writes](#what-fetch-writes). |
| `feed.xml` | RSS 2.0. The channel link is `https://earn.superteam.fun`. Each item link is the listing URL. |
| `shortlist.md` | The same rows as the RSS feed, soonest deadline first. |
| `discrepancies.json` | Schema version 1. `discrepancies` is the #1456-shaped gap. |
| `diff.json` | Schema version 1. Groups are `new`, `changed`, `closed`, and `deadlineWithin72h`. |

`discrepancies.json` looks like this:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-30T00:00:00.000Z",
  "disclaimer": "Unofficial feed. Not affiliated with Superteam. Listings may be stale. Verify each listing on https://earn.superteam.fun before acting on it.",
  "sources": { "agentApi": "fixture", "publicFeed": "fixture" },
  "discrepancies": []
}
```

An empty `discrepancies` array means this snapshot found no public-feed row that was OPEN, agent-eligible, and missing from the agent source.

There is no published read rate limit for the agent listings endpoint. Consumers of this feed should read these static files instead of polling Earn. The manual Pages workflow requests the public listings endpoint once per run. If you automate `fetch` yourself, poll at most once every 10 minutes, back off on HTTP 429, and keep the identifying `User-Agent`. This repository does not schedule that poll. Registration and submission limits in the Superteam skill file do not apply here: this CLI does not call those routes.

## GitHub Pages

The workflow `.github/workflows/feed.yml` is manual (`workflow_dispatch` only). It does not enable GitHub Pages and it does not change repository visibility. Leave the repository private until you decide otherwise.

1. Confirm the repository visibility yourself. Nothing in this repo flips it.
2. In the repository settings, open Pages and set the source to GitHub Actions. The workflow will fail until a person does this.
3. Optional: add an Actions secret named `EARN_AGENT_API_KEY`. Leave it unset to skip the live agent API. The public listings endpoint is still requested, and the agent source falls back to `fixtures/agent-api-live.json`. The workflow never prints the secret. The CLI redacts it from error text and does not write it into `public/`.
4. Open Actions, choose **Publish feed**, and run the workflow.
5. GitHub prints the Pages URL on the deploy job. The site root is `index.html`.

A later manual run restores `snapshot.json` from the Actions cache when that cache is available, then writes a new snapshot. That is what lets the dashboard mark rows new since the previous run. The cache is not a secret.

## Agent API key

The live agent endpoint is documented by Superteam in [skill.md](https://superteam.fun/skill.md):

`GET https://superteam.fun/api/agents/listings/live`

It expects `Authorization: Bearer <key>` and a `User-Agent` identifying this project.

**This repository does not register an agent and does not call `POST /api/agents`.** When you already have a read-only key, pass it at runtime:

```bash
export EARN_AGENT_API_KEY="your-existing-key"
earn-watch fetch --out ./feed
```

Leave `EARN_AGENT_API_KEY` unset to skip the live agent API. The CLI then uses `fixtures/agent-api-live.json` for that source. See `.env.example`.

The key is optional. It is read from the environment only. `.env.example` is a placeholder with an empty value. It is never written to `listings.json`, `shortlist.md`, `feed.xml`, `discrepancies.md`, `discrepancies.json`, `diff.md`, `diff.json`, `snapshot.json`, `index.html`, `discrepancies.html`, or logs. Do not commit it. If you later run the manual Pages workflow, store it as an Actions secret named `EARN_AGENT_API_KEY`.

## What `fetch` writes

Every markdown and JSON file carries a generated-at timestamp. The prose files also carry the disclaimer above.

| File | Role |
| --- | --- |
| `listings.json` | Normalized agent-eligible open listings. Schema version 1. |
| `shortlist.md` | The same rows, sorted by deadline (soonest first) and then reward (highest first). |
| `feed.xml` | RSS 2.0 for the same rows, in that same order. |
| `discrepancies.md` | OPEN and agent-eligible public-feed rows whose slug is missing from the agent source. |
| `discrepancies.json` | The same rows, schema version 1. |
| `diff.md` | Human report: `new`, `changed` (deadline or reward), `closed`, and deadline within 72 hours. |
| `diff.json` | The same diff, schema version 1, for agents. |
| `snapshot.json` | Copy of this run's `listings.json`. The next fetch diffs against it. |

Keep `snapshot.json` between runs. The first successful fetch in a directory is a baseline: new, changed, and closed stay empty, and deadline within 72 hours is still filled from the current rows. An unreadable `snapshot.json` is ignored, the fetch still writes a new baseline, and stderr says why.

`listings.json` is schema version 1:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-30T00:00:00.000Z",
  "disclaimer": "Unofficial feed. Not affiliated with Superteam. Listings may be stale. Verify each listing on https://earn.superteam.fun before acting on it.",
  "sources": { "agentApi": "fixture", "publicFeed": "fixture" },
  "warnings": [],
  "skipped": 0,
  "listings": [
    {
      "slug": "sample-agent-only-integration-notes",
      "title": "Sample: agent-only integration notes",
      "type": "project",
      "sponsor": "Sample Labs",
      "reward": { "amount": 2000, "token": "USDC" },
      "deadline": "2026-12-01T00:00:00.000Z",
      "skills": [],
      "agentAccess": "AGENT_ONLY",
      "status": "OPEN",
      "url": "https://superteam.fun/earn/listing/sample-agent-only-integration-notes",
      "fetchedAt": "2026-10-30T00:00:00.000Z"
    }
  ]
}
```

Listing URLs use `https://superteam.fun/earn/listing/<slug>`.

The normalized fields are `slug`, `title`, `type`, `sponsor`, `reward.amount`, `reward.token`, `deadline` (UTC), `skills`, `agentAccess`, `status`, `url`, and `fetchedAt`. Earn list payloads often omit `skills`; the array is empty unless the source includes them. Skill objects of the form `{ "skills": "Content", "subskills": ["Research"] }` are flattened to unique strings.

Rows are kept when `agentAccess` is `AGENT_ALLOWED` or `AGENT_ONLY` and `status` is `OPEN`. If either field is missing or null, that field is not used to reject the row. `HUMAN_ONLY` and any status other than `OPEN` are dropped.

The same slug from both sources is merged. A live agent response wins conflicts. Recorded agent fixtures do not overwrite a live public feed; live public fields win, and empty skills are filled from the other side. When the key is unset and the public feed is live, the shortlist warns and names the sample-only slugs. A slug that also appears on the live feed keeps the live fields.

### Diff

`changed` means the deadline instant or the reward amount or token differs. Title, sponsor, and skills edits are left out. `closed` means the slug was in the previous snapshot and this fetch did not return it. `new` means the slug is in this fetch and was absent from the previous snapshot. Deadline within 72 hours is computed from this fetch alone: remaining time is strictly under 72 hours, so overdue `OPEN` rows are included. A row can be both new and inside that window.

`diff.json` has the same groups: `new`, `changed`, `closed`, and `deadlineWithin72h`. `baseline` is true when there was no usable snapshot. `comparedTo` is the previous `generatedAt`, or null on a baseline.

An offline baseline (`fetch --offline` with no `snapshot.json` yet) reports zero new, changed, and closed rows. With the recorded fixtures and a clock after 2026-08-28, the deadline window includes the two sample rows whose deadlines are already past:

```markdown
# Listing diff

Unofficial feed. Not affiliated with Superteam. Listings may be stale. Verify each listing on https://earn.superteam.fun before acting on it.

Generated: 2026-10-30T00:00:00.000Z
Previous snapshot: none. This fetch is the baseline written to snapshot.json.

New, changed, and closed compare this fetch with the previous snapshot. A listing can also appear under deadline within 72 hours.
Deadline within 72 hours means the deadline is strictly less than 72 hours after this fetch, including deadlines that have already passed.

## New (0)

In this fetch, missing from the previous snapshot.

None.

## Changed (0)

Deadline or reward differs from the previous snapshot. Title, sponsor, and skills edits are omitted.

None.

## Closed (0)

In the previous snapshot, missing from this fetch.

None.

## Deadline within 72 hours (2)

Strictly under 72 hours from this fetch, including overdue rows.

| Deadline (UTC) | Reward | Title | URL |
| --- | --- | --- | --- |
| 2026-07-06T00:00:00.000Z | 300 USDC | Sample: stale open listing still marked OPEN | https://superteam.fun/earn/listing/sample-stale-open-listing |
| 2026-08-28T21:59:59.000Z | 500 USDC | Sample: NFT locks on Streamflow (issue 1456 shape) | https://superteam.fun/earn/listing/twitter-post-about-nft-locks-on-streamflow |
```

A later fetch that sees a reward and deadline edit adds a changed row. Only the fields that moved use `->`:

```markdown
## Changed (1)

Deadline or reward differs from the previous snapshot. Title, sponsor, and skills edits are omitted.

| Slug | Title | Deadline | Reward | Changed | URL |
| --- | --- | --- | --- | --- | --- |
| sample-agent-only-integration-notes | Sample: agent-only integration notes | 2026-12-01T00:00:00.000Z -> 2026-12-03T00:00:00.000Z | 500 USDC -> 2000 USDC | deadline, reward | https://superteam.fun/earn/listing/sample-agent-only-integration-notes |
```

A second offline fetch with unchanged fixtures reports `new 0, changed 0, closed 0` again. The deadline window stays, because it is based on the clock rather than the snapshot.

### RSS

`feed.xml` is RSS 2.0. The channel link is `https://earn.superteam.fun`. Each item's link and guid are the listing URL. `pubDate` is the fetch time. The description carries reward, deadline, sponsor, type, access, status, and skills. Item order matches the shortlist.

Offline mode appends its warning to the channel description. The first item below is the soonest deadline in the recorded fixtures:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Agent-eligible Superteam Earn listings</title>
    <link>https://earn.superteam.fun</link>
    <description>Unofficial feed. Not affiliated with Superteam. Listings may be stale. Verify each listing on https://earn.superteam.fun before acting on it. Sources: agent API fixture, public feed fixture. Offline mode: both sources are recorded fixtures. Nothing was fetched from the network.</description>
    <lastBuildDate>Fri, 30 Oct 2026 00:00:00 GMT</lastBuildDate>
    <generator>earn-agent-feed/0.2.0</generator>
    <item>
      <title>Sample: stale open listing still marked OPEN</title>
      <link>https://superteam.fun/earn/listing/sample-stale-open-listing</link>
      <guid isPermaLink="true">https://superteam.fun/earn/listing/sample-stale-open-listing</guid>
      <pubDate>Fri, 30 Oct 2026 00:00:00 GMT</pubDate>
      <category>hackathon</category>
      <description>300 USDC. Deadline 2026-07-06T00:00:00.000Z. Sponsor Sample Sponsor. Type hackathon. Access AGENT_ALLOWED. Status OPEN. Skills none.</description>
    </item>
  </channel>
</rss>
```

### Discrepancies

`discrepancies.md` lists public-feed rows that are explicitly `OPEN` and `AGENT_ALLOWED` or `AGENT_ONLY`, and whose slug does not appear anywhere in the agent payload. A missing or null `agentAccess` or `status` stays in the shortlist when the other checks pass, and stays out of this file. A slug the agent payload returns as `CLOSED` or `HUMAN_ONLY` is present, so it is not a discrepancy.

The recorded fixtures include one such row, the sample shaped like issue #1456:

```markdown
# Public feed discrepancies

Unofficial feed. Not affiliated with Superteam. Listings may be stale. Verify each listing on https://earn.superteam.fun before acting on it.

Generated: 2026-10-30T00:00:00.000Z
Sources: agent API fixture, public feed fixture

These rows are OPEN and agent-eligible (`AGENT_ALLOWED` or `AGENT_ONLY`) on the public listings feed, and the slug is missing from the agent source.
The agent source is the live agent endpoint when `EARN_AGENT_API_KEY` is set, and `fixtures/agent-api-live.json` otherwise.
This is the gap reported in SuperteamDAO/earn #1456: https://github.com/SuperteamDAO/earn/issues/1456

This run did not call the live agent endpoint. The list is relative to the recorded agent fixture.

## Missing from the agent source (1)

| Slug | Deadline (UTC) | Reward | Title | Sponsor | Type | Access | URL |
| --- | --- | --- | --- | --- | --- | --- | --- |
| twitter-post-about-nft-locks-on-streamflow | 2026-08-28T21:59:59.000Z | 500 USDC | Sample: NFT locks on Streamflow (issue 1456 shape) | Streamflow | bounty | AGENT_ALLOWED | https://superteam.fun/earn/listing/twitter-post-about-nft-locks-on-streamflow |
```

That check is live only when `EARN_AGENT_API_KEY` is set and the agent request succeeds. Without a key, the agent source is `fixtures/agent-api-live.json`. A live public feed compared with that fixture will list every eligible public slug the sample file omits. Read the fixture sentence in the file before treating those rows as a live outage.

## Data sources

| Source | Role | When it is used |
| --- | --- | --- |
| `GET https://superteam.fun/api/agents/listings/live` | Primary. Official agent API. | Only if `EARN_AGENT_API_KEY` is set and `--offline` is not. |
| `GET https://earn.superteam.fun/api/listings?take=100` | Cross-check. Undocumented feed the website uses. | Best-effort on every online fetch. |
| `fixtures/agent-api-live.json` and `fixtures/public-listings.json` | Recorded samples, including the public slug from issue #1456 that the sample agent payload omits. | Agent source when the key is unset. Both sources with `--offline`. Public source when that request fails. |

The public `/api/listings` route is undocumented. Treat it as a cross-check, not a contract. If the request fails (including in CI without network), the command continues with fixtures.

There is no published read rate limit for the agent listings endpoint. Registration and submission limits are documented in the skill file; this CLI does not call those routes. If you automate `fetch` later, poll at most once every 10 minutes, back off on HTTP 429, and keep the identifying `User-Agent`.

The fixtures are sample data for offline tests. They are not a live snapshot of Earn.

## Library

The npm package exports the zod schemas and the fetch pipeline (`loadFeed`, `loadFeedReport`, `ListingSchema`, `FeedFileSchema`). `loadFeedReport` adds the discrepancy list. `diffListings` compares two feed files. `AgentListingsClient` is the seam for the official API: `LiveAgentListingsClient` performs the GET, and `FixtureAgentListingsClient` replays a payload. Callers that do not have a key receive the fixture client and do not touch the network.

## Development

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run build:site
```

Tests use the recorded fixtures and an injected `fetch`. They do not call Superteam and do not need a key. `npm run build:site` is offline too.

GitHub Actions runs lint, typecheck, test, build, and the offline site build on push and pull request. That job does not receive `EARN_AGENT_API_KEY`.

## Not in this version

- A scheduled publish. `.github/workflows/feed.yml` is manual while the repository is private. It does not enable Pages and does not change visibility.
- Registering an agent or calling `POST /api/agents`
- Submitting to bounties, wallets, signing, payouts, or market data
- Posting `docs/upstream-issue-DRAFT.md` or submitting `docs/writeup-DRAFT.md`

## License

[Apache-2.0](LICENSE). Copyright 2026 earn-agent-feed contributors.
