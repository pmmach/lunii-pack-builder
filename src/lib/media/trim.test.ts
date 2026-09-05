import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { probeDuration, trimAudio } from "./trim";

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
