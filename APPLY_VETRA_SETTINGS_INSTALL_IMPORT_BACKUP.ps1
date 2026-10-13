$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = (Get-Location).Path
$settingsPath = Join-Path $root 'app\settings\page.tsx'
$rootLayoutPath = Join-Path $root 'app\layout.tsx'
$componentsPath = Join-Path $root 'components'
$settingsLayoutPath = Join-Path $root 'app\settings\layout.tsx'
$settingsManifestPath = Join-Path $root 'app\settings\manifest.ts'

foreach ($required in @($settingsPath, $rootLayoutPath, $componentsPath)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required VETRA project path not found: $required. Run this script from the project root."
    }
}

$providerPath = Join-Path $componentsPath 'PwaInstallProvider.tsx'
if (Test-Path -LiteralPath $providerPath) {
    throw "components/PwaInstallProvider.tsx already exists. No files were changed; inspect it before retrying."
}
if (Test-Path -LiteralPath $settingsLayoutPath) {
    throw "app/settings/layout.tsx already exists. No files were changed; merge the clinic manifest metadata into that layout before retrying."
}
if (Test-Path -LiteralPath $settingsManifestPath) {
    throw "app/settings/manifest.ts already exists. No files were changed; inspect it before retrying."
}

function Replace-Once([string]$Content, [string]$Old, [string]$New, [string]$Label) {
    # Normalize line endings before matching so the patch works with both CRLF and LF checkouts.
    $Content = $Content.Replace("`r`n", "`n").Replace("`r", "`n")
    $Old = $Old.Replace("`r`n", "`n").Replace("`r", "`n")
    $New = $New.Replace("`r`n", "`n").Replace("`r", "`n")
    $index = $Content.IndexOf($Old, [System.StringComparison]::Ordinal)
    if ($index -lt 0) { throw "Patch anchor not found ($Label). No files have been written yet." }
    $second = $Content.IndexOf($Old, $index + $Old.Length, [System.StringComparison]::Ordinal)
    if ($second -ge 0) { throw "Patch anchor is not unique ($Label). No files have been written yet." }
    return $Content.Substring(0, $index) + $New + $Content.Substring($index + $Old.Length)
}

$settings = [System.IO.File]::ReadAllText($settingsPath).Replace("`r`n", "`n").Replace("`r", "`n")
$rootLayout = [System.IO.File]::ReadAllText($rootLayoutPath).Replace("`r`n", "`n").Replace("`r", "`n")
if ($settings.Contains('VETRA_SETTINGS_INSTALL_IMPORT_BACKUP_V1') -or $rootLayout.Contains('PwaInstallProvider')) {
    throw 'A VETRA install/import/backup patch appears to have been applied already. No files were changed.'
}

$settings = Replace-Once $settings 'import { useRouter } from "next/navigation";' ('import { useRouter } from "next/navigation";' + "`r`n" + 'import { usePwaInstall } from "@/components/PwaInstallProvider";') 'settings PWA hook import'

$billingType = @'
type BillingSettings = {
  id: string;
  clinic_id: string;
  consultation_fee: number | null;
  auto_add_consultation_fee: boolean;
};
'@
$backupTypes = @'
type BillingSettings = {
  id: string;
  clinic_id: string;
  consultation_fee: number | null;
  auto_add_consultation_fee: boolean;
};

const BACKUP_TABLES = [
  "clients",
  "pets",
  "visits",
  "visit_medications",
  "medications",
  "vaccinations",
  "appointments",
  "appointment_settings",
  "products",
  "product_categories",
  "inventory_movements",
  "invoices",
  "invoice_items",
  "billing_settings",
  "financial_accounts",
  "cash_register_sessions",
  "financial_transactions",
  "legacy_import_batches",
  "legacy_import_source_rows",
  "legacy_import_id_map",
] as const;

const BACKUP_PAGE_SIZE = 500;
const BACKUP_MAX_ROWS_PER_TABLE = 500_000;
const BACKUP_MAX_TOTAL_ROWS = 1_000_000;
'@
$settings = Replace-Once $settings $billingType $backupTypes 'backup table allowlist'

$arText = @'
    appearance: "المظهر واللغة",
