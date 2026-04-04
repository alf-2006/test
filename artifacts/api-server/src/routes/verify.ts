import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { lettersTable, questionsTable, repliesTable, adminNotificationsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { encrypt, safeDecrypt } from "../crypto.js";
import * as bcrypt from "bcryptjs";
import { sendToAdmin, sendToLetter } from "../services/push.service.js";
import { broadcastToAdmin } from "../websocket.js";

const router = Router();

const unlockAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_UNLOCK = 10;
const WINDOW_MS = 30 * 60 * 1000;
const ALLOWED_REACTIONS = ["❤️", "😢", "😊", "🙏", "😮", "✨"];

function checkUnlockLimit(token: string): boolean {
  const now = Date.now();
  const record = unlockAttempts.get(token);
  if (!record || now > record.resetAt) {
    unlockAttempts.set(token, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (record.count >= MAX_UNLOCK) return false;
  record.count++;
  return true;
}

async function createNotification(type: string, letterId: string, message: string) {
  try {
    await db.insert(adminNotificationsTable).values({ type, letterId, message: encrypt(message) });
  } catch (err) {
    console.error("createNotification error:", err);
  }
}

// GET /api/verify/:token - get letter metadata + questions
router.get("/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const letters = await db.select().from(lettersTable).where(eq(lettersTable.uniqueToken, token));
    const letter = letters[0];

    if (!letter) return res.status(404).json({ error: "not_found", message: "الرسالة غير موجودة" });
    if (letter.status === "draft") return res.status(403).json({ error: "not_sent", message: "هذه الرسالة لم ترسل بعد" });

    const now = new Date();

    // Check expiry
    if (letter.expiresAt && letter.expiresAt < now) {
      return res.status(410).json({
        error: "expired",
        message: "انتهت صلاحية هذه الرسالة",
        expiredAt: letter.expiresAt.toISOString(),
      });
    }

    const isScheduledLocked = letter.scheduledUnlockAt && !letter.isUnlocked && letter.scheduledUnlockAt > now;

    // Mark as delivered when recipient opens the verify page
    if (letter.deliveryStatus === "sent") {
      await db.update(lettersTable)
        .set({ deliveryStatus: "delivered", updatedAt: now })
        .where(eq(lettersTable.id, letter.id));
      broadcastToAdmin({ type: "letter_delivered", letterId: letter.id, timestamp: Date.now() });
    }

    const questions = await db
      .select()
      .from(questionsTable)
      .where(eq(questionsTable.letterId, letter.id))
      .orderBy(questionsTable.orderIndex);

    return res.json({
      title: safeDecrypt(letter.title),
      recipientName: safeDecrypt(letter.recipientName),
      language: letter.language,
      status: letter.status,
      scheduledUnlockAt: letter.scheduledUnlockAt ? letter.scheduledUnlockAt.toISOString() : null,
      isUnlocked: letter.isUnlocked,
      isScheduledLocked: !!isScheduledLocked,
      reactionEmoji: letter.reactionEmoji,
      questions: isScheduledLocked ? [] : questions.map(q => ({
        id: q.id,
        questionText: safeDecrypt(q.questionText),
        orderIndex: q.orderIndex,
      })),
    });
  } catch (err) {
    console.error("Get letter by token error:", err);
    return res.status(500).json({ error: "server_error", message: "خطأ في الخادم" });
  }
});

// POST /api/verify/:token/unlock - verify answers and unlock letter
router.post("/:token/unlock", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { answers } = req.body;

    if (!checkUnlockLimit(token)) {
      return res.status(429).json({ error: "too_many_attempts", message: "محاولات كثيرة، انتظر قليلاً" });
    }

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: "missing_answers", message: "الإجابات مطلوبة" });
    }

    const letters = await db.select().from(lettersTable).where(eq(lettersTable.uniqueToken, token));
    const letter = letters[0];

    if (!letter) return res.status(404).json({ error: "not_found", message: "الرسالة غير موجودة" });
    if (letter.status === "draft") return res.status(403).json({ error: "not_sent", message: "هذه الرسالة لم ترسل بعد" });

    const now = new Date();

    // Check expiry
    if (letter.expiresAt && letter.expiresAt < now) {
      return res.status(410).json({ error: "expired", message: "انتهت صلاحية هذه الرسالة" });
    }

    if (letter.scheduledUnlockAt && !letter.isUnlocked && letter.scheduledUnlockAt > now) {
      return res.status(423).json({
        error: "message_locked",
        message: "هذه الرسالة مقفلة حتى " + letter.scheduledUnlockAt.toISOString(),
        scheduledUnlockAt: letter.scheduledUnlockAt.toISOString(),
      });
    }

    const questions = await db
      .select()
      .from(questionsTable)
      .where(eq(questionsTable.letterId, letter.id))
      .orderBy(questionsTable.orderIndex);

    if (questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const userAnswer = answers.find((a: any) => a.questionId === question.id);
        if (!userAnswer) {
          return res.status(403).json({ error: "wrong_answers", failedIndex: i, message: `إجابة السؤال ${i + 1} غير موجودة` });
        }
        const normalizedInput = userAnswer.answer?.toLowerCase().trim() || "";
        const storedHash = question.answerText;
        let match = false;
        if (storedHash.startsWith("$2b$") || storedHash.startsWith("$2a$")) {
          match = await bcrypt.compare(normalizedInput, storedHash);
        } else {
          match = normalizedInput === storedHash;
        }
        if (!match) {
          return res.status(403).json({ error: "wrong_answers", failedIndex: i, message: `إجابة السؤال ${i + 1} غير صحيحة` });
        }
      }
    }

    const wasRead = letter.isRead;
    if (!letter.isRead) {
      await db.update(lettersTable)
        .set({ isRead: true, readAt: now, status: "read", deliveryStatus: "read", updatedAt: now })
        .where(eq(lettersTable.id, letter.id));

      const letterTitle = safeDecrypt(letter.title);
      const recipientName = safeDecrypt(letter.recipientName);
      const notifMessage = `قرأ المستلم رسالة: "${letterTitle}"`;

      createNotification("letter_read", letter.id, notifMessage);

      sendToAdmin({
        type: "letter_read",
        title: "✉️ تمت قراءة رسالة",
        body: notifMessage,
        url: `/letters/${letter.id}`,
        letterId: letter.id,
      }).catch(() => {});

      broadcastToAdmin({
        type: "letter_read",
        letterId: letter.id,
        recipientName,
        readAt: now.toISOString(),
        timestamp: Date.now(),
      });
    }

    const replies = await db
      .select()
      .from(repliesTable)
      .where(eq(repliesTable.letterId, letter.id))
      .orderBy(repliesTable.createdAt);

    return res.json({
      letter: {
        id: letter.id,
        title: safeDecrypt(letter.title),
        recipientName: safeDecrypt(letter.recipientName),
        uniqueToken: letter.uniqueToken,
        isRead: true,
        readAt: wasRead ? letter.readAt?.toISOString() : now.toISOString(),
        language: letter.language,
        status: letter.status === "draft" || letter.status === "sent" ? "read" : letter.status,
        reactionEmoji: letter.reactionEmoji,
        imageData: letter.imageData,
        imageMime: letter.imageMime,
        imageCaption: letter.imageCaption ? safeDecrypt(letter.imageCaption) : null,
        createdAt: letter.createdAt.toISOString(),
        updatedAt: letter.updatedAt.toISOString(),
        body: safeDecrypt(letter.body),
        replies: replies.map(r => ({
          id: r.id,
          letterId: r.letterId,
          replyBody: safeDecrypt(r.replyBody),
          replyFrom: r.replyFrom === "__admin__" ? "__admin__" : safeDecrypt(r.replyFrom),
          createdAt: r.createdAt.toISOString(),
        })),
      },
    });
  } catch (err) {
    console.error("Unlock letter error:", err);
    return res.status(500).json({ error: "server_error", message: "خطأ في الخادم" });
  }
});

