import { Router, type IRouter } from "express";
import {
  GetAdminReportResponse,
  GetAdminSalesQueryParams,
  GetAdminSalesResponse,
  ResetSalesBody,
  ResetSalesResponse,
} from "@workspace/api-zod";
import { appUsersTable, db, saleItemsTable, salesEpochTable, salesTable } from "@workspace/db";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { requireAdmin, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();
const DAY_MS = 86_400_000;

router.post("/admin/sales/reset", requireAdmin, async (req, res, next) => {
  const admin = (req as AuthenticatedRequest).appUser;
  if (admin?.role !== "admin" || admin.username?.toLowerCase() !== "marlon") {
    res.status(403).json({ error: "Réservé au compte administrateur marlon." });
    return;
  }
  if (!ResetSalesBody.safeParse(req.body).success) {
    res.status(400).json({ error: "Confirmation obligatoire : EFFACER LES ESSAIS." });
    return;
  }
  try {
    const deletedSales = await db.transaction(async (tx) => {
      // Same lock as receipt allocation: a concurrent sale cannot race the reset.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('univers-des-saveurs:receipts'))`);
      const testSales = await tx.select({ id: salesTable.id }).from(salesTable).where(eq(salesTable.isTest, true));
      if (testSales.length) {
        await tx.delete(saleItemsTable).where(inArray(saleItemsTable.saleId, testSales.map((sale) => sale.id)));
      }
      const removed = await tx.delete(salesTable).where(eq(salesTable.isTest, true)).returning({ id: salesTable.id });
      await tx.insert(salesEpochTable).values({ id: 1, epoch: 0, testEpoch: 1 })
        .onConflictDoUpdate({ target: salesEpochTable.id, set: { testEpoch: sql`${salesEpochTable.testEpoch} + 1` } });
      return removed.length;
    });
    req.log.warn({ deletedSales, admin: admin.clerkUserId }, "Test sales and test receipts reset by administrator");
    res.json(ResetSalesResponse.parse({ deletedSales }));
  } catch (error) {
    next(error);
  }
});

function parseBusinessDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function displayName(user: typeof appUsersTable.$inferSelect): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || "Utilisateur";
}

router.get("/admin/sales", requireAdmin, async (req, res, next) => {
  const query = GetAdminSalesQueryParams.safeParse(req.query);
  if (!query.success || (req.query.includeTests !== undefined && req.query.includeTests !== "true" && req.query.includeTests !== "false")) {
    res.status(400).json({ error: "Invalid limit" });
    return;
  }
  const includeTests = req.query.includeTests === "true";
  const admin = (req as AuthenticatedRequest).appUser;
  if (includeTests && (admin?.role !== "admin" || admin.username?.toLowerCase() !== "marlon")) {
    res.status(403).json({ error: "Les ventes d’essai sont réservées au compte marlon." });
    return;
  }

  try {
    const sales = await db
      .select()
      .from(salesTable)
      .where(includeTests ? undefined : eq(salesTable.isTest, false))
      .orderBy(desc(salesTable.createdAt))
      .limit(query.data.limit);
    const saleIds = sales.map((sale) => sale.id);
    const items =
      saleIds.length === 0
        ? []
        : await db
            .select()
            .from(saleItemsTable)
            .where(inArray(saleItemsTable.saleId, saleIds));
    const itemBySale = new Map<string, typeof items>();
    for (const item of items) {
      const existing = itemBySale.get(item.saleId);
      if (existing) {
        existing.push(item);
      } else {
        itemBySale.set(item.saleId, [item]);
      }
    }

    const result = sales.map((sale) => ({
      ...sale,
      items: itemBySale.get(sale.id) ?? [],
    }));
    res.json(GetAdminSalesResponse.parse(result));
  } catch (error) {
    next(error);
  }
});

