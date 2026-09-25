# Démarrage local — L'Univers des Saveurs

Guide pour un nouveau développeur souhaitant lancer le projet en local.

---

## Prérequis

| Outil | Version minimale | Vérifier |
|-------|-----------------|---------|
| Node.js | 22+ | `node --version` |
| pnpm | 9+ | `pnpm --version` |
| Expo Go (mobile) | dernière | App Store / Play Store |

> **pnpm uniquement.** Le projet bloque `npm` et `yarn` au niveau du workspace.

---

## 1. Installer les dépendances

```bash
pnpm install
```

---

## 2. Configurer les variables d'environnement

Copier le fichier exemple et le remplir :

```bash
cp .env.example .env
```

Éditer `.env` :

```env
# Connexion à la base de données PostgreSQL
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/univers_saveurs

# Clé secrète JWT — générer une vraie clé :
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=remplacer_par_une_longue_cle_aleatoire

# Durée de validité des tokens (ex: 8h, 1d, 7d)
JWT_EXPIRES_IN=8h

# Port du serveur backend
PORT=8080
NODE_ENV=development

# URL de l'API vue par le frontend web
EXPO_PUBLIC_API_URL=http://localhost:8080
```

> **Ne jamais committer `.env`** — il est dans `.gitignore`.

---

## 3. Synchroniser la base de données

Lance une seule fois pour créer toutes les tables :

```bash
pnpm db:push
```

Si tu veux forcer une resynchronisation (⚠️ peut modifier des colonnes existantes) :

```bash
pnpm db:push-force
```

---

## 4. Créer le premier compte administrateur

Au premier lancement, l'application n'a aucun utilisateur. L'endpoint `/api/auth/setup` permet de créer le compte admin initial (il devient inactif dès qu'un admin existe).

Démarre le serveur (voir étape 5), puis dans un autre terminal :

```bash
curl -X POST http://localhost:8080/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "MonMotDePasse1",
    "firstName": "Prénom",
    "lastName": "Nom"
  }'
```

La réponse contient un `token` JWT — garde-le pour tester l'API si besoin.

---

## 5. Lancer les serveurs

### Backend (API)

```bash
pnpm api:dev
```

Disponible sur `http://localhost:8080`.  
Endpoint de santé : `http://localhost:8080/api/healthz`

### Frontend web

```bash
pnpm front:web
```

Disponible sur `http://localhost:19006`.

### Frontend mobile (Expo Go)

1. Trouver l'IP locale de ta machine :
   - Windows : `ipconfig` → chercher "Adresse IPv4"
   - macOS/Linux : `ifconfig` ou `ip a`

2. Éditer `artifacts/univers-des-saveurs/.env.local` :

```env
EXPO_PUBLIC_API_URL=http://192.168.X.X:8080
```

3. Lancer :

```bash
pnpm front:mobile
```

4. Scanner le QR code avec **Expo Go** (iOS / Android).

> Le téléphone et le PC doivent être sur le **même réseau Wi-Fi**.

---

## Récapitulatif des scripts racine

| Script | Action |
|--------|--------|
| `pnpm db:push` | Synchroniser le schéma de la base de données |
| `pnpm db:push-force` | Forcer la resynchronisation (avec confirmation) |
| `pnpm api:dev` | Lancer le serveur backend (build + start) |
| `pnpm api:build` | Builder le serveur sans le démarrer |
| `pnpm front:web` | Lancer le frontend dans le navigateur |
| `pnpm front:mobile` | Lancer Expo pour mobile (QR code) |

---

## Structure du projet

```
/
├── artifacts/
│   ├── api-server/          # Backend Express.js (JWT, API REST)
│   └── univers-des-saveurs/ # Frontend React Native / Expo
├── lib/
│   ├── db/                  # Schéma Drizzle ORM + migrations
│   ├── api-spec/            # Spécification OpenAPI
│   ├── api-zod/             # Schémas Zod générés
│   └── api-client-react/    # Client React généré
├── .env                     # Variables locales (non commité)
├── .env.example             # Modèle à copier
└── GETTING_STARTED.md       # Ce fichier
```

---

## Authentification — comment ça marche

Le projet utilise **JWT (JSON Web Tokens)** géré en interne :

1. L'utilisateur se connecte via `POST /api/auth/login` avec `username` + `password`
2. Le serveur vérifie le mot de passe (bcrypt) et retourne un token JWT
3. Le token est stocké localement :
   - **Web** : `localStorage`
   - **Mobile** : `expo-secure-store` (stockage chiffré natif)
4. Chaque requête API inclut `Authorization: Bearer <token>`
5. Le token expire après la durée définie dans `JWT_EXPIRES_IN` — l'utilisateur est redirigé vers la page de connexion

### Rôles disponibles

| Rôle | Accès |
|------|-------|
| `admin` | Tout — gestion équipe, rapports, ventes |
| `manager` | Équipe, rapports, ventes |
| `cashier` | Caisse uniquement |
| `server` | Enregistrement des ventes |

---

## Dépannage

**`DATABASE_URL must be set`**  
→ Le fichier `.env` n'est pas trouvé ou `DATABASE_URL` est absent.

**`JWT_SECRET must be set`**  
→ Ajouter `JWT_SECRET` dans `.env` (générer avec la commande indiquée).

**`SASL: client password must be a string`**  
→ Vérifier que `DATABASE_URL` est bien définie et que le mot de passe est correctement encodé (`@` → `%40`).

**Expo ne trouve pas l'API sur mobile**  
→ Remplacer `localhost` par l'IP de la machine dans `artifacts/univers-des-saveurs/.env.local`.

**Port 8080 déjà utilisé**  
→ Changer `PORT=8080` dans `.env` et `EXPO_PUBLIC_API_URL` en conséquence.
