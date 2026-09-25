import { Router, type IRouter } from "express";
import {
  CreateCategoryBody,
  CreateCategoryResponse,
  UpdateCategoryBody,
  UpdateCategoryParams,
  UpdateCategoryResponse,
  DeleteCategoryParams,
  DeleteCategoryBody,
  CreateProductBody,
  CreateProductResponse,
  GetCategoriesResponse,
  GetProductsResponse,
  UpdateProductStockBody,
  UpdateProductStockParams,
  UpdateProductStockResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
  ImportProductsBody,
  ImportProductsResponse,
} from "@workspace/api-zod";
import ExcelJS from "exceljs";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { categoriesTable, db, productsTable } from "@workspace/db";
import { requireActiveUser, requireAdmin, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/admin/products/import", requireAdmin, async (req, res, next) => {
  if ((req as AuthenticatedRequest).appUser?.role !== "admin") {
    res.status(403).json({ error: "Import réservé à l'administrateur." });
    return;
  }
  const parsed = ImportProductsBody.safeParse(req.body);
  if (!parsed.success || !/^[A-Za-z0-9+/]+={0,2}$/.test(parsed.data.base64)) {
    res.status(400).json({ error: "Sélectionnez un fichier Excel .xlsx valide (3 Mo maximum)." });
    return;
  }
  const buffer = Buffer.from(parsed.data.base64, "base64");
  if (buffer.length > 3 * 1024 * 1024 || buffer.length < 20 || buffer.subarray(0, 2).toString() !== "PK") {
    res.status(400).json({ error: "Fichier .xlsx invalide ou trop volumineux (3 Mo maximum)." });
    return;
  }
  try {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    } catch {
      res.status(400).json({ error: "Le fichier Excel .xlsx ne peut pas être lu." });
      return;
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("Le fichier ne contient aucune feuille.");
    const header = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, index) => header.set(cell.text.trim().toLocaleLowerCase("fr-FR"), index));
    const fields = ["nom", "catégorie", "prix", "stock"];
    if (fields.some((field) => !header.has(field))) {
      throw new Error("La première ligne doit contenir : Nom, Catégorie, Prix, Stock.");
    }
    if (sheet.rowCount > 501) throw new Error("Le fichier ne peut pas dépasser 500 produits.");
    const rows: { name: string; category: string; price: number; stockQuantity: number }[] = [];
    for (let index = 2; index <= sheet.rowCount; index++) {
      const row = sheet.getRow(index);
      const text = (field: string) => row.getCell(header.get(field)!).text.trim();
      const name = text("nom");
      const category = text("catégorie");
      const priceText = text("prix").replace(/[\s\u00a0]/g, "");
      const stockText = text("stock").replace(/[\s\u00a0]/g, "");
      if (![name, category, priceText, stockText].some(Boolean)) continue;
      const price = Number(priceText);
      const stockQuantity = Number(stockText);
      if (!name || name.length > 200 || !category || category.length > 200 ||
          !/^\d+$/.test(priceText) || !/^\d+$/.test(stockText) ||
          !Number.isSafeInteger(price) || price > 2_147_483_647 ||
          !Number.isSafeInteger(stockQuantity) || stockQuantity > 2_147_483_647) {
        throw new Error(`Ligne ${index} invalide : vérifiez le nom, la catégorie, le prix et le stock (entiers positifs).`);
      }
      rows.push({ name, category, price, stockQuantity });
    }
    if (!rows.length) throw new Error("Aucun produit à importer.");
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('univers-des-saveurs:catalog-import'))`);
      const storedCategories = await tx.select().from(categoriesTable);
      const byName = new Map(storedCategories.map((c) => [c.name.toLocaleLowerCase("fr-FR"), c]));
      const slugs = new Set(storedCategories.map((c) => c.slug));
      const existing = await tx.select({ name: productsTable.name, categoryId: productsTable.categoryId }).from(productsTable);
      const productKeys = new Set(existing.map((p) => `${p.categoryId}:${p.name.toLocaleLowerCase("fr-FR")}`));
      let created = 0, skipped = 0, categoriesCreated = 0;
      for (const row of rows) {
        const key = row.category.toLocaleLowerCase("fr-FR");
        let category = byName.get(key);
        if (category && !category.active) throw new Error(`Catégorie désactivée : ${row.category}.`);
        if (!category) {
          const base = slugify(row.category);
          let slug = base, suffix = 2;
          while (slugs.has(slug)) slug = `${base}-${suffix++}`;
          const [inserted] = await tx.insert(categoriesTable).values({ name: row.category, slug }).returning();
          if (!inserted) throw new Error("Catégorie non créée.");
          category = inserted;
          byName.set(key, category);
          slugs.add(slug);
          categoriesCreated++;
        }
        const productKey = `${category.id}:${row.name.toLocaleLowerCase("fr-FR")}`;
        if (productKeys.has(productKey)) { skipped++; continue; }
        await tx.insert(productsTable).values({
          name: row.name, categoryId: category.id, price: row.price, stockQuantity: row.stockQuantity,
        });
        productKeys.add(productKey);
        created++;
      }
      return { created, skipped, categoriesCreated };
    });
    req.log.info(result, "Excel products imported");
    res.json(ImportProductsResponse.parse(result));
  } catch (error) {
    if (error instanceof Error && /Ligne |première ligne|Aucun produit|dépasser 500|Catégorie désactivée|aucune feuille/.test(error.message)) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "category";
}

function imageUrl(imagePath: string | null): string | null {
  return imagePath ? `/api/storage${imagePath}` : null;
}

function categoryResponse(category: typeof categoriesTable.$inferSelect) {
  return {
    ...category,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

function productResponse(
  product: typeof productsTable.$inferSelect,
  category: typeof categoriesTable.$inferSelect,
) {
  return {
    ...product,
    imageUrl: imageUrl(product.imagePath),
    category: categoryResponse(category),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

router.get("/categories", requireActiveUser, async (_req, res, next) => {
  try {
    const categories = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.active, true))
      .orderBy(asc(categoriesTable.name));
    res.json(GetCategoriesResponse.parse(categories.map(categoryResponse)));
  } catch (error) {
    next(error);
  }
});

router.get("/products", requireActiveUser, async (_req, res, next) => {
  try {
    const products = await db
      .select({ product: productsTable, category: categoriesTable })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(and(eq(productsTable.active, true), eq(categoriesTable.active, true)))
      .orderBy(asc(productsTable.name));
    res.json(
      GetProductsResponse.parse(
        products.map(({ product, category }) => productResponse(product, category)),
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/admin/categories", requireAdmin, async (req, res, next) => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid category payload" });
    return;
  }
  try {
    const normalizedName = parsed.data.name.trim();
    const category = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('univers-des-saveurs:catalog-import'))`);
      const duplicate = await tx.query.categoriesTable.findFirst({
        where: sql`lower(${categoriesTable.name}) = lower(${normalizedName}) AND ${categoriesTable.active} = true`,
      });
      if (duplicate) return null;
      const [created] = await tx.insert(categoriesTable)
        .values({ name: normalizedName, slug: slugify(normalizedName) }).returning();
      return created;
    });
    if (!category) {
      res.status(409).json({ error: "Une catégorie portant ce nom existe déjà." });
      return;
    }
    res.status(201).json(CreateCategoryResponse.parse(categoryResponse(category)));
  } catch (error) {
    next(error);
  }
});

