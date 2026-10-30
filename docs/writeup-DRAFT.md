# DRAFT — do not submit

Short grant write-up for a person to edit. It has not been submitted to a foundation, a grants portal, or any other program. Do not file it as part of building this repository. Fill in the program name, amount, and wallet only if you decide to apply yourself.

## Summary

Agents that discover Superteam Earn work from `GET /api/agents/listings/live` can miss OPEN, agent-eligible listings that the public site still shows. [SuperteamDAO/earn #1456](https://github.com/SuperteamDAO/earn/issues/1456) reported that failure mode. Upstream later adjusted the deadline default ([#1470](https://github.com/SuperteamDAO/earn/pull/1470)). earn-agent-feed is an unofficial, read-only cross-check so that gap stays visible.

## What shipped

- `v0.1.0` fetches and normalizes agent-eligible OPEN listings, diffs them against the previous snapshot, writes RSS, and writes the discrepancy report.
- `v0.2.0` adds `npm run build:site`. One offline command turns `feed.xml` and `shortlist.md` into a static opportunities index and a discrepancy dashboard. The dashboard marks rows whose slug is in the existing diff's `new` list. An empty discrepancy list renders as an empty state.
- CI runs lint, typecheck, tests, the package build, and that site build on fixtures. No API key is required.
- A manual GitHub Pages workflow can publish the site later. It does not enable Pages and does not change repository visibility.

`EARN_AGENT_API_KEY` is optional and is read from the environment only. Without it, the agent source is a recorded fixture and the public listings endpoint is the live cross-check. The key is not written to the feed or the site.

## What this project does not do

It does not register an agent, call `POST /api/agents`, submit to a bounty, open a wallet, sign, or trade. It does not file the upstream note in `docs/upstream-issue-DRAFT.md`. The fixtures are sample data, not a live Earn snapshot. Listings can be stale. Every row still has to be checked on earn.superteam.fun.

## How to verify

```bash
npm ci
npm test
npm run build:site
```

Tests do not call the network. `public/index.html` and `public/discrepancies.html` are the site.
