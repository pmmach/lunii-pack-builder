import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureMp3, probeDuration, trimAudio } from "./trim";

const fixture = path.join(__dirname, "__fixtures__", "sample.mp3");
let tmpDir: string;

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe("trimAudio", () => {
  it("découpe une plage valide", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-trim-"));
    const out = path.join(tmpDir, "out.mp3");
    const result = await trimAudio(fixture, out, {
      startSeconds: 0.2,
      endSeconds: 1.2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.durationSeconds).toBeCloseTo(1.0, 5);

    const probed = await probeDuration(out);
    expect(probed.ok).toBe(true);
    if (!probed.ok) return;
    expect(Math.abs(probed.data - 1.0)).toBeLessThan(0.2);
  });

  it("copie le fichier si la plage couvre tout un MP3", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-trim-"));
    const out = path.join(tmpDir, "out.mp3");
    const sourceDuration = await probeDuration(fixture);
    expect(sourceDuration.ok).toBe(true);
    if (!sourceDuration.ok) return;

    const percents: number[] = [];
    const result = await trimAudio(
      fixture,
      out,
      {
        startSeconds: 0,
        endSeconds: sourceDuration.data,
      },
      (percent) => percents.push(percent)
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(percents.at(-1)).toBe(100);
    expect(percents.some((p) => p > 0 && p < 100)).toBe(true);

    const probed = await probeDuration(out);
    expect(probed.ok).toBe(true);
    if (!probed.ok) return;
    expect(Math.abs(probed.data - sourceDuration.data)).toBeLessThan(0.05);
  });

  it("rejette une plage invalide", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-trim-"));
    const out = path.join(tmpDir, "out.mp3");
    const result = await trimAudio(fixture, out, {
      startSeconds: 1.5,
      endSeconds: 0.5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_TRIM_RANGE");
  });
});

describe("ensureMp3", () => {
  it("copie une source déjà MP3 vers la destination", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-ensure-"));
    const out = path.join(tmpDir, "source.mp3");
    const sourceDuration = await probeDuration(fixture);
    expect(sourceDuration.ok).toBe(true);
    if (!sourceDuration.ok) return;

    const result = await ensureMp3(fixture, out);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const probed = await probeDuration(out);
    expect(probed.ok).toBe(true);
    if (!probed.ok) return;
    expect(Math.abs(probed.data - sourceDuration.data)).toBeLessThan(0.05);
  });
});
