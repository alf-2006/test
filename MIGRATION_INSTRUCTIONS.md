# Database Migration Instructions

After pulling this code on Replit, run the following command **once** in the Shell
to apply all new schema changes (new columns and tables):

```bash
cd /workspace && npx drizzle-kit push --config=lib/db/drizzle.config.ts
```

## New schema additions in this update:

### letters table — new columns:
- `delivery_status` ENUM('sent','delivered','read') — WhatsApp-style read receipts
- `expires_at` TIMESTAMP — optional letter expiry date
- `viewing_at` TIMESTAMP — when recipient last sent a heartbeat
- `reaction_emoji` TEXT — recipient's emoji reaction

### New tables:
- `letter_images` — up to 5 images per letter with ordering
- `letter_templates` — reusable letter templates

## If drizzle-kit push asks to confirm destructive changes:
Answer **Yes** only for adding new columns/tables.
Never confirm dropping existing columns or tables.
