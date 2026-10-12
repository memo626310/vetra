$ErrorActionPreference = "Stop"

$projectRoot = (Get-Location).Path
if (-not (Test-Path (Join-Path $projectRoot "package.json"))) {
  throw "Run this script from the VETRA project root (the folder containing package.json)."
}
if (-not (Test-Path (Join-Path $projectRoot "app\client-interface"))) {
  throw "The app\client-interface folder was not found. Stop: no files were changed."
}

$manifest = @'
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/client-interface",
    name: "VETRA Care",
    short_name: "VETRA",
    description: "Your pet's health records, vaccines, and care reminders.",
    start_url: "/client-interface",
    scope: "/client-interface",
    display: "standalone",
    display_override: ["standalone"],
    orientation: "portrait",
    background_color: "#F8FAFC",
    theme_color: "#0B2540",
    lang: "en",
    dir: "auto",
    categories: ["medical", "lifestyle"],
    icons: [
      {
        src: "/client-interface/icons/icon-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/client-interface/icons/icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}
'@

$layout = @'
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import ClientAppInstallPrompt from "@/components/client-interface/ClientAppInstallPrompt";

export const metadata: Metadata = {
  title: "VETRA Care",
  description: "Your pet's health records, vaccines, and care reminders.",
  applicationName: "VETRA Care",
  manifest: "/client-interface/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "VETRA",
    statusBarStyle: "default",
  },
  icons: {
    apple: [
      {
        url: "/client-interface/icons/icon-180",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B2540",
};

export default function ClientInterfaceLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <>
      {children}
      <ClientAppInstallPrompt />
    </>
  );
}
'@

$installPrompt = @'
"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type Language = "ar" | "en";

export default function ClientAppInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("vetra-language");
    setLanguage(savedLanguage === "ar" ? "ar" : "en");

    const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
    const isAlreadyInstalled =
      window.matchMedia("(display-mode: standalone)").matches ||
      navigatorWithStandalone.standalone === true;

    if (isAlreadyInstalled) {
      setInstalled(true);
      return;
    }

    const iosDevice =
      /iPhone|iPad|iPod/i.test(window.navigator.userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    setIsIOS(iosDevice);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const handleAppInstalled = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (installed || dismissed || (!installEvent && !isIOS)) return null;

  const isArabic = language === "ar";
  const title = isArabic ? "\u062b\u0628\u0651\u062a VETRA \u0639\u0644\u0649 \u0645\u0648\u0628\u0627\u064a\u0644\u0643" : "Install VETRA on your phone";
  const subtitle = isArabic
    ? "\u0648\u0635\u0648\u0644 \u0623\u0633\u0631\u0639 \u0644\u0645\u0644\u0641 \u062d\u064a\u0648\u0627\u0646\u0643 \u0648\u062a\u0637\u0639\u064a\u0645\u0627\u062a\u0647 \u0648\u0645\u062a\u0627\u0628\u0639\u062a\u0647."
    : "Quick access to your pet's records, vaccines, and care.";
  const installLabel = isArabic ? "\u062a\u062b\u0628\u064a\u062a" : "Install";
  const closeLabel = isArabic ? "\u0625\u062e\u0641\u0627\u0621" : "Dismiss";
  const instruction = isArabic
    ? "\u0644\u062a\u062b\u0628\u064a\u062a VETRA \u0639\u0644\u0649 iPhone: \u0627\u0636\u063a\u0637 \u0645\u0634\u0627\u0631\u0643\u0629 \u062b\u0645 \u00ab\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629 \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629\u00bb."
    : "On iPhone: tap Share, then choose \u201cAdd to Home Screen\u201d.";

  async function installApp() {
    if (!installEvent) {
      setShowIOSInstructions((current) => !current);
      return;
    }

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallEvent(null);
  }

  return (
    <aside
      dir={isArabic ? "rtl" : "ltr"}
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-md rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
      aria-label={title}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0B2540] text-xl font-black text-white">
          V<span className="ml-0.5 text-cyan-300">.</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-slate-300">{subtitle}</p>
          {isIOS && showIOSInstructions && (
            <p className="mt-2 rounded-lg bg-slate-100 p-2 text-xs leading-5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {instruction}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={installApp}
              className="rounded-lg bg-[#0B2540] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#123F61]"
            >
              {isIOS && !installEvent
                ? (isArabic ? "\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u062a\u062b\u0628\u064a\u062a" : "How to install")
                : installLabel}
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {closeLabel}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
'@

$icon180 = @'
import { createElement } from "react";
import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  const mark = createElement(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "68%",
        height: "68%",
        border: "6px solid #37C6D0",
        borderRadius: "34%",
        color: "#FFFFFF",
        fontSize: 112,
        fontWeight: 800,
        fontFamily: "Arial, Helvetica, sans-serif",
      },
    },
    "V",
  );
  const dot = createElement("div", {
    style: {
      position: "absolute",
      top: "17%",
      right: "17%",
      width: 25,
      height: 25,
      borderRadius: "999px",
      backgroundColor: "#37C6D0",
      border: "5px solid #0B2540",
    },
  });
  const image = createElement("div", {
    style: {
      display: "flex",
      position: "relative",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      background: "linear-gradient(145deg, #0B2540 0%, #123F61 100%)",
    },
  }, mark, dot);
  return new ImageResponse(image, { width: 180, height: 180 });
}
'@

$icon192 = @'
import { createElement } from "react";
import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  const mark = createElement(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "68%",
        height: "68%",
        border: "6px solid #37C6D0",
        borderRadius: "34%",
        color: "#FFFFFF",
        fontSize: 122,
        fontWeight: 800,
        fontFamily: "Arial, Helvetica, sans-serif",
      },
    },
    "V",
  );
  const dot = createElement("div", {
    style: {
      position: "absolute",
      top: "17%",
      right: "17%",
      width: 27,
      height: 27,
      borderRadius: "999px",
      backgroundColor: "#37C6D0",
      border: "5px solid #0B2540",
    },
  });
  const image = createElement("div", {
    style: {
      display: "flex",
      position: "relative",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      background: "linear-gradient(145deg, #0B2540 0%, #123F61 100%)",
    },
  }, mark, dot);
  return new ImageResponse(image, { width: 192, height: 192 });
}
'@

