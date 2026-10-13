$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$dashboardPath = Join-Path $root 'app\dashboard\page.tsx'
$layoutPath = Join-Path $root 'app\layout.tsx'
$cssPath = Join-Path $root 'app\globals.css'
$componentPath = Join-Path $root 'components\ClinicMobileNavigation.tsx'

foreach ($required in @($dashboardPath, $layoutPath, $cssPath)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Missing required project file: $required. Run this script from your VETRA project root. No files were changed."
  }
}

function Read-Normalized([string]$Path) {
  return ([System.IO.File]::ReadAllText($Path) -replace "`r`n", "`n")
}
function Replace-OnceOrAlreadyApplied {
  param([string]$Text,[string]$Old,[string]$New,[string]$Label)
  $first = $Text.IndexOf($Old, [System.StringComparison]::Ordinal)
  if ($first -lt 0) {
    if ($Text.Contains($New)) { return $Text }
    throw "Patch stopped safely: couldn't find expected section '$Label'. No files were written."
  }
  $second = $Text.IndexOf($Old, $first + $Old.Length, [System.StringComparison]::Ordinal)
  if ($second -ge 0) { throw "Patch stopped safely: section '$Label' appears more than once. No files were written." }
  return $Text.Substring(0,$first) + $New + $Text.Substring($first + $Old.Length)
}

$dashboard = Read-Normalized $dashboardPath
$layout = Read-Normalized $layoutPath
$css = Read-Normalized $cssPath

# Only compact the dashboard's phone layout. Desktop sizes stay as they are.
$old = @'
        <section className="flex-1 p-5 transition-colors duration-500 sm:p-8 lg:p-12">
'@
$new = @'
        <section className="min-w-0 flex-1 p-3 transition-colors duration-500 sm:p-8 lg:p-12">
'@
$dashboard = Replace-OnceOrAlreadyApplied -Text $dashboard -Old $old -New $new -Label 'dashboard responsive padding'
$old = @'
          <header className="mb-10 flex items-start justify-between gap-4">
'@
$new = @'
          <header className="mb-6 flex items-start justify-between gap-3 sm:mb-10 sm:gap-4">
'@
$dashboard = Replace-OnceOrAlreadyApplied -Text $dashboard -Old $old -New $new -Label 'dashboard header spacing'
$old = @'
              <h2 className="text-2xl font-black tracking-tight sm:text-4xl">
'@
$new = @'
              <h2 className="text-xl font-black tracking-tight sm:text-4xl">
