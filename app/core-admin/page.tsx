"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";

type Status = "active" | "setup" | "suspended" | "deleted" | "provisioning" | "ready" | "paused" | "failed" | "trial" | "past_due" | "cancelled" | "expired";
type Plan = { id: string; code: string; name: string; monthly_price: number; yearly_price: number; is_active: boolean };
type Clinic = {
  id: string; name: string; city: string | null; country: string | null; status: Status; clinic_number: number;
  created_at: string; updated_at: string; owner_doctor_id: string;
  owner: { id: string; full_name: string; phone: string | null; status: string } | null;
  database: { provider: string; region: string | null; status: Status; project_ref: string; updated_at: string } | null;
  subscription: { status: Status; trial_ends_at: string | null; ends_at: string | null; plan: Plan | null } | null;
  doctors: Array<{ id: string; full_name: string; phone: string | null; status: string; role: string; membership_status: string }>;
};
type Activity = { id: number; user_id: string; clinic_id: string; route: string; page_label: string; event_type: string; created_at: string };
type DashboardData = {
  generatedAt: string;
  stats: Record<string, number | null>;
  plans: Plan[];
  clinics: Clinic[];
  doctors: Array<{ id: string; full_name: string; phone: string | null; status: string; created_at: string }>;
  activity: Activity[];
};

const statCards = [
  ["clinics", "العيادات", "🏥", "text-cyan-300", "bg-cyan-400/10"],
  ["activeSubscriptions", "الاشتراكات الحالية", "◈", "text-emerald-300", "bg-emerald-400/10"],
  ["doctors", "الأطباء والحسابات", "◉", "text-violet-300", "bg-violet-400/10"],
  ["readyDatabases", "قواعد جاهزة", "▣", "text-amber-300", "bg-amber-400/10"],
  ["pendingAdoptions", "طلبات تبنٍ معلقة", "♡", "text-pink-300", "bg-pink-400/10"],
  ["pendingBreeding", "طلبات تزاوج معلقة", "✦", "text-orange-300", "bg-orange-400/10"],
] as const;

