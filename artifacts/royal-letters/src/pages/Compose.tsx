import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import {
  useCreateLetter,
  useUpdateLetter,
  useGetLetter,
  CreateLetterRequestLanguage,
  CreateLetterRequestStatus
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, Send, Loader2, CalendarClock, Lock, Eye } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, addMinutes, differenceInMinutes, differenceInDays, differenceInHours } from "date-fns";
import { ar } from "date-fns/locale";
import { toast } from "sonner";

interface QAPair {
  id?: string;
  questionText: string;
  answerText: string;
  orderIndex: number;
}

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function humanizeUnlock(targetDate: Date): string {
  const now = new Date();
  const diffMins = differenceInMinutes(targetDate, now);
  if (diffMins <= 0) return "الوقت المحدد في الماضي";
  const diffDays = differenceInDays(targetDate, now);
  const diffHours = differenceInHours(targetDate, now);
  if (diffHours < 24) {
    const hrs = Math.floor(diffHours);
    const mins = diffMins % 60;
    if (hrs === 0) return `ستُفتح هذه الرسالة خلال ${mins} دقيقة`;
    return `ستُفتح خلال ${hrs} ساعة${mins > 0 ? ` و${mins} دقيقة` : ""}`;
  }
  if (diffDays < 7) {
    const hrs = diffHours % 24;
    return `ستُفتح خلال ${diffDays} ${diffDays === 1 ? "يوم" : "أيام"}${hrs > 0 ? ` و${hrs} ساعة` : ""}`;
  }
  return `ستُفتح يوم ${format(targetDate, "EEEE، d MMMM yyyy 'الساعة' HH:mm", { locale: ar })}`;
}

function CharCount({ count }: { count: number }) {
  const color = count > 10000 ? "text-red-500" : count > 5000 ? "text-amber-500" : "text-muted-foreground";
  return (
    <div className={`text-xs text-left mt-1 tabular-nums ${color}`}>
      {count.toLocaleString()} حرف
      {count > 10000 && <span className="mr-2 font-semibold">⚠ رسالة طويلة جداً</span>}
      {count > 5000 && count <= 10000 && <span className="mr-2">• قد تبدو طويلة على الهاتف</span>}
    </div>
  );
}

function RecipientInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim()) { setSuggestions([]); return; }
    try {
      const res = await fetch(`${apiBase}/api/letters/recipient-suggestions?q=${encodeURIComponent(q)}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch {}
  }, [apiBase]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 300);
    setShowSuggestions(true);
  };

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={handleChange}
        onFocus={() => { if (suggestions.length) setShowSuggestions(true); }}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder="مثال: سمو الأمير..."
        className="h-11"
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              className="w-full text-right px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors border-b border-border/30 last:border-0 min-h-[44px]"
              onMouseDown={() => { onChange(s); setSuggestions([]); setShowSuggestions(false); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Compose() {
  const [, params] = useRoute("/compose/:id");
  const letterId = params?.id;
  const isEditing = !!letterId;

  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: existingLetter, isLoading: isFetching } = useGetLetter(letterId || "", {
    query: { enabled: isEditing }
  });

  const createMutation = useCreateLetter();
  const updateMutation = useUpdateLetter();

  const [title, setTitle] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [language, setLanguage] = useState<CreateLetterRequestLanguage>("arabic");
  const [body, setBody] = useState("");
  const [questions, setQuestions] = useState<QAPair[]>([]);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(toLocalDatetimeValue(addMinutes(new Date(), 60)));
  const [previewMode, setPreviewMode] = useState(false);
  const [expiresEnabled, setExpiresEnabled] = useState(false);
  const [expiresAt, setExpiresAt] = useState(toLocalDatetimeValue(addMinutes(new Date(), 60 * 24 * 7)));
  const [draftBanner, setDraftBanner] = useState(false);

  const DRAFT_KEY = "royal_letter_draft_v2";

  // Auto-save draft for new letters only
  const autosaveRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (isEditing) return;
    if (!title && !body && !recipientName) return;
    clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          title, body, recipientName, language, questions,
          scheduleEnabled, scheduledAt, expiresEnabled, expiresAt,
          savedAt: new Date().toISOString(),
        }));
      } catch {}
    }, 2000);
    return () => clearTimeout(autosaveRef.current);
  }, [title, body, recipientName, language, questions, scheduleEnabled, scheduledAt, expiresEnabled, expiresAt, isEditing]);

  // On mount for new letter: check for saved draft
  useEffect(() => {
    if (isEditing) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setDraftBanner(true);
    } catch {}
  }, [isEditing]);

  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.title) setTitle(d.title);
      if (d.body) setBody(d.body);
      if (d.recipientName) setRecipientName(d.recipientName);
      if (d.language) setLanguage(d.language);
      if (d.questions) setQuestions(d.questions);
      if (d.scheduleEnabled) { setScheduleEnabled(true); if (d.scheduledAt) setScheduledAt(d.scheduledAt); }
      if (d.expiresEnabled) { setExpiresEnabled(true); if (d.expiresAt) setExpiresAt(d.expiresAt); }
    } catch {}
    setDraftBanner(false);
  };

  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftBanner(false);
  };

  const minDatetime = toLocalDatetimeValue(addMinutes(new Date(), 1));
  const scheduleDate = scheduleEnabled && scheduledAt ? new Date(scheduledAt) : null;

  useEffect(() => {
    if (existingLetter?.letter) {
      const l = existingLetter.letter;
      setTitle(l.title);
      setRecipientName(l.recipientName);
      setLanguage(l.language as CreateLetterRequestLanguage);
      setBody(l.body);
      const unlockAt = (l as any).scheduledUnlockAt;
      if (unlockAt) { setScheduleEnabled(true); setScheduledAt(toLocalDatetimeValue(new Date(unlockAt))); }
      if (l.questions) {
        setQuestions(l.questions.map((q: any) => ({
          id: q.id, questionText: q.questionText, answerText: q.answerText || "", orderIndex: q.orderIndex
        })));
      }
    }
  }, [existingLetter]);

  const handleAddQuestion = () => {
    if (questions.length >= 3) return;
    setQuestions([...questions, { questionText: "", answerText: "", orderIndex: questions.length }]);
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index).map((q, i) => ({ ...q, orderIndex: i })));
  };

  const handleQuestionChange = (index: number, field: keyof QAPair, value: string) => {
    const newQs = [...questions];
    newQs[index] = { ...newQs[index], [field]: value };
    setQuestions(newQs);
  };

  const handleSave = async (status: CreateLetterRequestStatus) => {
    try {
      const scheduledUnlockAt = scheduleEnabled ? new Date(scheduledAt).toISOString() : null;
      const payload: any = {
        title, recipientName, language, body, status, scheduledUnlockAt,
        expiresAt: expiresEnabled ? new Date(expiresAt).toISOString() : null,
        questions: questions
          .filter(q => q.questionText && q.answerText)
          .map((q, i) => ({ questionText: q.questionText, answerText: q.answerText, orderIndex: i })),
      };
      if (isEditing) await updateMutation.mutateAsync({ id: letterId, data: payload });
      else {
        await createMutation.mutateAsync({ data: payload });
        localStorage.removeItem(DRAFT_KEY);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/letters"] });
      toast.success(status === "draft" ? "تم حفظ المسودة" : "تم إصدار الرسالة بنجاح");
      setLocation("/dashboard");
    } catch {
      toast.error("حدث خطأ أثناء الحفظ");
    }
  };

  if (isEditing && isFetching) {
    return <AdminLayout><div className="flex justify-center p-12"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div></AdminLayout>;
  }

  const isPending = createMutation.isPending || updateMutation.isPending;
  const bodyLength = body.length;

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-12">

        {/* Draft restore banner */}
        {draftBanner && !isEditing && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
            <span className="text-sm text-amber-800 flex-1">📝 لديك مسودة محفوظة — هل تريد استعادتها؟</span>
            <button onClick={restoreDraft} className="text-xs bg-amber-700 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-amber-800 transition-colors min-h-[32px]">استعادة</button>
            <button onClick={discardDraft} className="text-xs text-amber-600 hover:text-amber-800 font-medium px-2 min-h-[32px]">تجاهل</button>
          </div>
        )}

        <Card className="border-[#C9A84C]/30 shadow-md">
          <CardHeader className="bg-muted/30 border-b border-border/50">
            <CardTitle className="text-lg">معلومات الرسالة</CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold">عنوان الرسالة</label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="مثال: رسالة شكر وتقدير" className="h-11" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">اسم المستلم</label>
                <RecipientInput value={recipientName} onChange={setRecipientName} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">لغة الرسالة</label>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value as CreateLetterRequestLanguage)}
                  className="w-full h-11 rounded-md border border-input bg-background/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="arabic">العربية</option>
                  <option value="english">English</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#C9A84C]/30 shadow-md">
          <CardHeader className="bg-muted/30 border-b border-border/50 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">محتوى الرسالة</CardTitle>
            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setPreviewMode(!previewMode)}>
              <Eye className="w-3.5 h-3.5" />{previewMode ? "تحرير" : "معاينة"}
            </Button>
          </CardHeader>
          <CardContent className="pt-5">
            {previewMode ? (
              <div className="p-6 md:p-10 rounded-xl border-2 border-primary/20 bg-[#FAF7F0] relative min-h-[280px]">
                <div className="absolute inset-0 bg-parchment-pattern opacity-40 mix-blend-multiply pointer-events-none rounded-xl" />
                <div
                  className="relative z-10 font-script text-xl md:text-2xl leading-loose text-[#2C1810] whitespace-pre-wrap"
                  dir={language === "english" ? "ltr" : "rtl"}
                >
                  {body || <span className="text-muted-foreground font-sans text-base">لا يوجد محتوى بعد...</span>}
                </div>
              </div>
            ) : (
              <>
                <div className="p-3 rounded-xl border-2 border-primary/20 bg-[#FAF7F0] relative">
                  <div className="absolute inset-0 bg-parchment-pattern opacity-40 mix-blend-multiply pointer-events-none rounded-xl" />
                  <Textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    placeholder="اكتب نص الرسالة هنا..."
                    className="min-h-[280px] md:min-h-[380px] bg-transparent border-none shadow-none focus-visible:ring-0 text-lg md:text-xl leading-loose p-4 md:p-8 relative z-10 font-script resize-none placeholder:font-sans placeholder:text-base"
                  />
                </div>
                <CharCount count={bodyLength} />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-[#C9A84C]/30 shadow-md">
          <CardHeader className="bg-muted/30 border-b border-border/50 flex flex-row items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-primary shrink-0" />تأجيل فتح الرسالة
            </CardTitle>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-muted-foreground">تفعيل</span>
              <div
                onClick={() => setScheduleEnabled(!scheduleEnabled)}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${scheduleEnabled ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${scheduleEnabled ? "right-0.5" : "left-0.5"}`} />
              </div>
            </label>
          </CardHeader>
          {scheduleEnabled && (
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">تاريخ ووقت الفتح</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  min={minDatetime}
                  onChange={e => setScheduledAt(e.target.value)}
                  className="w-full h-11 rounded-md border border-input bg-background/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {scheduleDate && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 font-medium">{humanizeUnlock(scheduleDate)}</p>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        <Card className="border-[#C9A84C]/30 shadow-md">
          <CardHeader className="bg-muted/30 border-b border-border/50 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-lg">أسئلة الأمان</CardTitle>
            <Badge variant="outline">{questions.length} / 3</Badge>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            {questions.length === 0 ? (
              <div className="text-center p-6 border-2 border-dashed border-border rounded-xl text-muted-foreground">
                <p className="mb-4 text-sm">ستُفتح الرسالة مباشرة بدون أسئلة.</p>
                <Button variant="outline" onClick={handleAddQuestion} type="button"><Plus className="w-4 h-4 me-2" />إضافة سؤال</Button>
              </div>
            ) : (
              questions.map((q, index) => (
                <div key={index} className="flex gap-3 items-start p-4 bg-muted/20 rounded-xl border border-border/50">
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0 mt-1 text-sm">{index + 1}</div>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">السؤال</label>
                      <Input value={q.questionText} onChange={e => handleQuestionChange(index, 'questionText', e.target.value)} placeholder="مثال: ما هو لونك المفضل؟" className="h-11" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">الإجابة الصحيحة</label>
                      <Input value={q.answerText} onChange={e => handleQuestionChange(index, 'answerText', e.target.value)} placeholder="الجواب المطابق" className="h-11" />
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveQuestion(index)} className="text-destructive mt-5 hover:bg-destructive/10 shrink-0 min-h-[44px] min-w-[44px]" type="button">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
            {questions.length > 0 && questions.length < 3 && (
              <Button variant="outline" onClick={handleAddQuestion} type="button" className="w-full border-dashed min-h-[44px]">
                <Plus className="w-4 h-4 me-2" />إضافة سؤال آخر
              </Button>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
          <Button variant="outline" size="lg" onClick={() => handleSave("draft")} disabled={isPending || !title || !recipientName} className="min-h-[44px]">
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <Save className="w-4 h-4 me-2" />}
            حفظ كمسودة
          </Button>
          <Button variant="royal" size="lg" onClick={() => handleSave("sent")} disabled={isPending || !title || !recipientName || !body} className="min-h-[44px]">
            {createMutation.isPending ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <Send className="w-4 h-4 me-2" />}
            {scheduleEnabled ? "إصدار وجدولة الرسالة" : "إصدار الرسالة"}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
