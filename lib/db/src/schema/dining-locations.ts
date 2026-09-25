import { createInsertSchema } from "drizzle-zod";
import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export const diningLocationKindEnum = pgEnum("dining_location_kind", ["table", "space"]);

export const diningLocationsTable = pgTable(
  "dining_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    kind: diningLocationKindEnum("kind").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("dining_locations_name_unique").on(sql`lower(${table.name})`),
    index("dining_locations_active_kind_idx").on(table.active, table.kind),
  ],
);

export const insertDiningLocationSchema = createInsertSchema(diningLocationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDiningLocation = z.infer<typeof insertDiningLocationSchema>;
export type DiningLocation = typeof diningLocationsTable.$inferSelect;