'@
$dashboard = Replace-OnceOrAlreadyApplied -Text $dashboard -Old $old -New $new -Label 'dashboard greeting size'
$old = @'
                className={`mt-3 max-w-2xl text-sm font-medium leading-7 transition-all duration-500 sm:text-base ${
'@
$new = @'
                className={`mt-2 max-w-2xl text-sm font-medium leading-6 transition-all duration-500 sm:mt-3 sm:text-base sm:leading-7 ${
'@
$dashboard = Replace-OnceOrAlreadyApplied -Text $dashboard -Old $old -New $new -Label 'dashboard greeting description'
$old = @'
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
'@
$new = @'
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
'@
$dashboard = Replace-OnceOrAlreadyApplied -Text $dashboard -Old $old -New $new -Label 'dashboard action grid'
$old = @'
                  className={`group relative min-h-[220px] overflow-hidden rounded-[32px] p-7 transition-all duration-300 ease-out hover:-translate-y-2 hover:scale-[1.01] active:scale-[0.98] ${
'@
$new = @'
                  className={`group relative min-h-[164px] overflow-hidden rounded-3xl p-4 transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.005] active:scale-[0.98] sm:min-h-[220px] sm:rounded-[32px] sm:p-7 sm:hover:-translate-y-2 sm:hover:scale-[1.01] ${
'@
$dashboard = Replace-OnceOrAlreadyApplied -Text $dashboard -Old $old -New $new -Label 'dashboard card container'
$old = @'
                    className={`relative mb-7 flex h-16 w-16 items-center justify-center rounded-3xl text-3xl transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 ${
'@
$new = @'
                    className={`relative mb-4 flex h-11 w-11 items-center justify-center rounded-2xl text-2xl transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 sm:mb-7 sm:h-16 sm:w-16 sm:rounded-3xl sm:text-3xl ${
'@
$dashboard = Replace-OnceOrAlreadyApplied -Text $dashboard -Old $old -New $new -Label 'dashboard card icon sizing'
$old = @'
                  <h3 className="relative text-2xl font-black tracking-tight transition-transform duration-300 group-hover:translate-x-1">
'@
$new = @'
                  <h3 className="relative text-base font-black tracking-tight transition-transform duration-300 group-hover:translate-x-1 sm:text-2xl">
'@
$dashboard = Replace-OnceOrAlreadyApplied -Text $dashboard -Old $old -New $new -Label 'dashboard card heading sizing'
$old = @'
                    className={`relative mt-3 text-base font-medium leading-7 transition-colors duration-300 ${
'@
$new = @'
                    className={`relative mt-2 text-xs font-medium leading-5 transition-colors duration-300 sm:mt-3 sm:text-base sm:leading-7 ${
'@
$dashboard = Replace-OnceOrAlreadyApplied -Text $dashboard -Old $old -New $new -Label 'dashboard card subtitle sizing'
$old = @'
                    className={`relative mt-6 text-sm font-bold transition-all duration-300 ${
'@
$new = @'
                    className={`relative mt-4 text-xs font-bold transition-all duration-300 sm:mt-6 sm:text-sm ${
'@
$dashboard = Replace-OnceOrAlreadyApplied -Text $dashboard -Old $old -New $new -Label 'dashboard card action spacing'

# The shared navigation is shown only inside authenticated clinic routes. Client portal and auth pages stay untouched.
$componentContent = @'
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { vetraCore } from "@/lib/vetra-core";

// VETRA_CLINIC_MOBILE_NAV_COMPONENT
const PUBLIC_ROUTES = ["/", "/login", "/register", "/clinic-setup"];
const MORE_ITEMS = [
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

  const linkClass = (href: string) => `flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-bold sm:text-xs ${isActive(href) ? "text-blue-500" : ""}`;
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
          <button type="button" onClick={() => goTo("/visits/new")} className={linkClass("/visits/new")}><span className="-mt-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white shadow-lg shadow-blue-600/25">＋</span><span className="truncate">{language === "ar" ? "كشف جديد" : "New Visit"}</span></button>
          <button type="button" onClick={() => goTo("/clients")} className={linkClass("/clients")}><span className="text-xl leading-6">👥</span><span className="truncate">{language === "ar" ? "العملاء" : "Clients"}</span></button>
          <button type="button" onClick={() => goTo("/pets")} className={linkClass("/pets")}><span className="text-xl leading-6">🐾</span><span className="truncate">{language === "ar" ? "الحيوانات" : "Pets"}</span></button>
          <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)} className={linkClass("__more__")}><span className="text-xl leading-6">☰</span><span className="truncate">{language === "ar" ? "المزيد" : "More"}</span></button>
        </div>
      </nav>
    </>
  );
}
'@

if (Test-Path -LiteralPath $componentPath) {
  $existingComponent = Read-Normalized $componentPath
  if (-not $existingComponent.Contains('VETRA_CLINIC_MOBILE_NAV_COMPONENT')) {
    throw "A different components\ClinicMobileNavigation.tsx already exists. No files were written. Review it before proceeding."
  }
}

# Integrate the shared component into the root layout, without changing the client portal.
if (-not $layout.Contains('import ClinicMobileNavigation from "@/components/ClinicMobileNavigation";')) {
  $old = @'
import AuthGuard from "@/components/AuthGuard";
'@
  $new = @'
import AuthGuard from "@/components/AuthGuard";
import ClinicMobileNavigation from "@/components/ClinicMobileNavigation";
'@
  $layout = Replace-OnceOrAlreadyApplied -Text $layout -Old $old -New $new -Label 'root layout import'
}
if (-not $layout.Contains('<ClinicMobileNavigation />')) {
  $old = @'
        <AuthGuard>{children}</AuthGuard>
'@
  $new = @'
        <AuthGuard>{children}</AuthGuard>
        <ClinicMobileNavigation />
'@
  $layout = Replace-OnceOrAlreadyApplied -Text $layout -Old $old -New $new -Label 'root layout navigation mount'
}

# Reserve space for the fixed bottom bar on phones only, and only when the clinic shell is active.
if (-not $css.Contains('VETRA_CLINIC_MOBILE_SHELL_CSS')) {
  $css = $css.TrimEnd() + @'

/* VETRA_CLINIC_MOBILE_SHELL_CSS */
@media (max-width: 1023px) {
  html.clinic-mobile-shell body {
    padding-bottom: calc(5rem + env(safe-area-inset-bottom));
  }
}
'@
}

# Prepare all changes in memory first; only now create backups and write.
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backups = @()
foreach ($path in @($dashboardPath,$layoutPath,$cssPath)) {
  $backup = "$path.bak-mobile-$timestamp"
  [System.IO.File]::Copy($path,$backup,$false)
  $backups += $backup
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($dashboardPath,$dashboard,$utf8NoBom)
[System.IO.File]::WriteAllText($layoutPath,$layout,$utf8NoBom)
[System.IO.File]::WriteAllText($cssPath,$css,$utf8NoBom)
[System.IO.File]::WriteAllText($componentPath,$componentContent,$utf8NoBom)

Write-Host ''
Write-Host 'VETRA mobile experience patch applied.' -ForegroundColor Green
Write-Host 'Added responsive dashboard cards and a shared clinic bottom navigation for phone screens.'
Write-Host 'Client portal and desktop navigation remain separate.'
Write-Host 'Backups:' -ForegroundColor Cyan
$backups | ForEach-Object { Write-Host "  $_" }
Write-Host 'Next: run npm run build. Do not push until the build passes.' -ForegroundColor Cyan
