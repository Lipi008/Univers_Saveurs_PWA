# Déploiement VPS — L'Univers des Saveurs

Déploiement sur `pos.luniversdessaveurs.com` avec nginx + SSL Let's Encrypt déjà en place.

---

## Architecture cible

```
Internet (HTTPS :443)
        │
      Nginx  (pos.luniversdessaveurs.com)
        ├── /api/*  →  127.0.0.1:3002  (API Express)
        └── /*      →  127.0.0.1:3003  (Frontend statique)
```

---

## Prérequis VPS

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm
npm install -g pnpm

# PM2
npm install -g pm2

# Vérifier
node --version   # v22.x.x
pnpm --version   # 9.x.x
pm2 --version
```

---

## 1. Récupérer le code

```bash
cd /opt
git clone <url-du-repo> univers-des-saveurs
cd univers-des-saveurs
```

> Si pas de Git : transférer via `scp` ou `rsync` depuis le poste local.

---

## 2. Installer les dépendances

```bash
pnpm install --frozen-lockfile
```

---

## 3. Configurer l'environnement de production

```bash
cp .env.example .env
nano .env
```

Contenu minimal pour la production :

```env
# Base de données
DATABASE_URL=postgresql://lipi:lipi%402024%40@156.67.28.71:5432/univers_saveurs

# JWT — générer une clé forte :
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=REMPLACER_PAR_UNE_VRAIE_CLE_256_BITS

# Durée des tokens (8h recommandé en prod)
JWT_EXPIRES_IN=8h

# L'API tourne sur le port 3002 (nginx proxy)
PORT=3002
NODE_ENV=production

# Domaine public (utilisé lors du build frontend)
EXPO_PUBLIC_DOMAIN=pos.luniversdessaveurs.com
```

> **Ne jamais committer ce fichier.** Il est dans `.gitignore`.

---

## 4. Synchroniser la base de données

À faire **une seule fois** au premier déploiement, ou après un changement de schéma :

```bash
pnpm db:push
```

En cas de conflit (rare) :

```bash
pnpm db:push-force
```

---

## 5. Créer le premier compte administrateur

Au tout premier déploiement, aucun utilisateur n'existe. Une fois l'API démarrée (étape 7), exécuter :

```bash
curl -X POST https://pos.luniversdessaveurs.com/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "MotDePasseForce1",
    "firstName": "Prénom",
    "lastName": "Nom"
  }'
```

Cet endpoint se désactive automatiquement dès qu'un admin existe.

---

## 6. Builder le frontend

Le build frontend génère les fichiers statiques pour le web **et** les bundles pour Expo Go (iOS/Android).

```bash
EXPO_PUBLIC_DOMAIN=pos.luniversdessaveurs.com \
  node artifacts/univers-des-saveurs/scripts/build.js
```

Le build produit `artifacts/univers-des-saveurs/static-build/` avec :
- `web/` — app web PWA
- `ios/manifest.json` et `android/manifest.json` — pour Expo Go

> ⏱ Ce build prend **3 à 10 minutes** (Metro bundler en arrière-plan).

---

## 7. Builder l'API

```bash
pnpm api:build
```

Produit `artifacts/api-server/dist/index.mjs`.

---

## 8. Démarrer avec PM2

PM2 gère les deux processus et les redémarre automatiquement.

```bash
# Charger le .env et démarrer
pm2 start ecosystem.config.cjs --env production

# Vérifier que les deux processus tournent
pm2 status

# Consulter les logs
pm2 logs

# Sauvegarder la configuration PM2
pm2 save

# Activer le démarrage automatique au reboot
pm2 startup
# → suivre la commande affichée (sudo env PATH=...)
```

---

## 9. Vérifier le déploiement

```bash
# API
curl https://pos.luniversdessaveurs.com/api/healthz
# → {"status":"ok"}

# Frontend
curl -I https://pos.luniversdessaveurs.com
# → HTTP/2 200
```

---

## Configuration Nginx (déjà en place)

La config suivante est celle de la v1 — elle est **compatible sans modification** avec la v2 :

```nginx
server {
    server_name pos.luniversdessaveurs.com;

    location /api/ {
        proxy_pass http://127.0.0.1:3002/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
    }

    location / {
        proxy_pass http://127.0.0.1:3003/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/pos.luniversdessaveurs.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pos.luniversdessaveurs.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = pos.luniversdessaveurs.com) {
        return 301 https://$host$request_uri;
    }
    listen 80;
    server_name pos.luniversdessaveurs.com;
    return 404;
}
```

Recharger nginx après modification :

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## Mise à jour (déploiement suivant)

```bash
cd /opt/univers-des-saveurs

# Récupérer les changements
git pull

# Réinstaller si les dépendances ont changé
pnpm install --frozen-lockfile

# Rebuilder le frontend (si le code front a changé)
EXPO_PUBLIC_DOMAIN=pos.luniversdessaveurs.com \
  node artifacts/univers-des-saveurs/scripts/build.js

# Rebuilder l'API (si le code back a changé)
pnpm api:build

# Synchroniser le schéma si des tables ont changé
pnpm db:push

# Redémarrer les services
pm2 restart univers-api univers-front

# Vérifier
pm2 status
```

---

## Commandes PM2 utiles

| Commande | Action |
|----------|--------|
| `pm2 status` | État des processus |
| `pm2 logs` | Logs en temps réel |
| `pm2 logs univers-api` | Logs API uniquement |
| `pm2 logs univers-front` | Logs frontend uniquement |
| `pm2 restart univers-api` | Redémarrer l'API |
| `pm2 restart all` | Redémarrer tout |
| `pm2 stop all` | Arrêter tout |
| `pm2 delete all` | Supprimer les processus PM2 |
| `pm2 monit` | Dashboard temps réel |

---

## Dépannage

**`JWT_SECRET must be set`**  
→ Vérifier que `.env` est présent à la racine et contient `JWT_SECRET`.

**`DATABASE_URL must be set`**  
→ Idem. Le fichier `.env` doit être chargé par PM2 (l'`ecosystem.config.cjs` le charge via `dotenv`).

**Port 3002 ou 3003 déjà utilisé**  
→ `sudo lsof -i :3002` pour voir quel processus l'occupe. Arrêter l'ancien avec `pm2 stop <nom>`.

**Build frontend échoue avec "No deployment domain found"**  
→ S'assurer que `EXPO_PUBLIC_DOMAIN=pos.luniversdessaveurs.com` est passé avant `node scripts/build.js`.

**Nginx affiche 502 Bad Gateway**  
→ L'un des deux processus Node ne tourne pas. Vérifier `pm2 status` et `pm2 logs`.

**Renouvellement SSL Let's Encrypt**  
→ Certbot renouvelle automatiquement. Vérifier avec `sudo certbot renew --dry-run`.
