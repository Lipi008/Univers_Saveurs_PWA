import { categoriesTable, db, productsTable } from "@workspace/db";

// Catalogue de lancement de L'Univers des Saveurs. Ne pas remplacer par les
// anciens produits de démonstration : ce fichier accompagne l'export du code.
const categories = [
  ["Boissons — Bières", "boissons-bieres"],
  ["Boissons — Champagnes", "boissons-champagnes"],
  ["Boissons — Jus et sodas", "boissons-jus-sodas"],
  ["Boissons — Vins et liqueurs", "boissons-vins-liqueurs"],
  ["Desserts", "desserts"],
  ["Glaces — 1 boule", "glaces-1-boule"],
  ["Glaces — Pots 3 000 F", "glaces-pots-3000"],
  ["Glaces — Pots 5 000 F", "glaces-pots-5000"],
  ["Gâteaux — Grands", "gateaux-grands"],
  ["Gâteaux — Moyens", "gateaux-moyens"],
  ["Gâteaux — Parts", "gateaux-parts"],
  ["Gâteaux — Personnalisés", "gateaux-personnalises"],
  ["Gâteaux — Petits", "gateaux-petits"],
  ["Mignardises", "mignardises"],
  ["Petit déjeuner", "petit-dejeuner"],
  ["Pizza — Grande", "pizza-grande"],
  ["Pizza — Moyenne", "pizza-moyenne"],
  ["Pizza — Petite", "pizza-petite"],
  ["Plats africains", "plats-africains"],
  ["Salades", "salades"],
  ["Suppléments", "supplements"],
] as const;

type CatalogProduct = { category: string; name: string; price: number };

function group(category: string, items: readonly (readonly [string, number])[]): CatalogProduct[] {
  return items.map(([name, price]) => ({ category, name, price }));
}

const iceFlavors = [
  "Caramel", "Chocolat", "Céréales", "Fraise", "Fruits des bois",
  "Kinder", "Malaga", "Menthe", "Nutella", "Oréo", "Vanille",
];
const cakeFlavors = ["Caramel", "Chocolat", "Céréales", "Fruits", "Vanille"];
const pizzaFlavors = [
  "4 Saisons", "Bolognaise", "Crémière", "Forestière", "Fromage",
  "Jambon", "Pepperoni", "Poulet", "Royale",
];

