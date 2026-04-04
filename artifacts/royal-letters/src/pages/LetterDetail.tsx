import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArabesqueDivider } from "@/components/ArabesqueDivider";
import { WaxSeal } from "@/components/WaxSeal";
import { ArrowRight, Copy, Send, PenLine, Eye, EyeOff, CheckCircle, Clock, MessageSquare, User, Crown, Wifi } from "lucide-react";
import { useAdminSocket, type WsEvent } from "@/hooks/useAdminSocket";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useGetLetter, useSendLetter } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function LetterDetail() {
  const [, params] = useRoute("/letters/:id");
  const letterId = params?.id || "";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useGetLetter(letterId);
  const sendMutation = useSendLetter();

  const [adminReply, setAdminReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [replySuccess, setReplySuccess] = useState(false);

  const letter = data?.letter;
  const [isOnline, setIsOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const onlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for recipient online events via WebSocket
  useAdminSocket((event: WsEvent) => {
    if (event.type === "recipient_online" && event.letterId === letterId) {
      setIsOnline(true);
      setLastSeen(new Date().toISOString());
      if (onlineTimerRef.current) clearTimeout(onlineTimerRef.current);
      onlineTimerRef.current = setTimeout(() => setIsOnline(false), 15_000);
    }
    if (event.type === "letter_read" && event.letterId === letterId) {
      refetch();
    }
    if (event.type === "new_reply" && event.letterId === letterId) {
      refetch();
    }
  });

  useEffect(() => () => { if (onlineTimerRef.current) clearTimeout(onlineTimerRef.current); }, []);

  const copyLink = () => {
    if (!letter) return;
    const url = `${window.location.origin}/letter/${letter.uniqueToken}`;
    navigator.clipboard.writeText(url).then(() => toast.success("تم نسخ الرابط! 🔗"));
  };

  const [confirmSend, setConfirmSend] = useState(false);
  const handleSend = async () => {
    if (!letter) return;
    if (!confirmSend) { setConfirmSend(true); return; }
    setConfirmSend(false);
    await sendMutation.mutateAsync({ id: letterId });
    toast.success("تم إرسال الرسالة!");
    refetch();
  };

  const handleAdminReply = async () => {
    if (!adminReply.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/letters/${letterId}/admin-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ replyBody: adminReply }),
      });
      if (res.ok) {
        setAdminReply("");
        setReplySuccess(true);
        setTimeout(() => setReplySuccess(false), 3000);
        refetch();
        queryClient.invalidateQueries({ queryKey: ["/api/letters"] });
      }
    } catch {
      alert("حدث خطأ أثناء إرسال الرد");
    } finally {
      setSendingReply(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft": return <Badge variant="secondary">مسودة</Badge>;
      case "sent": return <Badge className="bg-blue-600 hover:bg-blue-700 text-white">أُرسلت</Badge>;
      case "read": return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">قُرئت</Badge>;
      case "replied": return <Badge className="bg-purple-600 hover:bg-purple-700 text-white">تم الرد</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center p-20">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (!letter) {
    return (
      <AdminLayout>
        <div className="text-center p-20 text-muted-foreground">الرسالة غير موجودة</div>
      </AdminLayout>
    );
  }

  const replies = (letter as any).replies || [];
  const recipientReplies = replies.filter((r: any) => r.replyFrom !== "__admin__" && !r.isAdmin);
  const adminReplies = replies.filter((r: any) => r.replyFrom === "__admin__" || r.isAdmin);

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-8 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")} className="rounded-full">
              <ArrowRight className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-display text-2xl text-foreground">{letter.title}</h1>
              <p className="text-muted-foreground text-sm">إلى: {letter.recipientName}</p>
              {/* Online indicator */}
              {isOnline ? (
                <span className="inline-flex items-center gap-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-1 font-medium">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  يشاهد الرسالة الآن
                </span>
              ) : lastSeen ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Wifi className="w-3 h-3" />
                  آخر ظهور: {new Date(lastSeen).toLocaleTimeString("ar-EG")}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {getStatusBadge(letter.status)}
            {letter.status === "draft" && (
              <Button variant="royal" size="sm" onClick={handleSend} disabled={sendMutation.isPending}>
                <Send className="w-4 h-4 me-2" /> إصدار وإرسال
              </Button>
            )}
            {letter.status !== "draft" && (
              <Button variant="outline" size="sm" onClick={copyLink}>
                <Copy className="w-4 h-4 me-2" /> نسخ الرابط
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setLocation(`/compose/${letterId}`)}>
              <PenLine className="w-4 h-4 me-2" /> تعديل
            </Button>
          </div>
        </div>

        {/* Reading Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`p-4 rounded-2xl border flex items-center gap-3 ${letter.isRead ? "bg-green-50 border-green-200" : "bg-muted/30 border-border/50"}`}>
            {letter.isRead ? (
              <CheckCircle className="w-8 h-8 text-green-600 shrink-0" />
            ) : (
              <EyeOff className="w-8 h-8 text-muted-foreground shrink-0" />
            )}
            <div>
              <p className="font-semibold text-sm">{letter.isRead ? "قرأ الرسالة" : "لم يُشاهَد بعد"}</p>
              {letter.isRead && letter.readAt && (
                <p className="text-xs text-muted-foreground">
                  {format(new Date(letter.readAt), "d MMMM yyyy - HH:mm", { locale: ar })}
                </p>
              )}
            </div>
          </div>
          <div className="p-4 rounded-2xl border bg-muted/30 border-border/50 flex items-center gap-3">
            <MessageSquare className="w-8 h-8 text-primary shrink-0" />
            <div>
              <p className="font-semibold text-sm">{recipientReplies.length} رد من المستلم</p>
              <p className="text-xs text-muted-foreground">{adminReplies.length} رد منك</p>
            </div>
          </div>
          <div className="p-4 rounded-2xl border bg-muted/30 border-border/50 flex items-center gap-3">
            <Clock className="w-8 h-8 text-amber-500 shrink-0" />
            <div>
              <p className="font-semibold text-sm">أُنشئت في</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(letter.createdAt), "d MMMM yyyy", { locale: ar })}
              </p>
            </div>
          </div>
        </div>

        {/* Letter Preview */}
        <div className="relative bg-[#FAF7F0] shadow-lg rounded-sm border border-[#e6dbb8] overflow-hidden">
          <div className="absolute inset-0 bg-parchment-pattern opacity-40 mix-blend-multiply pointer-events-none" />
          <div className="absolute inset-3 border border-[#C9A84C]/30 pointer-events-none" />
          <div className="relative z-10 p-8 md:p-12">
            <div className="flex justify-center mb-6">
              <WaxSeal className="w-16 h-16" />
            </div>
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl text-[#2C1810] mb-2">{letter.title}</h2>
              <p className="text-[#5a4231]">إلى السيد/ة: <strong>{letter.recipientName}</strong></p>
            </div>
            <ArabesqueDivider className="mb-8" />
            <div
              className="font-script text-2xl leading-[2.5] text-[#2C1810] whitespace-pre-wrap px-4 md:px-8"
              dir={letter.language === "english" ? "ltr" : "rtl"}
            >
              {(letter as any).body}
            </div>
            <ArabesqueDivider className="mt-10 mb-6" />
            <p className="text-right text-xs text-[#8b7355] font-sans">
              صدرت في: {format(new Date(letter.createdAt), "d MMMM yyyy", { locale: ar })}
            </p>
          </div>
        </div>

        {/* Security Questions */}
        {(letter as any).questions?.length > 0 && (
          <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-xl flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" /> أسئلة الأمان الحالية
            </h3>
            <div className="space-y-3">
              {(letter as any).questions.map((q: any, i: number) => (
                <div key={q.id} className="flex gap-4 p-3 bg-muted/30 rounded-xl">
                  <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{q.questionText}</p>
                    <p className="text-xs text-muted-foreground mt-1">الإجابة: <span className="font-mono text-primary">{q.answerText}</span></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conversation Thread */}
        {replies.length > 0 && (
          <div className="space-y-4">
            <h3 className="font-display text-xl flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" /> محادثة الرسالة
            </h3>
            <div className="space-y-4">
              {replies.map((reply: any) => {
                const isAdminReply = reply.replyFrom === "__admin__" || reply.isAdmin;
                return (
                  <motion.div
                    key={reply.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 ${isAdminReply ? "flex-row-reverse" : ""}`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isAdminReply ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {isAdminReply ? <Crown className="w-5 h-5" /> : <User className="w-5 h-5" />}
                    </div>
                    <div className={`flex-1 max-w-lg ${isAdminReply ? "items-end" : "items-start"} flex flex-col`}>
                      <div className={`px-4 py-3 rounded-2xl ${isAdminReply ? "bg-primary/10 border border-primary/20 rounded-tr-sm" : "bg-muted/50 border border-border/50 rounded-tl-sm"}`}>
                        <p className="font-semibold text-xs mb-1 text-muted-foreground">
                          {isAdminReply ? "أحمد (أنت)" : reply.replyFrom}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{reply.replyBody}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 px-1">
                        {format(new Date(reply.createdAt), "d MMM yyyy - HH:mm", { locale: ar })}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Admin Reply Box */}
        <div className="bg-card border border-[#C9A84C]/30 rounded-2xl p-6 space-y-4">
          <h3 className="font-display text-xl flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" /> ردك على الرسالة
          </h3>
          {replySuccess && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl text-center">
              ✓ تم إرسال ردك بنجاح
            </div>
          )}
          <Textarea
            value={adminReply}
            onChange={e => setAdminReply(e.target.value)}
            placeholder="اكتب ردك على هذه الرسالة..."
            className="min-h-[120px] bg-background font-script text-lg leading-loose"
          />
          <Button
            variant="royal"
            className="w-full h-12"
            onClick={handleAdminReply}
            disabled={sendingReply || !adminReply.trim()}
          >
            {sendingReply ? (
              <span className="flex items-center gap-2"><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75"/></svg>جارٍ الإرسال...</span>
            ) : (
              <><Send className="w-4 h-4 me-2" /> إرسال الرد</>
            )}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
