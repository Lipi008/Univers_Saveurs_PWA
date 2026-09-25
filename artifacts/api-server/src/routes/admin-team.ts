import {
  CreateAdminTeamMemberBody, CreateAdminTeamMemberResponse, DeleteAdminTeamMemberParams,
  GetAdminTeamQueryParams, GetAdminTeamResponse,
  ResetAdminTeamMemberPasswordBody, ResetAdminTeamMemberPasswordResponse,
} from "@workspace/api-zod";
import { appUsersTable, db } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { getAuthenticatedUserId, requireAdmin, type AuthenticatedRequest } from "../middlewares/auth";
import { hashPassword } from "../lib/local-auth";

const router: IRouter = Router();

function usernameBase(firstName: string, lastName: string) {
  const normalize = (value: string) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${normalize(firstName)}.${normalize(lastName)}`.replace(/^\.+|\.+$/g, "").slice(0, 56) || "membre";
}
function memberResponse(user: typeof appUsersTable.$inferSelect) {
  return {
    id: user.clerkUserId, name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Membre",
    firstName: user.firstName, lastName: user.lastName, email: user.email, username: user.username,
    role: user.role, active: user.active, mustResetPassword: user.mustResetPassword,
    createdAt: user.createdAt, deactivatedAt: user.deactivatedAt,
  };
}

router.get("/admin/team", requireAdmin, async (req, res, next) => {
  try {
    const query = GetAdminTeamQueryParams.parse(req.query);
    const users = await db.select().from(appUsersTable)
      .where(query.includeInactive ? undefined : eq(appUsersTable.active, true)).orderBy(appUsersTable.createdAt);
    res.json(GetAdminTeamResponse.parse(users.map(memberResponse)));
  } catch (error) { next(error); }
});

router.post("/admin/team", requireAdmin, async (req, res, next) => {
  const parsed = CreateAdminTeamMemberBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Informations du membre invalides" }); return; }
  const password = parsed.data.password;
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    res.status(400).json({ error: "Le mot de passe temporaire doit contenir 8 caractères, une lettre et un chiffre" }); return;
  }
  try {
    const hashed = await hashPassword(password);
    const base = usernameBase(parsed.data.firstName, parsed.data.lastName);
    const user = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`team-username:${base}`}))`);
      let username = base;
      for (let suffix = 2; ; suffix += 1) {
        const duplicate = await tx.select({ id: appUsersTable.clerkUserId }).from(appUsersTable)
          .where(sql`lower(${appUsersTable.username}) = ${username}`).limit(1);
        if (!duplicate.length) break;
        username = `${base.slice(0, 60 - String(suffix).length)}${suffix}`;
      }
      const [created] = await tx.insert(appUsersTable).values({
        clerkUserId: `local-${randomUUID()}`, username, passwordHash: hashed.hash, passwordSalt: null,
        firstName: parsed.data.firstName.trim(), lastName: parsed.data.lastName.trim(),
        email: null, role: parsed.data.role, active: true, mustResetPassword: true,
      }).returning();
      return created;
    });
    res.status(201).json(CreateAdminTeamMemberResponse.parse(memberResponse(user)));
  } catch (error) { next(error); }
});

router.delete("/admin/team/:id", requireAdmin, async (req, res, next) => {
  const parsed = DeleteAdminTeamMemberParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Identifiant invalide" }); return; }
  try {
    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.clerkUserId, parsed.data.id)).limit(1);
    if (!user) { res.status(404).json({ error: "Membre introuvable" }); return; }
    if (user.clerkUserId === getAuthenticatedUserId(req)) { res.status(400).json({ error: "Impossible de désactiver votre propre compte" }); return; }
    if (user.role === "admin") { res.status(400).json({ error: "Impossible de désactiver un administrateur" }); return; }
    await db.update(appUsersTable).set({ active: false, deactivatedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(appUsersTable.clerkUserId, user.clerkUserId), eq(appUsersTable.active, true)));
    res.status(204).send();
  } catch (error) { next(error); }
});

router.post("/admin/team/:id/password", requireAdmin, async (req, res, next) => {
  const admin = (req as AuthenticatedRequest).appUser;
  if (admin?.role !== "admin" || admin.username?.toLowerCase() !== "marlon") {
    res.status(403).json({ error: "Réservé au compte administrateur marlon." }); return;
  }
  const parsed = ResetAdminTeamMemberPasswordBody.safeParse(req.body);
  if (!parsed.success || !/[A-Za-z]/.test(parsed.data.password) || !/\d/.test(parsed.data.password)) {
    res.status(400).json({ error: "Le mot de passe temporaire doit contenir 8 caractères, une lettre et un chiffre." }); return;
  }
  try {
    const [target] = await db.select().from(appUsersTable)
      .where(eq(appUsersTable.clerkUserId, String(req.params.id))).limit(1);
    if (!target) { res.status(404).json({ error: "Membre introuvable" }); return; }
    if (target.role === "admin") {
      res.status(403).json({ error: "Le mot de passe d’un administrateur ne peut pas être modifié depuis la gestion d’équipe." }); return;
    }
    if (!target.active) { res.status(400).json({ error: "Ce membre est désactivé." }); return; }
    const hashed = await hashPassword(parsed.data.password);
    const id = String(req.params.id);
    const [user] = await db.update(appUsersTable).set({ passwordHash: hashed.hash, passwordSalt: null, mustResetPassword: true, updatedAt: new Date() })
      .where(and(eq(appUsersTable.clerkUserId, id), eq(appUsersTable.active, true))).returning();
    if (!user) { res.status(404).json({ error: "Membre introuvable" }); return; }
    req.log.info({ targetId: id, adminId: admin.clerkUserId }, "Staff password reset");
    res.json(ResetAdminTeamMemberPasswordResponse.parse(memberResponse(user)));
  } catch (error) { next(error); }
});
export default router;