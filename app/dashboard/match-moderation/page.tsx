"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { vetraCore } from "@/lib/vetra-core";

type Listing = { id: string; name: string; species: string; breed: string | null; city: string; description: string; photo_url: string | null; status: string; gender?: string; health_review_status?: string; reproductive_review_status?: string; welfare_review_status?: string; is_demo: boolean };
type Report = { id: string; target_listing_id: string; listing_type: string; reason: string; status: string };

export default function MatchModerationPage() {
  const [token, setToken] = useState("");
  const [role, setRole] = useState("");
  const [adoption, setAdoption] = useState<Listing[]>([]);
  const [breeding, setBreeding] = useState<Listing[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [health, setHealth] = useState<Record<string, boolean>>({});
  const [reproductive, setReproductive] = useState<Record<string, boolean>>({});
  const [welfare, setWelfare] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await vetraCore.auth.getSession();
    const session = data.session;
    if (!session?.access_token) { setError("سجّل الدخول بحساب مراجعة معتمد في VETRA Core."); return; }
    setToken(session.access_token);
    const response = await fetch("/api/match/moderation", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "تعذر تحميل قائمة المراجعة."); return; }
    setAdoption(result.adoption || []); setBreeding(result.breeding || []); setReports(result.reports || []); setRole(result.role || ""); setError("");
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function moderate(type: string, listingId: string, decision: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/match/moderation", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ type, listingId, decision, healthReviewed: health[listingId] === true, reproductiveReviewed: reproductive[listingId] === true, welfareReviewed: welfare[listingId] === true }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر حفظ القرار."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر حفظ القرار."); }
    finally { setBusy(false); }
  }
  async function reviewReport(reportId: string, decision: string) {
    setBusy(true); setError("");
    try { const response = await fetch("/api/match/moderation", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "report", reportId, decision }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر تحديث البلاغ."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تحديث البلاغ."); } finally { setBusy(false); }
  }
  const renderListing = (item: Listing, type: "adoption" | "breeding") => <article key={item.id} className="rounded-2xl border border-[#E7EAE6] bg-white p-4 shadow-sm"><div className="flex gap-4">{item.photo_url && <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#E6F6F0]"><Image src={item.photo_url} alt={item.name} fill unoptimized sizes="96px" className="object-cover"/></div>}<div className="min-w-0"><h3 className="font-black">{item.name} · {item.species} {item.breed ? `· ${item.breed}` : ""}</h3><p className="mt-1 text-xs text-[#657585]">{item.city} · {item.gender || ""}</p><p className="mt-2 text-sm leading-6">{item.description}</p></div></div>{type === "breeding" && <div className="mt-4 grid gap-2 rounded-xl bg-[#F4FBF8] p-3 text-xs sm:grid-cols-3"><label className="flex gap-2"><input type="checkbox" checked={health[item.id] || false} onChange={(e) => setHealth((old) => ({ ...old, [item.id]: e.target.checked }))}/>اجتاز الفحص الصحي</label><label className="flex gap-2"><input type="checkbox" checked={reproductive[item.id] || false} onChange={(e) => setReproductive((old) => ({ ...old, [item.id]: e.target.checked }))}/>اجتاز فحص الأهلية التناسلية</label><label className="flex gap-2"><input type="checkbox" checked={welfare[item.id] || false} onChange={(e) => setWelfare((old) => ({ ...old, [item.id]: e.target.checked }))}/>اجتاز مراجعة الرفاه</label></div>}<div className="mt-4 flex flex-wrap gap-2"><button disabled={busy || (type === "breeding" && !["veterinarian", "admin"].includes(role))} onClick={() => void moderate(type, item.id, "approve")} className="min-h-10 rounded-lg bg-[#138780] px-4 text-xs font-black text-white disabled:opacity-40">موافقة ونشر</button><button disabled={busy} onClick={() => void moderate(type, item.id, "reject")} className="min-h-10 rounded-lg border border-[#E7EAE6] px-4 text-xs font-bold">رفض</button><button disabled={busy} onClick={() => void moderate(type, item.id, "unpublish")} className="min-h-10 rounded-lg border border-[#E7EAE6] px-4 text-xs font-bold">إيقاف النشر</button></div></article>;

  return <main dir="rtl" className="min-h-screen bg-[#FAF8F4] px-4 py-6 font-[Tahoma,Arial,sans-serif] text-[#17324D] sm:p-8"><div className="mx-auto max-w-5xl"><header className="flex items-center justify-between"><div><p className="text-xs font-black tracking-widest text-[#138780]">VETRA TINDER</p><h1 className="mt-1 text-3xl font-black">مراجعة الملفات والبلاغات</h1></div><div className="flex gap-2"><button onClick={() => void load()} className="min-h-10 rounded-xl border border-[#E7EAE6] bg-white px-3 text-xs font-bold">تحديث</button><Link href="/dashboard" className="inline-flex min-h-10 items-center rounded-xl border border-[#E7EAE6] bg-white px-3 text-xs font-bold">العودة للوحة</Link></div></header>{error && <p role="alert" className="mt-4 rounded-xl bg-[#FFF0F1] p-3 text-sm text-[#9D4351]">{error}</p>}<p className="mt-3 text-sm text-[#657585]">صلاحيتك: {role || "غير معروفة"}. موافقة التزاوج تتطلب طبيبًا بيطريًا أو مدير المنصة مع اعتماد الفحوص الثلاثة.</p>
    <section className="mt-7"><h2 className="mb-3 text-xl font-black">طلبات التبني ({adoption.length})</h2><div className="space-y-3">{adoption.map((item) => renderListing(item, "adoption"))}{!adoption.length && <p className="rounded-xl bg-white p-5 text-sm text-[#657585]">لا توجد طلبات تبنٍ قيد المراجعة.</p>}</div></section>
    <section className="mt-7"><h2 className="mb-3 text-xl font-black">ملفات التزاوج ({breeding.length})</h2><div className="space-y-3">{breeding.map((item) => renderListing(item, "breeding"))}{!breeding.length && <p className="rounded-xl bg-white p-5 text-sm text-[#657585]">لا توجد طلبات تزاوج قيد المراجعة.</p>}</div></section>
    <section className="mt-7"><h2 className="mb-3 text-xl font-black">البلاغات المفتوحة ({reports.length})</h2><div className="space-y-3">{reports.map((report) => <article key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E7EAE6] bg-white p-4"><p className="text-sm">{report.reason} <span className="text-xs text-[#657585]">({report.listing_type})</span></p><div className="flex gap-2"><button disabled={busy} onClick={() => void reviewReport(report.id, "resolved")} className="rounded-lg bg-[#138780] px-3 py-2 text-xs font-bold text-white">تمت المراجعة</button><button disabled={busy} onClick={() => void reviewReport(report.id, "dismissed")} className="rounded-lg border border-[#E7EAE6] px-3 py-2 text-xs font-bold">إغلاق البلاغ</button></div></article>)}{!reports.length && <p className="rounded-xl bg-white p-5 text-sm text-[#657585]">لا توجد بلاغات مفتوحة.</p>}</div></section>
  </div></main>;
}
