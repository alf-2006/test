import { Router } from "express";
import { db } from "@workspace/db";
import { lettersTable, repliesTable } from "@workspace/db/schema";
import { requireAdmin } from "../middleware/adminAuth.js";
import { sql, count } from "drizzle-orm";

const router = Router();

// GET /api/analytics - admin analytics data
router.get("/", requireAdmin, async (req, res) => {
  try {
    // Total letters
    const [totals] = await db.select({ total: count() }).from(lettersTable);

    // Letters by status
    const byStatus = await db.execute(sql`
      SELECT status, COUNT(*) as cnt FROM letters GROUP BY status
    `);

    // Letters per month (last 12 months)
    const perMonth = await db.execute(sql`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as cnt
      FROM letters
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY month
      ORDER BY month ASC
    `);

    // Average time to read (hours)
    const [avgRead] = await db.execute(sql`
      SELECT AVG(EXTRACT(EPOCH FROM (read_at - created_at))/3600) as avg_hours
      FROM letters
      WHERE read_at IS NOT NULL AND created_at IS NOT NULL
    `);

    // Scheduled letters
    const [scheduled] = await db.execute(sql`
      SELECT
        COUNT(CASE WHEN scheduled_unlock_at IS NOT NULL AND is_unlocked = false THEN 1 END) as locked,
        COUNT(CASE WHEN scheduled_unlock_at IS NOT NULL AND is_unlocked = true THEN 1 END) as unlocked
      FROM letters
    `);

    // Replies count
    const [replyCount] = await db.select({ total: count() }).from(repliesTable);

    return res.json({
      totals: {
        letters: totals.total,
        replies: replyCount.total,
      },
      byStatus: byStatus.rows,
      perMonth: perMonth.rows,
      avgReadHours: (avgRead.rows[0] as any)?.avg_hours || 0,
      scheduled: (scheduled.rows[0] as any) || { locked: 0, unlocked: 0 },
    });
  } catch (err) {
    console.error("Analytics error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;
