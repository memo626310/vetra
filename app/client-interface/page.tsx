"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

const heroPhotos = [
  {
    src: "https://images.unsplash.com/photo-1770836037289-e00e5f351d11?auto=format&fit=crop&w=1600&q=85",
    alt: "Veterinarian examining a dog in a clinic",
  },
  {
    src: "https://images.unsplash.com/photo-1770836037793-95bdbf190f71?auto=format&fit=crop&w=1600&q=85",
    alt: "A veterinarian caring for a dachshund",
  },
  {
    src: "https://images.unsplash.com/photo-1770836037949-c5e8db65aa86?auto=format&fit=crop&w=1600&q=85",
    alt: "A close veterinary examination of a dog",
  },
  {
    src: "https://images.unsplash.com/photo-1733783506192-653df6185a7d?auto=format&fit=crop&w=1600&q=85",
    alt: "A white cat being examined by a veterinarian",
  },
  {
    src: "https://images.unsplash.com/photo-1725409796872-8b41e8eca929?auto=format&fit=crop&w=1600&q=85",
    alt: "A kitten receiving a checkup at a veterinary clinic",
  },
  {
    src: "https://images.unsplash.com/photo-1555606396-79625d075363?auto=format&fit=crop&w=1600&q=85",
    alt: "A person gently holding a cat",
  },
  {
    src: "https://images.unsplash.com/photo-1759156232578-31d0fb5ab1aa?auto=format&fit=crop&w=1600&q=85",
    alt: "A kitten being held gently",
  },
  {
    src: "https://images.unsplash.com/photo-1780759791909-28547ceb56af?auto=format&fit=crop&w=1600&q=85",
    alt: "A ginger cat with green eyes",
  },
] as const;

