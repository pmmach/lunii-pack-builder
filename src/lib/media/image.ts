import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { err, ok, type Result } from "@/lib/shared/result";
import type { ImageCropOptions } from "./types";

export async function cropImageToSquare(
  opts: ImageCropOptions
): Promise<Result<{ path: string; size: number }>> {
  const size = opts.size ?? 320;

  try {
    await mkdir(path.dirname(opts.outputPath), { recursive: true });
    const image = sharp(opts.sourcePath);
    const meta = await image.metadata();
    if (!meta.width || !meta.height) {
      return err("Image illisible", "INVALID_IMAGE");
    }

    let pipeline = image;

    if (opts.focusX !== undefined || opts.focusY !== undefined) {
      const focusX = opts.focusX ?? 0.5;
      const focusY = opts.focusY ?? 0.5;
      const side = Math.min(meta.width, meta.height);
      let left = Math.round(focusX * meta.width - side / 2);
      let top = Math.round(focusY * meta.height - side / 2);
      left = Math.max(0, Math.min(left, meta.width - side));
      top = Math.max(0, Math.min(top, meta.height - side));
      pipeline = sharp(opts.sourcePath).extract({
        left,
        top,
        width: side,
        height: side,
      });
    }

    await pipeline
      .resize(size, size, { fit: "cover", position: "centre" })
      .jpeg({ quality: 85 })
      .toFile(opts.outputPath);

    return ok({ path: opts.outputPath, size });
  } catch {
    return err("Image illisible", "INVALID_IMAGE");
  }
}