router.patch("/admin/categories/:id", requireAdmin, async (req, res, next) => {
  const params = UpdateCategoryParams.safeParse(req.params);
  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Le nom de la catégorie est invalide." });
    return;
  }
  try {
    const normalizedName = parsed.data.name.trim();
    const duplicate = await db.query.categoriesTable.findFirst({
      where: and(
        sql`lower(${categoriesTable.name}) = lower(${normalizedName})`,
        ne(categoriesTable.id, params.data.id),
        eq(categoriesTable.active, true),
      ),
    });
    if (duplicate) {
      res.status(409).json({ error: "Une catégorie portant ce nom existe déjà." });
      return;
    }
    const [category] = await db
      .update(categoriesTable)
      .set({ name: normalizedName, slug: slugify(normalizedName), active: true })
      .where(eq(categoriesTable.id, params.data.id))
      .returning();
    if (!category) {
      res.status(404).json({ error: "Catégorie introuvable." });
      return;
    }
    res.json(UpdateCategoryResponse.parse(categoryResponse(category)));
  } catch (error) {
    next(error);
  }
});

router.delete("/admin/categories/:id", requireAdmin, async (req, res, next) => {
  const params = DeleteCategoryParams.safeParse(req.params);
  const parsed = DeleteCategoryBody.safeParse(req.body ?? {});
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "La catégorie sélectionnée est invalide." });
    return;
  }
  try {
    await db.transaction(async (tx) => {
      const category = await tx.query.categoriesTable.findFirst({
        where: eq(categoriesTable.id, params.data.id),
      });
      if (!category || !category.active) {
        res.status(404).json({ error: "Catégorie introuvable." });
        return;
      }
      const [usage] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(productsTable)
        .where(and(eq(productsTable.categoryId, category.id), eq(productsTable.active, true)));
      const productCount = Number(usage?.count ?? 0);
      if (productCount > 0 && !parsed.data.replacementCategoryId) {
        res.status(409).json({
          error: `Cette catégorie contient ${productCount} produit${productCount > 1 ? "s" : ""}. Sélectionnez une catégorie de remplacement.`,
        });
        return;
      }
      if (productCount > 0) {
        const replacementCategoryId = parsed.data.replacementCategoryId;
        if (!replacementCategoryId) {
          res.status(409).json({
            error: "Sélectionnez une catégorie de remplacement.",
          });
          return;
        }
        if (replacementCategoryId === category.id) {
          res.status(400).json({ error: "La catégorie de remplacement doit être différente." });
          return;
        }
        const replacement = await tx.query.categoriesTable.findFirst({
          where: and(eq(categoriesTable.id, replacementCategoryId), eq(categoriesTable.active, true)),
        });
        if (!replacement) {
          res.status(400).json({ error: "La catégorie de remplacement est introuvable." });
          return;
        }
        await tx
          .update(productsTable)
          .set({ categoryId: replacement.id })
          .where(and(eq(productsTable.categoryId, category.id), eq(productsTable.active, true)));
      }
      await tx.update(categoriesTable).set({ active: false }).where(eq(categoriesTable.id, category.id));
    });
    if (res.headersSent) return;
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post("/admin/products", requireAdmin, async (req, res, next) => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid product payload" });
    return;
  }
  if (parsed.data.imagePath && !/^\/objects\/products\/[0-9a-f-]+$/i.test(parsed.data.imagePath)) {
    res.status(400).json({ error: "Invalid product image path" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('univers-des-saveurs:catalog-import'))`);
      const category = await tx.query.categoriesTable.findFirst({
        where: eq(categoriesTable.id, parsed.data.categoryId),
      });
      if (!category || !category.active) return null;
      const [created] = await tx.insert(productsTable)
        .values({
          name: parsed.data.name.trim(),
          categoryId: parsed.data.categoryId,
          price: parsed.data.price,
          stockQuantity: parsed.data.stockQuantity,
          imagePath: parsed.data.imagePath,
        })
        .returning();
      return { product: created, category };
    });
    if (!result?.product) {
      res.status(400).json({ error: "Category not found or inactive" });
      return;
    }
    res
      .status(201)
      .json(CreateProductResponse.parse(productResponse(result.product, result.category)));
  } catch (error) {
    next(error);
  }
});

router.patch("/admin/products/:id", requireAdmin, async (req, res, next) => {
  const params = UpdateProductParams.safeParse(req.params);
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid product payload" });
    return;
  }
  try {
    const category = await db.query.categoriesTable.findFirst({
      where: eq(categoriesTable.id, parsed.data.categoryId),
    });
    if (!category) {
      res.status(400).json({ error: "Category not found" });
      return;
    }
    const [product] = await db
      .update(productsTable)
      .set({ name: parsed.data.name, categoryId: parsed.data.categoryId, price: parsed.data.price, imagePath: parsed.data.imagePath })
      .where(eq(productsTable.id, params.data.id))
      .returning();
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(UpdateProductResponse.parse(productResponse(product, category)));
  } catch (error) {
    next(error);
  }
});

router.patch("/admin/products/:id/stock", requireAdmin, async (req, res, next) => {
  const params = UpdateProductStockParams.safeParse(req.params);
  const parsed = UpdateProductStockBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid stock payload" });
    return;
  }
  try {
    const [product] = await db
      .update(productsTable)
      .set({ stockQuantity: parsed.data.stockQuantity })
      .where(eq(productsTable.id, params.data.id))
      .returning();
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const category = await db.query.categoriesTable.findFirst({
      where: eq(categoriesTable.id, product.categoryId),
    });
    if (!category) throw new Error("Product category not found");
    res.json(UpdateProductStockResponse.parse(productResponse(product, category)));
  } catch (error) {
    next(error);
  }
});

export default router;