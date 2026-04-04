import { useState, useEffect, useCallback, useRef } from "react";
import { useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGetLetterByToken,
  useUnlockLetter,
  useCreateReply,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WaxSeal } from "@/components/WaxSeal";
import { ArabesqueDivider } from "@/components/ArabesqueDivider";
import { Lock, Send, Loader2, Crown, User, MessageSquare, AlertCircle, CheckCircle2, Bell } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

function useCountdown(targetDate: Date | null) {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!targetDate) return;
    const update = () => {
      const diff = targetDate.getTime() - Date.now();
      if (diff <= 0) {
        setExpired(true);
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        // Auto-reload page 3 seconds after countdown hits zero
        setTimeout(() => window.location.reload(), 3000);
        return;
      }
      const totalSeconds = Math.floor(diff / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      setTimeLeft({ days, hours, minutes, seconds });
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return { timeLeft, expired };
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center min-w-0">
      <div className="bg-[#2C1810] text-[#C9A84C] rounded-xl w-14 h-16 md:w-18 md:h-20 flex items-center justify-center font-mono font-bold text-2xl md:text-3xl shadow-lg border border-[#C9A84C]/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
        <span className="relative z-10">{String(value).padStart(2, "0")}</span>
      </div>
      <span className="text-xs text-muted-foreground mt-1.5 font-medium">{label}</span>
    </div>
  );
}

