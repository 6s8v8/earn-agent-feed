import { describe, expect, it } from "vitest";

import { isAgentEligibleOpen } from "../src/filter.js";

describe("isAgentEligibleOpen", () => {
  it("keeps AGENT_ALLOWED and AGENT_ONLY when status is OPEN", () => {
    expect(isAgentEligibleOpen({ agentAccess: "AGENT_ALLOWED", status: "OPEN" })).toBe(true);
    expect(isAgentEligibleOpen({ agentAccess: "AGENT_ONLY", status: "OPEN" })).toBe(true);
  });

  it("drops human-only, closed, and review listings", () => {
    expect(isAgentEligibleOpen({ agentAccess: "HUMAN_ONLY", status: "OPEN" })).toBe(false);
    expect(isAgentEligibleOpen({ agentAccess: "AGENT_ALLOWED", status: "CLOSED" })).toBe(false);
    expect(isAgentEligibleOpen({ agentAccess: "AGENT_ONLY", status: "REVIEW" })).toBe(false);
  });

  it("keeps rows when agentAccess or status is missing or null", () => {
    expect(isAgentEligibleOpen({ slug: "omitted" })).toBe(true);
    expect(isAgentEligibleOpen({ agentAccess: null, status: "OPEN" })).toBe(true);
    expect(isAgentEligibleOpen({ agentAccess: "AGENT_ALLOWED", status: null })).toBe(true);
    expect(isAgentEligibleOpen({ agentAccess: null, status: null })).toBe(true);
  });

  it("drops unknown access values and non-objects", () => {
    expect(isAgentEligibleOpen({ agentAccess: "", status: "OPEN" })).toBe(false);
    expect(isAgentEligibleOpen({ agentAccess: "AGENT_ALLOWED", status: "open" })).toBe(false);
    expect(isAgentEligibleOpen(null)).toBe(false);
    expect(isAgentEligibleOpen([])).toBe(false);
    expect(isAgentEligibleOpen("OPEN")).toBe(false);
  });
});
