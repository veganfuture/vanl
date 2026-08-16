import { err, ok, ResultAsync, type Result } from "neverthrow";
import type postgres from "postgres";
import { z } from "zod";
import { sql } from "~/lib/db";
import type { Image, ImageMeta } from "./image";

/**
 * Repositories are the only code in this project allowed to write SQL - see
 * auth_repository.ts for the fuller rationale (also applies here).
 */

export type DbError = { readonly message: string; readonly cause: unknown };

const ImageRowSchema = z.object({
  sha256: z.string(),
  bytes: z.instanceof(Buffer),
  mime: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  created_at: z.coerce.date(),
});

function mapImageRow(row: unknown): Result<Image, DbError> {
  const parsed = ImageRowSchema.safeParse(row);
  if (!parsed.success) {
    return err({ message: `Corrupt images row: ${parsed.error.message}`, cause: parsed.error });
  }
  return ok({
    sha256: parsed.data.sha256,
    bytes: parsed.data.bytes,
    mime: parsed.data.mime,
    width: parsed.data.width,
    height: parsed.data.height,
    createdAt: parsed.data.created_at,
  });
}

const ImageMetaRowSchema = ImageRowSchema.omit({ bytes: true });

function mapImageMetaRow(row: unknown): Result<ImageMeta, DbError> {
  const parsed = ImageMetaRowSchema.safeParse(row);
  if (!parsed.success) {
    return err({ message: `Corrupt images row: ${parsed.error.message}`, cause: parsed.error });
  }
  return ok({
    sha256: parsed.data.sha256,
    mime: parsed.data.mime,
    width: parsed.data.width,
    height: parsed.data.height,
    createdAt: parsed.data.created_at,
  });
}

export type NewImageInput = {
  sha256: string;
  bytes: Buffer;
  mime: string;
  width: number;
  height: number;
};

export class ImageRepository {
  constructor(private readonly sql: postgres.Sql) {}

  /**
   * True content-addressed upsert: re-uploading bytes that hash to an
   * already-stored sha256 is a no-op that still returns the existing row
   * (the `do update set sha256 = excluded.sha256` is a cheap way to make
   * `returning *` always yield a row, insert or not - postgres.js has no
   * plain "insert or select" primitive).
   */
  upsertImage(input: NewImageInput): ResultAsync<Image, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        insert into images (sha256, bytes, mime, width, height)
        values (${input.sha256}, ${input.bytes}, ${input.mime}, ${input.width}, ${input.height})
        on conflict (sha256) do update set sha256 = excluded.sha256
        returning *
      `,
      (cause): DbError => ({ message: "Failed to upsert image", cause }),
    ).andThen((rows) => mapImageRow(rows[0]));
  }

  /** Full row including bytes - for serving the actual image. */
  findImageBySha256(sha256: string): ResultAsync<Image | null, DbError> {
    return ResultAsync.fromPromise(
      this.sql`select * from images where sha256 = ${sha256}`,
      (cause): DbError => ({ message: "Failed to find image", cause }),
    ).andThen((rows): Result<Image | null, DbError> => (rows[0] ? mapImageRow(rows[0]) : ok(null)));
  }

  /** Metadata only (no bytes) - for callers that just need width/height/mime. */
  findImageMetaBySha256(sha256: string): ResultAsync<ImageMeta | null, DbError> {
    return ResultAsync.fromPromise(
      this.sql`select sha256, mime, width, height, created_at from images where sha256 = ${sha256}`,
      (cause): DbError => ({ message: "Failed to find image metadata", cause }),
    ).andThen((rows): Result<ImageMeta | null, DbError> =>
      rows[0] ? mapImageMetaRow(rows[0]) : ok(null),
    );
  }
}

export const imageRepository = new ImageRepository(sql);
