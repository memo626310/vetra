"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";
import { supabase } from "@/lib/supabase";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ar = language === "ar";

  useEffect(() => {
    window.setTimeout(() => setLanguage(localStorage.getItem("vetra-language") === "en" ? "en" : "ar"), 0);
    void vetraCore.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) {
        router.replace("/login");
        return;
      }
      const response = await fetch("/api/staff/auth-state", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const state = await response.json().catch(() => null) as { mustChangePassword?: boolean } | null;
      if (response.ok && state && !state.mustChangePassword) router.replace("/dashboard");
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 10) {
      setError(ar ? "كلمة المرور يجب ألا تقل عن 10 أحرف." : "Password must be at least 10 characters.");
      return;
    }
    if (password !== confirm) {
      setError(ar ? "كلمتا المرور غير متطابقتين." : "Passwords do not match.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data, error: sessionError } = await vetraCore.auth.getSession();
      if (sessionError || !data.session?.access_token) throw new Error(ar ? "انتهت الجلسة. سجّل الدخول مرة أخرى." : "Your session expired. Sign in again.");
      const response = await fetch("/api/staff/change-password", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || (ar ? "تعذر تغيير كلمة المرور." : "Could not change password."));

      await Promise.all([
        vetraCore.auth.signOut(),
        supabase.auth.signOut(),
      ]);

      router.replace("/login");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : (ar ? "تعذر تغيير كلمة المرور." : "Could not change password."));
      setSaving(false);
    }
  }

  return <main dir={ar ? "rtl" : "ltr"} className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-4 py-8 text-slate-900 dark:bg-[#0f1115] dark:text-white">
    <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#181b21] sm:p-8">
      <p className="text-xs font-bold uppercase text-cyan-600">VETRA / SECURITY</p>
      <h1 className="mt-2 text-xl font-bold">{ar ? "غيّر كلمة المرور" : "Change your password"}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">{ar ? "كلمة المرور المؤقتة لم تعد صالحة للاستخدام. أنشئ كلمة مرور جديدة للمتابعة." : "Your temporary password must be replaced before you continue."}</p>
      {loading ? <p className="mt-6 text-sm text-slate-500">{ar ? "جارٍ التحقق من الحساب..." : "Verifying account..."}</p> : <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
        <label className="block text-sm font-semibold">{ar ? "كلمة المرور الجديدة" : "New password"}<input required minLength={10} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 outline-none focus:border-cyan-500 dark:border-white/10 dark:bg-[#111419]" /></label>
        <label className="block text-sm font-semibold">{ar ? "تأكيد كلمة المرور" : "Confirm password"}<input required minLength={10} maxLength={128} type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 outline-none focus:border-cyan-500 dark:border-white/10 dark:bg-[#111419]" /></label>
        {error && <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
        <button disabled={saving} className="w-full rounded-lg bg-cyan-500 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{saving ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "حفظ ومتابعة" : "Save and continue")}</button>
      </form>}
    </section>
  </main>;
}
