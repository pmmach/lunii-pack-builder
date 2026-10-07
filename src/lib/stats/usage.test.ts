import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  _resetUsageForTests,
  aggregateUsage,
  flushUsageWrites,
  loadUsageReport,
  parisDay,
  recordUsage,
  setUsageDataDirForTests,
  setUsageNowForTests,
  type UsageEvent,
} from "./usage";

const NOW = new Date("2026-10-07T12:00:00.000Z");
let dir: string | null = null;

afterEach(async () => {
  await flushUsageWrites();
  _resetUsageForTests();
  if (dir) {
    await rm(dir, { recursive: true, force: true });
    dir = null;
  }
});

async function useTempDir(): Promise<void> {
  dir = await mkdtemp(path.join(tmpdir(), "lunii-usage-"));
  setUsageDataDirForTests(dir);
  setUsageNowForTests(() => NOW);
}

function at(iso: string): void {
  const date = new Date(iso);
  setUsageNowForTests(() => date);
}

describe("usage", () => {
  it("agrège visiteurs, packs, sources et fréquence", async () => {
    await useTempDir();

    at("2026-10-01T10:00:00.000Z");
    recordUsage({ type: "visit", visitorIp: "203.0.113.10" });
    recordUsage({
      type: "resolve",
      visitorIp: "203.0.113.10",
      ok: true,
      sourceKind: "rss",
    });
    recordUsage({
      type: "export",
      visitorIp: "203.0.113.10",
      ok: true,
      stories: 1,
    });

    at("2026-10-02T10:00:00.000Z");
    recordUsage({ type: "visit", visitorIp: "203.0.113.10" });
    recordUsage({
      type: "resolve",
      visitorIp: "198.51.100.8",
      ok: false,
      sourceKind: "spotify",
      errorCode: "NO_SHOW_NAME",
    });

    at("2026-10-04T10:00:00.000Z");
    recordUsage({ type: "visit", visitorIp: "203.0.113.10" });
    at("2026-10-06T10:00:00.000Z");
    recordUsage({ type: "visit", visitorIp: "203.0.113.10" });
    recordUsage({
      type: "export",
      visitorIp: "203.0.113.10",
      ok: true,
      stories: 3,
    });
    recordUsage({ type: "download", visitorIp: "203.0.113.10", ok: true });
    recordUsage({ type: "tts", visitorIp: "203.0.113.10", ok: true });
    recordUsage({
      type: "rate_limited",
      visitorIp: "203.0.113.10",
      bucket: "export",
    });
    recordUsage({
      type: "resolve",
      visitorIp: "203.0.113.10",
      ok: false,
      sourceKind: "pas-une-famille",
      errorCode: "code invalide",
    });

    at("2026-10-07T12:00:00.000Z");
    recordUsage({ type: "visit", visitorIp: "198.51.100.8" });

    const report = await loadUsageReport();
    expect(report.last30.visitors).toBe(2);
    expect(report.last30.resolvesOk).toBe(1);
    expect(report.last30.resolvesFail).toBe(2);
    expect(report.last30.exports).toBe(2);
    expect(report.last30.stories).toBe(4);
    expect(report.last30.singleStoryPacks).toBe(1);
    expect(report.last30.multiStoryPacks).toBe(1);
    expect(report.last30.downloads).toBe(1);
    expect(report.last30.tts).toBe(1);
    expect(report.last30.rateLimited).toBe(1);
    expect(report.rateLimitedByBucket.export).toBe(1);
    expect(report.frequency).toEqual({ once: 0, few: 1, regular: 1 });
    expect(report.sourceKinds).toEqual(
      expect.arrayContaining([
        { kind: "rss", ok: 1, fail: 0 },
        { kind: "spotify", ok: 0, fail: 1 },
        { kind: "autre", ok: 0, fail: 1 },
      ])
    );
    expect(report.errorCodes).toEqual(
      expect.arrayContaining([
        { code: "NO_SHOW_NAME", count: 1 },
        { code: "UNKNOWN", count: 1 },
      ])
    );
    expect(report.days).toHaveLength(30);
    expect(report.days[0]?.day).toBe(parisDay(NOW));
    expect(report.today.visitors).toBe(1);

    const raw = await readFile(path.join(dir!, "usage.jsonl"), "utf8");
    expect(raw).not.toContain("203.0.113.10");
    expect(raw).not.toContain("198.51.100.8");
    expect(raw).not.toContain("http");
  });

  it("déduplique les visites d'une même IP le même jour", async () => {
    await useTempDir();
    recordUsage({ type: "visit", visitorIp: "203.0.113.10" });
    recordUsage({ type: "visit", visitorIp: "203.0.113.10" });
    await flushUsageWrites();
    const raw = await readFile(path.join(dir!, "usage.jsonl"), "utf8");
    expect(raw.trim().split("\n")).toHaveLength(1);
  });

  it("oublie les événements de plus de 90 jours", async () => {
    await useTempDir();
    at("2026-07-08T12:00:00.000Z");
    recordUsage({
      type: "resolve",
      visitorIp: "203.0.113.10",
      ok: true,
      sourceKind: "rss",
    });
    at("2026-07-09T12:00:00.000Z");
    recordUsage({
      type: "resolve",
      visitorIp: "203.0.113.11",
      ok: true,
      sourceKind: "page",
    });
    at("2026-10-07T12:00:00.000Z");
    const report = await loadUsageReport();
    expect(report.last30.resolvesOk).toBe(0);
    const raw = await readFile(path.join(dir!, "usage.jsonl"), "utf8");
    expect(raw).not.toContain("2026-07-08");
    expect(raw).toContain("2026-07-09");
  });

  it("ignore une ligne illisible", async () => {
    await useTempDir();
    await writeFile(
      path.join(dir!, "usage.jsonl"),
      'pas du json\n{"t":"2026-10-07T12:00:00.000Z","type":"visit","visitor":"abcd"}\n',
      "utf8"
    );
    const report = await loadUsageReport();
    expect(report.today.visitors).toBe(0);
  });

  it("calcule la fréquence sur le jour de Paris", () => {
    const events: UsageEvent[] = [
      {
        t: "2026-10-06T22:30:00.000Z",
        type: "visit",
        visitor: "aaaaaaaaaaaaaaaa",
      },
    ];
    const report = aggregateUsage(events, NOW);
    expect(parisDay(new Date("2026-10-06T22:30:00.000Z"))).toBe("2026-10-07");
    expect(report.today.visitors).toBe(1);
  });
});
