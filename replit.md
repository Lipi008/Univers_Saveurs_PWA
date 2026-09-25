# L'Univers des Saveurs

Application mobile POS pour piloter les commandes, les tables, la caisse, les stocks et les rapports d’un établissement de restauration.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed-catalog` — charger le catalogue initial (141 articles, 21 catégories, stock initial 100) dans une base vide. Les données du catalogue sont incluses dans `scripts/src/seed-catalog.ts`. La commande ne modifie pas une base contenant déjà des produits.
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/univers-des-saveurs/app/(tabs)/index.tsx` — écran principal de prise de commande et reçu
- `artifacts/univers-des-saveurs/context/OrderContext.tsx` — panier, espace de vente et persistance locale
- `artifacts/univers-des-saveurs/app/(tabs)/` — écrans Commandes, Tables, Stocks, Caisse et Rapports
- `artifacts/univers-des-saveurs/constants/colors.ts` — palette issue du logo fourni
- `artifacts/univers-des-saveurs/assets/images/icon.png` — logo de L'Univers des Saveurs

## Architecture decisions

- La première version privilégie l’usage mobile et hors connexion avec AsyncStorage pour le panier et l’espace sélectionné.
- Le reçu est affiché dans une feuille native et contient l’identité visuelle, le détail de la commande, le total et le mode de paiement.
- La palette reprend le bordeaux, l’or et la crème du logo pour maintenir une identité cohérente et lisible en service.

## Product

- Prendre une commande par catégories et recherche, sélectionner une table ou la vente à emporter, et suivre un panier en cours.
- Consulter l’occupation des tables, les niveaux de stocks, le chiffre d’affaires et la répartition des paiements.
- Générer un reçu de caisse à partir de la commande active et démarrer une nouvelle commande.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
