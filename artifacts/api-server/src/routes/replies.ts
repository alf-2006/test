import { Router } from "express";
import { db } from "@workspace/db";
import { lettersTable, repliesTable, adminNotificationsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "../middleware/adminAuth.js";
import { encrypt, safeDecrypt } from "../crypto.js";
import { sendToAdmin, sendToLetter } from "../services/push.service.js";
import { broadcastToAdmin } from "../websocket.js";

const router = Router();

async function createNotification(type: string, letterId: string, message: string) {
  try {
    await db.insert(adminNotificationsTable).values({ type, letterId, message: encrypt(message) });
  } catch (err) {
    console.error("createNotification error:", err);
  }
}

// POST /api/replies - recipient submits a reply
router.post("/", async (req, res) => {
  try {
    const { token, replyBody, replyFrom } = req.body;

    if (!token || !replyBody?.trim() || !replyFrom?.trim()) {
      return res.status(400).json({ error: "missing_fields", message: "جميع الحقول مطلوبة" });
    }
    if (replyBody.trim().length < 10) {
      return res.status(400).json({ error: "too_short", message: "الرد قصير جداً (10 أحرف على الأقل)" });
    }
    if (replyBody.length > 2000) {
      return res.status(400).json({ error: "too_long", message: "الرد طويل جداً (الحد الأقصى 2000 حرف)" });
    }

    const letters = await db.select().from(lettersTable).where(eq(lettersTable.uniqueToken, token));
    const letter = letters[0];

    if (!letter) return res.status(404).json({ error: "not_found", message: "الرسالة غير موجودة" });
    if (letter.status === "draft") return res.status(403).json({ error: "forbidden", message: "لا يمكن الرد على رسالة غير مرسلة" });

    const [reply] = await db.insert(repliesTable).values({
      letterId: letter.id,
      replyBody: encrypt(replyBody),
      replyFrom: encrypt(replyFrom),
    }).returning();

    await db.update(lettersTable)
      .set({ status: "replied", updatedAt: new Date() })
      .where(eq(lettersTable.id, letter.id));

    const letterTitle = safeDecrypt(letter.title);
    const notifMessage = `${replyFrom} أرسل رداً على رسالة: "${letterTitle}"`;
    const previewText = replyBody.length > 80 ? replyBody.slice(0, 80) + "..." : replyBody;

    createNotification("new_reply", letter.id, notifMessage);

    sendToAdmin({
      type: "new_reply",
      title: "💬 رد جديد على رسالة",
      body: notifMessage,
      url: `/letters/${letter.id}`,
      letterId: letter.id,
      recipientName: replyFrom,
    }).catch(() => {});

    // WebSocket real-time broadcast
    broadcastToAdmin({
      type: "new_reply",
      letterId: letter.id,
      recipientName: replyFrom,
      preview: previewText,
      timestamp: Date.now(),
    });

    return res.status(201).json({
      reply: {
        id: reply.id,
        letterId: reply.letterId,
        replyBody,
        replyFrom,
        createdAt: reply.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("Create reply error:", err);
    return res.status(500).json({ error: "server_error", message: "خطأ في الخادم" });
  }
});

// GET /api/replies/:letterId - admin gets replies for a letter
router.get("/:letterId", requireAdmin, async (req, res) => {
  try {
    const { letterId } = req.params;
    const replies = await db
      .select()
      .from(repliesTable)
      .where(eq(repliesTable.letterId, letterId))
      .orderBy(desc(repliesTable.createdAt));

    return res.json({
      replies: replies.map(r => ({
        id: r.id,
        letterId: r.letterId,
        replyBody: safeDecrypt(r.replyBody),
        replyFrom: r.replyFrom === "__admin__" ? "__admin__" : safeDecrypt(r.replyFrom),
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("Get replies error:", err);
    return res.status(500).json({ error: "server_error", message: "خطأ في الخادم" });
  }
});

export default router;