'@
$arTextNew = @'
    appearance: "المظهر واللغة",
    appDataTools: "التطبيق والبيانات",
    appDataToolsHint: "تثبيت VETRA وإدارة نسخ بيانات العيادة.",
    installTitle: "تثبيت برنامج VETRA",
    installHint: "افتح VETRA كتطبيق مستقل للوصول الأسرع من الشاشة الرئيسية.",
    installButton: "تثبيت البرنامج",
    installHowTo: "طريقة التثبيت",
    appInstalled: "مثبّت بالفعل على هذا الجهاز",
    installAccepted: "تم طلب تثبيت VETRA.",
    installDismissed: "لم يتم تأكيد التثبيت. يمكنك المحاولة مرة أخرى أو استخدام قائمة المتصفح.",
    installIosHelp: "على iPhone أو iPad: افتح قائمة المشاركة في Safari ثم اختر «إضافة إلى الشاشة الرئيسية».",
    installManualHelp: "افتح قائمة المتصفح (⋮ أو ⋯)، ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» إن كانت متاحة.",
    importTitle: "استيراد قاعدة بيانات من نظام آخر",
    importHint: "افحص قاعدة النظام القديم واحفظ أرشيفها ثم راجع البيانات قبل نقلها إلى VETRA.",
    importButton: "فتح صفحة الاستيراد",
    backupTitle: "تصدير قاعدة البيانات / نسخة احتياطية",
    backupHint: "نزّل ملف JSON ببيانات العيادة المتاحة لحسابك. احتفظ به في مكان آمن؛ الملف يحتوي على بيانات عملاء وحيوانات وفواتير.",
    backupButton: "تصدير نسخة احتياطية",
    backupConfirm: "سيتم تنزيل ملف يحتوي على بيانات العيادة، ومنها بيانات العملاء والحيوانات والفواتير والحركات المالية. احفظ الملف في مكان آمن ولا تشاركه مع غير المخولين. هل تريد المتابعة؟",
    backupProgress: "جاري تجهيز نسخة من الجدول:",
    backupSuccess: "تم تنزيل نسخة بيانات العيادة بنجاح.",
    backupRows: "سجلًا",
    backupError: "تعذر إنشاء النسخة الاحتياطية:",
    backupTenantError: "توقف التصدير بسبب اختلاف معرف العيادة في البيانات؛ لم يتم تنزيل أي ملف.",
    backupLimitError: "تجاوز حجم البيانات الحد الوقائي للتصدير. استخدم نسخة قاعدة بيانات كاملة من مزود قاعدة البيانات.",
'@
$settings = Replace-Once $settings $arText $arTextNew 'Arabic settings labels'

$enText = @'
    appearance: "Appearance & language",
'@
$enTextNew = @'
    appearance: "Appearance & language",
    appDataTools: "App & data tools",
    appDataToolsHint: "Install VETRA and manage clinic data backups.",
    installTitle: "Install VETRA",
    installHint: "Use VETRA as a standalone app for faster access from your home screen.",
    installButton: "Install app",
    installHowTo: "How to install",
    appInstalled: "Already installed on this device",
    installAccepted: "VETRA installation was accepted.",
    installDismissed: "Installation was not confirmed. Try again or use the browser menu.",
    installIosHelp: "On iPhone or iPad: open Safari's Share menu, then choose “Add to Home Screen”.",
    installManualHelp: "Open your browser menu (⋮ or ⋯), then choose “Install app” or “Add to Home Screen” when available.",
    importTitle: "Import a database from another system",
    importHint: "Scan the legacy database, archive the source, and review the data before importing it into VETRA.",
    importButton: "Open import page",
    backupTitle: "Export database / backup",
    backupHint: "Download a JSON file of clinic data available to your account. Store it securely; it contains client, pet, invoice, and financial data.",
    backupButton: "Export backup",
    backupConfirm: "This file contains clinic data, including clients, pets, invoices, and financial transactions. Keep it in a secure location and do not share it with unauthorized people. Continue?",
    backupProgress: "Preparing backup for table:",
    backupSuccess: "Clinic data backup downloaded successfully.",
    backupRows: "records",
    backupError: "Could not create the backup:",
    backupTenantError: "Export stopped because a row returned a different clinic ID. No file was downloaded.",
    backupLimitError: "The export exceeded the safety limit. Use a full database backup from your database provider.",
