"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { vetraCore } from "@/lib/vetra-core";
import { getClinicDb } from "@/lib/clinic-db";
import PushNotificationsButton from "@/components/PushNotificationsButton";
import ReceptionCheckoutNotice from "@/components/ReceptionCheckoutNotice";
import { writeVetraTheme } from "@/lib/theme";
import { permissionForPath } from "@/lib/staff-permissions";
import { useStaffPermissions } from "@/lib/use-staff-permissions";
// VETRA_DASHBOARD_CURRENT_DESIGN_POLISH_V1

type Language = "ar" | "en";
type DashboardTheme = "midnight" | "ocean" | "violet" | "light";

const dashboardThemes: Record<DashboardTheme, {
  labelAr: string; labelEn: string; page: string; sidebar: string; header: string;
  card: string; cardHover: string; activeNav: string; accentText: string;
  focus: string; quickSale: string; quickSaleIcon: string; quickSaleText: string;
}> = {
  midnight: {
    labelAr: "ليلي تركوازي", labelEn: "Midnight teal",
    page: "bg-[#0F1115] text-white", sidebar: "border-white/[0.06] bg-[#13161B]",
    header: "border-white/[0.07] bg-[radial-gradient(ellipse_at_top_right,_rgba(20,184,166,0.13),_transparent_48%),linear-gradient(135deg,#171b22,#12151a)]",
    card: "border-white/[0.06] bg-[#181B21] text-white shadow-sm", cardHover: "hover:border-white/[0.10] hover:bg-[#1C2026] hover:shadow-xl",
    activeNav: "bg-blue-500/10 text-blue-400 hover:bg-blue-500/15", accentText: "text-teal-400",
    focus: "focus-visible:ring-teal-400", quickSale: "border-teal-400/20 bg-teal-500/10 hover:border-teal-300/30 hover:bg-teal-500/[0.14]",
    quickSaleIcon: "bg-teal-500/15 text-teal-300", quickSaleText: "text-teal-300",
  },
  ocean: {
    labelAr: "أزرق محيطي", labelEn: "Ocean blue",
    page: "bg-[#081521] text-slate-50", sidebar: "border-sky-200/[0.08] bg-[#0b1d2b]",
    header: "border-sky-300/10 bg-[radial-gradient(ellipse_at_top_right,_rgba(56,189,248,0.16),_transparent_48%),linear-gradient(135deg,#102638,#0b1d2b)]",
    card: "border-sky-200/[0.08] bg-[#102333] text-slate-50 shadow-sm", cardHover: "hover:border-sky-300/20 hover:bg-[#142b3d] hover:shadow-xl",
    activeNav: "bg-sky-400/10 text-sky-300 hover:bg-sky-400/15", accentText: "text-sky-300",
    focus: "focus-visible:ring-sky-400", quickSale: "border-cyan-300/20 bg-cyan-400/10 hover:border-cyan-200/30 hover:bg-cyan-400/[0.16]",
    quickSaleIcon: "bg-cyan-400/15 text-cyan-200", quickSaleText: "text-cyan-200",
  },
  violet: {
    labelAr: "بنفسجي هادئ", labelEn: "Soft violet",
    page: "bg-[#15111b] text-white", sidebar: "border-violet-200/[0.08] bg-[#1b1524]",
    header: "border-violet-300/10 bg-[radial-gradient(ellipse_at_top_right,_rgba(167,139,250,0.17),_transparent_48%),linear-gradient(135deg,#241b30,#191421)]",
    card: "border-violet-200/[0.08] bg-[#211a2b] text-white shadow-sm", cardHover: "hover:border-violet-300/20 hover:bg-[#281f34] hover:shadow-xl",
    activeNav: "bg-violet-400/10 text-violet-300 hover:bg-violet-400/15", accentText: "text-violet-300",
    focus: "focus-visible:ring-violet-400", quickSale: "border-fuchsia-300/20 bg-fuchsia-400/10 hover:border-fuchsia-200/30 hover:bg-fuchsia-400/[0.16]",
    quickSaleIcon: "bg-fuchsia-400/15 text-fuchsia-200", quickSaleText: "text-fuchsia-200",
  },
  light: {
    labelAr: "فاتح", labelEn: "Light",
    page: "bg-[#F7F8FA] text-slate-800", sidebar: "border-slate-100 bg-white",
    header: "border-slate-200 bg-[radial-gradient(ellipse_at_top_right,_rgba(20,184,166,0.12),_transparent_48%),linear-gradient(135deg,#ffffff,#f6faf9)]",
    card: "border-slate-100 bg-white text-slate-800 shadow-sm", cardHover: "hover:border-slate-200 hover:shadow-xl",
    activeNav: "bg-blue-50 text-blue-800 hover:bg-blue-100", accentText: "text-teal-700",
    focus: "focus-visible:ring-teal-500", quickSale: "border-teal-100 bg-teal-50 hover:border-teal-300 hover:shadow-md",
    quickSaleIcon: "bg-teal-100 text-teal-700", quickSaleText: "text-teal-700",
  },
};

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
      visits: "سجل الزيارات",
      vaccines: "التطعيمات",
      inventory: "المخزون",
      finance: "المالية",
      reports: "التقارير",
      settings: "الإعدادات",
      messages: "رسائل واتساب",
      staff: "فريق العيادة",
    },

    cards: [
      ["زيارة جديدة", "ابدأ كشف جديد", "🩺"],
      ["بيع سريع", "إنشاء فاتورة بيع بسرعة", "🛒"],
      ["العملاء", "أصحاب الحيوانات", "👥"],
      ["الحيوانات", "ملفات الحيوانات", "🐾"],
      ["المواعيد", "مواعيد اليوم والمتابعة", "📅"],
      ["التطعيمات", "القادمة والمتأخرة", "💉"],
      ["المخزون", "الأدوية والمنتجات", "📦"],
      ["استعلام سريع", "ابحث عن منتج بالباركود", "🔎"],
      ["المالية", "الدخل والمصروفات", "💰"],
      ["التقارير", "ملخص العيادة", "📊"],
      ["سجل الزيارات", "عرض وتعديل الكشوفات السابقة", "📋"],
      ["رسائل واتساب", "قوالب الرسائل ومشاركتها", "💬"],
      ["فريق العيادة", "الأطباء والمساعدون والاستقبال", "👩‍⚕️"],
      ["مشتريات المخزون", "إضافة مشتريات من مورد", "🧾"],
      ["الفواتير", "عرض وإدارة الفواتير", "📄"],
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
    workspace: "مساحة عملك",
    shortcutsTitle: "اختصارات العيادة",
    shortcutsSubtitle: "كل أدواتك اليومية في مكان واحد",
    todayStatsTitle: "إحصائيات اليوم",
    todayStats: ["مواعيد اليوم", "تطعيمات اليوم", "كمية قليلة", "نفد من الكمية", "قرب انتهاء الصلاحية"],
    theme: "المظهر",

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
      visits: "Visit History",
      vaccines: "Vaccines",
      inventory: "Inventory",
      finance: "Finance",
      reports: "Reports",
      settings: "Settings",
      messages: "WhatsApp messages",
      staff: "Clinic staff",
    },

    cards: [
      ["New Visit", "Start a new visit", "🩺"],
      ["Quick Sale", "Create a sales invoice fast", "🛒"],
      ["Clients", "Pet owners", "👥"],
      ["Pets", "Pet records", "🐾"],
      ["Appointments", "Today's appointments", "📅"],
      ["Vaccines", "Due and overdue", "💉"],
      ["Inventory", "Medicines and products", "📦"],
      ["Quick Lookup", "Find a product by barcode", "🔎"],
      ["Finance", "Income and expenses", "💰"],
      ["Reports", "Clinic summary", "📊"],
      ["Visit History", "Review and edit previous visits", "📋"],
      ["WhatsApp Messages", "Templates and customer sharing", "💬"],
      ["Clinic Staff", "Doctors, assistants, and front desk", "👩‍⚕️"],
      ["Inventory Purchases", "Add stock from a supplier", "🧾"],
      ["Invoices", "View and manage invoices", "📄"],
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
    workspace: "Your workspace",
    shortcutsTitle: "Clinic shortcuts",
    shortcutsSubtitle: "Your daily tools, all in one place",
    todayStatsTitle: "Today's statistics",
    todayStats: ["Today's appointments", "Today's vaccinations", "Low stock", "Out of stock", "Near expiry"],
    theme: "Theme",

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
  const router = useRouter();
  const { loaded: permissionsLoaded, can } = useStaffPermissions();
  const [theme, setTheme] = useState<DashboardTheme>("midnight");
  const [lastDarkTheme, setLastDarkTheme] = useState<DashboardTheme>("midnight");
  const [language, setLanguage] = useState<Language>("ar");
  const [ready, setReady] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [clinicContext, setClinicContext] =
    useState<ClinicContext | null>(null);

  const [clinicLoading, setClinicLoading] = useState(true);
  const [todayStats, setTodayStats] = useState<Array<number | null>>([null, null, null, null, null]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("vetra-theme");
    const savedLanguage = localStorage.getItem("vetra-language");

    if (savedTheme && Object.hasOwn(dashboardThemes, savedTheme)) {
      const selectedTheme = savedTheme as DashboardTheme;
      // Restore the browser preference after hydration to keep the server render stable.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(selectedTheme);
      if (selectedTheme !== "light") setLastDarkTheme(selectedTheme);
    }

    if (savedLanguage === "en") {
      setLanguage("en");
    }

    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;

    writeVetraTheme(theme);

    localStorage.setItem(
      "vetra-language",
      language
    );
  }, [theme, language, ready]);

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
          router.replace("/clinic-setup");
        }

        return;
      }

      let displayContext = context;
      try {
        const db = await getClinicDb();
        const { data: clinicProfile } = await db.from("clinic_profile_settings")
          .select("doctor_name")
          .eq("clinic_id", context.clinic_id)
          .maybeSingle();
        if (clinicProfile?.doctor_name) {
          displayContext = { ...context, doctor_name: clinicProfile.doctor_name };
        }
      } catch {
        // Keep the VETRA account name if the clinic profile is not configured yet.
      }

      if (mounted) {
        setClinicContext(displayContext);
        setClinicLoading(false);
      }
    }

    void loadClinicContext();

    return () => {
      mounted = false;
    };
  }, [ready, router]);

  useEffect(() => {
    const clinicId = clinicContext?.clinic_id;
    if (!ready || !clinicId || !permissionsLoaded) return;

    let mounted = true;

    async function loadTodayStats() {
      try {
        const db = await getClinicDb();
        const today = new Date();
        const dateKey = [
          today.getFullYear(),
          String(today.getMonth() + 1).padStart(2, "0"),
          String(today.getDate()).padStart(2, "0"),
        ].join("-");
        const expiryLimit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
        const expiryLimitKey = [
          expiryLimit.getFullYear(),
          String(expiryLimit.getMonth() + 1).padStart(2, "0"),
          String(expiryLimit.getDate()).padStart(2, "0"),
        ].join("-");

        const [appointmentsResult, vaccinesResult, productsResult] = await Promise.all([
          can("appointments") ? db.from("appointments").select("id, status").eq("clinic_id", clinicId).eq("appointment_date", dateKey) : Promise.resolve({ data: [], error: null }),
          can("vaccinations") ? db.from("vaccinations").select("next_dose_at").eq("clinic_id", clinicId).not("next_dose_at", "is", null) : Promise.resolve({ data: [], error: null }),
          can("inventory") ? db.from("products").select("quantity, reorder_level, expiry_date").eq("clinic_id", clinicId).eq("is_active", true) : Promise.resolve({ data: [], error: null }),
        ]);

        if (appointmentsResult.error) throw appointmentsResult.error;
        if (vaccinesResult.error) throw vaccinesResult.error;
        if (productsResult.error) throw productsResult.error;

        const vaccinationsToday = (vaccinesResult.data || []).filter((item) => {
          const value = String(item.next_dose_at || "");
          return value.slice(0, 10) === dateKey;
        }).length;
        const lowStock = (productsResult.data || []).filter((item) => Number(item.quantity) > 0 && Number(item.quantity) <= Number(item.reorder_level)).length;
        const outOfStock = (productsResult.data || []).filter((item) => Number(item.quantity) <= 0).length;
        const nearExpiry = (productsResult.data || []).filter((item) => {
          const expiryDate = String(item.expiry_date || "").slice(0, 10);
          return Boolean(expiryDate) && expiryDate >= dateKey && expiryDate <= expiryLimitKey;
        }).length;
        const appointmentsToday = (appointmentsResult.data || []).filter((item) => !["cancelled", "no_show"].includes(String(item.status))).length;

        if (mounted) setTodayStats([appointmentsToday, vaccinationsToday, lowStock, outOfStock, nearExpiry]);
      } catch (error) {
        console.error("VETRA DASHBOARD STATS ERROR:", error);
        if (mounted) setTodayStats([null, null, null, null, null]);
      }
    }

    void loadTodayStats();
    return () => {
      mounted = false;
    };
  }, [clinicContext?.clinic_id, ready, permissionsLoaded, can]);

  const t = translations[language];
  const isArabic = language === "ar";
  const darkMode = theme !== "light";
  const palette = dashboardThemes[theme];

  const selectTheme = (nextTheme: DashboardTheme) => {
    if (nextTheme !== "light") setLastDarkTheme(nextTheme);
    setTheme(nextTheme);
  };

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
      router.push(href);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);

    await Promise.all([
      vetraCore.auth.signOut(),
      supabase.auth.signOut(),
    ]);

    router.replace("/login");
  };

  const navItems = [
  ["🏠", t.nav.home, "/dashboard"],
  ["👥", t.nav.clients, "/clients"],
  ["🐾", t.nav.pets, "/pets"],
  ["📅", t.nav.appointments, "/appointments"],
  ["🩺", t.nav.visits, "/dashboard/visits"],
  ["💉", t.nav.vaccines, "/vaccinations"],
  ["💬", t.nav.messages, "/messages"],
  ["👩‍⚕️", t.nav.staff, "/staff"],
  ["📦", t.nav.inventory, "/inventory/products"],
  ["🧾", isArabic ? "الفواتير" : "Invoices", "/invoices"],
  ["💰", t.nav.finance, "/finance"],
  ["📊", t.nav.reports, "/reports"],
  ["🟢", isArabic ? "نشاط العملاء" : "Client activity", "/dashboard/clients-activity"],
  ].filter((item) => {
    const required = permissionForPath(item[2]);
    return !required || (permissionsLoaded && can(required.key, required.action));
  });
  const visibleCards = t.cards.map((card, index) => ({ card, index })).filter(({ index }) => {
    const cardPaths = ["/visits/new", "/invoices/new", "/clients", "/pets", "/appointments", "/vaccinations", "/inventory/products", "/barcode-test", "/finance", "/reports", "/dashboard/visits", "/messages", "/staff", "/inventory/purchases", "/invoices"];
    const required = permissionForPath(cardPaths[index]);
    return !required || (permissionsLoaded && can(required.key, required.action));
  });
  const visibleStats = ["appointments", "vaccinations", "inventory", "inventory", "inventory"]
    .map((key, index) => ({ key, index }))
    .filter(({ key }) => permissionsLoaded && can(key, "view"));
  return (
    <main
      dir={isArabic ? "rtl" : "ltr"}
      className={`min-h-screen transition-colors duration-500 ${palette.page}`}
    >
      <div className="flex min-h-screen">

        {/* ================= SIDEBAR ================= */}

        <aside
          className={`sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto border-l px-5 py-7 transition-all duration-500 xl:w-72 xl:px-7 xl:py-8 lg:block ${
            palette.sidebar
          }`}
        >
          {/* Logo */}

          <div className="mb-9">
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

          <nav aria-label={isArabic ? "التنقل الرئيسي" : "Main navigation"} className="space-y-1.5">
            {navItems.map(([icon, title, href], index) => {
              const isHome = index === 0;

              return (
                <button
                  key={title}
                  onClick={() => goTo(href)}
                  aria-current={isHome ? "page" : undefined}
                  className={`group w-full rounded-xl px-4 py-3.5 text-sm font-semibold transition-all duration-200 hover:translate-x-1 ${
                    isArabic
                      ? "text-right"
                      : "text-left"
                  } ${
                    isHome
                      ? palette.activeNav
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

          {permissionsLoaded && can("clinic_settings", "view") && <div
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
          </div>}
        </aside>

        {/* ================= MAIN ================= */}

        <section className="min-w-0 flex-1 px-3 pb-8 pt-3 transition-colors duration-500 sm:px-6 sm:py-7 xl:px-10">
          <div className="mx-auto w-full max-w-[1600px]">

          {/* ================= HEADER ================= */}

          <header className={`relative mb-6 flex flex-wrap items-start justify-between gap-4 overflow-hidden rounded-3xl border p-4 shadow-sm sm:mb-8 sm:gap-6 sm:p-7 lg:p-8 ${palette.header}`}>

            <div className="min-w-0">

              <p
                className={`mb-2 text-xs font-semibold tracking-wide transition-colors duration-500 sm:mb-3 sm:text-sm ${
                  darkMode
                    ? "text-slate-500"
                    : "text-slate-400"
                }`}
              >
                {formattedDate}
              </p>

              <p className={`mb-2 text-xs font-bold uppercase tracking-[0.18em] ${palette.accentText}`}>{t.workspace}</p>
              <h2 className="text-2xl font-black tracking-tight sm:text-4xl lg:text-[2.65rem]">
                {t.welcome}، {doctorName}{" "}

                <span className="inline-block transition-transform duration-300 hover:rotate-12">
                  👋
                </span>
              </h2>

              <p
                className={`mt-2 max-w-2xl text-sm font-medium leading-6 transition-all duration-500 sm:mt-3 sm:text-base sm:leading-7 ${
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
                    className={`hidden sm:inline-flex rounded-full px-3 py-1 text-xs font-bold ${
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

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">

              {/* Language */}

              <button
                onClick={() =>
                  setLanguage(
                    isArabic ? "en" : "ar"
                  )
                }
                className={`flex h-10 items-center gap-2 rounded-2xl border px-3 text-sm font-bold transition-all duration-300 active:scale-95 sm:h-12 sm:px-4 sm:hover:-translate-y-0.5 ${
                  darkMode
                    ? "border-white/[0.06] bg-[#181B21] hover:bg-[#1D2128]"
                    : "border-slate-100 bg-white hover:bg-slate-50"
                }`}
              >
                <span className="transition-transform duration-500 hover:rotate-180">
                  🌐
                </span>

                <span className="hidden sm:inline">
                  {t.language}
                </span>
              </button>

              {/* Theme */}

              <label className={`flex h-10 items-center gap-2 rounded-2xl border px-2.5 text-xs font-bold transition sm:h-12 sm:px-3 ${darkMode ? "border-white/[0.06] bg-[#181B21]" : "border-slate-100 bg-white"}`}>
                <span aria-hidden="true">🎨</span>
                <span className="sr-only">{t.theme}</span>
                <select
                  aria-label={t.theme}
                  value={theme}
                  onChange={(event) => selectTheme(event.target.value as DashboardTheme)}
                  className={`max-w-[92px] cursor-pointer bg-transparent outline-none sm:max-w-[118px] ${darkMode ? "text-slate-200" : "text-slate-700"}`}
                >
                  {(Object.keys(dashboardThemes) as DashboardTheme[]).map((key) => (
                    <option key={key} value={key} className={darkMode ? "bg-[#181B21] text-white" : "bg-white text-slate-800"}>
                      {isArabic ? dashboardThemes[key].labelAr : dashboardThemes[key].labelEn}
                    </option>
                  ))}
                </select>
              </label>

              <button
                onClick={() =>
                  selectTheme(darkMode ? "light" : lastDarkTheme)
                }
                className={`flex h-10 w-10 items-center justify-center rounded-2xl border text-xl transition-all duration-500 active:scale-90 sm:h-12 sm:w-12 sm:hover:-translate-y-0.5 ${
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

              <PushNotificationsButton
                audience="clinic"
                language={isArabic ? "ar" : "en"}
                darkMode={darkMode}
              />

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

          {clinicContext && ["owner", "admin", "reception"].includes(String(clinicContext.role || "").toLowerCase()) && (
            <ReceptionCheckoutNotice
              clinicId={clinicContext.clinic_id}
              language={isArabic ? "ar" : "en"}
              darkMode={darkMode}
              canDismiss={["owner", "admin"].includes(String(clinicContext.role || "").toLowerCase())}
            />
          )}

          {/* ================= CARDS ================= */}

          <div className="mb-4 flex flex-wrap items-end justify-between gap-2 sm:mb-5">
            <div>
              <h3 className="text-lg font-black tracking-tight sm:text-xl">{t.shortcutsTitle}</h3>
              <p className={`mt-1 text-xs font-medium sm:text-sm ${darkMode ? "text-slate-500" : "text-slate-500"}`}>{t.shortcutsSubtitle}</p>
            </div>
            <span className={`hidden rounded-full px-3 py-1.5 text-xs font-bold sm:inline-flex ${darkMode ? "bg-white/[0.04] text-slate-400" : "bg-white text-slate-500 shadow-sm"}`}>{visibleCards.length} {isArabic ? "أدوات" : "tools"}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">

            {visibleCards.map(({ card, index }) => {
              const [title, subtitle, icon] = card;
              const colors = cardColors[index % cardColors.length];
              const featured = index === 0;
              const quickSale = index === 1;

              return (
                <button
                  key={title}
                  onClick={() => {
                    switch (index) {
                      case 0:
                        goTo("/visits/new");
                        break;
                      case 1:
                        goTo("/invoices/new?mode=quick-sale");
                        break;
                      case 2:
                        goTo("/clients");
                        break;
                      case 3:
                        goTo("/pets");
                        break;
                      case 4:
                        goTo("/appointments");
                        break;
                      case 5:
                        goTo("/vaccinations");
                        break;
                      case 6:
                        goTo("/inventory/products");
                        break;
                      case 7:
                        goTo("/barcode-test");
                        break;
                      case 8:
                        goTo("/finance");
                        break;
                      case 9:
                        goTo("/reports");
                        break;
                      case 10:
                        goTo("/dashboard/visits");
                        break;
                      case 11:
                        goTo("/messages");
                        break;
                      case 12:
                        goTo("/staff");
                        break;
                      case 13:
                        goTo("/inventory/purchases");
                        break;
                      case 14:
                        goTo("/invoices");
                        break;
                      default:
                        goTo("/dashboard");
                    }
                  }}
                  className={`group relative flex min-h-[118px] items-center gap-4 overflow-hidden rounded-2xl p-4 text-start transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 ${palette.focus} focus-visible:ring-offset-2 active:scale-[0.99] sm:min-h-[152px] sm:gap-5 sm:rounded-3xl sm:p-5 lg:min-h-[166px] lg:p-6 sm:hover:-translate-y-1 ${
                    isArabic
                      ? "text-right"
                      : "text-left"
                  } ${
                    featured
                      ? "bg-[linear-gradient(135deg,#0b2d45,#0b2540_58%,#123d52)] text-white shadow-lg shadow-slate-900/20 hover:shadow-xl hover:shadow-slate-900/30"
                      : quickSale
                        ? `${palette.quickSale} ${darkMode ? "border text-white shadow-sm hover:shadow-md" : "border text-slate-800 shadow-sm"}`
                        : darkMode
                          ? `${palette.card} ${palette.cardHover}`
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
                    className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl transition-all duration-500 group-hover:scale-105 group-hover:rotate-3 sm:h-14 sm:w-14 sm:rounded-2xl sm:text-3xl ${
                      featured
                        ? "bg-white/15"
                        : quickSale
                          ? palette.quickSaleIcon
                          : `${darkMode ? colors.dark : colors.light} ${colors.icon}`
                    }`}
                  >
                    <span className="transition-transform duration-500 group-hover:scale-110">
                      {icon}
                    </span>
                  </div>

                  {/* Title */}

                  <div className="relative min-w-0 flex-1">
                    <h3 className="text-base font-black tracking-tight transition-transform duration-300 group-hover:translate-x-0.5 sm:text-lg lg:text-xl">
                      {title}
                    </h3>
                    <p className={`mt-1.5 text-xs font-medium leading-5 transition-colors duration-300 sm:text-sm ${featured ? "text-blue-100/80" : darkMode ? "text-slate-400" : "text-slate-500"}`}>
                      {subtitle}
                    </p>
                    <div className={`mt-3 text-xs font-bold transition-colors duration-300 ${featured ? "text-white" : quickSale ? palette.quickSaleText : palette.accentText}`}>
                      {t.open}{" "}{isArabic ? "←" : "→"}
                    </div>
                  </div>

                </button>
              );
            })}

          </div>

          <section className="mt-8">
            <div className="mb-4">
              <h3 className="text-lg font-black tracking-tight sm:text-xl">{t.todayStatsTitle}</h3>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                ["📅", t.todayStats[0], "text-blue-400", "bg-blue-500/10"],
                ["💉", t.todayStats[1], "text-emerald-400", "bg-emerald-500/10"],
                ["📦", t.todayStats[2], "text-amber-400", "bg-amber-500/10"],
                ["⚠️", t.todayStats[3], "text-rose-400", "bg-rose-500/10"],
                ["⏳", t.todayStats[4], "text-violet-400", "bg-violet-500/10"],
              ].map(([icon, label, accent, iconBg], index) => ({ icon, label, accent, iconBg, index }))
              .filter(({ index }) => visibleStats.some((item) => item.index === index))
              .map(({ icon, label, accent, iconBg, index }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => goTo(["/appointments", "/vaccinations", "/inventory/products?stock=low", "/inventory/products?stock=out", "/inventory/products"][index])}
                  aria-label={`${label}: ${todayStats[index] ?? "—"}`}
                  className={`group min-h-[132px] rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-500/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 sm:p-5 ${darkMode ? "border-white/[0.06] bg-[#181B21]" : "border-slate-100 bg-white shadow-sm"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${iconBg}`}>{icon}</span>
                    <span className={`text-3xl font-black ${accent}`}>{todayStats[index] ?? "—"}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2"><p className={`text-sm font-bold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>{label}</p><span aria-hidden="true" className="text-xs text-slate-400 transition group-hover:translate-x-0.5">{isArabic ? "←" : "→"}</span></div>
                </button>
              ))}
            </div>
          </section>

          </div>
        </section>
      </div>
    </main>
  );
}
