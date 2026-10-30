const AGENT_ELIGIBLE = new Set(["AGENT_ALLOWED", "AGENT_ONLY"]);

/**
 * Keep a raw listing when it is agent-eligible and open.
 * A missing or null `agentAccess` / `status` does not reject the row.
 * Present values must be AGENT_ALLOWED|AGENT_ONLY and OPEN.
 */
export function isAgentEligibleOpen(raw: unknown): boolean {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  const record = raw as Record<string, unknown>;
  if ("agentAccess" in record && record.agentAccess != null) {
    if (
      typeof record.agentAccess !== "string" ||
      !AGENT_ELIGIBLE.has(record.agentAccess)
    ) {
      return false;
    }
  }
  if ("status" in record && record.status != null) {
    if (record.status !== "OPEN") {
      return false;
    }
  }
  return true;
}

export function filterRawListings(rows: unknown[]): unknown[] {
  return rows.filter((row) => isAgentEligibleOpen(row));
}