const products: CatalogProduct[] = [
  ...group("boissons-bieres", [
    ["Desperados", 1000], ["Heineken", 1000], ["Panaché", 1000],
  ]),
  ...group("boissons-champagnes", [
    ["LP Laurent-Perrier", 50000], ["Moët Nectar", 60000],
    ["Nicolas Feuillatte", 45000], ["Veuve Clicquot", 71000],
  ]),
  ...group("boissons-jus-sodas", [
    ["Canette", 1000], ["Jus de fruits naturels", 1000],
  ]),
  ...group("boissons-vins-liqueurs", [
    ["Bailey's", 20000], ["Chêne Margot", 7000], ["Crosse Blanc", 5000],
    ["Guigal Côte du Rhône", 16000], ["Martini Rouge", 15000], ["Vin Rouge 1935", 10000],
  ]),
  ...group("desserts", [
    ["Fondant au chocolat", 2000], ["Mousse au chocolat", 2000],
    ["Salade de fruits", 2000], ["Tartelettes aux fruits", 2000],
  ]),
  ...iceFlavors.flatMap((flavor) => [
    { category: "glaces-1-boule", name: `Glace ${flavor} — 1 boule`, price: 1000 },
    { category: "glaces-pots-3000", name: `Glace ${flavor} — Pot 3 000 F`, price: 3000 },
    { category: "glaces-pots-5000", name: `Glace ${flavor} — Pot 5 000 F`, price: 5000 },
  ]),
  ...cakeFlavors.flatMap((flavor) => [
    { category: "gateaux-parts", name: `Gâteau ${flavor} — 1 part`, price: 2500 },
    { category: "gateaux-petits", name: `Gâteau ${flavor} — Petit`, price: 10000 },
    { category: "gateaux-moyens", name: `Gâteau ${flavor} — Moyen`, price: 15000 },
    { category: "gateaux-grands", name: `Gâteau ${flavor} — Grand`, price: 20000 },
  ]),
  ...group("gateaux-personnalises", [
    ["Gâteau personnalisé — à partir de", 25000],
    ["Gâteau pâte à sucre — à partir de", 35000],
  ]),
  ...group("mignardises", [
    ["10 burgers", 5000], ["10 croissants au jambon", 7500],
    ["10 croque-monsieur", 5000], ["10 crêpes chocolat", 5000],
    ["10 pastels au jambon", 7500], ["10 samoussas", 5000],
    ["12 allumettes", 5000], ["12 choux", 5000],
    ["12 mini crêpes nature", 5000], ["12 mini pizzas", 5000],
    ["12 quiches", 5000], ["20 cakes", 5000],
  ]),
  ...group("petit-dejeuner", [
    ["Cappuccino", 1000], ["Chocolat chaud", 1500], ["Croissant", 500],
    ["Expresso", 1000], ["Pain au chocolat", 500], ["Pain brochette", 1500],
    ["Sandwich", 1500], ["Thé", 1000],
  ]),
  ...pizzaFlavors.flatMap((flavor) => [
    { category: "pizza-petite", name: `Pizza ${flavor} — Petite`, price: flavor === "4 Saisons" ? 8000 : 5000 },
    { category: "pizza-moyenne", name: `Pizza ${flavor} — Moyenne`, price: flavor === "4 Saisons" ? 10000 : 8000 },
    { category: "pizza-grande", name: `Pizza ${flavor} — Grande`, price: flavor === "4 Saisons" ? 12000 : 10000 },
  ]),
  ...group("plats-africains", [
    ["Gouagouassou / Riz", 2500], ["Poisson braisé / Attiéké", 2500],
    ["Pondeuse kedjenou / Attiéké", 2500], ["Poulet braisé / Attiéké", 2500],
    ["Sauce graine / Riz", 2500], ["Sauce kôpè / Placali", 2000],
    ["Sauce légumes / Riz", 2500], ["Sosso frit / Attiéké", 2500],
    ["Soupe de carpe / Attiéké", 2500],
  ]),
  ...group("salades", [
    ["Salade composée", 3000], ["Salade macédoine", 5000], ["Salade nature", 2500],
  ]),
  ...group("supplements", [
    ["Alloco grillé", 1000], ["Attiéké", 500], ["Couscous", 1000],
    ["Fou fou", 1000], ["Foutou", 1000], ["Placali", 500],
    ["Pomme de terre sautée", 1000], ["Riz", 500],
  ]),
];

if (products.length !== 141 || categories.length !== 21) {
  throw new Error("Le catalogue de lancement est incomplet.");
}

try {
  const seeded = await db.transaction(async (tx) => {
    // Ne jamais modifier un catalogue déjà utilisé : ni prix, ni stock, ni ventes.
    const [existingProduct] = await tx.select({ id: productsTable.id }).from(productsTable).limit(1);
    if (existingProduct) return false;

    await tx.insert(categoriesTable).values(
      categories.map(([name, slug]) => ({ name, slug })),
    ).onConflictDoNothing();
    const categoryIds = new Map(
      (await tx.select({ id: categoriesTable.id, slug: categoriesTable.slug }).from(categoriesTable))
        .map(({ slug, id }) => [slug, id]),
    );
    await tx.insert(productsTable).values(products.map(({ category, name, price }) => {
      const categoryId = categoryIds.get(category);
      if (!categoryId) throw new Error(`Catégorie manquante : ${category}`);
      return { categoryId, name, price, stockQuantity: 100 };
    }));
    return true;
  });
  console.info(seeded ? "Catalogue initial chargé : 141 produits, 21 catégories." : "Catalogue déjà présent : aucune modification.");
} finally {
  await db.$client.end();
}