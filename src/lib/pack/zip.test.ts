import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import yauzl from "yauzl";
import { zipPackDirectory } from "./zip";

let tmpDir: string;

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

function listZipEntries(zipPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error("no zip"));
        return;
      }
      const entries: string[] = [];
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        entries.push(entry.fileName);
        zipfile.readEntry();
      });
      zipfile.on("end", () => resolve(entries));
      zipfile.on("error", reject);
    });
  });
}

describe("zipPackDirectory", () => {
  it("zippe le contenu à la racine, sans dossier parent (attendu par Lunii Admin Builder)", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-zip-"));
    const packDir = path.join(tmpDir, "mon-pack");
    await mkdir(path.join(packDir, "assets"), { recursive: true });
    await writeFile(path.join(packDir, "story.json"), "{}");
    await writeFile(path.join(packDir, "assets", "abc123.mp3"), "fake");

    const zipPath = path.join(tmpDir, "out.zip");
    const result = await zipPackDirectory(packDir, zipPath);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const entries = await listZipEntries(zipPath);
    expect(entries).toContain("story.json");
    expect(entries).toContain("assets/abc123.mp3");
    expect(entries.some((e) => e.startsWith("mon-pack/"))).toBe(false);
  });
});
