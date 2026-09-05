import { env } from "@/lib/shared/env";
import { err, ok, type Result } from "@/lib/shared/result";

type Bucket = "resolve" | "export";

interface WindowState {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowState>();

/** Injectable pour les tests. */
let nowFn = () => Date.now();

export function setRateLimitNowForTests(fn: (() => number) | null): void {
  nowFn = fn ?? (() => Date.now());
}

export function _resetRateLimitForTests(): void {
  windows.clear();
  nowFn = () => Date.now();
}

export function checkRateLimit(
  ip: string,
  bucket: Bucket
): Result<true> {
  const key = `${ip}::${bucket}`;
  const now = nowFn();
  const windowMs = 60_000;
  const limit = env.RATE_LIMIT_PER_MINUTE;

  let state = windows.get(key);
  if (!state || now >= state.resetAt) {
    state = { count: 0, resetAt: now + windowMs };
    windows.set(key, state);
  }

  if (state.count >= limit) {
    return err(
      "Trop de requêtes, réessaie dans une minute.",
      "RATE_LIMITED"
    );
  }

  state.count += 1;
  return ok(true);
}
