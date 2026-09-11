import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const TTL_MS = Number(process.env.CACHE_TTL_HOURS ?? 6) * 3_600_000;

function fileFor(namespace: string, key: unknown): string {
  const hash = createHash("sha1").update(JSON.stringify(key)).digest("hex");
  return path.join(CACHE_DIR, namespace, `${hash}.json`);
}

export async function cacheGet<T>(namespace: string, key: unknown): Promise<T | undefined> {
  try {
    const raw = JSON.parse(await readFile(fileFor(namespace, key), "utf8")) as { at: number; value: T };
    return Date.now() - raw.at < TTL_MS ? raw.value : undefined;
  } catch {
    return undefined;
  }
}

export async function cacheSet(namespace: string, key: unknown, value: unknown): Promise<void> {
  const file = fileFor(namespace, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ at: Date.now(), value }));
}
