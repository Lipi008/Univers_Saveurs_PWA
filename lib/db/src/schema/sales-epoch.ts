import { integer, pgTable } from "drizzle-orm/pg-core";

// A reset invalidates all sales created against older catalog snapshots.
// The singleton row is created on the first reset; an absent row means epoch 0.
export const salesEpochTable = pgTable("sales_epoch", {
  id: integer("id").primaryKey(),
  epoch: integer("epoch").notNull().default(0),
  testEpoch: integer("test_epoch").notNull().default(0),
});