import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { lettersTable, repliesTable } from "@workspace/db/schema";
import { requireAdmin } from "../middleware/adminAuth.js";
import { sql, count } from "drizzle-orm";

const router = Router();

// GET /api/analytics - admin analytics data
router.get("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const [totals] = await db.select({ total: count() }).from(lettersTable);
    const [replyCount] = await db.select({ total: count() }).from(repliesTable);

    const byStatus = await db.execute(sql`
      SELECT status, COUNT(*) as cnt FROM letters GROUP BY status
    `);

    const perMonth = await db.execute(sql`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as cnt
      FROM letters
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY month
      ORDER BY month ASC
    `);

    const avgReadResult = await db.execute(sql`
      SELECT AVG(EXTRACT(EPOCH FROM (read_at - created_at))/3600) as avg_hours
      FROM letters
      WHERE read_at IS NOT NULL AND created_at IS NOT NULL
    `);

    const scheduledResult = await db.execute(sql`
      SELECT
        COUNT(CASE WHEN scheduled_unlock_at IS NOT NULL AND is_unlocked = false THEN 1 END) as locked,
        COUNT(CASE WHEN scheduled_unlock_at IS NOT NULL AND is_unlocked = true THEN 1 END) as unlocked
      FROM letters
    `);

    const avgRow = (avgReadResult.rows?.[0] ?? avgReadResult[0]) as Record<string, unknown> | undefined;
    const schedRow = (scheduledResult.rows?.[0] ?? scheduledResult[0]) as Record<string, unknown> | undefined;

    return res.json({
      totals: {
        letters: totals.total,
        replies: replyCount.total,
      },
      byStatus: (byStatus.rows ?? byStatus) as unknown[],
      perMonth: (perMonth.rows ?? perMonth) as unknown[],
      avgReadHours: avgRow?.avg_hours ?? 0,
      scheduled: {
        locked: schedRow?.locked ?? 0,
        unlocked: schedRow?.unlocked ?? 0,
      },
    });
  } catch (err) {
    console.error("Analytics error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;
