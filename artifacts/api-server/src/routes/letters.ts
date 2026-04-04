import { Router } from "express";
import { db } from "@workspace/db";
import { lettersTable, questionsTable, repliesTable } from "@workspace/db/schema";
import { eq, desc, and, SQL } from "drizzle-orm";
import { requireAdmin } from "../middleware/adminAuth.js";
import { encrypt, safeDecrypt } from "../crypto.js";
import * as crypto from "crypto";
import * as bcrypt from "bcryptjs";
import { sendToAdmin, sendToLetter } from "../services/push.service.js";

const router = Router();

function generateToken(): string {
  return crypto.randomBytes(20).toString("hex");
}

function formatLetter(letter: any) {
  return {
    id: letter.id,
    title: safeDecrypt(letter.title),
    recipientName: safeDecrypt(letter.recipientName),
    uniqueToken: letter.uniqueToken,
    isRead: letter.isRead,
    readAt: letter.readAt ? letter.readAt.toISOString() : null,
    language: letter.language,
    status: letter.status,
    scheduledUnlockAt: letter.scheduledUnlockAt ? letter.scheduledUnlockAt.toISOString() : null,
    expiresAt: (letter as any).expiresAt ? (letter as any).expiresAt.toISOString() : null,
    reactionEmoji: (letter as any).reactionEmoji || null,
    isUnlocked: letter.isUnlocked ?? false,
    createdAt: letter.createdAt.toISOString(),
    updatedAt: letter.updatedAt.toISOString(),
  };
}

function formatReply(r: any) {
  return {
    id: r.id,
    letterId: r.letterId,
    replyBody: safeDecrypt(r.replyBody),
    replyFrom: r.replyFrom === "__admin__" ? "__admin__" : safeDecrypt(r.replyFrom),
    isAdmin: r.replyFrom === "__admin__",
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/", requireAdmin, async (req, res) => {
  try {
    const { status, search } = req.query;

    const conditions: SQL[] = [];
    if (status) conditions.push(eq(lettersTable.status, status as any));

    const letters = await db
      .select()
      .from(lettersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(lettersTable.createdAt));

    let result = letters.map(formatLetter);

    // Search after decryption
    if (search) {
      const q = (search as string).toLowerCase();
      result = result.filter(l =>
        l.title.toLowerCase().includes(q) || l.recipientName.toLowerCase().includes(q)
      );
    }

    return res.json({ letters: result, total: result.length });
  } catch (err) {
    console.error("List letters error:", err);
    return res.status(500).json({ error: "server_error", message: "خطأ في الخادم" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const { title, body, recipientName, language = "arabic", status = "draft", questions = [], scheduledUnlockAt, expiresAt } = req.body;

    if (!title || !body || !recipientName) {
      return res.status(400).json({ error: "missing_fields", message: "العنوان والمحتوى واسم المستلم مطلوبة" });
    }

    const uniqueToken = generateToken();
    const now = new Date();
    const parsedSchedule = scheduledUnlockAt ? new Date(scheduledUnlockAt) : null;

    const [letter] = await db.insert(lettersTable).values({
      title: encrypt(title),
      body: encrypt(body),
      recipientName: encrypt(recipientName),
      uniqueToken,
      language,
      status,
      scheduledUnlockAt: parsedSchedule,
      ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
      isUnlocked: !parsedSchedule,
      createdAt: now,
      updatedAt: now,
    }).returning();

    if (questions && questions.length > 0) {
      const hashed = await Promise.all(
        questions.map(async (q: any, i: number) => ({
          letterId: letter.id,
          questionText: encrypt(q.questionText),
          answerText: await bcrypt.hash(q.answerText.toLowerCase().trim(), 12),
          orderIndex: q.orderIndex ?? i,
        }))
      );
      await db.insert(questionsTable).values(hashed);
    }

    return res.status(201).json({ letter: formatLetter(letter) });
  } catch (err) {
    console.error("Create letter error:", err);
    return res.status(500).json({ error: "server_error", message: "خطأ في الخادم" });
  }
});

// Admin: get full letter with answers (for editing)
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const letters = await db.select().from(lettersTable).where(eq(lettersTable.id, id));
    const letter = letters[0];

    if (!letter) {
      return res.status(404).json({ error: "not_found", message: "الرسالة غير موجودة" });
    }

    const questions = await db
      .select()
      .from(questionsTable)
      .where(eq(questionsTable.letterId, id))
      .orderBy(questionsTable.orderIndex);

    const replies = await db
      .select()
      .from(repliesTable)
      .where(eq(repliesTable.letterId, id))
      .orderBy(repliesTable.createdAt);

    return res.json({
      letter: {
        ...formatLetter(letter),
        body: safeDecrypt(letter.body),
        questions: questions.map(q => ({
          id: q.id,
          questionText: safeDecrypt(q.questionText),
          answerText: "[مشفّر]", // Never expose answer hash to admin UI
          orderIndex: q.orderIndex,
        })),
        replies: replies.map(formatReply),
      },
    });
  } catch (err) {
    console.error("Get letter error:", err);
    return res.status(500).json({ error: "server_error", message: "خطأ في الخادم" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, body, recipientName, language, status, questions, scheduledUnlockAt, expiresAt } = req.body;

    const existing = await db.select().from(lettersTable).where(eq(lettersTable.id, id));
    if (!existing[0]) {
      return res.status(404).json({ error: "not_found", message: "الرسالة غير موجودة" });
    }

    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = encrypt(title);
    if (body !== undefined) updateData.body = encrypt(body);
    if (recipientName !== undefined) updateData.recipientName = encrypt(recipientName);
    if (language !== undefined) updateData.language = language;
    if (status !== undefined) updateData.status = status;
    if (scheduledUnlockAt !== undefined) {
      const parsedSchedule = scheduledUnlockAt ? new Date(scheduledUnlockAt) : null;
      updateData.scheduledUnlockAt = parsedSchedule;
      updateData.isUnlocked = !parsedSchedule;
      updateData.unlockNotified = false;
    }

    const [updated] = await db
      .update(lettersTable)
      .set(updateData)
      .where(eq(lettersTable.id, id))
      .returning();

    if (questions !== undefined) {
      await db.delete(questionsTable).where(eq(questionsTable.letterId, id));
      if (questions.length > 0) {
        const hashed = await Promise.all(
          questions.map(async (q: any, i: number) => ({
            letterId: id,
            questionText: encrypt(q.questionText),
            answerText: await bcrypt.hash(q.answerText.toLowerCase().trim(), 12),
            orderIndex: q.orderIndex ?? i,
          }))
        );
        await db.insert(questionsTable).values(hashed);
      }
    }

    return res.json({ letter: formatLetter(updated) });
  } catch (err) {
    console.error("Update letter error:", err);
    return res.status(500).json({ error: "server_error", message: "خطأ في الخادم" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.select().from(lettersTable).where(eq(lettersTable.id, id));
    if (!existing[0]) {
      return res.status(404).json({ error: "not_found", message: "الرسالة غير موجودة" });
    }

    await db.delete(questionsTable).where(eq(questionsTable.letterId, id));
    await db.delete(repliesTable).where(eq(repliesTable.letterId, id));
    await db.delete(lettersTable).where(eq(lettersTable.id, id));

    return res.json({ success: true, message: "تم حذف الرسالة" });
  } catch (err) {
    console.error("Delete letter error:", err);
    return res.status(500).json({ error: "server_error", message: "خطأ في الخادم" });
  }
});

router.post("/:id/send", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.select().from(lettersTable).where(eq(lettersTable.id, id));
    if (!existing[0]) {
      return res.status(404).json({ error: "not_found", message: "الرسالة غير موجودة" });
    }

    const [updated] = await db
      .update(lettersTable)
      .set({ status: "sent", updatedAt: new Date() })
      .where(eq(lettersTable.id, id))
      .returning();

    return res.json({ letter: formatLetter(updated) });
  } catch (err) {
    console.error("Send letter error:", err);
    return res.status(500).json({ error: "server_error", message: "خطأ في الخادم" });
  }
});

