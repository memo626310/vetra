"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getClientPortalDb } from "@/lib/client-portal-db";
import { clientPortalPhotos } from "../pet-photos";

export default function ClientLoginPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [dark, setDark] = useState(false);
  const [phone, setPhone] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);

  useEffect(() => {
    const savedLanguage =
      window.localStorage.getItem("vetra-language");

    const savedTheme =
      window.localStorage.getItem("vetra-theme");

    if (savedLanguage === "ar") {
      setLanguage("ar");
    }

    if (savedTheme === "dark") {
      setDark(true);
    }

    const previousPhoto = Number.parseInt(
      window.sessionStorage.getItem("vetra-login-photo") ?? "-1",
      10,
    );
    const photoChoices = clientPortalPhotos
      .map((_, index) => index)
      .filter((index) => index !== previousPhoto);
    const nextPhoto = photoChoices[Math.floor(Math.random() * photoChoices.length)] ?? 0;
    window.sessionStorage.setItem("vetra-login-photo", String(nextPhoto));
    setPhotoIndex(nextPhoto);
  }, []);

  const ar = language === "ar";

  async function handleLogin(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setMessage("");

    const normalizedPhone = phone
      .trim()
      .replace(/\s+/g, "");

    const normalizedCode = clientCode
      .trim()
      .replace(/\s+/g, "");

    if (!normalizedPhone || !normalizedCode) {
      setMessage(
        ar
          ? "من فضلك اكتب رقم التليفون و Client ID."
          : "Please enter your phone number and Client ID."
      );

      setLoading(false);
      return;
    }

    if (!/^[0-9]{6}$/.test(normalizedCode)) {
      setMessage(
        ar
          ? "Client ID لازم يكون 6 أرقام."
          : "Client ID must be 6 digits."
      );

      setLoading(false);
      return;
    }

    try {
      const db = await getClientPortalDb(
        normalizedCode,
        normalizedPhone
      );

      const {
        data: client,
        error,
      } = await db
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

      const ownerSessionStorage = keepSignedIn ? window.localStorage : window.sessionStorage;
      const otherStorage = keepSignedIn ? window.sessionStorage : window.localStorage;
      const ownerSessionKeys = ["vetra-client-id", "vetra-client-code", "vetra-client-phone"];

      ownerSessionKeys.forEach((key) => {
        otherStorage.removeItem(key);
      });

      ownerSessionStorage.setItem("vetra-client-id", client.id);
      ownerSessionStorage.setItem("vetra-client-code", client.client_code);
      ownerSessionStorage.setItem("vetra-client-phone", normalizedPhone);

      router.replace(`/client-interface/${client.id}`);
    } catch (error) {
      console.error(
        "PET OWNER LOGIN ERROR:",
        error
      );

      setMessage(
        ar
          ? "رقم التليفون أو Client ID غير صحيح."
          : "The phone number or Client ID is incorrect."
      );

      setLoading(false);
    }
  }

  return (
    <main
      dir={ar ? "rtl" : "ltr"}
      className={`relative min-h-screen overflow-hidden transition-colors duration-700 ${
        dark
          ? "bg-[#07111C] text-white"
          : "bg-[#F8FBFF] text-slate-900"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[30rem] w-[30rem] rounded-full bg-cyan-300/20 blur-3xl" />

        <div className="absolute -right-32 bottom-[-5rem] h-[32rem] w-[32rem] rounded-full bg-blue-300/20 blur-3xl" />

      </div>

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <button
          onClick={() =>
            router.push("/client-interface")
          }
          aria-label={ar ? "العودة إلى بوابة VETRA" : "Back to VETRA client portal"}
          className={`flex items-center ${dark ? "" : "rounded-xl bg-[#10251f] p-1.5 shadow-sm"}`}
        >
          <Image
            src="/vetra-logo-full.png"
            alt="VETRA"
            width={992}
            height={830}
            priority
            className="h-12 w-[58px] object-contain sm:h-14 sm:w-[68px]"
          />
        </button>

        <div className="flex gap-2">
          <button
            onClick={() =>
              setLanguage(
                ar ? "en" : "ar"
              )
            }
            className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs font-bold backdrop-blur dark:border-white/10 dark:bg-white/5"
          >
            {ar ? "English" : "العربية"}
          </button>

          <button
            onClick={() =>
              setDark((v) => !v)
            }
            aria-label={dark ? (ar ? "الوضع الفاتح" : "Light mode") : (ar ? "الوضع الداكن" : "Dark mode")}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-white/5"
          >
            {dark ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.6 8.6 0 1 0 20.5 14.2Z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <section className="relative z-10 flex min-h-[calc(100vh-90px)] items-center justify-center px-5 pb-10">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/70 bg-white/70 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-white/5 sm:rounded-[2.5rem] lg:grid-cols-2">

          <div className="relative order-1 flex min-h-[270px] items-end overflow-hidden bg-[#0B1825] px-7 py-8 text-white sm:min-h-[320px] sm:px-10 sm:py-10 lg:order-none lg:min-h-[600px] lg:items-center lg:px-12 lg:py-12">
            {photoIndex !== null && (
              <Image
                key={clientPortalPhotos[photoIndex].src}
                src={clientPortalPhotos[photoIndex].src}
                alt={clientPortalPhotos[photoIndex].alt}
                fill
                unoptimized
                sizes="(max-width: 1023px) 100vw, 40vw"
                className="object-cover object-center"
              />
            )}
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#07111c]/95 via-[#07111c]/35 to-[#07111c]/10" />
            <div className="relative z-10 max-w-md lg:mx-auto lg:text-center">
              <h1 className="text-3xl font-black sm:text-4xl">
                {ar ? "أهلاً بيك تاني" : "Welcome back"}
              </h1>

              <p className="mt-3 text-sm leading-7 text-white/85 sm:text-base">
                {ar
                  ? "كل ما يخص حيوانك الأليف، في مكان واحد."
                  : "Everything your pet needs, in one place."}
              </p>
            </div>
          </div>

          <div className="order-2 p-7 sm:p-12 lg:order-none">
            <div className="mb-8">
              <h2 className="mt-3 text-4xl font-black tracking-tight">
                {ar
                  ? "تسجيل الدخول"
                  : "Sign in"}
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {ar
                  ? "استخدم رقم التليفون و Client ID للدخول لملفك."
                  : "Use your phone number and Client ID to access your pet care."}
              </p>
            </div>

            <form
              onSubmit={handleLogin}
              className="space-y-5"
            >
              <label className="block">
                <span className="mb-2 block text-sm font-bold">
                  {ar
                    ? "رقم التليفون"
                    : "Phone Number"}
                </span>

                <input
                  type="tel"
                  required
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500"
                  placeholder="010XXXXXXXX"
                  dir="ltr"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold">
                  Client ID
                </span>

                <input
                  type="text"
                  required
                  inputMode="numeric"
                  maxLength={6}
                  value={clientCode}
                  onChange={(e) =>
                    setClientCode(
                      e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6)
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 font-bold tracking-[0.18em] text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500"
                  dir="ltr"
                />
              </label>

              <label className="flex cursor-pointer items-center gap-3 select-none text-sm">
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(event) => setKeepSignedIn(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-cyan-500"
                />
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  {ar ? "\u0627\u0628\u0642\u0646\u064a \u0645\u0633\u062c\u0644 \u0627\u0644\u062f\u062e\u0648\u0644" : "Keep me signed in"}
                </span>
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
                    ? "دخول"
                    : "Sign in"}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-600 dark:text-slate-300">
              {ar
                ? "الـ Client ID موجود في ملفك لدى VETRA."
                : "Your Client ID is available in your VETRA client profile."}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm">
              <span className="text-slate-500 dark:text-slate-400">
                {ar ? "تمثل عيادة؟" : "Are you a clinic?"}
              </span>
              <button
                type="button"
                onClick={() => router.push("/register")}
                className="font-bold text-cyan-700 underline-offset-4 transition hover:underline dark:text-cyan-300"
              >
                {ar ? "سجّل عيادة جديدة" : "Register a new clinic"}
              </button>
              <span className="text-slate-400">{ar ? "أو" : "or"}</span>
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="font-bold text-slate-800 underline-offset-4 transition hover:underline dark:text-white"
              >
                {ar ? "تسجيل الدخول كعيادة" : "Login as a clinic"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
