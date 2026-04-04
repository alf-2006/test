import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { motion } from "framer-motion";
import { BarChart2, TrendingUp, Mail, MessageSquare, Clock, Lock } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

interface AnalyticsData {
  totals: { letters: number; replies: number };
  byStatus: { status: string; cnt: string }[];
  perMonth: { month: string; cnt: string }[];
  avgReadHours: number;
  scheduled: { locked: string; unlocked: string };
}

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة", sent: "مُرسلة", read: "مقروءة", replied: "مُردّ عليها",
};
const GOLD = "#C9A84C";
const COLORS = [GOLD, "#8b5cf6", "#3b82f6", "#22c55e", "#f59e0b", "#ef4444"];

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4 shadow-sm"
    >
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/analytics", { credentials: "include" })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const monthlyData = data?.perMonth.map(m => ({
    month: m.month.slice(5), // MM only
    رسائل: parseInt(m.cnt),
  })) || [];

  const statusData = data?.byStatus.map(s => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: parseInt(s.cnt),
  })) || [];

  const readRate = data ? (() => {
    const read = data.byStatus.find(s => s.status === "read" || s.status === "replied");
    const total = data.totals.letters;
    if (!total) return 0;
    const readCount = data.byStatus
      .filter(s => s.status === "read" || s.status === "replied")
      .reduce((a, s) => a + parseInt(s.cnt), 0);
    return Math.round((readCount / total) * 100);
  })() : 0;

  return (
    <AdminLayout>
      <div className="space-y-8" dir="rtl">
        <div className="flex items-center gap-3 mb-2">
          <BarChart2 className="w-6 h-6 text-primary" />
          <h1 className="font-display text-2xl text-foreground">الإحصائيات والتقارير</h1>
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="text-center py-20 text-muted-foreground">
            <p>فشل تحميل البيانات</p>
            <button onClick={() => window.location.reload()} className="mt-3 text-primary underline text-sm">إعادة المحاولة</button>
          </div>
        )}

        {data && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Mail} label="إجمالي الرسائل" value={data.totals.letters} />
              <StatCard icon={MessageSquare} label="إجمالي الردود" value={data.totals.replies} />
              <StatCard icon={TrendingUp} label="معدل القراءة" value={`${readRate}%`} sub="من الرسائل المُرسلة" />
              <StatCard
                icon={Clock}
                label="متوسط وقت القراءة"
                value={data.avgReadHours ? `${Math.round(Number(data.avgReadHours))} ساعة` : "—"}
                sub="من الإرسال للقراءة"
              />
            </div>

            {/* Monthly bar chart */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-card border border-border rounded-2xl p-6 shadow-sm"
            >
              <h2 className="font-semibold text-foreground mb-5 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" /> الرسائل خلال آخر 12 شهر
              </h2>
              {monthlyData.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">لا توجد بيانات كافية</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    />
                    <Bar dataKey="رسائل" fill={GOLD} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </motion.div>

            {/* Status donut + scheduled info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="bg-card border border-border rounded-2xl p-6 shadow-sm"
              >
                <h2 className="font-semibold text-foreground mb-4">توزيع الرسائل حسب الحالة</h2>
                {statusData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">لا توجد رسائل</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                        {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Legend
                        formatter={(v) => <span style={{ fontSize: 12 }}>{v}</span>}
                      />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-card border border-border rounded-2xl p-6 shadow-sm"
              >
                <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-primary" /> الرسائل المجدولة
                </h2>
                <div className="space-y-4 mt-6">
                  <div className="flex items-center justify-between p-4 bg-orange-50 border border-orange-200 rounded-xl">
                    <span className="text-sm font-medium text-orange-800">🔒 مقفلة (لم تُفتح بعد)</span>
                    <span className="text-2xl font-bold text-orange-700">{data.scheduled.locked || 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-xl">
                    <span className="text-sm font-medium text-green-800">🔓 مفتوحة (انتهى التوقيت)</span>
                    <span className="text-2xl font-bold text-green-700">{data.scheduled.unlocked || 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 border border-border rounded-xl">
                    <span className="text-sm font-medium text-muted-foreground">معدل الرد على الرسائل</span>
                    <span className="text-2xl font-bold text-foreground">
                      {data.totals.letters > 0 ? `${Math.round((data.totals.replies / data.totals.letters) * 100)}%` : "—"}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