'@
$settings = Replace-Once $settings $enText $enTextNew 'English settings labels'

$stateAnchor = @'
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
'@
$stateReplacement = @'
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [exportingBackup, setExportingBackup] = useState(false);
  const [backupProgress, setBackupProgress] = useState("");
  const [installHelp, setInstallHelp] = useState(false);
  const [installStatus, setInstallStatus] = useState("");
'@
$settings = Replace-Once $settings $stateAnchor $stateReplacement 'settings action state'

$hookAnchor = '  const t = text[language];'
$hookReplacement = @'
  const t = text[language];
  const { canInstall, isInstalled, isIOS, installApp } = usePwaInstall();
'@
$settings = Replace-Once $settings $hookAnchor $hookReplacement 'settings install hook'

$functionAnchor = '  async function changePassword() {'
$functionsToInsert = @'
  async function handleInstallApplication() {
    setInstallStatus("");
    if (isInstalled) return;
    if (!canInstall) {
      setInstallHelp((current) => !current);
      return;
    }

    try {
      const result = await installApp();
      if (result === "accepted") {
        setInstallStatus(t.installAccepted);
        setInstallHelp(false);
      } else if (result === "dismissed") {
        setInstallStatus(t.installDismissed);
      } else {
        setInstallHelp(true);
      }
    } catch (installError) {
      console.error("VETRA APP INSTALL ERROR:", installError);
      setInstallHelp(true);
    }
  }

  async function exportCurrentDatabase() {
    if (!context || exportingBackup) return;
    if (!window.confirm(t.backupConfirm)) return;

    setExportingBackup(true);
    setBackupProgress("");
    setError("");
    setMessage("");

    try {
      const db = await getClinicDb();
      const tables: Record<string, Record<string, unknown>[]> = {};
      let totalRows = 0;

      for (const tableName of BACKUP_TABLES) {
        const rowsForTable: Record<string, unknown>[] = [];
        let offset = 0;

        while (true) {
          setBackupProgress(`${t.backupProgress} ${tableName} · ${(offset + 1).toLocaleString(language === "ar" ? "ar-EG" : "en-US")}`);
          const { data, error: queryError } = await db
            .from(tableName)
            .select("*")
            .order("id", { ascending: true })
            .range(offset, offset + BACKUP_PAGE_SIZE - 1);

          if (queryError) {
            throw new Error(`${tableName}: ${queryError.message}`);
          }

          const pageRows = (data || []) as Record<string, unknown>[];
          for (const row of pageRows) {
            if (typeof row.clinic_id === "string" && row.clinic_id && row.clinic_id !== context.clinic_id) {
              throw new Error(t.backupTenantError);
            }
          }

          rowsForTable.push(...pageRows);
          offset += pageRows.length;
          totalRows += pageRows.length;

          if (rowsForTable.length > BACKUP_MAX_ROWS_PER_TABLE || totalRows > BACKUP_MAX_TOTAL_ROWS) {
            throw new Error(t.backupLimitError);
          }
          if (pageRows.length < BACKUP_PAGE_SIZE) break;
        }

        tables[tableName] = rowsForTable;
      }

      const rowCounts = Object.fromEntries(
        Object.entries(tables).map(([tableName, rows]) => [tableName, rows.length])
      );
      const payload = {
        format: "VETRA_CLINIC_DATA_BACKUP",
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        clinic: {
          id: context.clinic_id,
          name: context.clinic_name,
        },
        rowCounts,
        totalRows,
        tables,
        limitations: "Application data export only. This JSON does not include PostgreSQL schema, functions, triggers, RLS policies, authentication users, or external files; it is not a full SQL dump or one-click restore file.",
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeClinicName = (context.clinic_name || "VETRA")
        .replace(/[^a-zA-Z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 50) || "VETRA";
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      anchor.href = objectUrl;
      anchor.download = `VETRA-backup-${safeClinicName}-${timestamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      setMessage(`${t.backupSuccess} ${totalRows.toLocaleString(language === "ar" ? "ar-EG" : "en-US")} ${t.backupRows}`);
    } catch (backupError) {
      console.error("VETRA BACKUP EXPORT ERROR:", backupError);
      setError(`${t.backupError} ${backupError instanceof Error ? backupError.message : String(backupError)}`);
    } finally {
      setExportingBackup(false);
      setBackupProgress("");
    }
  }

  async function changePassword() {
'@
$settings = Replace-Once $settings $functionAnchor $functionsToInsert 'settings install and export functions'

$securityAnchor = @'
          <section
            className={`rounded-3xl border p-6 ${
              darkMode
                ? "border-white/[0.06] bg-[#13161B]"
                : "border-slate-100 bg-white"
            }`}
          >
            <div className="mb-6">
              <h2 className="text-xl font-black">{t.security}</h2>
'@
$toolsSection = @'
          {/* VETRA_SETTINGS_INSTALL_IMPORT_BACKUP_V1 */}
          <section
            className={`rounded-3xl border p-6 ${
              darkMode
                ? "border-white/[0.06] bg-[#13161B]"
                : "border-slate-100 bg-white"
            }`}
          >
            <h2 className="text-xl font-black">{t.appDataTools}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">{t.appDataToolsHint}</p>

            <div className="mt-5 space-y-4">
              <div className={`rounded-2xl border p-4 ${darkMode ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-bold">📲 {t.installTitle}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{t.installHint}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleInstallApplication()}
                    disabled={isInstalled}
                    className="shrink-0 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isInstalled ? `✓ ${t.appInstalled}` : canInstall ? `⬇ ${t.installButton}` : `⬇ ${isIOS ? t.installHowTo : t.installButton}`}
                  </button>
                </div>
                {installHelp && (
                  <p className={`mt-3 rounded-xl p-3 text-xs leading-6 ${darkMode ? "bg-white/[0.04] text-slate-300" : "bg-white text-slate-600"}`}>
                    {isIOS ? t.installIosHelp : t.installManualHelp}
                  </p>
                )}
                {installStatus && <p role="status" className="mt-3 text-xs font-semibold text-teal-500">{installStatus}</p>}
              </div>

              <div className={`rounded-2xl border p-4 ${darkMode ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-bold">🗃️ {t.importTitle}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{t.importHint}</p>
                  </div>
                  <button type="button" onClick={() => router.push("/settings/import")} className="shrink-0 rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 text-sm font-bold text-violet-500 transition hover:bg-violet-500/15">
                    {t.importButton}
                  </button>
                </div>
              </div>

              <div className={`rounded-2xl border p-4 ${darkMode ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-bold">💾 {t.backupTitle}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{t.backupHint}</p>
                  </div>
                  <button type="button" onClick={() => void exportCurrentDatabase()} disabled={exportingBackup || loading || !context} className="shrink-0 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {exportingBackup ? t.backupProgress : `⬇ ${t.backupButton}`}
                  </button>
                </div>
                {backupProgress && <p role="status" className="mt-3 break-words rounded-xl bg-blue-500/10 p-3 text-xs font-semibold text-blue-500">{backupProgress}</p>}
              </div>
            </div>
          </section>

          <section
            className={`rounded-3xl border p-6 ${
              darkMode
                ? "border-white/[0.06] bg-[#13161B]"
                : "border-slate-100 bg-white"
            }`}
          >
            <div className="mb-6">
              <h2 className="text-xl font-black">{t.security}</h2>
'@
$settings = Replace-Once $settings $securityAnchor $toolsSection 'insert settings action section'

$providerContent = @'
"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export type PwaInstallResult = "accepted" | "dismissed" | "unavailable";

type PwaInstallContextValue = {
  canInstall: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  installApp: () => Promise<PwaInstallResult>;
};

const PwaInstallContext = createContext<PwaInstallContextValue>({
  canInstall: false,
  isInstalled: false,
  isIOS: false,
  installApp: async () => "unavailable",
});

export function usePwaInstall() {
  return useContext(PwaInstallContext);
}

export default function PwaInstallProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const browserNavigator = window.navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || browserNavigator.standalone === true;
    setIsInstalled(standalone);

    const ios = /iPhone|iPad|iPod/i.test(window.navigator.userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    setIsIOS(ios);

    const isClientPortal = pathname === "/client-interface" || pathname.startsWith("/client-interface/");
    const hasClinicManifest = pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/settings" || pathname.startsWith("/settings/");
    if (isClientPortal || !hasClinicManifest) {
      setInstallPrompt(null);
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [pathname]);

  async function installApp(): Promise<PwaInstallResult> {
    const prompt = installPrompt;
    if (!prompt) return "unavailable";

    setInstallPrompt(null);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setIsInstalled(true);
      return choice.outcome;
    } catch (error) {
      console.error("VETRA PWA INSTALL PROMPT ERROR:", error);
      return "unavailable";
    }
  }

  return (
    <PwaInstallContext.Provider value={{ canInstall: Boolean(installPrompt), isInstalled, isIOS, installApp }}>
      {children}
    </PwaInstallContext.Provider>
  );
}
'@

$rootLayout = Replace-Once $rootLayout 'import ClinicMobileNavigation from "@/components/ClinicMobileNavigation";' ('import ClinicMobileNavigation from "@/components/ClinicMobileNavigation";' + "`r`n" + 'import PwaInstallProvider from "@/components/PwaInstallProvider";') 'root layout provider import'
$rootBodyOld = @'
      <body>
        <AuthGuard>{children}</AuthGuard>
        <ClinicMobileNavigation />
      </body>
'@
$rootBodyNew = @'
      <body>
        <PwaInstallProvider>
          <AuthGuard>{children}</AuthGuard>
          <ClinicMobileNavigation />
        </PwaInstallProvider>
      </body>
'@
$rootLayout = Replace-Once $rootLayout $rootBodyOld $rootBodyNew 'root layout provider wrapper'

$settingsLayoutContent = @'
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "VETRA Clinic Settings",
  applicationName: "VETRA Clinic",
  manifest: "/settings/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "VETRA Clinic",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/vetra-client-icons-20261012-androidfix/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/vetra-client-icons-20261012-androidfix/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/vetra-client-icons-20261012/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
'@

$settingsManifestContent = @'
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "VETRA Clinic",
    short_name: "VETRA Clinic",
    description: "VETRA veterinary clinic management app for doctors.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    display_override: ["standalone"],
    orientation: "portrait",
    background_color: "#F7F8FA",
    theme_color: "#0B2540",
    lang: "en",
    categories: ["medical", "productivity"],
    icons: [
      { src: "/vetra-client-icons-20261012-androidfix/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/vetra-client-icons-20261012-androidfix/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/vetra-client-icons-20261012-androidfix/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
'@

# Write only after all anchored replacements succeeded.
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $root ".vetra-settings-install-backup-$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Copy-Item -LiteralPath $settingsPath -Destination (Join-Path $backupDir 'settings-page.tsx')
Copy-Item -LiteralPath $rootLayoutPath -Destination (Join-Path $backupDir 'root-layout.tsx')

$utf8Bom = New-Object System.Text.UTF8Encoding($true)
$settings = [System.Text.RegularExpressions.Regex]::Replace($settings, "\r?\n", "`r`n")
$rootLayout = [System.Text.RegularExpressions.Regex]::Replace($rootLayout, "\r?\n", "`r`n")
$providerContent = [System.Text.RegularExpressions.Regex]::Replace($providerContent, "\r?\n", "`r`n")
$settingsLayoutContent = [System.Text.RegularExpressions.Regex]::Replace($settingsLayoutContent, "\r?\n", "`r`n")
$settingsManifestContent = [System.Text.RegularExpressions.Regex]::Replace($settingsManifestContent, "\r?\n", "`r`n")
[System.IO.File]::WriteAllText($settingsPath, $settings, $utf8Bom)
[System.IO.File]::WriteAllText($rootLayoutPath, $rootLayout, $utf8Bom)
[System.IO.File]::WriteAllText($providerPath, $providerContent, $utf8Bom)
[System.IO.File]::WriteAllText($settingsLayoutPath, $settingsLayoutContent, $utf8Bom)
[System.IO.File]::WriteAllText($settingsManifestPath, $settingsManifestContent, $utf8Bom)

Write-Host ''
Write-Host 'VETRA settings patch applied.' -ForegroundColor Green
Write-Host 'Added: persistent install button, legacy database import shortcut, JSON data backup export.' -ForegroundColor Green
Write-Host "Backup of modified files: $backupDir" -ForegroundColor Cyan
Write-Host 'Next: run npm run build. The JSON export is application data, not a full PostgreSQL SQL dump.' -ForegroundColor Yellow
