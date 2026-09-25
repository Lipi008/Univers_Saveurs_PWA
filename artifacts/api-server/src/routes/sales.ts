import { Router, type IRouter } from "express";
import { CreateSaleBody, CreateSaleResponse, GetSalesEpochResponse } from "@workspace/api-zod";
import { db, productsTable, saleItemsTable, salesEpochTable, salesTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import {
  getAuthenticatedUserId,
  requireActiveUser,
  type AuthenticatedRequest,
} from "../middlewares/auth";

const router: IRouter = Router();

class SaleValidationError extends Error {}

router.get("/sales/epoch", requireActiveUser, async (_req, res, next) => {
  try {
    const [state] = await db.select({ epoch: salesEpochTable.epoch, testEpoch: salesEpochTable.testEpoch }).from(salesEpochTable).where(eq(salesEpochTable.id, 1));
    res.json(GetSalesEpochResponse.parse({ epoch: state?.epoch ?? 0, testEpoch: state?.testEpoch ?? 0 }));
  } catch (error) { next(error); }
});

router.post("/sales", requireActiveUser, async (req, res, next) => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid sale payload" });
    return;
  }

  const clerkUserId = getAuthenticatedUserId(req);
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { items, tableLabel, paymentMethod, clientRequestId } = parsed.data;
  const isTest = parsed.data.isTest === true;
  const account = (req as AuthenticatedRequest).appUser;
  if (isTest && (account?.role !== "admin" || account.username?.toLowerCase() !== "marlon")) {
    res.status(403).json({ error: "Les ventes d’essai sont réservées au compte marlon." });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Lock before deduplication or stock changes so a reset cannot erase a
      // sale between a retry lookup and its response.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('univers-des-saveurs:receipts'))`);
      const [state] = await tx.select({ epoch: salesEpochTable.epoch, testEpoch: salesEpochTable.testEpoch }).from(salesEpochTable).where(eq(salesEpochTable.id, 1));
      if (isTest ? (parsed.data.testEpoch ?? 0) !== (state?.testEpoch ?? 0) : (parsed.data.salesEpoch ?? 0) !== (state?.epoch ?? 0)) {
        throw new SaleValidationError("Vente créée avant la remise à zéro : vérifiez-la avant de refaire la vente.");
      }
      // Serialize retries for the same user/request key before looking at
      // stock. A unique index protects the final insert as a second line of
      // defense, while this lock prevents a retry from decrementing stock.
      if (clientRequestId) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${clerkUserId}:${clientRequestId}`}))`,
        );
        const [existingSale] = await tx
          .select()
          .from(salesTable)
          .where(
            sql`${eq(salesTable.clerkUserId, clerkUserId)} AND ${eq(
              salesTable.clientRequestId,
              clientRequestId,
            )}`,
          )
          .limit(1);
        if (existingSale) {
          if (existingSale.isTest !== isTest) throw new SaleValidationError("Identifiant de vente déjà utilisé pour un autre type de vente.");
          const existingItems = await tx
            .select()
            .from(saleItemsTable)
            .where(eq(saleItemsTable.saleId, existingSale.id));
          return { sale: { ...existingSale, items: existingItems }, duplicate: true };
        }
      }

      const quantities = new Map<string, number>();
      for (const item of items) {
        const quantity = (quantities.get(item.productId) ?? 0) + item.quantity;
        if (!Number.isSafeInteger(quantity) || quantity < 1) {
          throw new SaleValidationError("Sale quantities are out of range");
        }
        quantities.set(item.productId, quantity);
      }
      const productIds = [...quantities.keys()];
      const lockedProducts = await tx
        .select()
        .from(productsTable)
        .where(inArray(productsTable.id, productIds))
        .for("update");
      const productById = new Map(lockedProducts.map((product) => [product.id, product]));
      if (lockedProducts.length !== productIds.length) {
        throw new SaleValidationError("One or more products were not found");
      }
      for (const [productId, quantity] of quantities) {
        const product = productById.get(productId);
        if (!product?.active) {
          throw new SaleValidationError("One or more products are inactive");
        }
        if (!isTest && product.stockQuantity < quantity) {
          throw new SaleValidationError(`Insufficient stock for ${product.name}`);
        }
      }

      const lineItems = items.map((item) => {
        const product = productById.get(item.productId);
        if (!product) throw new SaleValidationError("Product not found");
        const lineTotal = product.price * item.quantity;
        if (!Number.isSafeInteger(lineTotal) || lineTotal < 0) {
          throw new SaleValidationError("Sale prices are out of range");
        }
        return {
          productId: product.id,
          name: product.name,
          unitPrice: product.price,
          quantity: item.quantity,
          lineTotal,
        };
      });
      const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
      if (!Number.isSafeInteger(subtotal) || subtotal < 0) {
        throw new SaleValidationError("Sale subtotal is out of range");
      }

      const cashAmount = parsed.data.cashAmount ?? (paymentMethod === "Espèces" ? subtotal : 0);
      const waveAmount = parsed.data.waveAmount ?? (paymentMethod === "Wave" ? subtotal : 0);
      const orangeMoneyAmount = parsed.data.orangeMoneyAmount ?? (paymentMethod === "Orange Money" ? subtotal : 0);
      const cashTendered = parsed.data.cashTendered ?? cashAmount;
      const paymentAmounts = [cashAmount, waveAmount, orangeMoneyAmount, cashTendered];
      if (paymentAmounts.some((amount) => !Number.isSafeInteger(amount) || amount < 0)) {
        throw new SaleValidationError("Les montants de paiement sont invalides");
      }
      if (cashAmount + waveAmount + orangeMoneyAmount !== subtotal) {
        throw new SaleValidationError("La somme des paiements doit correspondre au total de la vente");
      }
      if (cashTendered < cashAmount) {
        throw new SaleValidationError("Le montant reçu en espèces est insuffisant");
      }
      if (cashAmount === 0 && cashTendered !== 0) {
        throw new SaleValidationError("Un montant reçu en espèces nécessite une part payée en espèces");
      }
      const changeDue = cashTendered - cashAmount;
      const usedMethods = [
        cashAmount > 0 ? "Espèces" : null,
        waveAmount > 0 ? "Wave" : null,
        orangeMoneyAmount > 0 ? "Orange Money" : null,
      ].filter((method): method is string => Boolean(method));
      const resolvedPaymentMethod = usedMethods.length > 1 ? "Mixte" : usedMethods[0] ?? paymentMethod;

      if (!isTest) {
        for (const [productId, quantity] of quantities) {
          const updated = await tx
            .update(productsTable)
            .set({ stockQuantity: sql`${productsTable.stockQuantity} - ${quantity}` })
            .where(
              sql`${eq(productsTable.id, productId)} AND ${productsTable.stockQuantity} >= ${quantity}`,
            )
            .returning({ id: productsTable.id });
          if (updated.length !== 1) {
            throw new SaleValidationError("Insufficient stock");
          }
        }
      }

      // The transaction lock serializes receipt allocation across all API
      // instances. A failed sale rolls back its number along with the stock.
      const [lastReceipt] = await tx
        .select({
          number: sql<string>`coalesce(max((substring(${salesTable.receiptNumber} from ${isTest ? '^ESSAI-([0-9]+)$' : '^REC-([0-9]+)$'}))::bigint), 0)`,
        })
        .from(salesTable);
      const nextNumber = Number(lastReceipt?.number ?? 0) + 1;
      if (!Number.isSafeInteger(nextNumber)) throw new Error("Receipt number limit reached");

      const [createdSale] = await tx
        .insert(salesTable)
        .values({
          receiptNumber: `${isTest ? "ESSAI" : "REC"}-${String(nextNumber).padStart(6, "0")}`,
          isTest,
          clerkUserId,
          clientRequestId: clientRequestId ?? null,
          tableLabel,
          paymentMethod: resolvedPaymentMethod,
          subtotal,
          cashTendered,
          cashAmount,
          waveAmount,
          orangeMoneyAmount,
          changeDue,
        })
        .returning();

      if (!createdSale) {
        throw new Error("Unable to create sale");
      }

      const createdItems = await tx
        .insert(saleItemsTable)
        .values(
          lineItems.map((item) => ({
            saleId: createdSale.id,
            productId: item.productId,
            name: item.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
          })),
        )
        .returning();

      return {
        sale: { ...createdSale, items: createdItems },
        duplicate: false,
      };
    });

    res.status(result.duplicate ? 200 : 201).json(CreateSaleResponse.parse(result.sale));
  } catch (error) {
    if (error instanceof SaleValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

export default router;