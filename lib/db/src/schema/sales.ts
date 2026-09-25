import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { appUsersTable } from "./app-users";

export const salesTable = pgTable("sales", {
  id: uuid("id").defaultRandom().primaryKey(),
  receiptNumber: text("receipt_number").notNull().unique(),
  clerkUserId: text("clerk_user_id")
    .notNull()
    .references(() => appUsersTable.clerkUserId),
  clientRequestId: uuid("client_request_id"),
  isTest: boolean("is_test").notNull().default(false),
  tableLabel: text("table_label").notNull(),
  paymentMethod: text("payment_method").notNull(),
  subtotal: integer("subtotal").notNull(),
  cashTendered: integer("cash_tendered").notNull().default(0),
  cashAmount: integer("cash_amount").notNull().default(0),
  waveAmount: integer("wave_amount").notNull().default(0),
  orangeMoneyAmount: integer("orange_money_amount").notNull().default(0),
  changeDue: integer("change_due").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("sales_clerk_client_request_unique").on(
    table.clerkUserId,
    table.clientRequestId,
  ),
]);

export const insertSaleSchema = createInsertSchema(salesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof salesTable.$inferSelect;