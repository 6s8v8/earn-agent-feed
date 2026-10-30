import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const FIXTURE_FILES = {
  agent: "agent-api-live.json",
  publicFeed: "public-listings.json",
} as const;

export type FixtureName = keyof typeof FIXTURE_FILES;

export function fixturesDirectory(): string {
  return fileURLToPath(new URL("../fixtures/", import.meta.url));
}

export async function loadFixture(name: FixtureName): Promise<unknown> {
  const fileName = FIXTURE_FILES[name];
  const path = fileURLToPath(new URL(`../fixtures/${fileName}`, import.meta.url));
  const text = await readFile(path, "utf8");
  return JSON.parse(text) as unknown;
}
