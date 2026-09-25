import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { appUsersTable, db, type AppUser } from "@workspace/db";
import { verifyToken } from "../lib/local-auth";

export type AuthenticatedRequest = Request & { userId: string; appUser?: AppUser };

function tokenFromRequest(req: Request): string | undefined {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  const cookie = req.headers.cookie?.split(";").map((p) => p.trim()).find((p) => p.startsWith("pos_session="));
  return cookie ? decodeURIComponent(cookie.slice("pos_session=".length)) : undefined;
}

async function resolveUser(req: Request): Promise<AppUser | undefined> {
  const token = tokenFromRequest(req);
  if (!token) return undefined;
  const payload = verifyToken(token);
  if (!payload?.sub) return undefined;
  const [user] = await db.select().from(appUsersTable)
    .where(eq(appUsersTable.clerkUserId, payload.sub)).limit(1);
  return user?.active ? user : undefined;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await resolveUser(req);
  if (!user) { res.status(401).json({ error: "Token invalide ou expiré" }); return; }
  const auth = req as AuthenticatedRequest;
  auth.userId = user.clerkUserId;
  auth.appUser = user;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    const user = (req as AuthenticatedRequest).appUser;
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      res.status(403).json({ error: "Accès réservé au gérant" }); return;
    }
    next();
  });
}

export async function requireActiveUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    const user = (req as AuthenticatedRequest).appUser;
    if (!user?.active) { res.status(403).json({ error: "Compte désactivé" }); return; }
    if (user.mustResetPassword && user.role !== "admin") {
      res.status(403).json({ error: "Mot de passe temporaire à remplacer" }); return;
    }
    next();
  });
}

export function getAuthenticatedUserId(req: Request): string {
  return (req as AuthenticatedRequest).userId;
}