$icon512 = @'
import { createElement } from "react";
import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  const mark = createElement(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "68%",
        height: "68%",
        border: "18px solid #37C6D0",
        borderRadius: "34%",
        color: "#FFFFFF",
        fontSize: 325,
        fontWeight: 800,
        fontFamily: "Arial, Helvetica, sans-serif",
      },
    },
    "V",
  );
  const dot = createElement("div", {
    style: {
      position: "absolute",
      top: "17%",
      right: "17%",
      width: 72,
      height: 72,
      borderRadius: "999px",
      backgroundColor: "#37C6D0",
      border: "14px solid #0B2540",
    },
  });
  const image = createElement("div", {
    style: {
      display: "flex",
      position: "relative",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      background: "linear-gradient(145deg, #0B2540 0%, #123F61 100%)",
    },
  }, mark, dot);
  return new ImageResponse(image, { width: 512, height: 512 });
}
'@

$files = @(
  @{ Path = "app\client-interface\manifest.ts"; Content = $manifest },
  @{ Path = "app\client-interface\layout.tsx"; Content = $layout },
  @{ Path = "components\client-interface\ClientAppInstallPrompt.tsx"; Content = $installPrompt },
  @{ Path = "app\client-interface\icons\icon-180\route.ts"; Content = $icon180 },
  @{ Path = "app\client-interface\icons\icon-192\route.ts"; Content = $icon192 },
  @{ Path = "app\client-interface\icons\icon-512\route.ts"; Content = $icon512 }
)

$encoding = New-Object System.Text.UTF8Encoding($false)
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
foreach ($file in $files) {
  $path = Join-Path $projectRoot $file.Path
  $directory = Split-Path -Parent $path
  if (-not (Test-Path $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  if (Test-Path $path) {
    $backupPath = "$path.vetra-pwa-backup-$timestamp"
    Copy-Item -LiteralPath $path -Destination $backupPath
    Write-Host "Backup created: $backupPath" -ForegroundColor Yellow
  }
  [System.IO.File]::WriteAllText($path, $file.Content, $encoding)
  Write-Host "Created: $($file.Path)" -ForegroundColor Green
}

Write-Host "" 
Write-Host "VETRA client PWA files are in place." -ForegroundColor Cyan
Write-Host "No existing page, database, authentication logic, or service-worker cache was changed." -ForegroundColor Cyan
Write-Host "Next, run: npm run build" -ForegroundColor Yellow
