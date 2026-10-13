"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const features = [
  { icon: "🐾", title: "Your Pets", subtitle: "Everything about their care" },
  { icon: "💉", title: "Vaccines", subtitle: "Never miss an important dose" },
  { icon: "📅", title: "Appointments", subtitle: "Your next visit, one tap away" },
  { icon: "🧾", title: "Invoices", subtitle: "Your records, always with you" },
];

export default function ClientPortalPage() {
  const router = useRouter();
  const [showWelcome, setShowWelcome] = useState(true);
  const [welcomeExiting, setWelcomeExiting] = useState(false);
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("vetra-language");
    const savedTheme = window.localStorage.getItem("vetra-theme");
    const welcomed = window.localStorage.getItem("vetra-welcome-seen");

    if (savedLanguage === "ar") setLanguage("ar");
    if (savedTheme === "dark") setDark(true);

    if (welcomed === "true") {
      setShowWelcome(false);
      return;
    }

    const exitTimer = window.setTimeout(() => setWelcomeExiting(true), 2100);
    const hideTimer = window.setTimeout(() => {
      setShowWelcome(false);
      window.localStorage.setItem("vetra-welcome-seen", "true");
    }, 2900);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  const ar = language === "ar";

  const toggleLanguage = () => {
    const next = ar ? "en" : "ar";
    setLanguage(next);
    window.localStorage.setItem("vetra-language", next);
  };

  const toggleTheme = () => {
    setDark((value) => {
      const next = !value;
      window.localStorage.setItem("vetra-theme", next ? "dark" : "light");
      return next;
    });
  };

  return (
    <main
      dir={ar ? "rtl" : "ltr"}
      className={`relative min-h-screen overflow-hidden transition-colors duration-700 ${
        dark ? "bg-[#09111A] text-white" : "bg-[#F8FBFF] text-slate-900"
      }`}
    >
      {/* Fullscreen VETRA welcome transition */}
      {showWelcome && (
        <section
          className={`fixed inset-0 z-[100] flex items-center justify-center bg-[#07111C] text-white transition-all duration-700 ${
            welcomeExiting ? "scale-[1.08] opacity-0 blur-sm" : "scale-100 opacity-100"
          }`}
        >
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="absolute left-[10%] top-[18%] text-5xl opacity-30 animate-bounce">🐾</div>
            <div className="absolute right-[13%] top-[26%] text-4xl opacity-25 animate-pulse">🐾</div>
            <div className="absolute bottom-[19%] left-[20%] text-4xl opacity-20 animate-pulse">✦</div>
            <div className="absolute bottom-[14%] right-[18%] text-5xl opacity-20 animate-bounce">🐾</div>
          </div>

          <div className="relative px-8 text-center">
            <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-[2rem] border border-white/10 bg-white/10 text-5xl shadow-2xl backdrop-blur-xl transition duration-700 hover:scale-110">
              🐾
            </div>

            <div className="text-sm font-bold uppercase tracking-[0.45em] text-cyan-300">
              VETRA
            </div>

            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
              {ar ? "أهلاً بيك في VETRA" : "Welcome to VETRA"}
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">
              {ar
                ? "مكان بسيط وجميل تتابع منه كل حاجة تخص صاحبك الصغير. 🐾"
                : "A beautiful little place to keep your pet's care close to you. 🐾"}
            </p>

            <div className="mx-auto mt-8 h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-full origin-left animate-pulse rounded-full bg-cyan-300" />
            </div>
          </div>
        </section>
      )}

      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-cyan-200/30 blur-3xl dark:bg-cyan-400/10" />
        <div className="absolute right-[-100px] top-1/4 h-96 w-96 rounded-full bg-blue-200/30 blur-3xl dark:bg-blue-500/10" />
        <div className="absolute bottom-[-140px] left-1/3 h-96 w-96 rounded-full bg-emerald-200/20 blur-3xl dark:bg-emerald-400/10" />
        <div className="absolute left-[8%] top-[18%] text-3xl opacity-20 animate-bounce">🐾</div>
        <div className="absolute right-[12%] top-[12%] text-2xl opacity-20 animate-pulse">✦</div>
        <div className="absolute bottom-[20%] right-[7%] text-4xl opacity-15 animate-bounce">🐾</div>
        <div className="absolute bottom-[12%] left-[12%] text-2xl opacity-20 animate-pulse">♡</div>
      </div>

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-xl text-white shadow-lg dark:bg-white dark:text-slate-900">
            🐾
          </div>
          <div>
            <div className="font-black tracking-[0.18em]">VETRA</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Pet Care Portal
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/login")}
            className="hidden rounded-full border border-slate-200/80 bg-white/70 px-4 py-2 text-xs font-black backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md sm:inline-flex dark:border-white/10 dark:bg-white/5"
          >
            🩺 {ar ? "دخول الطبيب / العيادة" : "Doctor / Clinic Login"}
          </button>

          <button
            onClick={toggleLanguage}
            className="rounded-full border border-slate-200/80 bg-white/70 px-4 py-2 text-xs font-bold backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/5"
          >
            {ar ? "English" : "العربية"}
          </button>

          <button
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/70 backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/5"
            aria-label="Toggle theme"
          >
            {dark ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {/* Main landing */}
      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-90px)] max-w-7xl items-center gap-12 px-5 pb-14 pt-6 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:pt-0">
        <div className="order-2 lg:order-1">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-200/70 bg-white/70 px-4 py-2 text-xs font-bold text-cyan-700 shadow-sm backdrop-blur dark:border-cyan-300/10 dark:bg-white/5 dark:text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            {ar ? "رعاية حيوانك في مكان واحد" : "Your pet care, all in one place"}
          </div>

          <h2 className="max-w-3xl text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            {ar ? (
              <>
                أهلاً بيك،
                <span className="text-cyan-500"> Pet Owner</span> 👋
              </>
            ) : (
              <>
                Welcome,
                <span className="text-cyan-500"> Pet Owner</span> 👋
              </>
            )}
          </h2>

          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-500 dark:text-slate-300">
            {ar
              ? "كل تفاصيل حيوانك، مواعيدك، تطعيماتك وفواتيرك موجودة هنا بشكل بسيط وسهل."
              : "Your pets, appointments, vaccines and invoices — beautifully organized and always within reach."}
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <button
              onClick={() => router.push("/client-interface/login")}
              className="group rounded-2xl bg-slate-900 px-6 py-4 text-sm font-black text-white shadow-xl shadow-slate-900/15 transition duration-300 hover:-translate-y-1 hover:shadow-2xl dark:bg-white dark:text-slate-900"
            >
              <span>{ar ? "دخول صاحب الحيوان" : "Pet Owner Login"}</span>
              <span className="ms-2 inline-block transition-transform duration-300 group-hover:translate-x-1">→</span>
            </button>

            <button
              onClick={() => router.push("/login")}
              className="rounded-2xl border border-slate-200 bg-white/70 px-6 py-4 text-sm font-bold backdrop-blur transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-lg dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              🩺 {ar ? "دخول الطبيب / العيادة" : "Doctor / Clinic Login"}
            </button>
          </div>

          <div className="mt-12 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-3xl border border-white/80 bg-white/65 p-4 text-start shadow-sm backdrop-blur transition duration-500 hover:-translate-y-2 hover:shadow-xl dark:border-white/[0.06] dark:bg-white/[0.04]"
              >
                <div className="text-2xl transition-transform duration-500 group-hover:scale-125 group-hover:-rotate-6">
                  {feature.icon}
                </div>
                <div className="mt-4 text-sm font-black">
                  {ar
                    ? feature.title === "Your Pets"
                      ? "حيواناتك"
                      : feature.title === "Vaccines"
                        ? "التطعيمات"
                        : feature.title === "Appointments"
                          ? "المواعيد"
                          : "الفواتير"
                    : feature.title}
                </div>
                <div className="mt-1 text-[11px] leading-5 text-slate-400">
                  {ar ? "متابعة سهلة" : feature.subtitle}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hero visual */}
        <div className="relative order-1 flex min-h-[430px] items-center justify-center lg:order-2">
          <div className="absolute h-[330px] w-[330px] rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-400/10" />

          <div className="absolute right-[5%] top-[8%] rounded-full bg-white/70 p-4 text-2xl shadow-lg backdrop-blur animate-bounce dark:bg-white/10">
            🐾
          </div>

          <div className="absolute bottom-[12%] left-[8%] rounded-full bg-white/70 p-3 text-xl shadow-lg backdrop-blur animate-pulse dark:bg-white/10">
            ♡
          </div>

          <div className="relative h-[390px] w-[320px] sm:h-[450px] sm:w-[370px]">
            <div className="absolute inset-x-0 bottom-0 h-[330px] rounded-[3.5rem] border border-white/70 bg-white/55 shadow-2xl shadow-cyan-900/10 backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.05]" />

            <div className="absolute left-1/2 top-0 flex h-[230px] w-[230px] -translate-x-1/2 items-center justify-center rounded-full bg-gradient-to-br from-cyan-100 via-white to-blue-100 text-[125px] shadow-2xl transition duration-700 hover:scale-105 dark:from-cyan-500/20 dark:via-slate-900 dark:to-blue-500/20 sm:h-[260px] sm:w-[260px] sm:text-[145px]">
              🐶
            </div>

            <div className="absolute bottom-8 left-6 right-6 rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[#101923]/85">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {ar ? "حيوانك المميز" : "Your Hero Pet"}
                  </div>
                  <div className="mt-1 text-2xl font-black">Your Hero Pet 🐾</div>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-lg dark:bg-emerald-400/10">
                  💚
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {ar ? "رعاية أسهل" : "Smarter care"}
                </span>
                <span className="font-bold">VETRA</span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                <div className="h-full w-[82%] rounded-full bg-cyan-400 transition-all duration-1000" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10 px-5 pb-5 sm:hidden">
        <button
          onClick={() => router.push("/login")}
          className="w-full rounded-2xl border border-slate-200 bg-white/70 px-5 py-4 text-sm font-black shadow-lg backdrop-blur transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/5"
        >
          🩺 {ar ? "دخول الطبيب / العيادة" : "Doctor / Clinic Login"}
        </button>
      </div>

      <footer className="relative z-10 mx-auto max-w-7xl px-5 pb-8 text-center text-xs text-slate-400 sm:px-8 lg:px-10">
        {ar
          ? "VETRA — لأن كل حياة صغيرة تستحق الاهتمام. 🐾"
          : "VETRA — Because every little life matters. 🐾"}
      </footer>
    </main>
  );
}