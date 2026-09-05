import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/shared/env";

let started = false;

async function newestMtimeMs(dir: string): Promise<number> {
  let newest = 0;
  type DirentLike = { name: string; isDirectory: () => boolean };
  const entries = (await readdir(dir, { withFileTypes: true }).catch(
    () => [] as DirentLike[]
  )) as DirentLike[];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await newestMtimeMs(full);
      if (nested > newest) newest = nested;
    } else {
      const info = await stat(full).catch(() => null);
      if (info && info.mtimeMs > newest) newest = info.mtimeMs;
    }
  }
  const self = await stat(dir).catch(() => null);
  if (self && self.mtimeMs > newest) newest = self.mtimeMs;
  return newest;
}

async function purgeOnce(): Promise<number> {
  const root = path.join(process.cwd(), "workspace");
  const ttlMs = env.WORKSPACE_TTL_MINUTES * 60 * 1000;
  const cutoff = Date.now() - ttlMs;
  let cleaned = 0;

  type DirentLike = { name: string; isDirectory: () => boolean };
  const sessions = (await readdir(root, { withFileTypes: true }).catch(
    () => [] as DirentLike[]
  )) as DirentLike[];

  for (const entry of sessions) {
    if (!entry.isDirectory()) continue;
    const sessionDir = path.join(root, entry.name);
    const newest = await newestMtimeMs(sessionDir);
    if (newest > 0 && newest < cutoff) {
      await rm(sessionDir, { recursive: true, force: true }).catch(
        () => undefined
      );
      cleaned += 1;
    }
  }

  return cleaned;
}

export function startWorkspaceCleanupScheduler(): void {
  if (started) return;
  started = true;

  const intervalMs = 5 * 60 * 1000;
  setInterval(() => {
    void purgeOnce().then((n) => {
      if (n > 0) {
        console.info(`[cleanup] ${n} session(s) workspace purgée(s)`);
      }
    });
  }, intervalMs).unref?.();
}
