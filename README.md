# الرسائل الملكية — Royal Letters Platform

## Overview

A complete royal Arabic letter platform where Ahmed can write personalized letters to loved ones. Letters are locked behind custom security questions, opened via unique links, and displayed on beautiful parchment-style pages with royal Arabic fonts. Features AES-256-GCM encryption for all text fields, admin profile management, PWA with push notifications, and scheduled/time-locked messages with live countdown timers.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (Replit built-in)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Frontend**: React + Vite + Tailwind CSS v4
- **Auth**: Cookie-based sessions (bcryptjs for password hashing)
- **Animations**: Framer Motion
- **Encryption**: AES-256-GCM via Node.js built-in `crypto` module
- **Push notifications**: `web-push` library with VAPID keys

## Fonts

- **Rakkas** — Display headings, titles, page headers, seals
- **Aref Ruqaa Ink** — Letter body text (classical manuscript feel)
- **Cairo** — All UI elements (buttons, labels, navigation)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── royal-letters/      # React + Vite frontend (PWA)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas
│   └── db/                 # Drizzle ORM schema + DB connection
└── scripts/
```

## Database Schema

Tables: `letters`, `questions`, `replies`, `admin_sessions`, `admin_config`, `push_subscriptions`

- **letters**: id, title, body, recipientName, uniqueToken, isRead, readAt, language, status, scheduledUnlockAt, isUnlocked, unlockNotified, createdAt, updatedAt — all text fields AES-256-GCM encrypted
- **questions**: id, letterId, questionText, answerText, orderIndex — text fields encrypted
- **replies**: id, letterId, replyBody, replyFrom, createdAt — text fields encrypted
- **admin_sessions**: id, sessionToken, expiresAt, createdAt
- **admin_config**: id, username, displayName, passwordHash, securityQ1/Q2/Q3, securityA1/A2/A3Hash, updatedAt — text fields encrypted
- **push_subscriptions**: id, endpoint, p256dh, auth, letterToken, isAdmin, createdAt

## Environment Variables

Set these in Replit Secrets:
- `DATABASE_URL` — PostgreSQL connection string (auto-set by Replit)
- `ADMIN_USERNAME` — Ahmed's username (default: "ahmed")
- `ADMIN_PASSWORD_HASH` — bcrypt hash of password (cost 12)
- `SECURITY_Q1` — First security question
- `SECURITY_A1` — Answer to Q1 (lowercase)
- `SECURITY_Q2` — Second security question
- `SECURITY_A2` — Answer to Q2 (lowercase)
- `ENCRYPTION_KEY` — 64-char hex (32-byte AES-256 key) for all field encryption
- `VAPID_PUBLIC_KEY` — VAPID public key for push notifications
- `VAPID_PRIVATE_KEY` — VAPID private key
- `VAPID_EMAIL` — Contact email for push (e.g. mailto:admin@...)

## API Routes

### Auth
- `GET /api/auth/security-questions` — Get admin security questions (public)
- `POST /api/auth/login` — Login with {username, password, securityAnswer1?, securityAnswer2?}
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Check session
- `GET /api/auth/settings` — Get admin profile (admin only)
- `PUT /api/auth/settings` — Update profile/password/security Q&A (admin only)

### Letters (admin only)
- `GET /api/letters` — List all letters (filter by status, search)
- `POST /api/letters` — Create letter with questions + optional scheduledUnlockAt
- `GET /api/letters/:id` — Get letter with answers
- `PUT /api/letters/:id` — Update letter
- `DELETE /api/letters/:id` — Delete letter
- `POST /api/letters/:id/send` — Mark as sent
- `POST /api/letters/:id/admin-reply` — Admin reply

### Verify (public)
- `GET /api/verify/:token` — Get letter metadata + questions (returns 423 if scheduled-locked)
- `POST /api/verify/:token/unlock` — Verify answers → unlock full letter

### Replies (public)
- `POST /api/replies` — Submit reply by recipient
- `GET /api/replies/:letterId` — Get replies (admin only)

### Push Notifications
- `GET /api/push/vapid-key` — Get VAPID public key (public)
- `POST /api/push/subscribe` — Subscribe to push notifications
- `DELETE /api/push/unsubscribe` — Unsubscribe

## Pages

- `/` → `/login` — Admin login (2-step: credentials → security questions)
- `/dashboard` — Admin dashboard: letter list (table on desktop, cards on mobile), stats
- `/compose` — Create new letter with optional scheduled unlock time
- `/compose/:id` — Edit existing letter
- `/letters/:id` — Admin letter detail: view, see replies, reply back
- `/letter/:token` — Public letter view: countdown timer (if locked) → security questions → parchment → reply
- `/settings` — Admin profile, password change, security Q&A, push notification toggle

## Key Features

### Encryption (AES-256-GCM)
- Every sensitive field encrypted at rest using `ENCRYPTION_KEY` env var
- Encryption in `artifacts/api-server/src/crypto.ts`
- Admin credentials read from `admin_config` table (seeded from env on first run)

### Scheduled / Time-Locked Messages
- Admin sets optional `scheduledUnlockAt` datetime in Compose page
- `isUnlocked` defaults to false; backend scheduler (60s interval) flips it when time passes
- Recipients see animated countdown timer with days/hours/minutes/seconds
- Push notification sent to recipient + admin when message unlocks

### PWA / Push Notifications
- Service worker at `public/sw.js` handles install, activate, fetch cache, push events
- Admin subscribes via Settings page; recipients can subscribe from LetterView banner
- Push subscriptions stored in `push_subscriptions` table (VAPID-based)

### Mobile-First Design
- AdminLayout: hamburger menu on mobile, slide-out sidebar, backdrop overlay
- Dashboard: card-based list on mobile, table on desktop
- All interactive elements: min-height 44px for touch targets
- Responsive grid/flex layouts throughout

## Security Features

1. Cookie-based HTTP-only session tokens (7-day expiry)
2. bcrypt password hashing (cost 12)
3. AES-256-GCM encryption for all stored text fields
4. Admin 2-factor: password + 2 security questions
5. Security question answers normalized (lowercase, trimmed) before comparison
6. Letter tokens are cryptographically random (20 bytes hex)
7. Admin profile and security questions updateable via Settings page
8. Session invalidated after password change (forces re-login)

## Design System

- **Theme**: Light mode only — aged parchment, warm ivory, royal gold, deep ink
- **Primary color**: Gold (#C9A84C and family)
- **Background**: Warm ivory (#FAF7F0)
- **Letter paper**: Parchment (#FAF7F0 with gradient overlay)
- **Wax seal**: Deep red with gold border
- **Direction**: RTL (Arabic-first)
