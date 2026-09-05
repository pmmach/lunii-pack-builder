import { env } from "@/lib/shared/env";

let active = 0;
const queue: Array<() => void> = [];

function release(): void {
  active = Math.max(0, active - 1);
  const next = queue.shift();
  if (next) next();
}

export async function withConcurrencyLimit<T>(
  fn: () => Promise<T>
): Promise<T> {
  if (active >= env.MAX_CONCURRENT_JOBS) {
    await new Promise<void>((resolve) => {
      queue.push(resolve);
    });
  }
  active += 1;
  try {
    return await fn();
  } finally {
    release();
  }
}

export function _resetSemaphoreForTests(): void {
  active = 0;
  queue.length = 0;
}
