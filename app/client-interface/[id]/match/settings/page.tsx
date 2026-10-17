"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";

export default function MatchSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState({ clientCode: "", phone: "" });
  useEffect(() => {
    // Restore the account type after the first render.
    void vetraCore.auth.getSession().then(({ data }) => setToken(data.session?.access_token || ""));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOwner({
      clientCode: window.localStorage.getItem("vetra-client-code") || window.sessionStorage.getItem("vetra-client-code") || "",
      phone: window.localStorage.getItem("vetra-client-phone") || window.sessionStorage.getItem("vetra-client-phone") || "",
    });
  }, []);

  async function deleteAccount() {
    if (!window.confirm("هل تريد حذف حساب Tinder المستقل وكل ملفات الحيوانات والمحادثات والاهتمامات المرتبطة به؟ لا يمكن التراجع عن الحذف.")) return;
    setBusy(true); setError("");
    try {
      if (!token) throw new Error("سجّل الدخول إلى حساب Tinder أولًا.");
      const response = await fetch("/api/match/profile", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر حذف الحساب.");
      await vetraCore.auth.signOut(); router.replace(`/client-interface/${encodeURIComponent(id)}/match`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر حذف الحساب."); setBusy(false); }
  }
  async function clearClientMatchData() {
    if (!window.confirm("حذف ملفات Tinder والاهتمامات والبلاغات والمحادثات المرتبطة بحساب العميل؟ سيظل حساب VETRA والسجل الطبي كما هما.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/match/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(owner) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر حذف بيانات Tinder.");
      setError("تم حذف بيانات VETRA Tinder المرتبطة بحسابك.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر حذف بيانات Tinder."); }
    finally { setBusy(false); }
  }

  return <main dir="rtl" className="min-h-screen bg-[#FAF8F4] p-4 font-[Tahoma,Arial,sans-serif] text-[#17324D] sm:p-8"><div className="mx-auto max-w-2xl"><Link href={`/client-interface/${id}/match`} className="text-sm font-bold text-[#138780]">← العودة إلى VETRA Tinder</Link><section className="mt-4 rounded-3xl border border-[#E7EAE6] bg-white p-6 shadow-sm"><h1 className="text-2xl font-black">إعدادات حساب VETRA Tinder</h1><p className="mt-3 text-sm leading-7 text-[#657585]">يمكنك مراجعة <Link href="/match/privacy" className="font-bold text-[#138780] underline">سياسة الخصوصية</Link> و<Link href="/match/terms" className="font-bold text-[#138780] underline">شروط الاستخدام</Link> وإدارة بياناتك.</p>{token ? <button onClick={() => void deleteAccount()} disabled={busy} className="mt-6 min-h-11 rounded-xl border border-[#F3C8CE] bg-[#FFF0F1] px-4 text-sm font-black text-[#9D4351] disabled:opacity-50">{busy ? "جاري الحذف…" : "حذف حساب Tinder المستقل وبياناته"}</button> : owner.clientCode && owner.phone ? <button onClick={() => void clearClientMatchData()} disabled={busy} className="mt-6 min-h-11 rounded-xl border border-[#F3C8CE] bg-[#FFF0F1] px-4 text-sm font-black text-[#9D4351] disabled:opacity-50">{busy ? "جاري الحذف…" : "حذف بيانات Tinder المرتبطة بحساب VETRA"}</button> : <p className="mt-5 text-sm text-[#657585]">سجّل الدخول لعرض خيارات الحساب.</p>}{error && <p role="status" className="mt-4 rounded-xl bg-[#E6F6F0] p-3 text-sm text-[#275A5B]">{error}</p>}</section></div></main>;
}