// POST /api/verify/:token/heartbeat - recipient is viewing the letter
router.post("/:token/heartbeat", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const letters = await db.select().from(lettersTable).where(eq(lettersTable.uniqueToken, token));
    const letter = letters[0];
    if (!letter) return res.status(404).json({ error: "not_found" });

    const now = new Date();
    await db.update(lettersTable)
      .set({ viewingAt: now })
      .where(eq(lettersTable.id, letter.id));

    broadcastToAdmin({
      type: "recipient_online",
      letterId: letter.id,
      token,
      lastSeen: now.toISOString(),
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Heartbeat error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// PATCH /api/verify/:token/react - recipient adds emoji reaction
router.patch("/:token/react", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { emoji } = req.body;

    if (!emoji || !ALLOWED_REACTIONS.includes(emoji)) {
      return res.status(400).json({ error: "invalid_emoji", message: "رد فعل غير صالح" });
    }

    const letters = await db.select().from(lettersTable).where(eq(lettersTable.uniqueToken, token));
    const letter = letters[0];
    if (!letter) return res.status(404).json({ error: "not_found" });
    if (!letter.isRead) return res.status(403).json({ error: "not_read", message: "يجب قراءة الرسالة أولاً" });

    await db.update(lettersTable)
      .set({ reactionEmoji: emoji, updatedAt: new Date() })
      .where(eq(lettersTable.id, letter.id));

    const recipientName = safeDecrypt(letter.recipientName);
    const notifMsg = `${recipientName} تفاعل مع رسالتك بـ ${emoji}`;

    createNotification("reaction", letter.id, notifMsg);

    sendToAdmin({
      type: "new_reply",
      title: `${emoji} تفاعل جديد`,
      body: notifMsg,
      url: `/letters/${letter.id}`,
      letterId: letter.id,
    }).catch(() => {});

    broadcastToAdmin({
      type: "reaction",
      letterId: letter.id,
      emoji,
      recipientName,
      timestamp: Date.now(),
    });

    return res.json({ ok: true, emoji });
  } catch (err) {
    console.error("React error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;
