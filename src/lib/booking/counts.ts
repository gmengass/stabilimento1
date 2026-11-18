import { sql, type Kysely } from "kysely";
import type { DB } from "@/db/types";

export interface FreeOfTotal {
  free: number;
  total: number;
}

export interface DayCounts {
  umbrellas: FreeOfTotal;
  sunbeds: FreeOfTotal;
}

/**
 * Free / total umbrellas and sunbeds in one beach space on one day (ADR 0004 date view).
 * A spot is taken only by a `booked` day, so no-shows and released days nobody rebooked are free.
 * An umbrella holds its `included_sunbeds`; a standalone sunbed spot is one sunbed.
 */
export async function loadDayCounts(
  db: Kysely<DB>,
  areaId: number,
  date: string,
): Promise<DayCounts> {
  const row = await db
    .selectFrom("spot")
    .select((eb) => {
      const taken = eb.exists(
        eb
          .selectFrom("spot_day")
          .select("spot_day.id")
          .whereRef("spot_day.spot_id", "=", "spot.id")
          .where("spot_day.date", "=", date)
          .where("spot_day.state", "=", "booked"),
      );
      const sunbeds = sql<number>`case when spot.kind = 'umbrella' then spot.included_sunbeds else 1 end`;
      return [
        sql<number>`count(*) filter (where spot.kind = 'umbrella')::int`.as("umbrellas"),
        sql<number>`count(*) filter (where spot.kind = 'umbrella' and not ${taken})::int`.as(
          "freeUmbrellas",
        ),
        sql<number>`coalesce(sum(${sunbeds}), 0)::int`.as("sunbeds"),
        sql<number>`coalesce(sum(${sunbeds}) filter (where not ${taken}), 0)::int`.as(
          "freeSunbeds",
        ),
      ];
    })
    .where("spot.area_id", "=", areaId)
    .executeTakeFirstOrThrow();
  return {
    umbrellas: { free: row.freeUmbrellas, total: row.umbrellas },
    sunbeds: { free: row.freeSunbeds, total: row.sunbeds },
  };
}
