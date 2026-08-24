import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "~/lib/db";
import { ImageRepository, type NewImageInput } from "./image_repository";

const repository = new ImageRepository(sql);

function makeImage(overrides: Partial<Omit<NewImageInput, "sha256">> = {}): NewImageInput {
  const bytes = overrides.bytes ?? Buffer.from(`test-image-bytes-${crypto.randomUUID()}`);
  return {
    mime: "image/webp",
    width: 160,
    height: 96,
    ...overrides,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

beforeEach(async () => {
  await sql`truncate table images, events, organizations, signup_nonces, login_challenges, sessions, global_roles, users cascade`;
});

afterAll(async () => {
  await sql.end();
});

describe("upsertImage", () => {
  it("inserts a new image and round-trips every field", async () => {
    const input = makeImage({ width: 600, height: 360 });

    const stored = (await repository.upsertImage(input))._unsafeUnwrap();

    expect(stored.sha256).toBe(input.sha256);
    expect(stored.mime).toBe("image/webp");
    expect(stored.width).toBe(600);
    expect(stored.height).toBe(360);
    expect(stored.bytes.equals(input.bytes)).toBe(true);
  });

  it("is idempotent for identical bytes - a true content-addressed upsert", async () => {
    const input = makeImage();

    const first = (await repository.upsertImage(input))._unsafeUnwrap();
    const second = (await repository.upsertImage(input))._unsafeUnwrap();

    expect(second.sha256).toBe(first.sha256);
    const rows =
      await sql`select count(*)::int as count from images where sha256 = ${input.sha256}`;
    expect(rows[0].count).toBe(1);
  });
});

describe("findImageBySha256", () => {
  it("returns the full row including bytes", async () => {
    const input = makeImage();
    await repository.upsertImage(input);

    const found = (await repository.findImageBySha256(input.sha256))._unsafeUnwrap();

    expect(found?.bytes.equals(input.bytes)).toBe(true);
  });

  it("returns null for a sha256 that doesn't exist", async () => {
    const found = (await repository.findImageBySha256("a".repeat(64)))._unsafeUnwrap();

    expect(found).toBeNull();
  });
});

describe("findImageMetaBySha256", () => {
  it("returns metadata without bytes", async () => {
    const input = makeImage({ width: 1600, height: 900 });
    await repository.upsertImage(input);

    const meta = (await repository.findImageMetaBySha256(input.sha256))._unsafeUnwrap();

    expect(meta).toMatchObject({
      sha256: input.sha256,
      mime: "image/webp",
      width: 1600,
      height: 900,
    });
    expect(meta).not.toHaveProperty("bytes");
  });

  it("returns null for a sha256 that doesn't exist", async () => {
    const meta = (await repository.findImageMetaBySha256("b".repeat(64)))._unsafeUnwrap();

    expect(meta).toBeNull();
  });
});
