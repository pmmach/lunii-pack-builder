import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const STATS_COOKIE = "stats_auth";

export function readStatsToken(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

export function statsCookieOptions(
  maxAge = 60 * 60 * 24 * 30,
  secure = process.env.NODE_ENV === "production"
) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge,
  };
}

const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const ATTEMPT_LIMIT = 8;

interface AttemptState {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, AttemptState>();
let nowFn = () => Date.now();

export function setStatsAccessNowForTests(fn: (() => number) | null): void {
  nowFn = fn ?? (() => Date.now());
}

export function _resetStatsAccessForTests(): void {
  attempts.clear();
  nowFn = () => Date.now();
}

export function statsCookieValue(token: string): string {
  return createHmac("sha256", token).update("stats-auth").digest("hex");
}

export function passwordMatches(input: string, token: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b);
}

export function statsCookieMatches(
  cookie: string | undefined,
  token: string
): boolean {
  if (!cookie || !token) return false;
  const expected = statsCookieValue(token);
  const left = Buffer.from(cookie);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Retourne false quand l'IP a dépassé le plafond de tentatives. */
export function allowStatsAttempt(ip: string): boolean {
  const now = nowFn();
  let state = attempts.get(ip);
  if (!state || now >= state.resetAt) {
    state = { count: 0, resetAt: now + ATTEMPT_WINDOW_MS };
    attempts.set(ip, state);
  }
  if (state.count >= ATTEMPT_LIMIT) return false;
  state.count += 1;
  return true;
}