router.get("/admin/reports", requireAdmin, async (req, res, next) => {
  const from = parseBusinessDate(req.query.from);
  const to = parseBusinessDate(req.query.to);
  if (!from || !to || from > to || to.getTime() - from.getTime() > 366 * DAY_MS) {
    res.status(400).json({ error: "Période invalide ou supérieure à un an" });
    return;
  }

  const toExclusive = new Date(to.getTime() + DAY_MS);
  try {
    const rows = await db
      .select({ sale: salesTable, user: appUsersTable })
      .from(salesTable)
      .innerJoin(appUsersTable, eq(salesTable.clerkUserId, appUsersTable.clerkUserId))
      .where(and(eq(salesTable.isTest, false), gte(salesTable.createdAt, from), lt(salesTable.createdAt, toExclusive)))
      .orderBy(asc(salesTable.createdAt));

    const saleIds = rows.map(({ sale }) => sale.id);
    const items = saleIds.length
      ? await db.select().from(saleItemsTable).where(inArray(saleItemsTable.saleId, saleIds))
      : [];

    const cashierMap = new Map<string, {
      clerkUserId: string;
      name: string;
      role: typeof appUsersTable.$inferSelect.role;
      revenue: number;
      ticketCount: number;
    }>();
    const dailyMap = new Map<string, { revenue: number; ticketCount: number }>();
    const paymentMap = new Map<string, { revenue: number; ticketCount: number }>();
    const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>();

    for (const { sale, user } of rows) {
      const cashier = cashierMap.get(user.clerkUserId) ?? {
        clerkUserId: user.clerkUserId,
        name: displayName(user),
        role: user.role,
        revenue: 0,
        ticketCount: 0,
      };
      cashier.revenue += sale.subtotal;
      cashier.ticketCount += 1;
      cashierMap.set(user.clerkUserId, cashier);

      const date = sale.createdAt.toISOString().slice(0, 10);
      const day = dailyMap.get(date) ?? { revenue: 0, ticketCount: 0 };
      day.revenue += sale.subtotal;
      day.ticketCount += 1;
      dailyMap.set(date, day);

      for (const [paymentMethod, amount] of [
        ["Espèces", sale.cashAmount],
        ["Wave", sale.waveAmount],
        ["Orange Money", sale.orangeMoneyAmount],
      ] as const) {
        if (amount <= 0) continue;
        const payment = paymentMap.get(paymentMethod) ?? { revenue: 0, ticketCount: 0 };
        payment.revenue += amount;
        payment.ticketCount += 1;
        paymentMap.set(paymentMethod, payment);
      }
    }

    for (const item of items) {
      const key = `${item.productId}:${item.name}`;
      const total = itemMap.get(key) ?? { name: item.name, quantity: 0, revenue: 0 };
      total.quantity += item.quantity;
      total.revenue += item.lineTotal;
      itemMap.set(key, total);
    }

    const daily = [];
    for (let date = new Date(from); date <= to; date = new Date(date.getTime() + DAY_MS)) {
      const key = date.toISOString().slice(0, 10);
      daily.push({ date: key, ...(dailyMap.get(key) ?? { revenue: 0, ticketCount: 0 }) });
    }

    const totalRevenue = rows.reduce((sum, { sale }) => sum + sale.subtotal, 0);
    const report = {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      timezone: "Africa/Abidjan",
      totalRevenue,
      ticketCount: rows.length,
      averageTicket: rows.length ? Math.round(totalRevenue / rows.length) : 0,
      totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
      cashiers: [...cashierMap.values()]
        .map((cashier) => ({
          ...cashier,
          averageTicket: Math.round(cashier.revenue / cashier.ticketCount),
        }))
        .sort((a, b) => b.revenue - a.revenue),
      daily,
      payments: [...paymentMap.entries()]
        .map(([paymentMethod, totals]) => ({ paymentMethod, ...totals }))
        .sort((a, b) => b.revenue - a.revenue),
      topItems: [...itemMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    };
    res.json(GetAdminReportResponse.parse(report));
  } catch (error) {
    next(error);
  }
});

export default router;