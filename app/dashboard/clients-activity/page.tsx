"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { vetraCore } from "@/lib/vetra-core";

type ActivityClient = { id: string; name: string; phone: string | null; lastSeenAt: string | null };
type ActivityData = { activeClients: ActivityClient[]; visitedLast24Hours: ActivityClient[]; notificationsEnabled: ActivityClient[]; activityTrackingAvailable: boolean };
type Language = "ar" | "en";

const words = {
  ar: {
    back: "العودة للعيادة",
    title: "نشاط العملاء",
    subtitle: "متابعة العملاء المتصلين وزيارات بوابة العملاء وإعدادات الإشعارات.",
    active: "نشطون الآن",
    last24: "زاروا خلال آخر 24 ساعة",
    notifications: "فعّلوا الإشعارات",
    loading: "جارٍ تحميل النشاط...",
    empty: "لا يوجد عملاء في هذه القائمة حاليًا.",
    refresh: "تحديث القوائم",
    updated: "آخر تحديث",
    error: "تعذر تحميل نشاط العملاء. حاول تحديث الصفحة.",
    migrationRequired: "سجل الزيارات غير مفعّل بعد. طبّق ترحيل vetra_client_activity على قاعدة VETRA CORE؛ ستظل قائمة الإشعارات متاحة.",
    noVisitsYet: "لم تصل زيارات مسجلة بعد. انشر آخر نسخة من بوابة العملاء، ثم اطلب من العميل فتح البوابة أو تحديثها مرة واحدة. لن تُضاف الزيارات السابقة بأثر رجعي.",
    authError: "انتهت جلسة العيادة. سجّل الدخول مرة أخرى.",
    configurationError: "إعدادات الخادم غير مكتملة لتحميل نشاط العملاء.",
    name: "الاسم",
    phone: "الهاتف",
    seen: "آخر زيارة",
    online: "متصل الآن",
    minute: "دقيقة",
    hour: "ساعة",
    justNow: "الآن",
  },
  en: {
    back: "Back to clinic",
    title: "Client activity",
    subtitle: "See clients online, recent portal visits, and notification subscriptions.",
    active: "Active now",
    last24: "Visited in the last 24 hours",
    notifications: "Notifications enabled",
    loading: "Loading client activity...",
    empty: "There are no clients in this list right now.",
    refresh: "Refresh lists",
    updated: "Last updated",
    error: "Could not load client activity. Try refreshing the page.",
    migrationRequired: "Visit tracking is not installed yet. Apply the vetra_client_activity migration to VETRA CORE. Notification subscriptions are still available.",
    noVisitsYet: "No visits have been recorded yet. Deploy the latest client portal, then ask a client to open or refresh it once. Earlier visits are not backfilled.",
    authError: "Your clinic session expired. Sign in again.",
    configurationError: "Server configuration is incomplete for client activity.",
    name: "Name",
    phone: "Phone",
    seen: "Last visit",
    online: "Online now",
    minute: "min ago",
    hour: "hr ago",
    justNow: "Just now",
  },
} as const;

function relativeTime(value: string | null, language: Language, text: typeof words[Language]) {
  if (!value) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes === 0) return text.justNow;
  if (minutes < 60) return `${minutes} ${text.minute}`;
  return `${Math.floor(minutes / 60)} ${text.hour}`;
}

