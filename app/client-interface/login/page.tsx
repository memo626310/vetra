"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ClientLoginPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [dark, setDark] = useState(false);
  const [phone, setPhone] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("vetra-language");
    const savedTheme = window.localStorage.getItem("vetra-theme");

    if (savedLanguage === "ar") setLanguage("ar");
    if (savedTheme === "dark") setDark(true);
  }, []);

  const ar = language === "ar";

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setMessage("");

    const normalizedPhone = phone.trim();
    const normalizedCode = clientCode.trim().toUpperCase();

    if (!normalizedPhone || !normalizedCode) {
      setMessage(
        ar
          ? "من فضلك اكتب رقم التليفون و Client ID."
          : "Please enter your phone number and Client ID."
      );
      setLoading(false);
      return;
    }

    const { data: client, error } = await supabase
      .from("clients")
      .select("id, client_code")
      .eq("phone", normalizedPhone)
      .eq("client_code", normalizedCode)
      .maybeSingle();

    if (error || !client) {
      setMessage(
        ar
          ? "رقم التليفون أو Client ID غير صحيح."
          : "The phone number or Client ID is incorrect."
      );
      setLoading(false);
      return;
    }

    window.sessionStorage.setItem("vetra-client-id", client.id);
    window.sessionStorage.setItem("vetra-client-code", client.client_code);

    router.replace(`/client-interface/${client.id}`);
  }

  return (
    <main
      dir={ar ? "rtl" : "ltr"}
      className={`relative min-h-screen overflow-hidden transition-colors duration-700 ${
        dark ? "bg-[#07111C] text-white" : "bg-[#F8FBFF] text-slate-900"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[30rem] w-[30rem] rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute -right-32 bottom-[-5rem] h-[32rem] w-[32rem] rounded-full bg-blue-300/20 blur-3xl" />
        <div className="absolute left-[5%] top-[40%] rotate-[-18deg] text-8xl opacity-10">🐾</div>
        <div className="absolute right-[7%] top-[20%] rotate-[18deg] text-7xl opacity-10">🐾</div>
      </div>

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <button
          onClick={() => router.push("/client-interface")}
          className="flex items-center gap-3"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-2xl text-white shadow-xl dark:bg-white dark:text-slate-900">
            🐾
          </div>
          <div className="text-left">
            <div className="font-black tracking-[0.2em]">VETRA</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">
              Pet Care Portal
            </div>
          </div>
        </button>

        <div className="flex gap-2">
          <button
            onClick={() => setLanguage(ar ? "en" : "ar")}
            className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs font-bold backdrop-blur dark:border-white/10 dark:bg-white/5"
          >
            {ar ? "English" : "العربية"}
          </button>

          <button
            onClick={() => setDark((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-white/5"
          >
            {dark ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      <section className="relative z-10 flex min-h-[calc(100vh-90px)] items-center justify-center px-5 pb-10">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[3rem] border border-white/70 bg-white/70 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-white/5 lg:grid-cols-2">
          <div className="hidden min-h-[600px] items-center justify-center bg-slate-900 p-12 text-white lg:flex dark:bg-[#0B1825]">
            <div className="text-center">
              <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-full bg-white/10 text-[8rem] shadow-2xl">
                🐕
              </div>

              <div className="mt-10 text-xs font-bold uppercase tracking-[0.4em] text-cyan-300">
                VETRA
              </div>

              <h1 className="mt-4 text-4xl font-black">
                {ar ? "أهلاً بيك تاني 🐾" : "Welcome back 🐾"}
              </h1>

              <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-slate-300">
                {ar
                  ? "كل ما يخص حيوانك المميز، في مكان واحد."
                  : "Everything your hero pet needs, in one place."}
              </p>
            </div>
          </div>

          <div className="p-7 sm:p-12">
            <div className="mb-8">
              <div className="text-sm font-bold uppercase tracking-[0.25em] text-cyan-500">
                VETRA
              </div>

              <h2 className="mt-3 text-4xl font-black tracking-tight">
                {ar ? "تسجيل الدخول" : "Sign in"}
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-300">
                {ar
                  ? "استخدم رقم التليفون و Client ID للدخول لملفك."
                  : "Use your phone number and Client ID to access your pet care."}
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-bold">
                  {ar ? "رقم التليفون" : "Phone Number"}
                </span>

                <input
                  type="tel"
                  required
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10 dark:border-white/10 dark:bg-white/5"
                  placeholder="010XXXXXXXX"
                  dir="ltr"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold">
                  {ar ? "Client ID" : "Client ID"}
                </span>

                <input
                  type="text"
                  required
                  autoCapitalize="characters"
                  value={clientCode}
                  onChange={(e) => setClientCode(e.target.value.toUpperCase())}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 font-bold uppercase tracking-wider outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10 dark:border-white/10 dark:bg-white/5"
                  placeholder="VETRA-000125"
                  dir="ltr"
                />
              </label>

              {message && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">
                  {message}
                </div>
              )}

              <button
                disabled={loading}
                className="w-full rounded-2xl bg-slate-900 px-5 py-4 text-sm font-black text-white shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900"
              >
                {loading
                  ? ar
                    ? "جاري الدخول..."
                    : "Signing in..."
                  : ar
                    ? "دخول 🐾"
                    : "Sign in 🐾"}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-400">
              {ar
                ? "الـ Client ID موجود في ملفك لدى VETRA."
                : "Your Client ID is available in your VETRA client profile."}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
