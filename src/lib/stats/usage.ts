import { createHmac, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import {
  isSourceKind,
  type SourceKind,
} from "@/lib/stats/source-kind";

export const USAGE_RETENTION_MONTHS = 6;
export const USAGE_WINDOW_DAYS = 30;

const VISIT_CAP_PER_DAY = 10_000;
const PRUNE_EVERY = 25;

const EVENT_TYPES = [
  "visit",
  "resolve",
  "export",
  "download",
  "tts",
  "rate_limited",
] as const;

export type UsageEventType = (typeof EVENT_TYPES)[number];

export type UsageBucket = "resolve" | "export" | "tts" | "prepare";

export interface UsageEvent {
  t: string;
  type: UsageEventType;
  visitor: string;
  ok?: boolean;
  sourceKind?: SourceKind;
  stories?: number;
  errorCode?: string;
  bucket?: UsageBucket;
}

export interface UsageInput {
  type: UsageEventType;
  visitorIp: string;
  ok?: boolean;
  sourceKind?: string;
  stories?: number;
  errorCode?: string;
  bucket?: string;
}

export interface UsageTotals {
  visitors: number;
  resolvesOk: number;
  resolvesFail: number;
  exports: number;
  downloads: number;
  stories: number;
  singleStoryPacks: number;
  multiStoryPacks: number;
  tts: number;
  rateLimited: number;
}

export interface UsageDay extends UsageTotals {
  day: string;
}

export interface UsageReport {
  today: UsageTotals;
  last7: UsageTotals;
  last30: UsageTotals;
  /** Totaux sur les 6 derniers mois. */
  semester: UsageTotals;
  /** Visiteurs des 6 derniers mois, selon le nombre de jours distincts où ils apparaissent. */
  frequency: { once: number; few: number; regular: number };
  /** 30 derniers jours, du plus récent au plus ancien. */
  days: UsageDay[];
  /** 6 derniers mois, du plus ancien au plus récent. Sert aux courbes. */
  history: UsageDay[];
  sourceKinds: Array<{ kind: SourceKind; ok: number; fail: number }>;
  errorCodes: Array<{ code: string; count: number }>;
  rateLimitedByBucket: Record<UsageBucket, number>;
}

const parisDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function parisDay(date: Date): string {
  return parisDayFormatter.format(date);
}

export function addCalendarDays(day: string, delta: number): string {
  const parts = day.split("-").map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const date = parts[2] ?? 1;
  const utc = new Date(Date.UTC(year, month - 1, date + delta));
  return formatUtcDay(utc);
}

export function addCalendarMonths(day: string, delta: number): string {
  const parts = day.split("-").map(Number);
  const year = parts[0] ?? 1970;
  const month = (parts[1] ?? 1) - 1;
  const date = parts[2] ?? 1;
  const monthStart = new Date(Date.UTC(year, month + delta, 1));
  const lastDay = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)
  ).getUTCDate();
  return formatUtcDay(
    new Date(
      Date.UTC(
        monthStart.getUTCFullYear(),
        monthStart.getUTCMonth(),
        Math.min(date, lastDay)
      )
    )
  );
}

function formatUtcDay(utc: Date): string {
  const yyyy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function daysFrom(start: string, end: string): string[] {
  const days: string[] = [];
  let cursor = start;
  while (cursor <= end && days.length < 400) {
    days.push(cursor);
    cursor = addCalendarDays(cursor, 1);
  }
  return days;
}

export function fingerprintVisitor(ip: string, salt: string): string {
  return createHmac("sha256", salt).update(ip).digest("hex").slice(0, 16);
}

let dataDirOverride: string | null = null;
let nowFn = () => new Date();
let tail: Promise<void> = Promise.resolve();
let appendsSincePrune = 0;
let seenVisitDay = "";
const seenVisits = new Set<string>();
let loggedWriteError = false;

export function setUsageDataDirForTests(dir: string | null): void {
  dataDirOverride = dir;
}

export function setUsageNowForTests(fn: (() => Date) | null): void {
  nowFn = fn ?? (() => new Date());
}

export function _resetUsageForTests(): void {
  dataDirOverride = null;
  nowFn = () => new Date();
  tail = Promise.resolve();
  appendsSincePrune = 0;
  seenVisitDay = "";
  seenVisits.clear();
  loggedWriteError = false;
}

export function flushUsageWrites(): Promise<void> {
  return tail;
}

function dataDir(): string {
  if (dataDirOverride) return dataDirOverride;
  const fromEnv = process.env.USAGE_DATA_DIR?.trim();
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), "data");
}