export default function ClientPortalPage() {
  const router = useRouter();
  const [showWelcome, setShowWelcome] = useState(true);
  const [welcomeExiting, setWelcomeExiting] = useState(false);
  const [language, setLanguage] = useState<"en" | "ar">("ar");
  const [dark, setDark] = useState(false);
  const [heroPhotoIndex, setHeroPhotoIndex] = useState<number | null>(null);

  useEffect(() => {
    const rememberedClientId =
      window.localStorage.getItem("vetra-client-id") ??
      window.sessionStorage.getItem("vetra-client-id");

    if (rememberedClientId) {
      setShowWelcome(false);
      router.replace(`/client-interface/${encodeURIComponent(rememberedClientId)}`);
      return;
    }

    const savedLanguage = window.localStorage.getItem("vetra-language");
    const savedTheme = window.localStorage.getItem("vetra-theme");
    const welcomed = window.localStorage.getItem("vetra-welcome-seen");

    if (savedLanguage === "en") setLanguage("en");
    if (savedTheme === "dark") setDark(true);

    const previousPhoto = Number.parseInt(
      window.sessionStorage.getItem("vetra-landing-photo") ?? "-1",
      10,
    );
    const photoChoices = heroPhotos
      .map((_, index) => index)
      .filter((index) => index !== previousPhoto);
    const nextPhoto = photoChoices[Math.floor(Math.random() * photoChoices.length)] ?? 0;
    window.sessionStorage.setItem("vetra-landing-photo", String(nextPhoto));
    setHeroPhotoIndex(nextPhoto);

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
  }, [router]);

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
          <Image src="/vetra-logo-full.png" alt="VETRA — The Vet You Trust" width={992} height={830} priority className="h-auto w-44 object-contain sm:w-52" />
        </section>
      )}

      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-cyan-200/30 blur-3xl dark:bg-cyan-400/10" />
        <div className="absolute right-[-100px] top-1/4 h-96 w-96 rounded-full bg-blue-200/30 blur-3xl dark:bg-blue-500/10" />
        <div className="absolute bottom-[-140px] left-1/3 h-96 w-96 rounded-full bg-emerald-200/20 blur-3xl dark:bg-emerald-400/10" />
      </div>

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Image src={dark ? "/vetra-logo-full.png" : "/vetra-logo-light.png"} alt="VETRA — The Vet You Trust" width={992} height={830} className="h-14 w-[68px] object-contain sm:h-16 sm:w-[76px]" />

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/login")}
            className="hidden rounded-full border border-slate-200/80 bg-white/70 px-4 py-2 text-xs font-black backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md lg:inline-flex dark:border-white/10 dark:bg-white/5"
          >
            {ar ? "دخول الطبيب / العيادة" : "Doctor / Clinic Login"}
          </button>

          <button
            onClick={() => router.push("/register")}
            className="rounded-full bg-cyan-600 px-3 py-2 text-[11px] font-bold text-white transition hover:-translate-y-0.5 hover:bg-cyan-700 sm:px-4 sm:text-xs dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300"
          >
            <span className="sm:hidden">{ar ? "تسجيل عيادة" : "Register clinic"}</span>
            <span className="hidden sm:inline">{ar ? "تسجيل عيادة جديدة" : "Register a new clinic"}</span>
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
            aria-label={ar ? (dark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن") : (dark ? "Switch to light mode" : "Switch to dark mode")}
          >
            {dark ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="3.5" />
                <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Main landing */}
      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-90px)] max-w-7xl items-center gap-12 px-5 pb-14 pt-6 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:pt-0">
        <div className="order-2 lg:order-1">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-200/70 bg-white/70 px-4 py-2 text-xs font-bold text-cyan-700 shadow-sm backdrop-blur dark:border-cyan-300/10 dark:bg-white/5 dark:text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            {ar ? "بوابة VETRA لأصحاب الحيوانات" : "VETRA Client Portal for Pet Owners"}
          </div>

          <h1 className={`max-w-3xl text-5xl font-black leading-[1.12] tracking-tight sm:text-6xl lg:text-7xl ${ar ? "font-sans" : "leading-[1.02]"}`}>
            {ar ? (
              <>رعاية حيوانك الأليف، <span className="text-cyan-500">بسهولة.</span></>
            ) : (
              <>Pet care, <span className="text-cyan-500">made easy.</span></>
            )}
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-500 dark:text-slate-300">
            {ar
              ? "تابع المواعيد والتطعيمات والسجل الصحي لحيوانك الأليف من مكان واحد."
              : "Keep your pet’s appointments, vaccinations and health records together in one place."}
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <button
              onClick={() => router.push("/client-interface/login")}
              className="group rounded-2xl bg-slate-900 px-6 py-4 text-sm font-black text-white shadow-xl shadow-slate-900/15 transition duration-300 hover:-translate-y-1 hover:shadow-2xl dark:bg-white dark:text-slate-900"
            >
              <span>{ar ? "دخول صاحب الحيوان" : "Pet Owner Login"}</span>
              <span className="ms-2 inline-block transition-transform duration-300 group-hover:translate-x-1">→</span>
            </button>
          </div>

        </div>

        {/* Hero photo */}
        <div className="relative order-1 flex min-h-[300px] items-center justify-center lg:order-2 lg:min-h-[560px]">
          <figure className="relative h-[300px] w-full max-w-[520px] overflow-hidden rounded-[1.25rem] shadow-[0_24px_60px_-36px_rgba(15,23,42,.42)] sm:h-[420px] lg:h-[min(68vh,650px)] lg:min-h-[520px] lg:rounded-[46%_46%_1.25rem_1.25rem]">
            {heroPhotoIndex !== null && (
              <Image
                key={heroPhotos[heroPhotoIndex].src}
                src={heroPhotos[heroPhotoIndex].src}
                alt={heroPhotos[heroPhotoIndex].alt}
                fill
                unoptimized
                sizes="(max-width: 1023px) 100vw, 50vw"
                className="object-cover object-center transition-opacity duration-700"
              />
            )}
          </figure>
        </div>
      </section>

      <div className="relative z-10 px-5 pb-5 sm:hidden">
        <button
          onClick={() => router.push("/login")}
          className="w-full rounded-2xl border border-slate-200 bg-white/70 px-5 py-4 text-sm font-black shadow-lg backdrop-blur transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/5"
        >
          {ar ? "دخول الطبيب / العيادة" : "Doctor / Clinic Login"}
        </button>
      </div>

      <footer className="relative z-10 mx-auto max-w-7xl px-5 pb-8 text-center text-xs text-slate-400 sm:px-8 lg:px-10">
        {ar
          ? "VETRA — لأن كل حياة صغيرة تستحق الاهتمام."
          : "VETRA — Because every little life matters."}
      </footer>
    </main>
  );
}
