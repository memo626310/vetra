"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { vetraCore } from "@/lib/vetra-core";

// VETRA_CLINIC_MOBILE_NAV_COMPONENT
// VETRA_CLINIC_NAV_TEAL_POLISH_V1
const PUBLIC_ROUTES = ["/", "/login", "/register", "/clinic-setup"];
const MORE_ITEMS = [
  { icon: "🟢", ar: "نشاط العملاء", en: "Client activity", href: "/dashboard/clients-activity" },
  { icon: "📅", ar: "المواعيد", en: "Appointments", href: "/appointments" },
  { icon: "💉", ar: "التطعيمات", en: "Vaccinations", href: "/vaccinations" },
  { icon: "📦", ar: "المخزون", en: "Inventory", href: "/inventory/products" },
  { icon: "💰", ar: "المالية", en: "Finance", href: "/finance" },
  { icon: "📊", ar: "التقارير", en: "Reports", href: "/reports" },
  { icon: "⚙️", ar: "الإعدادات", en: "Settings", href: "/settings" },
  { icon: "👤", ar: "الملف الشخصي", en: "Profile", href: "/profile" },
];

export default function ClinicMobileNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [loggingOut, setLoggingOut] = useState(false);

  const isClientPortal = pathname === "/client-interface" || pathname.startsWith("/client-interface/");
  const isPublic = PUBLIC_ROUTES.includes(pathname) || isClientPortal;

  useEffect(() => {
    const savedTheme = localStorage.getItem("vetra-theme");
    const savedDarkMode = localStorage.getItem("vetra-dark-mode");
    const savedLanguage = localStorage.getItem("vetra-language");
    if (savedTheme === "light" || savedDarkMode === "false") setDark(false);
    else if (savedTheme === "dark" || savedDarkMode === "true") setDark(true);
    if (savedLanguage === "en" || savedLanguage === "ar") setLanguage(savedLanguage);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (isPublic) {
      root.classList.remove("clinic-mobile-shell");
      setMoreOpen(false);
      return;
    }
    root.classList.add("clinic-mobile-shell");
    return () => root.classList.remove("clinic-mobile-shell");
  }, [isPublic, pathname]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  if (isPublic) return null;

  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  const goTo = (href: string) => { setMoreOpen(false); router.push(href); };
  const signOut = async () => {
    setLoggingOut(true);
    try {
      await Promise.all([vetraCore.auth.signOut(), supabase.auth.signOut()]);
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  const linkClass = (href: string) => `flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-bold sm:text-xs ${isActive(href) ? "text-teal-500" : ""}`;
  const surfaceClass = dark ? "border-white/10 bg-[#11151B]/95 text-slate-200" : "border-slate-200 bg-white/95 text-slate-700";

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-[90] lg:hidden" role="dialog" aria-modal="true" aria-label={language === "ar" ? "المزيد من أقسام العيادة" : "More clinic sections"}>
          <button type="button" aria-label={language === "ar" ? "إغلاق القائمة" : "Close menu"} className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
          <section className={`absolute inset-x-0 bottom-0 rounded-t-[2rem] border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl ${surfaceClass}`}>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-400/50" />
            <div className="mb-4 flex items-center justify-between">
              <div><h2 className="text-lg font-black">{language === "ar" ? "كل أقسام العيادة" : "All clinic sections"}</h2><p className="mt-1 text-xs opacity-60">VETRA Clinic</p></div>
              <button type="button" onClick={() => setMoreOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-500/10 text-xl" aria-label={language === "ar" ? "إغلاق" : "Close"}>×</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MORE_ITEMS.map((item) => (
                <button key={item.href} type="button" onClick={() => goTo(item.href)} className={`flex min-h-12 items-center gap-3 rounded-2xl border px-3 py-3 text-start text-sm font-bold active:scale-[0.98] ${dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-slate-50"}`}>
                  <span className="text-xl">{item.icon}</span><span>{language === "ar" ? item.ar : item.en}</span>
                </button>
              ))}
            </div>
            <button type="button" disabled={loggingOut} onClick={() => void signOut()} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-rose-500/10 px-4 py-3 font-bold text-rose-500 disabled:opacity-60">
              <span>↪</span>{loggingOut ? (language === "ar" ? "جاري تسجيل الخروج..." : "Signing out...") : (language === "ar" ? "تسجيل الخروج" : "Sign out")}
            </button>
          </section>
        </div>
      )}

      <nav className={`fixed inset-x-0 bottom-0 z-[80] border-t pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_rgba(0,0,0,0.08)] backdrop-blur-xl lg:hidden ${surfaceClass}`} aria-label={language === "ar" ? "التنقل الرئيسي" : "Main navigation"}>
        <div className="mx-auto grid min-h-[68px] max-w-xl grid-cols-5 items-stretch px-1">
          <button type="button" onClick={() => goTo("/dashboard")} className={linkClass("/dashboard")}><span className="text-xl leading-6">🏠</span><span className="truncate">{language === "ar" ? "الرئيسية" : "Home"}</span></button>
          <button type="button" onClick={() => goTo("/visits/new")} className={linkClass("/visits/new")}><span className="-mt-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-500 text-2xl text-[#062D40] shadow-lg shadow-teal-600/25">＋</span><span className="truncate">{language === "ar" ? "كشف جديد" : "New Visit"}</span></button>
          <button type="button" onClick={() => goTo("/clients")} className={linkClass("/clients")}><span className="text-xl leading-6">👥</span><span className="truncate">{language === "ar" ? "العملاء" : "Clients"}</span></button>
          <button type="button" onClick={() => goTo("/pets")} className={linkClass("/pets")}><span className="text-xl leading-6">🐾</span><span className="truncate">{language === "ar" ? "الحيوانات" : "Pets"}</span></button>
          <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)} className={linkClass("__more__")}><span className="text-xl leading-6">☰</span><span className="truncate">{language === "ar" ? "المزيد" : "More"}</span></button>
        </div>
      </nav>
    </>
  );
}
