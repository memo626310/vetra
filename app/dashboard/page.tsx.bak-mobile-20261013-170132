"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { vetraCore } from "@/lib/vetra-core";

type Language = "ar" | "en";

type ClinicContext = {
  clinic_id: string;
  clinic_name: string;
  clinic_status: string;
  doctor_id: string;
  doctor_name: string;
  role: string;
  member_status: string;
  database_provider: string | null;
  project_ref: string | null;
  database_region: string | null;
  database_status: string | null;
  subscription_status: string | null;
  plan_code: string | null;
  plan_name: string | null;
  trial_ends_at: string | null;
};

const translations = {
  ar: {
    welcome: "مرحبًا بك",
    doctor: "د. محمد",
    sidebarSubtitle: "إدارة العيادة",

    nav: {
      home: "الرئيسية",
      clients: "العملاء",
      pets: "الحيوانات",
      appointments: "المواعيد",
      vaccines: "التطعيمات",
      inventory: "المخزون",
      finance: "المالية",
      reports: "التقارير",
      settings: "الإعدادات",
    },

    cards: [
      ["زيارة جديدة", "ابدأ كشف جديد", "🩺"],
      ["العملاء", "أصحاب الحيوانات", "👥"],
      ["الحيوانات", "ملفات الحيوانات", "🐾"],
      ["المواعيد", "مواعيد اليوم والمتابعة", "📅"],
      ["التطعيمات", "القادمة والمتأخرة", "💉"],
      ["المخزون", "الأدوية والمنتجات", "📦"],
      ["استعلام سريع", "ابحث عن منتج بالباركود", "🔎"],
      ["المالية", "الدخل والمصروفات", "💰"],
      ["التقارير", "ملخص العيادة", "📊"],
    ],

    open: "فتح",
    language: "English",
    notifications: "الإشعارات",
    signOut: "تسجيل الخروج",
    profile: "الملف الشخصي",
    clinic: "العيادة",
    owner: "المالك",
    database: "قاعدة البيانات",
    ready: "جاهزة",
    loading: "جاري التحميل...",

    encouragement: [
      "صباح جديد، وحالات جديدة تقدر تساعدها. 🐾",
      "كل حالة بتفرق، كمّل اللي بدأته. 💙",
      "أنت بتعمل فرق حقيقي كل يوم. 🐾",
      "اهتم بكل حالة، والنتيجة هتفرق. ❤️",
      "خطوة صغيرة منك ممكن تغيّر حياة كاملة. 🐾",
      "شغلك النهارده ممكن يخلي حيوان أحسن بكرة. 💙",
    ],
  },

  en: {
    welcome: "Welcome",
    doctor: "Dr. Mohamed",
    sidebarSubtitle: "Clinic Management",

    nav: {
      home: "Home",
      clients: "Clients",
      pets: "Pets",
      appointments: "Appointments",
      vaccines: "Vaccines",
      inventory: "Inventory",
      finance: "Finance",
      reports: "Reports",
      settings: "Settings",
    },

    cards: [
      ["New Visit", "Start a new visit", "🩺"],
      ["Clients", "Pet owners", "👥"],
      ["Pets", "Pet records", "🐾"],
      ["Appointments", "Today's appointments", "📅"],
      ["Vaccines", "Due and overdue", "💉"],
      ["Inventory", "Medicines and products", "📦"],
      ["Quick Lookup", "Find a product by barcode", "🔎"],
      ["Finance", "Income and expenses", "💰"],
      ["Reports", "Clinic summary", "📊"],
    ],

    open: "Open",
    language: "عربي",
    notifications: "Notifications",
    signOut: "Sign out",
    profile: "Profile",
    clinic: "Clinic",
    owner: "Owner",
    database: "Database",
    ready: "Ready",
    loading: "Loading...",

    encouragement: [
      "A new day, new cases, new lives to help. 🐾",
      "Every case matters. Keep going. 💙",
      "You make a real difference every day. 🐾",
      "Take care of every case. It all makes a difference. ❤️",
      "A small step from you can change a whole life. 🐾",
      "Your work today can help a pet feel better tomorrow. 💙",
    ],
  },
};

