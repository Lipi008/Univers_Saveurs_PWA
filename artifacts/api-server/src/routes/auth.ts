import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { appUsersTable, db } from "@workspace/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getOrCreateAppUser } from "../lib/app-users";
import { getAuthenticatedUserId, requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { hashPassword, signToken, verifyPassword } from "../lib/local-auth";

const router: IRouter = Router();

function fields(body: unknown) {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  return {
    username: typeof value.username === "string" ? value.username.trim() : "",
    password: typeof value.password === "string" ? value.password : "",
  };
}

function publicUser(user: typeof appUsersTable.$inferSelect) {
  const { passwordHash: _, passwordSalt: __, ...safe } = user;
  return safe;
}

router.get("/auth/setup-status", async (_req, res, next) => {
  try {
    const [admin] = await db.select({ id: appUsersTable.clerkUserId }).from(appUsersTable)
      .where(and(
        eq(appUsersTable.role, "admin"),
        eq(appUsersTable.active, true),
        isNotNull(appUsersTable.passwordHash),
      )).limit(1);
    res.json({ needsSetup: !admin });
  } catch (error) { next(error); }
});

router.post("/auth/setup", async (req, res, next) => {
  const body = req.body as Record<string, unknown>;
  const parsed = {
    ...fields(body),
    firstName: typeof body.firstName === "string" ? body.firstName.trim() : "",
    lastName: typeof body.lastName === "string" ? body.lastName.trim() : "",
  };
  if (parsed.username.length < 3 || parsed.password.length < 8 || !parsed.firstName || !parsed.lastName) {
    res.status(400).json({ error: "Nom d'utilisateur et mot de passe valides requis" }); return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('app_users_admin_bootstrap'))`);
      const [admin] = await tx.select({ id: appUsersTable.clerkUserId }).from(appUsersTable)
        .where(and(
          eq(appUsersTable.role, "admin"),
          eq(appUsersTable.active, true),
          isNotNull(appUsersTable.passwordHash),
        )).limit(1);
      if (admin) return undefined;
      const { hash } = await hashPassword(parsed.password);
      const [user] = await tx.insert(appUsersTable).values({
        clerkUserId: `local-${randomUUID()}`,
        username: parsed.username.toLowerCase(),
        passwordHash: hash,
        passwordSalt: null,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        role: "admin",
        active: true,
      }).returning();
      return user;
    });
    if (!result) { res.status(409).json({ error: "La configuration initiale est déjà terminée" }); return; }
    const token = signToken(result);
    res.status(201).json({ user: publicUser(result), token });
  } catch (error) { next(error); }
});

router.post("/auth/login", async (req, res, next) => {
  const parsed = fields(req.body);
  if (parsed.username.length < 3 || parsed.password.length < 8) {
    res.status(401).json({ error: "Identifiants incorrects" }); return;
  }
  try {
    const [user] = await db.select().from(appUsersTable)
      .where(sql`lower(${appUsersTable.username}) = ${parsed.username.toLowerCase()}`).limit(1);
    if (!user?.passwordHash || !(await verifyPassword(parsed.password, user.passwordHash))) {
      res.status(401).json({ error: "Identifiants incorrects" }); return;
    }
    if (!user.active) { res.status(403).json({ error: "Compte désactivé" }); return; }
    const token = signToken(user);
    res.json({ user: publicUser(user), token });
  } catch (error) { next(error); }
});

router.post("/auth/logout", (_req, res) => {
  res.setHeader("Set-Cookie", "pos_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
  res.status(204).send();
});

router.get("/auth/me", requireAuth, async (req, res, next) => {
  try {
    const id = getAuthenticatedUserId(req);
    const user = await getOrCreateAppUser(id);
    if (!user.active) { res.status(403).json({ error: "Compte désactivé" }); return; }
    res.json(publicUser(user));
  } catch (error) { next(error); }
});

router.post("/auth/password-reset-complete", requireAuth, async (req, res, next) => {
  const body = req.body as Record<string, unknown>;
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (
    !currentPassword || newPassword.length < 8 || newPassword.length > 256 ||
    !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword) || currentPassword === newPassword
  ) {
    res.status(400).json({ error: "Le nouveau mot de passe doit être différent et contenir au moins 8 caractères, une lettre et un chiffre." });
    return;
  }
  try {
    const id = getAuthenticatedUserId(req);
    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.clerkUserId, id)).limit(1);
    if (!user?.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
      res.status(400).json({ error: "Mot de passe actuel incorrect" }); return;
    }
    const { hash } = await hashPassword(newPassword);
    const [updated] = await db.update(appUsersTable).set({
      passwordHash: hash,
      passwordSalt: null,
      mustResetPassword: false,
      updatedAt: new Date(),
    }).where(eq(appUsersTable.clerkUserId, id)).returning();
    const token = signToken(updated);
    res.json({ user: publicUser(updated), token });
  } catch (error) { next(error); }
});

export default router;
