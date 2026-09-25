import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { salesTable } from "./sales";

export const saleItemsTable = pgTable("sale_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => salesTable.id, { onDelete: "cascade" }),
  // Keep this as text so historical snapshots remain readable if a product is
  // later removed or legacy rows used non-UUID catalog identifiers.
  productId: text("product_id").notNull(),
  name: text("name").notNull(),
  unitPrice: integer("unit_price").notNull(),
  quantity: integer("quantity").notNull(),
  lineTotal: integer("line_total").notNull(),
});

export const insertSaleItemSchema = createInsertSchema(saleItemsTable).omit({
  id: true,
});
export type InsertSaleItem = z.infer<typeof insertSaleItemSchema>;
export type SaleItem = typeof saleItemsTable.$inferSelect;