router.post("/:id/admin-reply", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { replyBody } = req.body;

    if (!replyBody?.trim()) {
      return res.status(400).json({ error: "missing_body", message: "نص الرد مطلوب" });
    }

    const existing = await db.select().from(lettersTable).where(eq(lettersTable.id, id));
    if (!existing[0]) {
      return res.status(404).json({ error: "not_found", message: "الرسالة غير موجودة" });
    }

    const [reply] = await db.insert(repliesTable).values({
      letterId: id,
      replyBody: encrypt(replyBody),
      replyFrom: "__admin__",
    }).returning();

    const adminName = process.env.ADMIN_USERNAME || "ahmed";

    const letterData = existing[0];
    sendToLetter(letterData.uniqueToken, {
      type: "new_reply",
      title: "💬 رد جديد على رسالتك",
      body: `تلقيت رداً جديداً`,
      url: `/letter/${letterData.uniqueToken}`,
    }).catch(() => {});

    return res.status(201).json({
      reply: {
        id: reply.id,
        letterId: reply.letterId,
        replyBody: replyBody,
        replyFrom: adminName,
        isAdmin: true,
        createdAt: reply.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("Admin reply error:", err);
    return res.status(500).json({ error: "server_error", message: "خطأ في الخادم" });
  }
});

router.get("/recipient-suggestions", requireAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    const allLetters = await db.select({ recipientName: lettersTable.recipientName }).from(lettersTable);
    const decrypted = allLetters.map(l => safeDecrypt(l.recipientName)).filter(Boolean);
    const unique = [...new Set(decrypted)];
    const query = (q as string || "").toLowerCase().trim();
    const filtered = query
      ? unique.filter(n => n.toLowerCase().includes(query))
      : unique;
    return res.json({ suggestions: filtered.slice(0, 5) });
  } catch (err) {
    console.error("Recipient suggestions error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;