function LockedMessageCard({ scheduledUnlockAt, onUnlocked }: { scheduledUnlockAt: string; onUnlocked: () => void }) {
  const targetDate = new Date(scheduledUnlockAt);
  const { timeLeft, expired } = useCountdown(targetDate);

  useEffect(() => {
    if (expired) {
      const timer = setTimeout(onUnlocked, 1500);
      return () => clearTimeout(timer);
    }
  }, [expired, onUnlocked]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md mx-auto mt-8 text-center"
    >
      <div className="bg-card/80 backdrop-blur-md border border-[#C9A84C]/30 p-8 rounded-3xl shadow-2xl royal-shadow">
        <motion.div
          animate={expired ? { scale: [1, 1.3, 1], rotate: [0, -10, 10, 0] } : { y: [0, -6, 0] }}
          transition={expired ? { duration: 0.6 } : { repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
          className="text-5xl mb-6"
        >
          {expired ? "🔓" : "🔒"}
        </motion.div>

        {expired ? (
          <div>
            <h2 className="font-display text-2xl text-gradient-gold mb-2">تم فتح الرسالة!</h2>
            <p className="text-muted-foreground text-sm">جارٍ التحميل...</p>
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mt-4" />
          </div>
        ) : (
          <>
            <h2 className="font-display text-2xl text-foreground mb-2">رسالة مقفلة</h2>
            <p className="text-muted-foreground text-sm mb-6">
              ستُفتح هذه الرسالة في{" "}
              <strong className="text-foreground">
                {format(targetDate, "d MMMM yyyy 'الساعة' HH:mm", { locale: ar })}
              </strong>
            </p>

            {timeLeft && (
              <div className="flex items-center justify-center gap-2 md:gap-4 mb-4">
                <CountdownUnit value={timeLeft.days} label="يوم" />
                <span className="text-2xl text-primary font-bold mb-4">:</span>
                <CountdownUnit value={timeLeft.hours} label="ساعة" />
                <span className="text-2xl text-primary font-bold mb-4">:</span>
                <CountdownUnit value={timeLeft.minutes} label="دقيقة" />
                <span className="text-2xl text-primary font-bold mb-4">:</span>
                <CountdownUnit value={timeLeft.seconds} label="ثانية" />
              </div>
            )}

            <p className="text-xs text-muted-foreground">العداد التنازلي يُحدَّث كل ثانية</p>
          </>
        )}
      </div>
    </motion.div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export default function LetterView() {
  const [, params] = useRoute("/letter/:token");
  const token = params?.token || "";

  const { data: metaData, isLoading: metaLoading, isError: metaError, refetch } = useGetLetterByToken(token);
  const unlockMutation = useUnlockLetter();
  const replyMutation = useCreateReply();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [unlockedData, setUnlockedData] = useState<any>(null);
  const [questionError, setQuestionError] = useState<{ message: string; failedIndex?: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyFrom, setReplyFrom] = useState("");
  const [replySuccess, setReplySuccess] = useState(() => !!token && sessionStorage.getItem(`replied_${token}`) === "1");
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false);
  const [notifSubscribed, setNotifSubscribed] = useState(false);

  const [reactionEmoji, setReactionEmoji] = useState<string | null>(null);
  const [reactionLoading, setReactionLoading] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  const questions = metaData?.questions || [];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const scheduledUnlockAt = (metaData as any)?.scheduledUnlockAt;
  const isScheduledLocked = (metaData as any)?.isScheduledLocked;
  const REACTIONS = ["❤️", "😢", "😊", "🙏", "😮", "✨"];

  // Set initial reaction from unlocked data
  useEffect(() => {
    if (unlockedData?.letter?.reactionEmoji) {
      setReactionEmoji(unlockedData.letter.reactionEmoji);
    }
  }, [unlockedData]);

  // Heartbeat: send ping every 10s while viewing
  useEffect(() => {
    if (!token || !unlockedData) return;
    const ping = () => fetch(`/api/verify/${token}/heartbeat`, { method: "POST", credentials: "include" }).catch(() => {});
    ping();
    const interval = setInterval(ping, 10_000);
    return () => clearInterval(interval);
  }, [token, unlockedData]);

  // Check if expired from meta error
  useEffect(() => {
    if (metaData === null && (metaData as any)?.error === "expired") setIsExpired(true);
  }, [metaData]);

  const handleReact = async (emoji: string) => {
    if (reactionLoading) return;
    setReactionLoading(true);
    try {
      const res = await fetch(`/api/verify/${token}/react`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) setReactionEmoji(emoji);
    } catch {}
    setReactionLoading(false);
  };

  const handleCountdownExpired = useCallback(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if ("serviceWorker" in navigator && "Notification" in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => setNotifSubscribed(!!sub));
      });
    }
  }, []);

  const subscribeRecipient = async () => {
    try {
      if (Notification.permission === "denied") return;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");
      const keyRes = await fetch(`${apiBase}/api/push/vapid-key`);
      if (!keyRes.ok) return;
      const { publicKey } = await keyRes.json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const subJson = sub.toJSON();
      await fetch(`${apiBase}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          p256dh: subJson.keys?.p256dh,
          auth: subJson.keys?.auth,
          letterToken: token,
          isAdmin: false,
        }),
      });
      setNotifSubscribed(true);
      setNotifBannerDismissed(true);
    } catch {}
  };

  const handleAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentQ = questions[currentQuestionIndex];
    if (!answers[currentQ.id]?.trim()) {
      setQuestionError({ message: "الرجاء إدخال الإجابة", failedIndex: currentQuestionIndex });
      return;
    }
    setQuestionError(null);

    if (!isLastQuestion) {
      setCurrentQuestionIndex(prev => prev + 1);
      return;
    }

    setSubmitting(true);
    try {
      const formattedAnswers = Object.entries(answers).map(([id, answer]) => ({ questionId: id, answer: answer.trim() }));
      const result = await unlockMutation.mutateAsync({ token, data: { answers: formattedAnswers } });
      setUnlockedData(result);
    } catch (err: any) {
      const errorData = err?.response?.data || err?.data || {};
      const failedIndex = errorData.failedIndex ?? currentQuestionIndex;
      const message = errorData.message || "إجابة خاطئة، حاول مرة أخرى";
      const failedQ = questions[failedIndex];
      if (failedQ) {
        setAnswers(prev => ({ ...prev, [failedQ.id]: "" }));
        setCurrentQuestionIndex(failedIndex);
      }
      setQuestionError({ message, failedIndex });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async () => {
    if (!replyFrom.trim()) return;
    if (replyBody.trim().length < 10) return;
    if (replyBody.length > 2000) return;
    try {
      await replyMutation.mutateAsync({ data: { token, replyBody, replyFrom } });
      setReplySuccess(true);
      // Persist thank-you state so page refresh keeps it
      if (token) sessionStorage.setItem(`replied_${token}`, "1");
    } catch {
      // handled by mutation error
    }
  };

  if (metaLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (metaError || !metaData) {
    const errData = (metaError as any)?.response?.data || (metaError as any)?.data;
    const isExpiredErr = errData?.error === "expired";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4" dir="rtl">
        <div className="text-center p-8 max-w-sm w-full">
          {isExpiredErr ? (
            <>
              <div className="w-20 h-20 mx-auto mb-4 text-5xl flex items-center justify-center">📜</div>
              <h2 className="font-display text-2xl mb-3 text-foreground">انتهت صلاحية هذه الرسالة</h2>
              <p className="text-muted-foreground mb-1">This letter has expired.</p>
              {errData?.expiredAt && (
                <p className="text-xs text-muted-foreground/60 mt-2">
                  انتهت في: {new Date(errData.expiredAt).toLocaleDateString("ar-SA")}
                </p>
              )}
            </>
          ) : (
            <>
              <Lock className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="font-display text-2xl mb-2 text-foreground">رسالة غير صالحة</h2>
              <p className="text-muted-foreground">الرمز غير صحيح أو الرسالة غير متوفرة.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const replies: any[] = unlockedData?.letter?.replies || [];
  const isUnlocked = !!unlockedData;

  const canShowNotifBanner = !notifBannerDismissed && !notifSubscribed
    && "Notification" in window && Notification.permission !== "denied"
    && isScheduledLocked && !isUnlocked;

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden" dir="rtl">
      <div className="fixed inset-0 bg-parchment-pattern opacity-40 mix-blend-multiply pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.8)_0%,transparent_70%)] pointer-events-none" />

      <main className="relative z-10 w-full max-w-4xl mx-auto px-4 py-10 md:py-20 min-h-screen flex flex-col items-center">

        <AnimatePresence mode="wait">
          {!isUnlocked && isScheduledLocked && scheduledUnlockAt && (
            <div className="w-full">
              <div className="text-center mb-8">
                <WaxSeal className="w-20 h-20 mx-auto mb-4" />
                <h1 className="font-display text-3xl md:text-4xl text-gradient-gold mb-2">رسالة مختومة</h1>
                <p className="text-lg text-foreground/80">إلى: <strong>{metaData.recipientName}</strong></p>
              </div>

              {canShowNotifBanner && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3"
                >
                  <Bell className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-800">فعّل الإشعارات</p>
                    <p className="text-xs text-amber-700 mt-0.5">احصل على إشعار فور فتح هذه الرسالة</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={subscribeRecipient} className="text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg min-h-[44px]">تفعيل</button>
                    <button onClick={() => setNotifBannerDismissed(true)} className="text-xs text-amber-600 hover:text-amber-800 px-2 min-h-[44px]">×</button>
                  </div>
                </motion.div>
              )}

              <LockedMessageCard scheduledUnlockAt={scheduledUnlockAt} onUnlocked={handleCountdownExpired} />
            </div>
          )}

          {!isUnlocked && !isScheduledLocked && (
            <motion.div
              key="verification"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
              transition={{ duration: 0.6 }}
              className="w-full max-w-md mt-8"
            >
              <div className="text-center mb-10">
                <WaxSeal className="w-20 h-20 mx-auto mb-5" />
                <h1 className="font-display text-3xl md:text-4xl text-gradient-gold mb-2">رسالة مختومة</h1>
                <p className="text-lg text-foreground/80">إلى: <strong>{metaData.recipientName}</strong></p>
              </div>

              {questions.length > 0 ? (
                <div className="bg-card/80 backdrop-blur-md border border-[#C9A84C]/30 p-6 md:p-8 rounded-3xl shadow-2xl royal-shadow">
                  <div className="flex justify-center gap-2 mb-6">
                    {questions.map((_, i) => (
                      <div
                        key={i}
                        className={`h-2 rounded-full transition-all duration-300 ${
                          i < currentQuestionIndex ? "w-8 bg-green-500"
                            : i === currentQuestionIndex ? "w-8 bg-primary"
                            : "w-3 bg-muted"
                        }`}
                      />
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.form
                      key={currentQuestionIndex}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25 }}
                      onSubmit={handleAnswer}
                      className="space-y-5"
                    >
                      <div className="text-center space-y-2">
                        <span className="text-xs font-bold text-primary tracking-widest block">
                          سؤال {currentQuestionIndex + 1} من {questions.length}
                        </span>
                        <h3 className="font-display text-xl md:text-2xl text-foreground leading-snug">
                          {questions[currentQuestionIndex].questionText}
                        </h3>
                      </div>

                      {questionError && questionError.failedIndex === currentQuestionIndex && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-xl"
                        >
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          {questionError.message}
                        </motion.div>
                      )}

                      <Input
                        autoFocus
                        placeholder="أدخل إجابتك هنا..."
                        className={`h-14 text-center text-lg bg-background ${
                          questionError?.failedIndex === currentQuestionIndex ? "border-destructive focus-visible:ring-destructive" : ""
                        }`}
                        value={answers[questions[currentQuestionIndex].id] || ""}
                        onChange={e => {
                          setAnswers(prev => ({ ...prev, [questions[currentQuestionIndex].id]: e.target.value }));
                          if (questionError?.failedIndex === currentQuestionIndex) setQuestionError(null);
                        }}
                      />

                      {currentQuestionIndex > 0 && (
                        <div className="space-y-1">
                          {questions.slice(0, currentQuestionIndex).map((q, i) => (
                            <div key={q.id} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                              <span>السؤال {i + 1}: أُجيب ✓</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <Button
                        type="submit"
                        variant="royal"
                        className="w-full h-14 text-lg min-h-[44px]"
                        disabled={submitting}
                      >
                        {submitting ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="animate-spin w-5 h-5" /> جارٍ التحقق...
                          </span>
                        ) : isLastQuestion ? "فض الختم وافتح الرسالة" : "التالي ←"}
                      </Button>
                    </motion.form>
                  </AnimatePresence>
                </div>
              ) : (
                <div className="text-center mt-12">
                  <Button
                    variant="royal"
                    className="h-16 px-10 text-xl rounded-full shadow-2xl min-h-[44px]"
                    onClick={() => unlockMutation.mutateAsync({ token, data: { answers: [] } }).then(setUnlockedData)}
                    disabled={unlockMutation.isPending}
                  >
                    {unlockMutation.isPending
                      ? <span className="flex items-center gap-2"><Loader2 className="animate-spin w-5 h-5" />جارٍ الفتح...</span>
                      : "فض الختم وافتح الرسالة"}
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isUnlocked && unlockedData && (
            <motion.div
              key="letter"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              className="w-full"
            >
              <div className="relative w-full bg-[#FAF7F0] shadow-2xl rounded-sm p-6 md:p-16 lg:p-20 border border-[#e6dbb8] royal-shadow overflow-hidden">
                <div className="absolute inset-0 bg-parchment-pattern opacity-50 mix-blend-multiply pointer-events-none" />
                <div className="absolute inset-3 md:inset-6 border border-[#C9A84C]/40 pointer-events-none" />
                <div className="relative z-10">
                  <div className="flex justify-center mb-8">
                    <WaxSeal className="w-16 h-16 md:w-20 md:h-20 drop-shadow-md" />
                  </div>
                  <div className="text-center mb-8 md:mb-10">
                    <h1 className="font-display text-3xl md:text-4xl lg:text-5xl text-[#2C1810] mb-3">{unlockedData.letter.title}</h1>
                    <p className="text-lg md:text-xl text-[#5a4231]">إلى السيد/ة: <strong>{unlockedData.letter.recipientName}</strong></p>
                  </div>
                  <ArabesqueDivider className="mb-10 md:mb-12" />
                  <div
                    className="font-script text-xl md:text-[26px] lg:text-[30px] leading-[2.4] md:leading-[2.6] text-[#2C1810] whitespace-pre-wrap px-2 md:px-8"
                    dir={unlockedData.letter.language === "english" ? "ltr" : "rtl"}
                    style={{ textAlign: unlockedData.letter.language === "english" ? "left" : "right" }}
                  >
                    {unlockedData.letter.body}
                  </div>
                  <ArabesqueDivider className="mt-10 md:mt-14 mb-6 md:mb-8" />
                  <p className="text-right text-sm text-[#8b7355]">
                    صدرت في: {format(new Date(unlockedData.letter.createdAt), "d MMMM yyyy", { locale: ar })}
                  </p>
                </div>
              </div>

              {replies.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.5 }}
                  className="mt-10 md:mt-12 max-w-2xl mx-auto space-y-4"
                >
                  <h3 className="font-display text-xl flex items-center gap-2 text-foreground">
                    <MessageSquare className="w-5 h-5 text-primary" /> المراسلات
                  </h3>
                  {replies.map((reply: any) => {
                    const isAdminReply = reply.replyFrom === "__admin__";
                    return (
                      <motion.div
                        key={reply.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex gap-3 ${isAdminReply ? "flex-row-reverse" : ""}`}
                      >
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isAdminReply ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {isAdminReply ? <Crown className="w-4 h-4" /> : <User className="w-4 h-4" />}
                        </div>
                        <div className={`max-w-xs md:max-w-sm flex flex-col ${isAdminReply ? "items-end" : "items-start"}`}>
                          <div className={`px-4 py-3 rounded-2xl font-script text-lg leading-relaxed ${isAdminReply ? "bg-primary/10 border border-primary/20 rounded-tr-sm" : "bg-muted/60 border border-border/50 rounded-tl-sm"}`}>
                            <p className="text-xs font-sans font-semibold text-muted-foreground mb-1">
                              {isAdminReply ? "أحمد" : reply.replyFrom}
                            </p>
                            <p>{reply.replyBody}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 font-sans">
                            {format(new Date(reply.createdAt), "d MMM - HH:mm", { locale: ar })}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2, duration: 1 }}
                className="mt-10 md:mt-12 max-w-2xl mx-auto"
              >
                {!replySuccess ? (
                  <div className="bg-card/60 backdrop-blur-sm border border-[#C9A84C]/30 p-6 md:p-8 rounded-3xl shadow-lg">
                    <h3 className="font-display text-xl md:text-2xl text-foreground mb-5 flex items-center gap-2">
                      <Send className="w-5 h-5 text-primary" /> أرسل رداً
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-semibold block mb-1.5">اسمك الكريم</label>
                        <Input placeholder="أدخل اسمك..." className="bg-background h-12" value={replyFrom} onChange={e => setReplyFrom(e.target.value)} />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <label className="text-sm font-semibold">رسالتك</label>
                          <span className={`text-xs font-mono tabular-nums ${replyBody.length > 1800 ? "text-red-500" : replyBody.length > 1500 ? "text-amber-500" : "text-muted-foreground"}`}>
                            {replyBody.length} / 2000
                          </span>
                        </div>
                        <Textarea
                          placeholder="اكتب ردك هنا... (10 أحرف على الأقل)"
                          className="bg-background min-h-[120px] md:min-h-[140px] font-script text-lg md:text-xl leading-loose"
                          value={replyBody}
                          onChange={e => { if (e.target.value.length <= 2000) setReplyBody(e.target.value); }}
                        />
                        {replyBody.trim().length > 0 && replyBody.trim().length < 10 && (
                          <p className="text-xs text-red-500 mt-1">الرد قصير جداً (10 أحرف على الأقل)</p>
                        )}
                      </div>
                      <Button
                        variant="royal"
                        className="w-full h-12 min-h-[44px]"
                        onClick={handleReply}
                        disabled={replyMutation.isPending || replyBody.trim().length < 10 || !replyFrom.trim()}
                      >
                        {replyMutation.isPending
                          ? <span className="flex items-center gap-2"><Loader2 className="animate-spin w-4 h-4" />جارٍ الإرسال...</span>
                          : <><Send className="w-4 h-4 me-2" />إرسال الرد</>}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative bg-[#FAF7F0] border border-[#C9A84C]/40 p-8 md:p-10 rounded-3xl text-center shadow-xl overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-parchment-pattern opacity-40 mix-blend-multiply pointer-events-none" />
                    <div className="relative z-10">
                      <WaxSeal className="w-16 h-16 mx-auto mb-4 drop-shadow-md" />
                      <h3 className="font-display text-2xl md:text-3xl text-[#2C1810] mb-3">شكراً لردك</h3>
                      <p className="text-[#5a4231] font-script text-lg mb-1">وصلت رسالتك إلى الديوان الملكي</p>
                      <p className="text-sm text-[#8b7355] mt-3 font-sans">Thank you for your reply</p>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
