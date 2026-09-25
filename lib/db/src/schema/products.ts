import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { categoriesTable } from "./categories";

export const productsTable = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categoriesTable.id),
    price: integer("price").notNull(),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    imagePath: text("image_path"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("products_category_idx").on(table.categoryId),
    index("products_active_idx").on(table.active),
    index("products_category_active_idx").on(table.categoryId, table.active),
    check("products_price_nonnegative", sql`${table.price} >= 0`),
    check("products_stock_nonnegative", sql`${table.stockQuantity} >= 0`),
  ],
);

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;