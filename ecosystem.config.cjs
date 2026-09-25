/**
 * PM2 ecosystem — L'Univers des Saveurs
 * Gère deux processus : API (port 3002) et Frontend (port 3003)
 *
 * Usage :
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save && pm2 startup
 */
require("dotenv").config({ path: ".env" });

module.exports = {
  apps: [
    {
      name: "univers-api",
      script: "artifacts/api-server/dist/index.mjs",
      node_args: "--enable-source-maps",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env_production: {
        NODE_ENV: "production",
        PORT: 3002,
        DATABASE_URL: process.env.DATABASE_URL,
        JWT_SECRET: process.env.JWT_SECRET,
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "8h",
      },
    },
    {
      name: "univers-front",
      script: "artifacts/univers-des-saveurs/server/serve.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      env_production: {
        NODE_ENV: "production",
        PORT: 3003,
      },
    },
  ],
};