function date(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function statusLabel(value: string | null | undefined) {
  const labels: Record<string, string> = { active: "نشطة", setup: "إعداد", suspended: "موقوفة", deleted: "محذوفة", provisioning: "جاري التجهيز", ready: "جاهزة", paused: "متوقفة", failed: "فشل", trial: "تجريبية", past_due: "متأخر", cancelled: "ملغى", expired: "منتهٍ" };
  return labels[value || ""] || value || "—";
}

function statusTone(value: string | null | undefined) {
  if (["active", "ready", "trial"].includes(value || "")) return "border-emerald-300/20 bg-emerald-400/10 text-emerald-200";
  if (["failed", "suspended", "deleted", "expired", "cancelled"].includes(value || "")) return "border-rose-300/20 bg-rose-400/10 text-rose-200";
  return "border-amber-300/20 bg-amber-400/10 text-amber-200";
}

export default function CoreAdminPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [token, setToken] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [operationBusy, setOperationBusy] = useState("");
  const [periodByClinic, setPeriodByClinic] = useState<Record<string, string>>({});
  const [planByClinic, setPlanByClinic] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Clinic | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError("");
    try {
      const { data: sessionData } = await vetraCore.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("سجّل الدخول بحساب مدير المنصة أولًا.");
      setToken(accessToken);
      const response = await fetch("/api/core-admin", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      const result = await response.json().catch(() => null) as DashboardData & { error?: string };
      if (!response.ok) throw new Error(result?.error || "تعذر تحميل لوحة التحكم.");
      setData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل لوحة التحكم.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const clinics = useMemo(() => (data?.clinics || []).filter((clinic) => {
    const haystack = [clinic.name, clinic.city, clinic.country, clinic.owner?.full_name, clinic.owner?.phone].filter(Boolean).join(" ").toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (status === "all" || clinic.status === status);
  }), [data?.clinics, query, status]);

  const refresh = () => { setRefreshing(true); void load(false); };
  const signOut = async () => { await vetraCore.auth.signOut(); router.push("/login"); };
  const total = (key: string) => data?.stats[key] ?? 0;
  const operate = async (payload: Record<string, string>, busyKey: string) => {
    setOperationBusy(busyKey); setOperationError("");
    try {
      const response = await fetch("/api/core-admin/operations", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "تعذر تنفيذ العملية.");
      await load(false);
      return true;
    } catch (cause) { setOperationError(cause instanceof Error ? cause.message : "تعذر تنفيذ العملية."); return false; }
    finally { setOperationBusy(""); }
  };
  const doctorName = (id: string) => data?.doctors.find((doctor) => doctor.id === id)?.full_name || "حساب غير معروف";
  const clinicNameById = (id: string) => data?.clinics.find((clinic) => clinic.id === id)?.name || "عيادة";
  const deleteClinic = async () => {
    if (!deleteTarget || deleteConfirmation !== deleteTarget.name) return;
    const deleted = await operate({ action: "clinic_delete", clinicId: deleteTarget.id, confirmationName: deleteConfirmation }, `clinic-delete:${deleteTarget.id}`);
    if (deleted) { setDeleteTarget(null); setDeleteConfirmation(""); }
  };

  return (
    <main dir="rtl" className="min-h-screen bg-[#0a0f16] text-slate-100">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-7 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[.08] pb-5">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-cyan-300 to-violet-500 text-2xl text-slate-950 shadow-lg shadow-cyan-500/10">✦</div>
            <div>
              <p className="text-xs font-bold tracking-[.2em] text-cyan-300">VETRA CORE</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">لوحة التحكم المركزية</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-200 sm:inline-flex">● النظام يعمل</span>
            <button type="button" onClick={refresh} disabled={refreshing} className="rounded-xl border border-white/10 bg-white/[.05] px-4 py-2.5 text-sm font-bold transition hover:bg-white/[.1] disabled:opacity-50">{refreshing ? "جاري التحديث…" : "تحديث البيانات"}</button>
            <button type="button" onClick={() => void signOut()} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:border-rose-300/30 hover:text-rose-200">خروج</button>
          </div>
        </header>

        {error && <div role="alert" className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div>}
        {operationError && <div role="alert" className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{operationError}</div>}
        {loading && !data ? <div className="grid min-h-[50vh] place-items-center"><div className="flex items-center gap-3 text-slate-400"><span className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-cyan-300" /> جاري تحميل بيانات VETRA Core…</div></div> : !data ? (
          <section className="mx-auto mt-12 max-w-2xl rounded-2xl border border-amber-300/20 bg-[#101722] p-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-400/10 text-2xl text-amber-300">!</div>
            <h2 className="mt-4 text-xl font-black">اللوحة تحتاج إلى إعداد مدير المنصة</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">{error || "تعذر قراءة بيانات VETRA Core."}</p>
            <button type="button" onClick={refresh} disabled={refreshing} className="mt-5 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-50">إعادة المحاولة</button>
          </section>
        ) : (
          <>
            <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {statCards.map(([key, label, icon, color, bg]) => <article key={key} className="rounded-2xl border border-white/[.08] bg-[#101722] p-4 shadow-xl shadow-black/10">
                <div className="flex items-start justify-between"><span className={`grid h-10 w-10 place-items-center rounded-xl ${bg} text-xl ${color}`}>{icon}</span><span className="text-xs text-slate-500">Core</span></div>
                <p className="mt-5 text-3xl font-black tracking-tight">{total(key)}</p><p className="mt-1 text-sm text-slate-400">{label}</p>
              </article>)}
            </section>

            <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
              <div className="rounded-2xl border border-white/[.08] bg-[#101722] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h2 className="text-lg font-black">العيادات المسجلة</h2><p className="mt-1 text-sm text-slate-400">إدارة ومراقبة حالة كل عيادة وقاعدة بياناتها</p></div>
                  <div className="flex w-full gap-2 sm:w-auto"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم العيادة أو المالك" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0b111b] px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-300/50 sm:w-64" /><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-white/10 bg-[#0b111b] px-3 py-2.5 text-sm outline-none focus:border-cyan-300/50"><option value="all">كل الحالات</option><option value="active">نشطة</option><option value="setup">إعداد</option><option value="suspended">موقوفة</option><option value="deleted">محذوفة</option></select></div>
                </div>
                <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-right text-sm"><thead><tr className="border-b border-white/[.08] text-xs text-slate-500"><th className="px-3 py-3 font-bold">العيادة</th><th className="px-3 py-3 font-bold">المالك</th><th className="px-3 py-3 font-bold">الحالة</th><th className="px-3 py-3 font-bold">قاعدة البيانات</th><th className="px-3 py-3 font-bold">الخطة</th><th className="px-3 py-3 font-bold">التسجيل</th></tr></thead><tbody>{clinics.map((clinic) => <tr key={clinic.id} className="border-b border-white/[.05] transition hover:bg-white/[.03]"><td className="px-3 py-4"><div className="font-bold">{clinic.name}</div><div className="mt-1 text-xs text-slate-500">#{clinic.clinic_number} · {[clinic.city, clinic.country].filter(Boolean).join("، ") || "بدون موقع"}</div></td><td className="px-3 py-4"><div>{clinic.owner?.full_name || "غير مرتبط"}</div><div className="mt-1 text-xs text-slate-500">{clinic.owner?.phone || "—"}</div></td><td className="px-3 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(clinic.status)}`}>{statusLabel(clinic.status)}</span></td><td className="px-3 py-4"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${clinic.database?.status === "ready" ? "bg-emerald-300" : "bg-amber-300"}`} />{statusLabel(clinic.database?.status)} </div><div className="mt-1 text-xs text-slate-500">{clinic.database?.region || clinic.database?.provider || "غير مضافة"}</div></td><td className="px-3 py-4"><div>{clinic.subscription?.plan?.name || "بدون اشتراك"}</div><div className={`mt-1 text-xs ${clinic.subscription ? "text-emerald-300" : "text-slate-500"}`}>{statusLabel(clinic.subscription?.status)}</div></td><td className="px-3 py-4 text-xs text-slate-400">{date(clinic.created_at)}</td></tr>)}{!clinics.length && <tr><td colSpan={6} className="px-3 py-12 text-center text-slate-500">لا توجد عيادات مطابقة للبحث.</td></tr>}</tbody></table></div>
                <div className="mt-5 space-y-3">{clinics.map((clinic) => <details key={`${clinic.id}-manage`} className="rounded-xl border border-white/[.07] bg-[#0b111b]"><summary className="cursor-pointer px-4 py-3 text-sm font-bold">إدارة {clinic.name} · الأطباء: {clinic.doctors.length}</summary><div className="space-y-4 border-t border-white/[.07] p-4"><div className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs text-slate-400">مدة الاشتراك<select value={periodByClinic[clinic.id] || "monthly"} onChange={(event) => setPeriodByClinic((old) => ({ ...old, [clinic.id]: event.target.value }))} className="rounded-lg border border-white/10 bg-[#101722] px-3 py-2 text-sm text-white"><option value="monthly">شهر</option><option value="two_months">شهران</option><option value="yearly">سنة</option><option value="lifetime">مدى الحياة</option></select></label><label className="grid gap-1 text-xs text-slate-400">الخطة<select value={planByClinic[clinic.id] || clinic.subscription?.plan?.id || data.plans[0]?.id || ""} onChange={(event) => setPlanByClinic((old) => ({ ...old, [clinic.id]: event.target.value }))} className="rounded-lg border border-white/10 bg-[#101722] px-3 py-2 text-sm text-white">{data.plans.filter((plan) => plan.is_active).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label><button type="button" disabled={!!operationBusy || !data.plans.length} onClick={() => void operate({ action: "subscription_set", clinicId: clinic.id, period: periodByClinic[clinic.id] || "monthly", planId: planByClinic[clinic.id] || clinic.subscription?.plan?.id || data.plans[0]?.id || "" }, `subscription:${clinic.id}`)} className="rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50">{operationBusy === `subscription:${clinic.id}` ? "جارٍ الحفظ…" : "تحديث الاشتراك"}</button>{clinic.subscription?.ends_at && <span className="text-xs text-slate-500">ينتهي {date(clinic.subscription.ends_at)}</span>}{clinic.subscription?.status === "active" && !clinic.subscription.ends_at && <span className="text-xs text-emerald-300">اشتراك مدى الحياة</span>}<button type="button" onClick={() => { setDeleteTarget(clinic); setDeleteConfirmation(""); }} className="rounded-lg border border-rose-300/20 px-4 py-2.5 text-sm font-bold text-rose-200">حذف العيادة بالكامل</button></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-right text-xs"><thead><tr className="text-slate-500"><th className="px-2 py-2">الطبيب</th><th className="px-2 py-2">الهاتف</th><th className="px-2 py-2">الدور</th><th className="px-2 py-2">الحالة</th><th className="px-2 py-2">إجراءات الحساب</th></tr></thead><tbody>{clinic.doctors.map((doctor) => <tr key={doctor.id} className="border-t border-white/[.06]"><td className="px-2 py-3 font-bold">{doctor.full_name}</td><td className="px-2 py-3 text-slate-400">{doctor.phone || "—"}</td><td className="px-2 py-3">{doctor.role === "owner" ? "مالك" : doctor.role === "admin" ? "مدير" : doctor.role === "reception" ? "استقبال" : doctor.role === "manager" ? "مدير" : "طبيب"}</td><td className="px-2 py-3">{statusLabel(doctor.status === "suspended" || doctor.membership_status === "suspended" ? "suspended" : "active")}</td><td className="px-2 py-3"><div className="flex gap-2"><button type="button" disabled={!!operationBusy} onClick={() => void operate({ action: "doctor_status", doctorId: doctor.id, period: doctor.status === "suspended" ? "active" : "suspended" }, `doctor:${doctor.id}`)} className="rounded-lg border border-amber-300/20 px-2.5 py-1.5 text-amber-200">{doctor.status === "suspended" ? "استعادة" : "إيقاف"}</button><button type="button" disabled={!!operationBusy} onClick={() => { if (window.confirm(`حذف حساب ${doctor.full_name}؟ لا يمكن التراجع عن هذا الإجراء.`)) void operate({ action: "doctor_delete", doctorId: doctor.id }, `delete:${doctor.id}`); }} className="rounded-lg border border-rose-300/20 px-2.5 py-1.5 text-rose-200">حذف كامل</button></div></td></tr>)}{!clinic.doctors.length && <tr><td colSpan={5} className="px-2 py-5 text-center text-slate-500">لا يوجد أطباء مرتبطون بهذه العيادة.</td></tr>}</tbody></table></div></div></details>)}</div>
              </div>

              <aside className="space-y-5">
                <section className="rounded-2xl border border-white/[.08] bg-[#101722] p-5"><div className="flex items-center justify-between"><div><h2 className="font-black">نشاط الأطباء</h2><p className="mt-1 text-xs text-slate-500">آخر الأقسام التي فتحوها في النظام</p></div><span className="text-xs text-cyan-300">{data.activity.length} حدث</span></div><div className="mt-4 max-h-[500px] space-y-2 overflow-y-auto">{data.activity.slice(0, 60).map((event) => <div key={event.id} className="rounded-xl border border-white/[.06] bg-[#0b111b] p-3"><div className="flex items-start justify-between gap-2"><div className="font-bold">{doctorName(event.user_id)}</div><time className="shrink-0 text-[10px] text-slate-500">{new Intl.DateTimeFormat("ar-EG", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(event.created_at))}</time></div><div className="mt-1 text-xs text-cyan-200">{event.page_label}</div><div className="mt-1 text-[10px] text-slate-500">{clinicNameById(event.clinic_id)} · {event.route}</div></div>)}{!data.activity.length && <p className="py-4 text-center text-xs text-slate-500">سجلات النشاط ستظهر بعد تثبيت ترحيل النشاط والتنقل بين أقسام النظام.</p>}</div></section>
                <section className="rounded-2xl border border-white/[.08] bg-[#101722] p-5"><div className="flex items-center justify-between"><div><h2 className="font-black">صحة المنصة</h2><p className="mt-1 text-xs text-slate-500">آخر قراءة مباشرة من VETRA Core</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">✓</span></div><div className="mt-5 space-y-3 text-sm"><div className="flex items-center justify-between"><span className="text-slate-400">قواعد البيانات الجاهزة</span><b>{total("readyDatabases")} / {total("databases")}</b></div><div className="flex items-center justify-between"><span className="text-slate-400">أجهزة الإشعارات</span><b>{total("pushSubscriptions")}</b></div><div className="flex items-center justify-between"><span className="text-slate-400">أعضاء العيادات</span><b>{total("members")}</b></div><div className="flex items-center justify-between"><span className="text-slate-400">آخر تحديث</span><b className="text-xs text-slate-300">{date(data?.generatedAt)}</b></div></div></section>
                <section className="rounded-2xl border border-white/[.08] bg-[#101722] p-5"><h2 className="font-black">خطوات سريعة</h2><div className="mt-4 grid gap-2"><Link href="/dashboard/match-moderation" className="rounded-xl border border-white/10 bg-white/[.03] px-3 py-3 text-sm font-bold transition hover:border-cyan-300/30 hover:bg-cyan-300/[.06]">مراجعة VETRA Tinder <span className="float-left text-cyan-300">↗</span></Link><Link href="/dashboard" className="rounded-xl border border-white/10 bg-white/[.03] px-3 py-3 text-sm font-bold transition hover:border-cyan-300/30 hover:bg-cyan-300/[.06]">العودة لمساحة العيادة <span className="float-left text-cyan-300">↗</span></Link></div></section>
                <section className="rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[.1] to-violet-400/[.06] p-5"><p className="text-xs font-bold tracking-widest text-cyan-300">PLATFORM ADMIN</p><p className="mt-3 text-sm leading-7 text-slate-300">هذه الشاشة تقرأ بيانات VETRA Core فقط. بيانات العيادات التشغيلية تظل داخل قواعدها المعزولة.</p></section>
              </aside>
            </section>
          </>
        )}
        <footer className="mt-7 border-t border-white/[.07] pt-4 text-xs text-slate-600">VETRA Core · لوحة تشغيل المنصة · {token ? "جلسة موثقة" : ""}</footer>
      </div>
      {deleteTarget && <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}><section role="dialog" aria-modal="true" aria-labelledby="delete-clinic-title" className="w-full max-w-lg rounded-2xl border border-rose-300/20 bg-[#101722] p-6 shadow-2xl"><h2 id="delete-clinic-title" className="text-xl font-black text-rose-200">حذف العيادة وكل بياناتها</h2><p className="mt-3 text-sm leading-7 text-slate-300">سيُحذف مشروع قاعدة بيانات Supabase للعيادة وكل بياناتها وملفاتها، ثم سجلاتها المركزية والاشتراكات والعضويات. هذا الإجراء نهائي.</p><p className="mt-3 text-sm text-slate-400">اكتب اسم العيادة للتأكيد: <b className="text-white">{deleteTarget.name}</b></p><input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-[#0b111b] px-4 py-3 text-sm outline-none focus:border-rose-300/50"/><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeleteTarget(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold">إلغاء</button><button type="button" disabled={deleteConfirmation !== deleteTarget.name || !!operationBusy} onClick={() => void deleteClinic()} className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">{operationBusy === `clinic-delete:${deleteTarget.id}` ? "جارٍ الحذف…" : "حذف نهائي"}</button></div></section></div>}
    </main>
  );
}