function usageFile(): string {
  return path.join(dataDir(), "usage.jsonl");
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function rememberVisit(ip: string, day: string): boolean {
  if (seenVisitDay !== day) {
    seenVisits.clear();
    seenVisitDay = day;
  }
  if (seenVisits.has(ip)) return false;
  if (seenVisits.size >= VISIT_CAP_PER_DAY) return false;
  seenVisits.add(ip);
  return true;
}

function sanitizeErrorCode(code: string | undefined): string | undefined {
  if (!code) return undefined;
  if (!/^[A-Z0-9_]{1,40}$/.test(code)) return "UNKNOWN";
  return code;
}

function sanitizeStories(stories: number | undefined): number | undefined {
  if (stories === undefined) return undefined;
  if (!Number.isInteger(stories) || stories < 0 || stories > 500) return undefined;
  return stories;
}

function sanitizeBucket(bucket: string | undefined): UsageBucket | undefined {
  if (
    bucket === "resolve" ||
    bucket === "export" ||
    bucket === "tts" ||
    bucket === "prepare"
  ) {
    return bucket;
  }
  return undefined;
}

function sanitizeKind(kind: string | undefined): SourceKind | undefined {
  if (!kind) return undefined;
  return isSourceKind(kind) ? kind : "autre";
}

async function loadSalt(dir: string): Promise<string> {
  const saltPath = path.join(dir, "visitor-salt");
  try {
    const existing = (await readFile(saltPath, "utf8")).trim();
    if (/^[a-f0-9]{64}$/.test(existing)) return existing;
  } catch {
    // créé ci-dessous
  }
  const salt = randomBytes(32).toString("hex");
  await writeFile(saltPath, `${salt}\n`, "utf8");
  return salt;
}

function parseEvent(line: string): UsageEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.t !== "string" || Number.isNaN(Date.parse(raw.t))) return null;
  if (typeof raw.type !== "string" || !EVENT_TYPES.includes(raw.type as UsageEventType)) {
    return null;
  }
  if (typeof raw.visitor !== "string" || !/^[a-f0-9]{16}$/.test(raw.visitor)) {
    return null;
  }

  const event: UsageEvent = {
    t: new Date(raw.t).toISOString(),
    type: raw.type as UsageEventType,
    visitor: raw.visitor,
  };
  if (typeof raw.ok === "boolean") event.ok = raw.ok;
  if (typeof raw.sourceKind === "string") {
    event.sourceKind = sanitizeKind(raw.sourceKind);
  }
  if (typeof raw.stories === "number") {
    const stories = sanitizeStories(raw.stories);
    if (stories !== undefined) event.stories = stories;
  }
  if (typeof raw.errorCode === "string") {
    event.errorCode = sanitizeErrorCode(raw.errorCode);
  }
  if (typeof raw.bucket === "string") {
    event.bucket = sanitizeBucket(raw.bucket);
  }
  return event;
}

async function readAndPrune(now: Date): Promise<UsageEvent[]> {
  const file = usageFile();
  let raw = "";
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw error;
  }

  const minDay = addCalendarMonths(parisDay(now), -USAGE_RETENTION_MONTHS);
  const kept: UsageEvent[] = [];
  let dropped = 0;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const event = parseEvent(trimmed);
    if (!event || parisDay(new Date(event.t)) < minDay) {
      dropped += 1;
      continue;
    }
    kept.push(event);
  }

  if (dropped > 0) {
    const body = kept.map((event) => JSON.stringify(event)).join("\n");
    await writeFile(file, body.length > 0 ? `${body}\n` : "", "utf8");
  }
  return kept;
}

async function appendEvent(input: UsageInput, now: Date): Promise<void> {
  const dir = dataDir();
  await mkdir(dir, { recursive: true });
  const salt = await loadSalt(dir);
  const event: UsageEvent = {
    t: now.toISOString(),
    type: input.type,
    visitor: fingerprintVisitor(input.visitorIp, salt),
  };
  if (typeof input.ok === "boolean") event.ok = input.ok;
  const kind = sanitizeKind(input.sourceKind);
  if (kind) event.sourceKind = kind;
  const stories = sanitizeStories(input.stories);
  if (stories !== undefined) event.stories = stories;
  const errorCode = sanitizeErrorCode(input.errorCode);
  if (errorCode) event.errorCode = errorCode;
  const bucket = sanitizeBucket(input.bucket);
  if (bucket) event.bucket = bucket;

  await appendFile(usageFile(), `${JSON.stringify(event)}\n`, "utf8");
  appendsSincePrune += 1;
  if (appendsSincePrune >= PRUNE_EVERY) {
    appendsSincePrune = 0;
    await readAndPrune(now);
  }
}

export function recordUsage(input: UsageInput): void {
  const now = nowFn();
  if (input.type === "visit") {
    const day = parisDay(now);
    if (!rememberVisit(input.visitorIp, day)) return;
  }

  void enqueue(async () => {
    try {
      await appendEvent(input, now);
    } catch {
      if (!loggedWriteError) {
        loggedWriteError = true;
        console.error(
          "usage: écriture impossible dans le dossier data (volume manquant ou non accessible)"
        );
      }
    }
  });
}

function emptyTotals(): UsageTotals {
  return {
    visitors: 0,
    resolvesOk: 0,
    resolvesFail: 0,
    exports: 0,
    downloads: 0,
    stories: 0,
    singleStoryPacks: 0,
    multiStoryPacks: 0,
    tts: 0,
    rateLimited: 0,
  };
}

interface DayBucket {
  visitors: Set<string>;
  totals: UsageTotals;
}

