import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { appUsersTable, type AppUser, db } from "@workspace/db";
import { hashPassword } from "./local-auth";

export async function getOrCreateAppUser(userId: string): Promise<AppUser> {
  const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.clerkUserId, userId)).limit(1);
  if (!user) throw new Error("Compte local introuvable");
  return user;
}

export async function createFirstAdmin(values: {
  username: string; password: string; firstName: string; lastName: string;
}) {
  const { hash } = await hashPassword(values.password);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('app_users_admin_bootstrap'))`);
    const existing = await tx.select({ id: appUsersTable.clerkUserId }).from(appUsersTable)
      .where(eq(appUsersTable.role, "admin")).limit(1);
    if (existing.length) return undefined;
    const [user] = await tx.insert(appUsersTable).values({
      clerkUserId: `local-${randomUUID()}`,
      username: values.username.toLowerCase(),
      passwordHash: hash,
      passwordSalt: null,
      firstName: values.firstName,
      lastName: values.lastName,
      role: "admin",
    }).returning();
    return user;
  });
}
