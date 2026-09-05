import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateWaveformPeaks } from "./waveform";

const fixture = path.join(__dirname, "__fixtures__", "sample.mp3");

describe("generateWaveformPeaks", () => {
  it("retourne N points normalisés dans [0, 1]", async () => {
    const result = await generateWaveformPeaks(fixture, 50);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(50);
    expect(result.data.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(Math.max(...result.data)).toBeGreaterThan(0);
  }, 20_000);
});