function ensureDay(map: Map<string, DayBucket>, day: string): DayBucket {
  let bucket = map.get(day);
  if (!bucket) {
    bucket = { visitors: new Set(), totals: emptyTotals() };
    map.set(day, bucket);
  }
  return bucket;
}

function applyEvent(bucket: DayBucket, event: UsageEvent): void {
  bucket.visitors.add(event.visitor);
  const totals = bucket.totals;
  if (event.type === "resolve") {
    if (event.ok) totals.resolvesOk += 1;
    else totals.resolvesFail += 1;
  } else if (event.type === "export" && event.ok) {
    totals.exports += 1;
    const stories = event.stories ?? 0;
    totals.stories += stories;
    if (stories === 1) totals.singleStoryPacks += 1;
    else if (stories >= 2) totals.multiStoryPacks += 1;
  } else if (event.type === "download" && event.ok !== false) {
    totals.downloads += 1;
  } else if (event.type === "tts" && event.ok) {
    totals.tts += 1;
  } else if (event.type === "rate_limited") {
    totals.rateLimited += 1;
  }
}

function totalsForDays(keys: string[], map: Map<string, DayBucket>): UsageTotals {
  const visitors = new Set<string>();
  const totals = emptyTotals();
  for (const key of keys) {
    const bucket = map.get(key);
    if (!bucket) continue;
    for (const visitor of bucket.visitors) visitors.add(visitor);
    totals.resolvesOk += bucket.totals.resolvesOk;
    totals.resolvesFail += bucket.totals.resolvesFail;
    totals.exports += bucket.totals.exports;
    totals.downloads += bucket.totals.downloads;
    totals.stories += bucket.totals.stories;
    totals.singleStoryPacks += bucket.totals.singleStoryPacks;
    totals.multiStoryPacks += bucket.totals.multiStoryPacks;
    totals.tts += bucket.totals.tts;
    totals.rateLimited += bucket.totals.rateLimited;
  }
  totals.visitors = visitors.size;
  return totals;
}

function dayPoint(day: string, map: Map<string, DayBucket>): UsageDay {
  const bucket = map.get(day);
  return {
    day,
    ...(bucket
      ? { ...bucket.totals, visitors: bucket.visitors.size }
      : emptyTotals()),
  };
}

export function aggregateUsage(events: UsageEvent[], now: Date): UsageReport {
  const today = parisDay(now);
  const historyKeys = daysFrom(
    addCalendarMonths(today, -USAGE_RETENTION_MONTHS),
    today
  );
  const last30Keys = Array.from({ length: USAGE_WINDOW_DAYS }, (_, index) =>
    addCalendarDays(today, index - (USAGE_WINDOW_DAYS - 1))
  );
  const last7Keys = last30Keys.slice(-7);
  const inHistory = new Set(historyKeys);
  const byDay = new Map<string, DayBucket>();
  const kindCounts = new Map<SourceKind, { ok: number; fail: number }>();
  const errorCounts = new Map<string, number>();
  const rateLimitedByBucket: Record<UsageBucket, number> = {
    resolve: 0,
    export: 0,
    tts: 0,
    prepare: 0,
  };
  const daysSeen = new Map<string, Set<string>>();

  for (const event of events) {
    const day = parisDay(new Date(event.t));
    applyEvent(ensureDay(byDay, day), event);
    if (!inHistory.has(day)) continue;

    let seen = daysSeen.get(event.visitor);
    if (!seen) {
      seen = new Set();
      daysSeen.set(event.visitor, seen);
    }
    seen.add(day);

    if (event.type === "resolve" && event.sourceKind) {
      const current = kindCounts.get(event.sourceKind) ?? { ok: 0, fail: 0 };
      if (event.ok) current.ok += 1;
      else current.fail += 1;
      kindCounts.set(event.sourceKind, current);
    }
    if (event.ok === false && event.errorCode && event.type !== "rate_limited") {
      errorCounts.set(event.errorCode, (errorCounts.get(event.errorCode) ?? 0) + 1);
    }
    if (event.type === "rate_limited" && event.bucket) {
      rateLimitedByBucket[event.bucket] += 1;
    }
  }

  const frequency = { once: 0, few: 0, regular: 0 };
  for (const days of daysSeen.values()) {
    if (days.size >= 4) frequency.regular += 1;
    else if (days.size >= 2) frequency.few += 1;
    else frequency.once += 1;
  }

  return {
    today: totalsForDays([today], byDay),
    last7: totalsForDays(last7Keys, byDay),
    last30: totalsForDays(last30Keys, byDay),
    semester: totalsForDays(historyKeys, byDay),
    frequency,
    days: [...last30Keys].reverse().map((day) => dayPoint(day, byDay)),
    history: historyKeys.map((day) => dayPoint(day, byDay)),
    sourceKinds: [...kindCounts.entries()]
      .map(([kind, counts]) => ({ kind, ...counts }))
      .sort((a, b) => b.ok + b.fail - (a.ok + a.fail)),
    errorCodes: [...errorCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
    rateLimitedByBucket,
  };
}

export function loadUsageReport(): Promise<UsageReport> {
  const now = nowFn();
  return enqueue(async () => {
    const events = await readAndPrune(now);
    return aggregateUsage(events, now);
  });
}
