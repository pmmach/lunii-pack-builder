import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGoogleTtsProvider } from "./google";

let tmpDir: string;

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe("createGoogleTtsProvider", () => {
  it("envoie du JSON et décode audioContent", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-google-"));
    const out = path.join(tmpDir, "out.mp3");
    const audio = Buffer.from([9, 8, 7]);
    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain("texttospeech.googleapis.com");
      expect(String(url)).toContain("key=test-api");
      const body = JSON.parse(String(init?.body)) as {
        input: { text: string };
        audioConfig: { audioEncoding: string };
      };
      expect(body.input.text).toBe("Bonjour");
      expect(body.audioConfig.audioEncoding).toBe("MP3");
      return new Response(
        JSON.stringify({ audioContent: audio.toString("base64") }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const provider = createGoogleTtsProvider({
      fetchFn: fetchFn as unknown as typeof fetch,
      apiKey: "test-api",
      voice: "fr-FR-Neural2-A",
      language: "fr-FR",
    });

    const result = await provider.synthesize("Bonjour", out);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await readFile(out)).toEqual(audio);
  });

  it("mappe 429 vers TTS_QUOTA", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-google-"));
    const fetchFn = vi.fn(
      async () => new Response("throttled", { status: 429 })
    );
    const provider = createGoogleTtsProvider({
      fetchFn: fetchFn as unknown as typeof fetch,
      apiKey: "k",
    });
    const result = await provider.synthesize(
      "Hi",
      path.join(tmpDir, "out.mp3")
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("TTS_QUOTA");
  });
});
