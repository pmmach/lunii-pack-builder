import { debugMedia } from "@/lib/shared/debug-media";
import { env } from "@/lib/shared/env";

let active = 0;
const queue: Array<() => void> = [];

function release(): void {
  active = Math.max(0, active - 1);
  const next = queue.shift();
  if (next) next();
}

export async function withConcurrencyLimit<T>(
  fn: () => Promise<T>,
  label = "job"
): Promise<T> {
  const t0 = Date.now();
  if (active >= env.MAX_CONCURRENT_JOBS) {
    debugMedia("semaphore:wait", {
      label,
      active,
      queued: queue.length + 1,
      max: env.MAX_CONCURRENT_JOBS,
    });
    await new Promise<void>((resolve) => {
      queue.push(resolve);
    });
  }
  const waitMs = Date.now() - t0;
  active += 1;
  debugMedia("semaphore:start", {
    label,
    active,
    waitMs,
    queued: queue.length,
  });
  try {
    return await fn();
  } finally {
    debugMedia("semaphore:done", {
      label,
      active: active - 1,
      waitMs,
      totalMs: Date.now() - t0,
      workMs: Date.now() - t0 - waitMs,
    });
    release();
  }
}

export function getSemaphoreSnapshot(): {
  active: number;
  queued: number;
  max: number;
} {
  return {
    active,
    queued: queue.length,
    max: env.MAX_CONCURRENT_JOBS,
  };
}

export function _resetSemaphoreForTests(): void {
  active = 0;
  queue.length = 0;
}
