# Changelog

## 0.2.0

- `npm run build:site` builds a static site from `feed.xml` and `shortlist.md`.
- `public/index.html` is an opportunities index. `public/discrepancies.html` is a discrepancy dashboard.
- The dashboard marks a row **New since last snapshot** when its slug is in the M1 diff (`diff.json` field `new`). An empty discrepancy list is a valid snapshot.
- `fetch` also writes `discrepancies.json` (schema version 1).
- CI runs lint, typecheck, test, build, and the offline site build on push and pull request. That job does not use secrets.
- `.github/workflows/feed.yml` publishes with `workflow_dispatch` only. It does not enable GitHub Pages and does not change repository visibility. `EARN_AGENT_API_KEY` is an optional Actions secret and is never printed. When it is unset, the agent source stays the recorded fixture and the public listings endpoint is still requested.
- `docs/upstream-issue-DRAFT.md` and `docs/writeup-DRAFT.md` are local drafts. This release does not post or submit them.

## 0.1.0

- Snapshot diff (`diff.md`, `diff.json`), RSS (`feed.xml`), and the #1456 discrepancy report (`discrepancies.md`).
- Offline fixtures, optional `EARN_AGENT_API_KEY` from the environment, and a public-listings cross-check.
