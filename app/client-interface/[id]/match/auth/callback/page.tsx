"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";

export default function MatchAuthCallbackPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void vetraCore.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      const session = data.session;
      if (sessionError || !session?.user.email_confirmed_at) { setError("تعذر التحقق من الرابط. اطلب رابطًا جديدًا ثم افتحه من هذا الجهاز."); setBusy(false); return; }
      setToken(session.access_token);
      setName(typeof session.user.user_metadata?.display_name === "string" ? session.user.user_metadata.display_name : "");
      void fetch("/api/match/profile", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" })
        .then((r) => r.json()).then((result) => {
          if (!active) return;
          if (result.profile) router.replace(`/client-interface/${encodeURIComponent(id)}/match`);
          else setBusy(false);
        }).catch(() => { if (active) { setError("تعذر تحميل ملف الحساب."); setBusy(false); } });
    });
    return () => { active = false; };
  }, [id, router]);

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/match/profile", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "profile", displayName: name.trim(), termsAccepted: accepted, adultConfirmed: adult }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر إنشاء الملف.");
      router.replace(`/client-interface/${encodeURIComponent(id)}/match`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر إنشاء الملف."); setBusy(false); }
  }

  return <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#FAF8F4] p-4 font-[Tahoma,Arial,sans-serif] text-[#17324D]"><section className="w-full max-w-lg rounded-[2rem] border border-[#E7EAE6] bg-white p-7 shadow-xl"><p className="text-xs font-black tracking-[.16em] text-[#138780]">VETRA TINDER</p><h1 className="mt-2 text-2xl font-black">{busy ? "نتحقق من حسابك…" : "أكمل ملفك"}</h1>
    {error && <p role="alert" className="mt-4 rounded-xl bg-[#FFF0F1] p-3 text-sm text-[#9D4351]">{error}</p>}
    {!busy && token && <form onSubmit={createProfile} className="mt-5 space-y-4"><label className="block"><span className="mb-1 block text-xs font-bold text-[#657585]">الاسم الظاهر</span><input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="min-h-12 w-full rounded-xl border border-[#E7EAE6] bg-[#FAF8F4] px-3"/></label><div className="flex items-start gap-3 rounded-xl border border-[#E7EAE6] p-3"><input id="accept-match-terms" type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 accent-[#138780]"/><label htmlFor="accept-match-terms" className="text-xs leading-6 text-[#42596A]">أوافق على <a className="font-bold text-[#138780] underline" href="/match/terms" target="_blank">شروط الاستخدام</a> و<a className="font-bold text-[#138780] underline" href="/match/privacy" target="_blank">سياسة الخصوصية</a>.</label></div><label className="flex items-start gap-3 rounded-xl border border-[#E7EAE6] p-3 text-xs leading-6 text-[#42596A]"><input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1 accent-[#138780]"/>أؤكد أن عمري ١٨ عامًا أو أكثر.</label><button disabled={busy} className="min-h-12 w-full rounded-xl bg-[#138780] px-4 font-black text-white">إنشاء الملف والمتابعة</button></form>}
  </section></main>;
}
