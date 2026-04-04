import { pgTable, text, boolean, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const languageEnum = pgEnum("language", ["arabic", "english"]);
export const statusEnum = pgEnum("status", ["draft", "sent", "read", "replied"]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["sent", "delivered", "read"]);

export const lettersTable = pgTable("letters", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  body: text("body").notNull(),
  recipientName: text("recipient_name").notNull(),
  uniqueToken: text("unique_token").notNull().unique(),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  language: languageEnum("language").notNull().default("arabic"),
  status: statusEnum("status").notNull().default("draft"),
  deliveryStatus: deliveryStatusEnum("delivery_status").default("sent"),
  scheduledUnlockAt: timestamp("scheduled_unlock_at"),
  isUnlocked: boolean("is_unlocked").notNull().default(false),
  unlockNotified: boolean("unlock_notified").notNull().default(false),
  expiresAt: timestamp("expires_at"),
  viewingAt: timestamp("viewing_at"),
  reactionEmoji: text("reaction_emoji"),
  imageData: text("image_data"),
  imageMime: text("image_mime"),
  imageCaption: text("image_caption"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const questionsTable = pgTable("questions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  letterId: text("letter_id").notNull().references(() => lettersTable.id, { onDelete: "cascade" }),
  questionText: text("question_text").notNull(),
  answerText: text("answer_text").notNull(),
  orderIndex: integer("order_index").notNull(),
});

export const repliesTable = pgTable("replies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  letterId: text("letter_id").notNull().references(() => lettersTable.id, { onDelete: "cascade" }),
  replyBody: text("reply_body").notNull(),
  replyFrom: text("reply_from").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const adminSessionsTable = pgTable("admin_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionToken: text("session_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const adminConfigTable = pgTable("admin_config", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: text("username").notNull(),
  displayName: text("display_name"),
  passwordHash: text("password_hash").notNull(),
  securityQ1: text("security_q1"),
  securityQ2: text("security_q2"),
  securityQ3: text("security_q3"),
  securityA1Hash: text("security_a1_hash"),
  securityA2Hash: text("security_a2_hash"),
  securityA3Hash: text("security_a3_hash"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  letterToken: text("letter_token"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const adminNotificationsTable = pgTable("admin_notifications", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text("type").notNull(),
  letterId: text("letter_id").references(() => lettersTable.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const letterImagesTable = pgTable("letter_images", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  letterId: text("letter_id").notNull().references(() => lettersTable.id, { onDelete: "cascade" }),
  imageData: text("image_data").notNull(),
  imageMime: text("image_mime").notNull(),
  imageCaption: text("image_caption"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const letterTemplatesTable = pgTable("letter_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  title: text("title"),
  body: text("body"),
  language: languageEnum("language").notNull().default("arabic"),
  questions: text("questions"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLetterSchema = createInsertSchema(lettersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertQuestionSchema = createInsertSchema(questionsTable).omit({ id: true });
export const insertReplySchema = createInsertSchema(repliesTable).omit({ id: true, createdAt: true });
export const insertAdminSessionSchema = createInsertSchema(adminSessionsTable).omit({ id: true, createdAt: true });

export type Letter = typeof lettersTable.$inferSelect;
export type InsertLetter = z.infer<typeof insertLetterSchema>;
export type Question = typeof questionsTable.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Reply = typeof repliesTable.$inferSelect;
export type InsertReply = z.infer<typeof insertReplySchema>;
export type AdminSession = typeof adminSessionsTable.$inferSelect;
export type AdminConfig = typeof adminConfigTable.$inferSelect;
export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
export type LetterImage = typeof letterImagesTable.$inferSelect;
export type LetterTemplate = typeof letterTemplatesTable.$inferSelect;
