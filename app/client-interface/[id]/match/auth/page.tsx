"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";

export default function MatchAuthPage() {
  const { id } = useParams<{ id: string }>();
  const [ar, setAr] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Restore the portal locale after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAr(window.localStorage.getItem("vetra-language") !== "en");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    if (!accepted) { setError(ar ? "وافق على شروط الاستخدام وسياسة الخصوصية للمتابعة." : "Accept the terms and privacy policy to continue."); setBusy(false); return; }
    try {
      const redirect = `${window.location.origin}/client-interface/${encodeURIComponent(id)}/match/auth/callback`;
      const { error: authError } = await vetraCore.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: redirect, data: { display_name: name.trim() } },
      });
      if (authError) throw authError;
      setSent(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : (ar ? "تعذر إرسال رابط التحقق." : "Could not send the verification link.")); }
    finally { setBusy(false); }
  }

  const t = ar ? { back: "العودة إلى VETRA Tinder", title: "حساب VETRA Tinder مستقل", body: "سجّل ببريد إلكتروني موثّق. هذا الحساب منفصل عن سجلات العيادات الطبية.", name: "الاسم الظاهر", email: "البريد الإلكتروني", accept: "أوافق على شروط الاستخدام وسياسة الخصوصية، وأؤكد أن بيانات الحيوان والصور تخصني أو لدي إذن بنشرها.", terms: "شروط الاستخدام", privacy: "سياسة الخصوصية", send: "إرسال رابط التحقق", sent: "أرسلنا رابطًا إلى بريدك. افتحه من الجهاز نفسه لإكمال تسجيل الدخول وتأكيد البريد.", required: "البريد الموثق مطلوب حاليًا. تسجيل الهاتف غير مفعّل حتى إعداد مزود رسائل موثوق." } : { back: "Back to VETRA Tinder", title: "Independent VETRA Tinder account", body: "Register with a verified email. This account is separate from clinic medical records.", name: "Display name", email: "Email address", accept: "I accept the Terms and Privacy Policy and confirm I own or have permission to publish the pet details and photos.", terms: "Terms of use", privacy: "Privacy policy", send: "Send verification link", sent: "A link was sent to your email. Open it on this device to finish sign-in and verify your address.", required: "A verified email is required for now. Phone sign-in is unavailable until a trusted SMS provider is configured." };

  return <main dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#FAF8F4] px-4 py-8 font-[Tahoma,Arial,sans-serif] text-[#17324D]">
    <div className="mx-auto max-w-xl"><Link href={`/client-interface/${id}/match`} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-bold text-[#138780]">{ar ? "→" : "←"} {t.back}</Link>
      <section className="mt-4 rounded-[2rem] border border-[#E7EAE6] bg-white p-6 shadow-[0_20px_70px_rgba(23,50,77,.08)] sm:p-9">
        <div className="flex items-center gap-3"><Image src="/vetra-tinder-logo.png" alt="VETRA Tinder" width={72} height={72} className="h-16 w-16 object-contain"/><div><p className="text-xs font-black tracking-[.16em] text-[#138780]">VETRA · PET COMMUNITY</p><h1 className="mt-1 text-2xl font-black">{t.title}</h1></div></div>
        <p className="mt-4 text-sm leading-7 text-[#657585]">{t.body}</p>
        <p className="mt-2 rounded-xl bg-[#E6F6F0] p-3 text-xs leading-6 text-[#275A5B]">{t.required}</p>
        {sent ? <p role="status" className="mt-6 rounded-2xl border border-[#BFE8DB] bg-[#E6F6F0] p-5 text-sm font-bold leading-7 text-[#275A5B]">{t.sent}</p> : <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block"><span className="mb-1 block text-xs font-bold text-[#657585]">{t.name}</span><input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="min-h-12 w-full rounded-xl border border-[#E7EAE6] bg-[#FAF8F4] px-3 outline-none focus:border-[#138780]"/></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-[#657585]">{t.email}</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="min-h-12 w-full rounded-xl border border-[#E7EAE6] bg-[#FAF8F4] px-3 outline-none focus:border-[#138780]"/></label>
          <div className="flex items-start gap-3 rounded-xl border border-[#E7EAE6] p-3"><input id="match-terms" type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 h-4 w-4 accent-[#138780]"/><label htmlFor="match-terms" className="text-xs leading-6 text-[#42596A]">{t.accept} <Link className="font-bold text-[#138780] underline" href="/match/terms" target="_blank">{t.terms}</Link> · <Link className="font-bold text-[#138780] underline" href="/match/privacy" target="_blank">{t.privacy}</Link></label></div>
          {error && <p role="alert" className="rounded-xl bg-[#FFF0F1] p-3 text-sm text-[#9D4351]">{error}</p>}
          <button disabled={busy} className="min-h-12 w-full rounded-xl bg-[#138780] px-5 text-sm font-black text-white disabled:opacity-50">{busy ? (ar ? "جاري الإرسال…" : "Sending…") : t.send}</button>
        </form>}
      </section>
    </div>
  </main>;
}
