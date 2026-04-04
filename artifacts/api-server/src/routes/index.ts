import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import lettersRouter from "./letters.js";
import verifyRouter from "./verify.js";
import repliesRouter from "./replies.js";
import settingsRouter from "./settings.js";
import pushRouter from "./push.js";
import notificationsRouter from "./notifications.js";
import templatesRouter from "./templates.js";
import analyticsRouter from "./analytics.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/auth/settings", settingsRouter);
router.use("/letters", lettersRouter);
router.use("/verify", verifyRouter);
router.use("/replies", repliesRouter);
router.use("/push", pushRouter);
router.use("/notifications", notificationsRouter);
router.use("/templates", templatesRouter);
router.use("/analytics", analyticsRouter);

export default router;
