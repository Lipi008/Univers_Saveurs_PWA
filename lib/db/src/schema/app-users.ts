import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "manager",
  "cashier",
  "server",
]);

export const appUsersTable = pgTable("app_users", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  username: text("username"),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  role: userRoleEnum("role").notNull(),
  active: boolean("active").notNull().default(true),
  mustResetPassword: boolean("must_reset_password").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("app_users_username_unique").on(sql`lower(${table.username})`),
  uniqueIndex("app_users_email_unique").on(sql`lower(${table.email})`),
]);

export const insertAppUserSchema = createInsertSchema(appUsersTable);
export type InsertAppUser = z.infer<typeof insertAppUserSchema>;
export type AppUser = typeof appUsersTable.$inferSelect;