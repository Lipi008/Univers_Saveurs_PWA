# Déploiement VPS — L'Univers des Saveurs

Déploiement complet depuis zéro sur un VPS Ubuntu/Debian avec nginx + SSL.

---

## Architecture cible

```
Internet (HTTPS :443)
        │
      Nginx  (pos.luniversdessaveurs.com)
        ├── /api/*  →  127.0.0.1:3002  (API Express — PM2)
        └── /*      →  127.0.0.1:3003  (Frontend statique — PM2)
```

---

## 0. Prérequis VPS

```bash
# Mettre à jour le système
sudo apt update && sudo apt upgrade -y

# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm
npm install -g pnpm

# PM2 (gestionnaire de processus)
npm install -g pm2

# Nginx + Certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Vérifier les versions
node --version    # v22.x.x
pnpm --version    # 9.x.x ou 10.x.x
pm2 --version
nginx -v
```

---

## 1. Récupérer le code

```bash
cd /opt
git clone <url-du-repo> univers-des-saveurs
cd univers-des-saveurs
```

---

## 2. Installer les dépendances

```bash
pnpm install --frozen-lockfile
```

---

## 3. Configurer l'environnement

```bash
cp .env.example .env
nano .env
```

Remplir le fichier `.env` :

```env
# Base de données PostgreSQL
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/univers_saveurs

# JWT — générer une clé forte :
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=REMPLACER_PAR_UNE_VRAIE_CLE_256_BITS

# Durée des tokens
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

```bash
pnpm db:push
```

---

## 5. Builder l'API

```bash
pnpm api:build
```

Produit `artifacts/api-server/dist/index.mjs`.

---

## 6. Builder le frontend

> ⚠️ Le build **doit être lancé depuis le dossier du frontend**, pas depuis la racine.

```bash
cd /opt/univers-des-saveurs/artifacts/univers-des-saveurs

EXPO_PUBLIC_DOMAIN=pos.luniversdessaveurs.com node scripts/build.js
```

Le build prend **5 à 15 minutes**. Il génère :
- `static-build/web/` — app web PWA
- `static-build/ios/manifest.json` — pour Expo Go iOS
- `static-build/android/manifest.json` — pour Expo Go Android

Revenir à la racine ensuite :

```bash
cd /opt/univers-des-saveurs
```

---

## 7. Configurer Nginx

### 7a. Créer le fichier de configuration

```bash
sudo nano /etc/nginx/sites-available/univers-des-saveurs
```

Coller ce contenu :

```nginx
server {
    listen 80;
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
}
```

### 7b. Activer le site et tester nginx

```bash
sudo ln -s /etc/nginx/sites-available/univers-des-saveurs /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7c. Obtenir le certificat SSL avec Certbot

```bash
sudo certbot --nginx -d pos.luniversdessaveurs.com
```

Certbot modifie automatiquement la config nginx pour ajouter le SSL et la redirection HTTP → HTTPS.

Vérifier le renouvellement automatique :

```bash
sudo certbot renew --dry-run
```

---

## 8. Démarrer avec PM2

```bash
cd /opt/univers-des-saveurs

# Démarrer les deux processus
pm2 start ecosystem.config.cjs --env production

# Vérifier que les deux processus sont UP
pm2 status
```

Tu dois voir `univers-api` (port 3002) et `univers-front` (port 3003) en `online`.

```bash
# Sauvegarder la liste des processus
pm2 save

# Activer le démarrage automatique au reboot du serveur
pm2 startup
# → copier-coller la commande sudo affichée par PM2
```

---

## 9. Créer le premier compte administrateur

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

La réponse contient un token JWT. Cet endpoint se désactive automatiquement une fois qu'un admin existe.

---

## 10. Vérifier le déploiement

```bash
# Santé de l'API
curl https://pos.luniversdessaveurs.com/api/healthz
# → {"status":"ok"}

# Frontend
curl -I https://pos.luniversdessaveurs.com
# → HTTP/2 200

# Statut setup (doit être false si l'admin a été créé)
curl https://pos.luniversdessaveurs.com/api/auth/setup-status
# → {"needsSetup":false}

# Processus PM2
pm2 status
```

---

## Mise à jour (déploiements suivants)

```bash
cd /opt/univers-des-saveurs

# 1. Récupérer les changements
git pull

# 2. Mettre à jour les dépendances si nécessaire
pnpm install --frozen-lockfile

# 3. Rebuilder l'API si le code back a changé
pnpm api:build

# 4. Rebuilder le frontend si le code front a changé
cd /opt/univers-des-saveurs/artifacts/univers-des-saveurs
EXPO_PUBLIC_DOMAIN=pos.luniversdessaveurs.com node scripts/build.js
cd /opt/univers-des-saveurs

# 5. Synchroniser le schéma si des tables ont changé
pnpm db:push

# 6. Redémarrer les services
pm2 restart univers-api univers-front

# 7. Vérifier
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
| `pm2 monit` | Dashboard temps réel |

---

## Dépannage

**Build frontend — `ENOENT: no such file or directory, open 'static-build/...'`**  
→ Le build doit être lancé **depuis** `artifacts/univers-des-saveurs/`, pas depuis la racine du projet.  
```bash
cd /opt/univers-des-saveurs/artifacts/univers-des-saveurs
EXPO_PUBLIC_DOMAIN=pos.luniversdessaveurs.com node scripts/build.js
```

**Build frontend — `Unable to resolve "@/..."` ou `"../../..."` après Babel**  
→ Le fichier source manque. Vérifier que tous les fichiers sont bien commités et présents :  
```bash
ls artifacts/univers-des-saveurs/utils/
ls artifacts/univers-des-saveurs/hooks/
ls artifacts/univers-des-saveurs/components/
```

**Build frontend — `No deployment domain found`**  
→ La variable `EXPO_PUBLIC_DOMAIN` n'est pas passée. Ajouter `EXPO_PUBLIC_DOMAIN=pos.luniversdessaveurs.com` avant la commande.

**`JWT_SECRET must be set`**  
→ Le fichier `.env` est absent ou incomplet. Vérifier avec `cat /opt/univers-des-saveurs/.env`.

**`DATABASE_URL must be set`**  
→ Idem. Le `.env` est chargé par `ecosystem.config.cjs` via `dotenv` au démarrage PM2.

**Nginx 502 Bad Gateway**  
→ Un des processus Node est arrêté. Vérifier `pm2 status` et `pm2 logs`.

**Port 3002 ou 3003 déjà occupé**  
```bash
sudo lsof -i :3002
sudo lsof -i :3003
```

**Renouvellement SSL automatique**  
→ Certbot installe un timer systemd. Vérifier avec `sudo certbot renew --dry-run`.
