import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { PenLine, Inbox, LogOut, Loader2, ShieldCheck, Settings, Menu, X, Smartphone, BarChart2 } from "lucide-react";
import { useGetAuthMe, useAdminLogout } from "@workspace/api-client-react";
import { useEffect, useState, useCallback } from "react";
import { NotificationBell } from "@/components/NotificationBell";
import { getPWAInstallPrompt, clearPWAInstallPrompt } from "@/main";
import { toast } from "sonner";
import { useAdminSocket, type WsEvent } from "@/hooks/useAdminSocket";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: auth, isLoading, isError } = useGetAuthMe();
  const logoutMutation = useAdminLogout();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const [sessionWarning, setSessionWarning] = useState(false);

  useEffect(() => {
    if (!isLoading && (isError || !auth?.authenticated)) setLocation("/login");
  }, [isLoading, isError, auth, setLocation]);

  useEffect(() => { setSidebarOpen(false); }, [location]);

  // PWA install banner
  useEffect(() => {
    if (localStorage.getItem("pwa_install_dismissed")) return;
    if (getPWAInstallPrompt()) { setShowInstallBanner(true); return; }
    const handler = () => setShowInstallBanner(true);
    const installed = () => { setShowInstallBanner(false); toast.success("تم تثبيت التطبيق! 🎉"); };
    window.addEventListener("pwa-install-available", handler);
    window.addEventListener("pwa-installed", installed);
    return () => {
      window.removeEventListener("pwa-install-available", handler);
      window.removeEventListener("pwa-installed", installed);
    };
  }, []);

  // Push notification permission banner
  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    const dismissCount = parseInt(localStorage.getItem("push_dismissed") || "0", 10);
    if (Notification.permission === "default" && dismissCount < 2) {
      const t = setTimeout(() => setShowNotifBanner(true), 3000);
      return () => clearTimeout(t);
    }
  }, []);

  // Session expiry warning check
  useEffect(() => {
    const checkExpiry = () => {
      const expiresAt = localStorage.getItem("session_expires_at");
      if (!expiresAt) return;
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff > 0 && diff < 30 * 60 * 1000) setSessionWarning(true);
      else setSessionWarning(false);
    };
    checkExpiry();
    const interval = setInterval(checkExpiry, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "n") { e.preventDefault(); setLocation("/compose"); }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") { e.preventDefault(); setLocation("/dashboard"); }
      if (e.key === "Escape") setSidebarOpen(false);
      if (e.key === "?") toast.info("⌨️ Ctrl+N: رسالة جديدة  •  Ctrl+D: الرسائل  •  Esc: إغلاق");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setLocation]);

  // WebSocket real-time events
  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type === "new_reply") {
      const preview = event.preview ? `"${event.preview}"` : "";
      toast.success(
        `💬 رد جديد من ${event.recipientName || "المستلم"} ${preview}`,
        {
          duration: 6000,
          action: event.letterId
            ? { label: "عرض →", onClick: () => setLocation(`/letters/${event.letterId}`) }
            : undefined,
        }
      );
      // Play sound if app is focused
      try { new Audio("/sounds/notify.mp3").play().catch(() => {}); } catch {}
      // Refresh notification bell
      window.dispatchEvent(new CustomEvent("ws-event", { detail: event }));
    } else if (event.type === "letter_read") {
      toast.success(`👁 ${event.recipientName || "المستلم"} فتح رسالتك ✓✓`, {
        duration: 5000,
        action: event.letterId
          ? { label: "عرض →", onClick: () => setLocation(`/letters/${event.letterId}`) }
          : undefined,
      });
      window.dispatchEvent(new CustomEvent("ws-event", { detail: event }));
    } else if (event.type === "message_unlocked") {
      toast.success(`🔓 رسالة مجدولة فُتحت: "${event.title || ""}"`, { duration: 5000 });
      window.dispatchEvent(new CustomEvent("ws-event", { detail: event }));
    } else if (event.type === "reaction") {
      toast.success(`${event.emoji} ${event.recipientName || "المستلم"} تفاعل مع رسالتك`, { duration: 4000 });
      window.dispatchEvent(new CustomEvent("ws-event", { detail: event }));
    } else if (event.type === "notification_count") {
      window.dispatchEvent(new CustomEvent("ws-event", { detail: event }));
    }
  }, [setLocation]);

  useAdminSocket(handleWsEvent);

  const handleInstall = async () => {
    const prompt = getPWAInstallPrompt() as any;
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    clearPWAInstallPrompt();
    setShowInstallBanner(false);
    if (outcome === "accepted") toast.success("جاري تثبيت التطبيق...");
  };

  const dismissInstall = () => {
    localStorage.setItem("pwa_install_dismissed", "1");
    setShowInstallBanner(false);
  };

  const dismissNotifBanner = () => {
    const count = parseInt(localStorage.getItem("push_dismissed") || "0", 10);
    localStorage.setItem("push_dismissed", String(count + 1));
    setShowNotifBanner(false);
  };

  const enableNotifications = async () => {
    setShowNotifBanner(false);
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      toast.success("تم تفعيل الإشعارات! افتح الإعدادات للمتابعة");
      setLocation("/settings");
    } else {
      toast.error("لم يتم منح إذن الإشعارات");
    }
  };

  const extendSession = async () => {
    try {
      await fetch("/api/auth/refresh-session", { method: "POST", credentials: "include" });
      setSessionWarning(false);
      toast.success("تم تمديد الجلسة ✓");
    } catch {
      toast.error("فشل تمديد الجلسة");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!auth?.authenticated) return null;

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/login");
  };

  const navItems = [
    { href: "/dashboard", label: "صندوق الرسائل", icon: Inbox },
    { href: "/compose", label: "رسالة جديدة", icon: PenLine },
    { href: "/analytics", label: "الإحصائيات", icon: BarChart2 },
    { href: "/settings", label: "الإعدادات", icon: Settings },
  ];

  const getTitle = () => {
    if (location === "/dashboard") return "الرسائل الصادرة والواردة";
    if (location.startsWith("/letters/")) return "تفاصيل الرسالة";
    if (location.startsWith("/compose")) return "صياغة رسالة";
    if (location === "/settings") return "الإعدادات الشخصية";
    if (location === "/analytics") return "الإحصائيات والتقارير";
    return "الديوان الملكي";
  };

  const Sidebar = () => (
    <aside className={cn(
      "bg-card border-l border-border shadow-xl z-30 flex flex-col relative overflow-hidden",
      "fixed inset-y-0 right-0 w-64 transition-transform duration-300",
      "md:relative md:translate-x-0 md:shrink-0",
      sidebarOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
    )}>
      <div className="absolute inset-0 opacity-10 bg-parchment-pattern mix-blend-multiply pointer-events-none" />
      <div className="p-5 border-b border-border/50 relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-primary shrink-0" />
          <div>
            <h1 className="font-display text-lg font-bold text-gradient-gold">الديوان الملكي</h1>
            <p className="text-xs text-muted-foreground">لوحة التحكم</p>
          </div>
        </div>
        <button className="md:hidden text-muted-foreground hover:text-foreground p-1" onClick={() => setSidebarOpen(false)}>
          <X className="w-5 h-5" />
        </button>
      </div>
      <nav className="flex-1 p-4 space-y-1.5 relative z-10">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className="block">
              <span className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 min-h-[44px]",
                isActive ? "bg-primary text-primary-foreground shadow-md" : "text-foreground hover:bg-primary/10 hover:text-primary"
              )}>
                <item.icon className="w-5 h-5 shrink-0" />
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border/50 relative z-10 space-y-2">
        <p className="text-xs text-muted-foreground text-center px-2">
          ? للاختصارات • Ctrl+N رسالة جديدة
        </p>
        <button
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          className="flex items-center w-full gap-3 px-4 py-3 text-destructive hover:bg-destructive/10 rounded-xl font-medium transition-all min-h-[44px]"
        >
          {logoutMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
          تسجيل الخروج
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-muted/30 flex" dir="rtl">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden relative">
        <header className="h-14 md:h-16 border-b border-border/50 bg-card/50 backdrop-blur-md flex items-center px-4 md:px-8 shrink-0 z-10 gap-3">
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="font-display text-lg md:text-xl text-foreground truncate flex-1">{getTitle()}</h2>
          {showInstallBanner && (
            <div className="hidden sm:flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-3 py-1.5 shrink-0">
              <Smartphone className="w-4 h-4 text-primary" />
              <button onClick={handleInstall} className="text-xs font-semibold text-primary hover:underline">تثبيت التطبيق</button>
              <button onClick={dismissInstall} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          <NotificationBell />
        </header>

        {/* Session expiry warning */}
        {sessionWarning && (
          <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 flex items-center gap-3">
            <span className="text-sm text-orange-800 flex-1">⚠️ جلستك ستنتهي قريباً</span>
            <button onClick={extendSession} className="text-xs bg-orange-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-orange-700 transition-colors min-h-[32px] shrink-0">
              تمديد الجلسة
            </button>
            <button onClick={() => setSessionWarning(false)} className="text-orange-500 hover:text-orange-700 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Push notification banner */}
        {showNotifBanner && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-3">
            <span className="text-sm text-amber-800 flex-1">🔔 فعّل الإشعارات لتعلم فوراً عند رد المستلمين</span>
            <button onClick={enableNotifications} className="text-xs bg-amber-700 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-amber-800 transition-colors shrink-0 min-h-[32px]">
              تفعيل
            </button>
            <button onClick={dismissNotifBanner} className="text-amber-600 hover:text-amber-800 shrink-0"><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="flex-1 overflow-auto p-4 md:p-8 relative">
          <div className="max-w-5xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