export default function ClientActivityPage() {
  const [language, setLanguage] = useState<Language>("ar");
  const [dark, setDark] = useState(true);
  const [data, setData] = useState<ActivityData>({ activeClients: [], visitedLast24Hours: [], notificationsEnabled: [], activityTrackingAvailable: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const t = words[language];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (localStorage.getItem("vetra-language") === "en") setLanguage("en");
      setDark(localStorage.getItem("vetra-theme") !== "light");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const loadActivity = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const { data: sessionData, error: sessionError } = await vetraCore.auth.getSession();
      const token = sessionData.session?.access_token;
      if (sessionError || !token) throw new Error("Clinic session expired");
      const response = await fetch("/api/client-activity", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = await response.json() as ActivityData & { error?: string; code?: string; generatedAt?: string };
      if (!response.ok) {
        if (result.code === "clinic_auth_required") throw new Error("clinic_auth_required");
        if (result.code === "server_config_missing") throw new Error("server_config_missing");
        throw new Error(result.error || "Could not load client activity");
      }
      setData(result);
      setUpdatedAt(result.generatedAt || new Date().toISOString());
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(message.includes("Clinic session expired") || message === "clinic_auth_required"
        ? t.authError
        : message === "server_config_missing" ? t.configurationError : t.error);
    } finally {
      setLoading(false);
    }
  }, [t.error, t.authError, t.configurationError]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadActivity(true), 0);
    const timer = window.setInterval(() => void loadActivity(), 30_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [loadActivity]);

  const card = dark ? "border-white/10 bg-[#171B22]" : "border-slate-200 bg-white";
  const muted = dark ? "text-slate-400" : "text-slate-500";

  function renderList(title: string, clients: ActivityClient[], kind: "active" | "visited" | "notifications") {
    return (
      <section className={`rounded-3xl border p-5 sm:p-6 ${card}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black">{title}</h2>
          <span className="rounded-full bg-teal-500/10 px-3 py-1 text-sm font-black text-teal-500">{clients.length}</span>
        </div>
        {loading ? <p className={`py-8 text-center text-sm ${muted}`}>{t.loading}</p> : clients.length === 0 ? <p className={`py-8 text-center text-sm ${muted}`}>{t.empty}</p> : (
          <ul className="divide-y divide-slate-500/10">
            {clients.map((client) => (
              <li key={client.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-1 last:pb-1">
                <div className="min-w-0">
                  <p className="truncate font-bold">{client.name || "—"}</p>
                  {client.phone && <p className={`mt-1 text-xs ${muted}`}>{t.phone}: {client.phone}</p>}
                </div>
                <span className={`shrink-0 text-xs ${kind === "active" ? "font-bold text-emerald-500" : muted}`}>
                  {kind === "active" ? `● ${t.online}` : kind === "visited" ? `${t.seen}: ${relativeTime(client.lastSeenAt, language, t)}` : (language === "ar" ? "مفعّلة" : "Enabled")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <main dir={language === "ar" ? "rtl" : "ltr"} className={`min-h-screen px-4 py-6 pb-24 sm:px-8 sm:py-10 ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}>
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/dashboard" className="text-sm font-bold text-teal-500">← {t.back}</Link>
            <h1 className="mt-3 text-3xl font-black sm:text-4xl">{t.title}</h1>
            <p className={`mt-2 max-w-2xl text-sm ${muted}`}>{t.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setLanguage((value) => { const next = value === "ar" ? "en" : "ar"; localStorage.setItem("vetra-language", next); return next; })} className={`rounded-xl border px-3 py-2 text-sm font-bold ${dark ? "border-white/10" : "border-slate-200"}`}>{language === "ar" ? "English" : "عربي"}</button>
            <button onClick={() => void loadActivity(true)} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white">{t.refresh}</button>
          </div>
        </header>

        {error && <p role="alert" className="mb-5 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-500">{error}</p>}
        {!error && !data.activityTrackingAvailable && <p role="status" className="mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-500">{t.migrationRequired}</p>}
        {!error && data.activityTrackingAvailable && data.visitedLast24Hours.length === 0 && <p role="status" className="mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-500">{t.noVisitsYet}</p>}
        {updatedAt && <p className={`mb-4 text-xs ${muted}`}>{t.updated}: {new Date(updatedAt).toLocaleTimeString(language === "ar" ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>}

        <div className="grid gap-4 xl:grid-cols-3">
          {renderList(t.active, data.activeClients, "active")}
          {renderList(t.last24, data.visitedLast24Hours, "visited")}
          {renderList(t.notifications, data.notificationsEnabled, "notifications")}
        </div>
      </div>
    </main>
  );
}
