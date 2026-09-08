import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEdgeTtsProvider } from "./edge";

let tmpDir: string;

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe("createEdgeTtsProvider", () => {
  it("écrit un MP3 via synthesizeFn", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-edge-"));
    const out = path.join(tmpDir, "out.mp3");
    const synthesizeFn = vi.fn(async (text: string, voice: string) => {
      expect(text).toBe("Bonjour");
      expect(voice).toBe("fr-FR-EloiseNeural");
      return new Uint8Array([0xff, 0xf3, 0x64, 0x00]);
    });

    const provider = createEdgeTtsProvider({
      synthesizeFn,
      voice: "fr-FR-EloiseNeural",
    });

    const result = await provider.synthesize("Bonjour", out);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await readFile(out)).toEqual(
      Buffer.from([0xff, 0xf3, 0x64, 0x00])
    );
  });

  it("mappe le timeout", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-edge-"));
    const provider = createEdgeTtsProvider({
      timeoutMs: 30,
      synthesizeFn: async () => {
        await new Promise((r) => setTimeout(r, 200));
        return new Uint8Array([1]);
      },
    });
    const result = await provider.synthesize(
      "Hi",
      path.join(tmpDir, "out.mp3")
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("TTS_TIMEOUT");
  });

  it("mappe une erreur réseau", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-edge-"));
    const provider = createEdgeTtsProvider({
      synthesizeFn: async () => {
        throw new Error("boom");
      },
    });
    const result = await provider.synthesize(
      "Hi",
      path.join(tmpDir, "out.mp3")
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("TTS_NETWORK");
  });
});
