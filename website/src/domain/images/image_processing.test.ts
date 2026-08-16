import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processUpload } from "./image_processing";

async function makeJpeg(
  width: number,
  height: number,
  opts?: { exif?: Record<string, Record<string, string>> },
): Promise<Buffer> {
  let pipeline = sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 180, b: 60 } },
  }).jpeg();
  if (opts?.exif) {
    pipeline = pipeline.withExif(opts.exif);
  }
  return pipeline.toBuffer();
}

describe("processUpload", () => {
  it("resizes independently per variant, preserving aspect ratio, and re-encodes to webp", async () => {
    const source = await makeJpeg(2000, 1200);

    const result = await processUpload(source, [
      { maxWidth: 1600 },
      { maxWidth: 600 },
      { maxWidth: 160 },
    ]);
    const variants = result._unsafeUnwrap();

    expect(variants).toHaveLength(3);
    expect(variants[0]).toMatchObject({ width: 1600, height: 960, mime: "image/webp" });
    expect(variants[1]).toMatchObject({ width: 600, height: 360, mime: "image/webp" });
    expect(variants[2]).toMatchObject({ width: 160, height: 96, mime: "image/webp" });

    for (const variant of variants) {
      const metadata = await sharp(variant.bytes).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBe(variant.width);
      expect(metadata.height).toBe(variant.height);
    }

    // Different pixel content per variant -> different bytes -> different hashes.
    const hashes = new Set(variants.map((v) => v.sha256));
    expect(hashes.size).toBe(3);
  });

  it("never upscales beyond the source's own dimensions", async () => {
    const source = await makeJpeg(100, 100);

    const variants = (await processUpload(source, [{ maxWidth: 1600 }]))._unsafeUnwrap();

    expect(variants[0].width).toBe(100);
    expect(variants[0].height).toBe(100);
  });

  it("strips EXIF (including GPS) on re-encode", async () => {
    const source = await makeJpeg(200, 200, {
      exif: {
        IFD0: { Make: "TestCam" },
        GPS: { GPSLatitude: "52,22,0", GPSLongitude: "4,54,0" },
      },
    });
    expect((await sharp(source).metadata()).exif).toBeDefined();

    const variants = (await processUpload(source, [{ maxWidth: 200 }]))._unsafeUnwrap();

    const outputMetadata = await sharp(variants[0].bytes).metadata();
    expect(outputMetadata.exif).toBeUndefined();
  });

  it("rejects absurd pixel dimensions", async () => {
    const huge = await makeJpeg(8000, 8000); // 64MP > MAX_INPUT_PIXELS

    const result = await processUpload(huge, [{ maxWidth: 600 }]);

    expect(result.isErr()).toBe(true);
  });

  it("rejects input that isn't a genuine image", async () => {
    const garbage = Buffer.from("this is definitely not an image", "utf-8");

    const result = await processUpload(garbage, [{ maxWidth: 600 }]);

    expect(result.isErr()).toBe(true);
  });

  it("rejects an empty upload", async () => {
    const result = await processUpload(Buffer.alloc(0), [{ maxWidth: 600 }]);

    expect(result.isErr()).toBe(true);
  });

  it("rejects an unsupported format (SVG)", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
      "utf-8",
    );

    const result = await processUpload(svg, [{ maxWidth: 600 }]);

    expect(result.isErr()).toBe(true);
  });
});
