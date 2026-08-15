import { err, ok, ResultAsync, type Result } from "neverthrow";
import type postgres from "postgres";
import { z } from "zod";
import { sql } from "~/lib/db";
import type { Place } from "./place";

/**
 * Repositories are the only code in this project allowed to write SQL - see
 * auth_repository.ts for the fuller rationale (also applies here).
 */

export type DbError = { readonly message: string; readonly cause: unknown };

const PlaceRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  municipality_name: z.string(),
  province: z.string(),
});

function mapPlaceRow(row: unknown): Result<Place, DbError> {
  const parsed = PlaceRowSchema.safeParse(row);
  if (!parsed.success) {
    return err({ message: `Corrupt places row: ${parsed.error.message}`, cause: parsed.error });
  }
  return ok({
    id: parsed.data.id,
    name: parsed.data.name,
    municipalityName: parsed.data.municipality_name,
    province: parsed.data.province,
  });
}

const SEARCH_LIMIT = 20;

export class PlaceRepository {
  constructor(private readonly sql: postgres.Sql) {}

  findPlaceById(id: string): ResultAsync<Place | null, DbError> {
    return ResultAsync.fromPromise(
      this.sql`select * from places where id = ${id}`,
      (cause): DbError => ({ message: "Failed to find place by id", cause }),
    ).andThen((rows): Result<Place | null, DbError> => (rows[0] ? mapPlaceRow(rows[0]) : ok(null)));
  }

  /** Places, not user-editable (seeded once from pdok.nl) - a simple prefix/substring search is enough. */
  searchPlaces(query: string): ResultAsync<Place[], DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        select * from places
        where name ilike ${`%${query}%`}
        order by name asc
        limit ${SEARCH_LIMIT}
      `,
      (cause): DbError => ({ message: "Failed to search places", cause }),
    ).andThen((rows) => {
      const mapped: Place[] = [];
      for (const row of rows) {
        const result = mapPlaceRow(row);
        if (result.isErr()) {
          return err<Place[], DbError>(result.error);
        }
        mapped.push(result.value);
      }
      return ok(mapped);
    });
  }
}

export const placeRepository = new PlaceRepository(sql);
