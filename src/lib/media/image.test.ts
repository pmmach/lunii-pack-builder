import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { cropImageToSquare } from "./image";

const fixture = path.join(__dirname, "__fixtures__", "sample.jpg");
let tmpDir: string;

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe("cropImageToSquare", () => {
  it("produit un JPEG 320x320", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-img-"));
    const out = path.join(tmpDir, "cover.jpg");
    const result = await cropImageToSquare({
      sourcePath: fixture,
      outputPath: out,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(320);
    expect(meta.format).toBe("jpeg");
  });
});