const cardColors = [
  {
    light: "bg-purple-50",
    dark: "bg-purple-500/10",
    icon: "text-purple-600",
  },
  {
    light: "bg-blue-50",
    dark: "bg-blue-500/10",
    icon: "text-blue-600",
  },
  {
    light: "bg-emerald-50",
    dark: "bg-emerald-500/10",
    icon: "text-emerald-600",
  },
  {
    light: "bg-orange-50",
    dark: "bg-orange-500/10",
    icon: "text-orange-600",
  },
  {
    light: "bg-pink-50",
    dark: "bg-pink-500/10",
    icon: "text-pink-600",
  },
  {
    light: "bg-yellow-50",
    dark: "bg-yellow-500/10",
    icon: "text-yellow-600",
  },
  {
    light: "bg-green-50",
    dark: "bg-green-500/10",
    icon: "text-green-600",
  },
  {
    light: "bg-indigo-50",
    dark: "bg-indigo-500/10",
    icon: "text-indigo-600",
  },
  {
    light: "bg-cyan-50",
    dark: "bg-cyan-500/10",
    icon: "text-cyan-600",
  },
];

export default function Home() {
  const [darkMode, setDarkMode] = useState(true);
  const [language, setLanguage] = useState<Language>("ar");
  const [ready, setReady] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [clinicContext, setClinicContext] =
    useState<ClinicContext | null>(null);

  const [clinicLoading, setClinicLoading] = useState(true);

  useEffect(() => {
    const savedTheme = localStorage.getItem("vetra-theme");
    const savedLanguage = localStorage.getItem("vetra-language");

    if (savedTheme === "light") {
      setDarkMode(false);
    }

    if (savedLanguage === "en") {
      setLanguage("en");
    }

    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;

    localStorage.setItem(
      "vetra-theme",
      darkMode ? "dark" : "light"
    );

    localStorage.setItem(
      "vetra-language",
      language
    );
  }, [darkMode, language, ready]);

  useEffect(() => {
    if (!ready) return;

    let mounted = true;

    async function loadClinicContext() {
      setClinicLoading(true);

      const { data, error } = await vetraCore.rpc(
        "get_my_clinic_context"
      );

      if (error) {
        console.error(
          "VETRA CORE CONTEXT ERROR:",
          error
        );

        if (mounted) {
          setClinicContext(null);
          setClinicLoading(false);
        }

        return;
      }

      const context = Array.isArray(data)
        ? data[0] ?? null
        : null;

      console.log(
        "ACTIVE VETRA CLINIC:",
        context
      );

      // =====================================================
      // CLINIC ACCESS GUARD
      // User cannot access the dashboard without an active
      // clinic and an active clinic membership.
      // =====================================================

      if (
        !context ||
        !context.clinic_id ||
        context.clinic_status !== "active" ||
        context.member_status !== "active"
      ) {
        if (mounted) {
          setClinicContext(null);
          setClinicLoading(false);
          window.location.replace("/clinic-setup");
        }

        return;
      }

      if (mounted) {
        setClinicContext(context);
        setClinicLoading(false);
      }
    }

    void loadClinicContext();

    return () => {
      mounted = false;
    };
  }, [ready]);

  const t = translations[language];
  const isArabic = language === "ar";

  const doctorName =
    clinicContext?.doctor_name ||
    t.doctor;

  const clinicName =
    clinicContext?.clinic_name ||
    t.clinic;

  const doctorRole =
    clinicContext?.role ||
    "—";

  const databaseStatus =
    clinicContext?.database_status ||
    "—";

  const todayMessage = useMemo(() => {
    const today = new Date();

    const dayNumber = Math.floor(
      Date.UTC(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      ) / 86400000
    );

    const index =
      dayNumber % t.encouragement.length;

    return t.encouragement[index];
  }, [language, t.encouragement]);

  const formattedDate = new Date().toLocaleDateString(
    language === "ar" ? "ar-EG" : "en-US",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  );

  const goTo = (href: string) => {
    if (href !== "#") {
      window.location.href = href;
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);

    await Promise.all([
      vetraCore.auth.signOut(),
      supabase.auth.signOut(),
    ]);

    window.location.href = "/login";
  };

  const navItems = [
  ["🏠", t.nav.home, "/dashboard"],
  ["👥", t.nav.clients, "/clients"],
  ["🐾", t.nav.pets, "/pets"],
  ["📅", t.nav.appointments, "/appointments"],
  ["💉", t.nav.vaccines, "/vaccinations"],
  ["📦", t.nav.inventory, "/inventory/products"],
  ["💰", t.nav.finance, "/finance"],
  ["📊", t.nav.reports, "/reports"],
];
  return (
    <main
      dir={isArabic ? "rtl" : "ltr"}
      className={`min-h-screen transition-colors duration-500 ${
        darkMode
          ? "bg-[#0F1115] text-white"
          : "bg-[#F7F8FA] text-slate-800"
      }`}
    >
      <div className="flex min-h-screen">

        {/* ================= SIDEBAR ================= */}

        <aside
          className={`hidden w-72 shrink-0 border-l px-7 py-8 transition-all duration-500 lg:block ${
            darkMode
              ? "border-white/[0.06] bg-[#13161B]"
              : "border-slate-100 bg-white"
          }`}
        >
          {/* Logo */}

          <div className="mb-12">
            <h1
              className={`text-4xl font-black tracking-tight transition-all duration-300 hover:tracking-wider ${
                darkMode
                  ? "text-white"
                  : "text-blue-900"
              }`}
            >
              VETRA
            </h1>

            <p
              className={`mt-2 text-sm font-medium ${
                darkMode
                  ? "text-slate-500"
                  : "text-slate-400"
              }`}
            >
              {t.sidebarSubtitle}
            </p>

            {/* Active clinic */}

            <div
              className={`mt-6 rounded-2xl border p-4 ${
                darkMode
                  ? "border-white/[0.06] bg-white/[0.025]"
                  : "border-slate-100 bg-slate-50"
              }`}
            >
              <p
                className={`text-xs font-semibold ${
                  darkMode
                    ? "text-slate-500"
                    : "text-slate-400"
                }`}
              >
                {t.clinic}
              </p>

              <p className="mt-1 truncate text-sm font-bold">
                {clinicLoading
                  ? t.loading
                  : clinicName}
              </p>

              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs">
                  👤
                </span>

                <span
                  className={`truncate text-xs ${
                    darkMode
                      ? "text-slate-500"
                      : "text-slate-400"
                  }`}
                >
                  {doctorName}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation */}

          <nav className="space-y-2">
            {navItems.map(([icon, title, href], index) => {
              const isHome = index === 0;
              const isClients = index === 1;
              const isPets = index === 2;

              return (
                <button
                  key={title}
                  onClick={() => goTo(href)}
                  className={`group w-full rounded-2xl px-5 py-4 text-base font-medium transition-all duration-300 hover:translate-x-1 ${
                    isArabic
                      ? "text-right"
                      : "text-left"
                  } ${
                    isHome
                      ? darkMode
                        ? "bg-blue-500/10 text-blue-400 hover:bg-blue-500/15"
                        : "bg-blue-50 text-blue-800 hover:bg-blue-100"
                      : darkMode
                        ? "text-slate-400 hover:bg-white/[0.04] hover:text-white"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  <span className="inline-block transition-transform duration-300 group-hover:scale-110">
                    {icon}
                  </span>

                  <span
                    className={
                      isArabic
                        ? "mr-3"
                        : "ml-3"
                    }
                  >
                    {title}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Settings */}

          <div
            className={`mt-10 border-t pt-6 ${
              darkMode
                ? "border-white/[0.06]"
                : "border-slate-100"
            }`}
          >
            <button
              onClick={() => goTo("/settings")}
              className={`group w-full rounded-2xl px-5 py-4 text-base font-medium transition-all duration-300 hover:translate-x-1 ${
                darkMode
                  ? "text-slate-500 hover:bg-white/[0.04] hover:text-white"
                  : "text-slate-400 hover:bg-slate-50 hover:text-slate-700"
              } ${
                isArabic
                  ? "text-right"
                  : "text-left"
              }`}
            >
              <span className="inline-block transition-transform duration-300 group-hover:rotate-45">
                ⚙️
              </span>

              <span
                className={
                  isArabic
                    ? "mr-3"
                    : "ml-3"
                }
              >
                {t.nav.settings}
              </span>
            </button>
          </div>
        </aside>

        {/* ================= MAIN ================= */}

        <section className="flex-1 p-5 transition-colors duration-500 sm:p-8 lg:p-12">

          {/* ================= HEADER ================= */}

          <header className="mb-10 flex items-start justify-between gap-4">

            <div className="min-w-0">

              <p
                className={`mb-3 text-sm font-medium transition-colors duration-500 sm:text-base ${
                  darkMode
                    ? "text-slate-500"
                    : "text-slate-400"
                }`}
              >
                {formattedDate}
              </p>

              <h2 className="text-2xl font-black tracking-tight sm:text-4xl">
                {t.welcome}، {doctorName}{" "}

                <span className="inline-block transition-transform duration-300 hover:rotate-12">
                  👋
                </span>
              </h2>

              <p
                className={`mt-3 max-w-2xl text-sm font-medium leading-7 transition-all duration-500 sm:text-base ${
                  darkMode
                    ? "text-slate-400"
                    : "text-slate-500"
                }`}
              >
                {todayMessage}
              </p>

              {/* Core status */}

              {!clinicLoading && clinicContext && (
                <div className="mt-4 flex flex-wrap gap-2">

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      darkMode
                        ? "bg-white/[0.05] text-slate-300"
                        : "bg-white text-slate-600 shadow-sm"
                    }`}
                  >
                    🏥 {clinicName}
                  </span>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      darkMode
                        ? "bg-blue-500/10 text-blue-400"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    👤 {doctorRole}
                  </span>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      databaseStatus === "ready"
                        ? darkMode
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-emerald-50 text-emerald-700"
                        : darkMode
                          ? "bg-orange-500/10 text-orange-400"
                          : "bg-orange-50 text-orange-700"
                    }`}
                  >
                    🗄️ {t.database}: {databaseStatus}
                  </span>

                </div>
              )}

            </div>

            {/* ================= ACTIONS ================= */}

            <div className="flex shrink-0 items-center gap-2">

              {/* Language */}

              <button
                onClick={() =>
                  setLanguage(
                    isArabic ? "en" : "ar"
                  )
                }
                className={`flex h-12 items-center gap-2 rounded-2xl border px-3 text-sm font-bold transition-all duration-300 hover:-translate-y-0.5 active:scale-95 sm:px-4 ${
                  darkMode
                    ? "border-white/[0.06] bg-[#181B21] hover:bg-[#1D2128]"
                    : "border-slate-100 bg-white hover:bg-slate-50"
                }`}
              >
                <span className="transition-transform duration-500 hover:rotate-180">
                  🌐
                </span>

                <span>
                  {t.language}
                </span>
              </button>

              {/* Theme */}

              <button
                onClick={() =>
                  setDarkMode(!darkMode)
                }
                className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-xl transition-all duration-500 hover:-translate-y-0.5 active:scale-90 ${
                  darkMode
                    ? "border-white/[0.06] bg-[#181B21] hover:bg-[#1D2128]"
                    : "border-slate-100 bg-white hover:bg-slate-50"
                }`}
                aria-label="Change theme"
              >
                <span className="inline-block transition-transform duration-500 hover:rotate-45">
                  {darkMode
                    ? "☀️"
                    : "🌙"}
                </span>
              </button>

              {/* Notifications */}

              <button
                className={`hidden h-12 w-12 items-center justify-center rounded-2xl border text-xl transition-all duration-300 hover:-translate-y-0.5 active:scale-90 sm:flex ${
                  darkMode
                    ? "border-white/[0.06] bg-[#181B21] hover:bg-[#1D2128]"
                    : "border-slate-100 bg-white hover:bg-slate-50"
                }`}
                aria-label={t.notifications}
              >
                <span className="inline-block transition-transform duration-300 hover:rotate-12">
                  🔔
                </span>
              </button>

              {/* Profile */}

              <div
                className={`hidden items-center gap-3 rounded-2xl border px-4 py-2 transition-all duration-300 hover:-translate-y-0.5 md:flex ${
                  darkMode
                    ? "border-white/[0.06] bg-[#181B21]"
                    : "border-slate-100 bg-white"
                }`}
              >
                <button
                  onClick={() => goTo("/profile")}
                  className={`text-right transition-all duration-200 hover:opacity-80 ${
                    isArabic
                      ? "text-right"
                      : "text-left"
                  }`}
                  title={t.profile}
                >
                  <p className="text-sm font-bold">
                    {doctorName}
                  </p>

                  <p
                    className={`mt-1 text-xs ${
                      darkMode
                        ? "text-slate-500"
                        : "text-slate-400"
                    }`}
                  >
                    {doctorRole !== "—"
                      ? doctorRole
                      : isArabic
                        ? "الطبيب"
                        : "Doctor"}
                  </p>
                </button>

                {/* Logout */}

                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  title={t.signOut}
                  aria-label={t.signOut}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg transition-all duration-300 hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                    darkMode
                      ? "bg-white/[0.05] text-slate-300 hover:bg-red-500/10 hover:text-red-400"
                      : "bg-slate-50 text-slate-500 hover:bg-red-50 hover:text-red-600"
                  }`}
                >
                  {loggingOut ? "…" : "↪"}
                </button>
              </div>
            </div>
          </header>

          {/* ================= CARDS ================= */}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">

            {t.cards.map((card, index) => {
              const [title, subtitle, icon] = card;

              const colors =
                cardColors[index];

              const featured =
                index === 0;

              return (
                <button
                  key={title}
                  onClick={() => {
                    switch (index) {
                      case 0:
                        goTo("/visits/new");
                        break;
                      case 1:
                        goTo("/clients");
                        break;
                      case 2:
                        goTo("/pets");
                        break;
                      case 3:
                        goTo("/appointments");
                        break;
                      case 4:
                        goTo("/vaccinations");
                        break;
                      case 5:
                        goTo("/inventory/products");
                        break;
                      case 6:
                        goTo("/barcode-test");
                        break;
                      case 7:
                        goTo("/finance");
                        break;
                      case 8:
                        goTo("/reports");
                        break;
                      default:
                        goTo("/dashboard");
                    }
                  }}
                  className={`group relative min-h-[220px] overflow-hidden rounded-[32px] p-7 transition-all duration-300 ease-out hover:-translate-y-2 hover:scale-[1.01] active:scale-[0.98] ${
                    isArabic
                      ? "text-right"
                      : "text-left"
                  } ${
                    featured
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500 hover:shadow-xl hover:shadow-blue-900/30"
                      : darkMode
                        ? "border border-white/[0.06] bg-[#181B21] text-white shadow-sm hover:border-white/[0.10] hover:bg-[#1C2026] hover:shadow-xl"
                        : "border border-slate-100 bg-white text-slate-800 shadow-sm hover:border-slate-200 hover:shadow-xl"
                  }`}
                >

                  {/* Glow */}

                  <div
                    className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl transition-all duration-700 group-hover:scale-150 ${
                      featured
                        ? "bg-white/10"
                        : darkMode
                          ? "bg-blue-500/[0.04]"
                          : "bg-blue-500/[0.05]"
                    }`}
                  />

                  {/* Icon */}

                  <div
                    className={`relative mb-7 flex h-16 w-16 items-center justify-center rounded-3xl text-3xl transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 ${
                      featured
                        ? "bg-white/15"
                        : `${darkMode ? colors.dark : colors.light} ${colors.icon}`
                    }`}
                  >
                    <span className="transition-transform duration-500 group-hover:scale-110">
                      {icon}
                    </span>
                  </div>

                  {/* Title */}

                  <h3 className="relative text-2xl font-black tracking-tight transition-transform duration-300 group-hover:translate-x-1">
                    {title}
                  </h3>

                  {/* Subtitle */}

                  <p
                    className={`relative mt-3 text-base font-medium leading-7 transition-colors duration-300 ${
                      featured
                        ? "text-blue-100"
                        : darkMode
                          ? "text-slate-500"
                          : "text-slate-400"
                    }`}
                  >
                    {subtitle}
                  </p>

                  {/* Open */}

                  <div
                    className={`relative mt-6 text-sm font-bold transition-all duration-300 ${
                      featured
                        ? "text-white"
                        : "translate-y-1 text-blue-500 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"
                    }`}
                  >
                    {t.open}{" "}
                    {isArabic
                      ? "←"
                      : "→"}
                  </div>

                </button>
              );
            })}

          </div>

        </section>
      </div>
    </main>
  );
}
