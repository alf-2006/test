import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { letterTemplatesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/adminAuth.js";
import { encrypt, safeDecrypt } from "../crypto.js";

const router = Router();

// GET /api/templates - list all templates
router.get("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const templates = await db.select().from(letterTemplatesTable).orderBy(letterTemplatesTable.createdAt);
    return res.json({
      templates: templates.map(t => ({
        id: t.id,
        name: safeDecrypt(t.name),
        language: t.language,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("List templates error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// GET /api/templates/:id - get full template
router.get("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(letterTemplatesTable).where(eq(letterTemplatesTable.id, req.params.id));
    const t = rows[0];
    if (!t) return res.status(404).json({ error: "not_found" });
    return res.json({
      id: t.id,
      name: safeDecrypt(t.name),
      title: t.title ? safeDecrypt(t.title) : "",
      body: t.body ? safeDecrypt(t.body) : "",
      language: t.language,
      questions: t.questions ? JSON.parse(safeDecrypt(t.questions)) : [],
      createdAt: t.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("Get template error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// POST /api/templates - create template
router.post("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, title, body, language, questions } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name_required", message: "اسم القالب مطلوب" });

    const [t] = await db.insert(letterTemplatesTable).values({
      name: encrypt(name),
      title: title ? encrypt(title) : null,
      body: body ? encrypt(body) : null,
      language: language || "arabic",
      questions: questions ? encrypt(JSON.stringify(questions)) : null,
    }).returning();

    return res.status(201).json({ id: t.id, name });
  } catch (err) {
    console.error("Create template error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/templates/:id - delete template
router.delete("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    await db.delete(letterTemplatesTable).where(eq(letterTemplatesTable.id, req.params.id));
    return res.json({ ok: true });
  } catch (err) {
    console.error("Delete template error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;
