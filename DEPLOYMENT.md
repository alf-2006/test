# Deployment Guide

## ⚠️ Important: Why Vercel Alone Won't Work

This project has features that **require a persistent server**:
- **WebSockets** (`/ws` endpoint) — real-time notifications
- **Background scheduler** (`setInterval`) — unlocks scheduled messages
- **Cookie-based sessions** — admin authentication

Vercel is serverless and kills processes between requests.

---

## ✅ Recommended: Railway (Easiest, Free Tier Available)

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select your `ad436621/test` repo
3. Railway will auto-detect the Node.js app
4. Set **Root Directory**: `artifacts/api-server`
5. Set **Start Command**: `node dist/index.cjs`
6. Set **Build Command**: `pnpm install && pnpm run build`
7. Add a PostgreSQL plugin in Railway
8. Add these Environment Variables:
   ```
   DATABASE_URL=<from Railway PostgreSQL plugin>
   ENCRYPTION_KEY=<your 64-char hex key>
   ADMIN_USERNAME=ahmed
   ADMIN_PASSWORD_HASH=<bcrypt hash>
   VAPID_PUBLIC_KEY=<your key>
   VAPID_PRIVATE_KEY=<your key>
   VAPID_EMAIL=mailto:your@email.com
   PORT=3000
   ```
9. For the **frontend**: Deploy `artifacts/royal-letters` separately on Vercel
   - Set `VITE_API_URL` to your Railway backend URL
   - Use `vite.config.vercel.ts` as the config

---

## ✅ Alternative: Render.com

1. New Web Service → Connect GitHub repo
2. Root Directory: `artifacts/api-server`
3. Build Command: `pnpm install && pnpm run build`
4. Start Command: `node dist/index.cjs`
5. Add PostgreSQL database
6. Set environment variables (same as Railway)

---

## ✅ Keep on Replit (Simplest)

Just keep it on Replit — it already works perfectly there.
Run the migration once after pulling:
```bash
npx drizzle-kit push --config=lib/db/drizzle.config.ts
```

---

## Vercel (Frontend Only)

The `vercel.json` in this repo deploys **only the React frontend** to Vercel.
You still need Railway/Render for the backend API.

In your Vercel project settings, set:
```
VITE_API_BASE_URL=https://your-railway-backend.up.railway.app
```
