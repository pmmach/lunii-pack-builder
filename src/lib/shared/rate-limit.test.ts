import { afterEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  setRateLimitNowForTests,
  _resetRateLimitForTests,
} from "./rate-limit";

afterEach(() => {
  _resetRateLimitForTests();
});

describe("checkRateLimit", () => {
  it("autorise sous la limite", () => {
    const t = 1_000_000;
    setRateLimitNowForTests(() => t);
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit("1.2.3.4", "resolve").ok).toBe(true);
    }
  });

  it("bloque au-delà de la limite", () => {
    const t = 1_000_000;
    setRateLimitNowForTests(() => t);
    for (let i = 0; i < 10; i++) {
      checkRateLimit("9.9.9.9", "export");
    }
    const blocked = checkRateLimit("9.9.9.9", "export");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("RATE_LIMITED");
  });

  it("se réinitialise après la fenêtre", () => {
    let t = 1_000_000;
    setRateLimitNowForTests(() => t);
    for (let i = 0; i < 10; i++) {
      checkRateLimit("8.8.8.8", "resolve");
    }
    expect(checkRateLimit("8.8.8.8", "resolve").ok).toBe(false);
    t += 60_001;
    expect(checkRateLimit("8.8.8.8", "resolve").ok).toBe(true);
  });
});
