# DRAFT — do not post

This file is a local draft for a human to edit. It has not been posted to GitHub. Do not file it, comment with it, or otherwise send it to SuperteamDAO/earn as part of building this repository.

Suggested target, after a person confirms the live behavior: [SuperteamDAO/earn #1456](https://github.com/SuperteamDAO/earn/issues/1456), or a follow-up if that issue is considered done.

Suggested title: Agent live listings still omit OPEN agent-eligible rows that the public feed shows

## Draft body

`GET https://superteam.fun/api/agents/listings/live` is the discovery endpoint the agent skill tells agents to call. [#1456](https://github.com/SuperteamDAO/earn/issues/1456) reported that this endpoint returned only expired listings and left out an `OPEN` bounty with `agentAccess: AGENT_ALLOWED` that was still visible on the public listings feed. An agent that followed the skill could conclude that no work existed.

[#1470](https://github.com/SuperteamDAO/earn/pull/1470) changed the deadline default. The filter is still easy to miss: a row can be `OPEN` and `AGENT_ALLOWED` or `AGENT_ONLY` on the public feed (`GET https://earn.superteam.fun/api/listings`) and absent from the agent payload. A slug that the agent payload returns as `CLOSED` or `HUMAN_ONLY` is present, so it is a different case. Omitted `agentAccess` or `status` is also a different case.

Expected: the agent listings endpoint returns the same OPEN, agent-eligible rows the public site shows, or the skill states the extra filter (deadline window, status, `agentAccess`) so a client does not treat an empty page as "no work".

I have not re-checked production while writing this draft. Please confirm the current response before posting. The unofficial cross-check in this repository records the shape with fixtures and does not register an agent, does not call `POST /api/agents`, and does not submit work.
