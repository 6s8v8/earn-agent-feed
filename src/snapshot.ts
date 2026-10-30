import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { FeedFileSchema, type FeedFile } from "./schema.js";

export const SNAPSHOT_FILENAME = "snapshot.json";

export type SnapshotRead =
  | { status: "missing" }
  | { status: "ok"; feed: FeedFile }
  | { status: "invalid"; message: string };

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export async function readSnapshot(outDir: string): Promise<SnapshotRead> {
  const snapshotPath = path.join(outDir, SNAPSHOT_FILENAME);
  let text: string;
  try {
    text = await readFile(snapshotPath, "utf8");
  } catch (error) {
    if (isEnoent(error)) {
      return { status: "missing" };
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { status: "invalid", message: "snapshot.json is not valid JSON" };
  }

  const result = FeedFileSchema.safeParse(parsed);
  if (!result.success) {
    return {
      status: "invalid",
      message: "snapshot.json does not match the listings feed schema",
    };
  }
  return { status: "ok", feed: result.data };
}

export async function writeSnapshot(outDir: string, feed: FeedFile): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const snapshotPath = path.join(outDir, SNAPSHOT_FILENAME);
  const parsed = FeedFileSchema.parse(feed);
  await writeFile(snapshotPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return snapshotPath;
}
