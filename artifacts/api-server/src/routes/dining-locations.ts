import { Router, type IRouter, type Response } from "express";
import {
  CreateDiningLocationBody,
  CreateDiningLocationResponse,
  DeleteDiningLocationParams,
  GetDiningLocationsResponse,
} from "@workspace/api-zod";
import { db, diningLocationsTable } from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { requireActiveUser, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

function response(location: typeof diningLocationsTable.$inferSelect) {
  return {
    ...location,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
  };
}

function requireExactAdmin(req: AuthenticatedRequest, res: Response): boolean {
  if (req.appUser?.role === "admin") return true;
  res.status(403).json({ error: "Administrator role required" });
  return false;
}

router.get("/dining-locations", requireActiveUser, async (_req, res, next) => {
  try {
    const locations = await db
      .select()
      .from(diningLocationsTable)
      .where(eq(diningLocationsTable.active, true))
      .orderBy(asc(diningLocationsTable.kind), asc(diningLocationsTable.name));
    res.json(GetDiningLocationsResponse.parse(locations.map(response)));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/dining-locations", requireActiveUser, async (req, res, next) => {
  if (!requireExactAdmin(req as AuthenticatedRequest, res)) return;
  const parsed = CreateDiningLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Nom ou type d’emplacement invalide" });
    return;
  }
  try {
    const name = parsed.data.name.trim();
    if (name.toLocaleLowerCase("fr-FR") === "à emporter") {
      res.status(400).json({ error: "À emporter est une option réservée" });
      return;
    }
    const [existing] = await db
      .select()
      .from(diningLocationsTable)
      .where(sql`lower(${diningLocationsTable.name}) = lower(${name})`)
      .limit(1);
    const [location] = existing
      ? await db
          .update(diningLocationsTable)
          .set({ name, kind: parsed.data.kind, active: true })
          .where(eq(diningLocationsTable.id, existing.id))
          .returning()
      : await db
          .insert(diningLocationsTable)
          .values({ name, kind: parsed.data.kind })
          .returning();
    if (!location) throw new Error("Unable to create dining location");
    res.status(201).json(CreateDiningLocationResponse.parse(response(location)));
  } catch (error) {
    next(error);
  }
});

router.delete("/admin/dining-locations/:id", requireActiveUser, async (req, res, next) => {
  if (!requireExactAdmin(req as AuthenticatedRequest, res)) return;
  const params = DeleteDiningLocationParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Emplacement introuvable" });
    return;
  }
  try {
    const [location] = await db
      .update(diningLocationsTable)
      .set({ active: false })
      .where(eq(diningLocationsTable.id, params.data.id))
      .returning();
    if (!location) {
      res.status(404).json({ error: "Emplacement introuvable" });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;