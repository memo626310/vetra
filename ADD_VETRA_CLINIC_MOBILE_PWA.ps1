$ErrorActionPreference = 'Stop'

# Run this script from the VETRA project root.
$root = (Get-Location).Path
if (-not (Test-Path (Join-Path $root 'package.json')) -or -not (Test-Path (Join-Path $root 'app'))) {
  throw 'Open PowerShell in the VETRA project root (the folder containing package.json and app), then run this script again.'
}

$icon192 = Join-Path $root 'public\vetra-client-icons-20261012-androidfix\icon-192.png'
$icon512 = Join-Path $root 'public\vetra-client-icons-20261012-androidfix\icon-512.png'
$iconMaskable = Join-Path $root 'public\vetra-client-icons-20261012-androidfix\icon-maskable-512.png'
$appleIcon = Join-Path $root 'public\vetra-client-icons-20261012\icon-180.png'
$requiredIcons = @($icon192, $icon512, $iconMaskable, $appleIcon)
$missingIcons = @($requiredIcons | Where-Object { -not (Test-Path $_) })
if ($missingIcons.Count -gt 0) {
  $missingList = ($missingIcons | ForEach-Object { ' - ' + $_ }) -join "`r`n"
  throw "One or more existing VETRA icon assets are missing; no files were changed:`r`n$missingList`r`nCheck that the previous app-icon patch was applied before running this script."
}

$dashboardDir = Join-Path $root 'app\dashboard'
New-Item -ItemType Directory -Force -Path $dashboardDir | Out-Null

$manifestPath = Join-Path $dashboardDir 'manifest.ts'
$layoutPath = Join-Path $dashboardDir 'layout.tsx'

# Preflight both destinations first so a conflict cannot leave a partial patch.
$destinationChecks = @(
  @{ Path = $manifestPath; Marker = 'VETRA_CLINIC_PWA_MANIFEST' },
  @{ Path = $layoutPath; Marker = 'VETRA_CLINIC_PWA_LAYOUT' }
)
foreach ($check in $destinationChecks) {
  if (Test-Path $check.Path) {
    $existing = Get-Content -LiteralPath $check.Path -Raw
    if (-not $existing.Contains($check.Marker)) {
      throw "File already exists and was not created by this patch; stopping without changing files: $($check.Path)"
    }
  }
}

$manifestContent = @'
import type { MetadataRoute } from "next";

// VETRA_CLINIC_PWA_MANIFEST
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
      {
        src: "/vetra-client-icons-20261012-androidfix/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/vetra-client-icons-20261012-androidfix/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/vetra-client-icons-20261012-androidfix/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
'@

$layoutContent = @'
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

// VETRA_CLINIC_PWA_LAYOUT
export const metadata: Metadata = {
  title: "VETRA Clinic",
  description: "VETRA veterinary clinic management app.",
  applicationName: "VETRA Clinic",
  manifest: "/dashboard/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "VETRA Clinic",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      {
        url: "/vetra-client-icons-20261012-androidfix/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/vetra-client-icons-20261012-androidfix/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/vetra-client-icons-20261012/icon-180.png",
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

export default function ClinicDashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
'@

function Write-VetraPwaFile([string]$Path, [string]$Content, [string]$Marker) {
  if (Test-Path $Path) {
    $existing = Get-Content -LiteralPath $Path -Raw
    if (-not $existing.Contains($Marker)) {
      throw "File already exists and was not created by this patch; stopping safely without overwriting it: $Path"
    }
    $backup = "$Path.vetra-pwa-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item -LiteralPath $Path -Destination $backup
    Write-Host "Backup created: $backup" -ForegroundColor Yellow
  }
  Set-Content -LiteralPath $Path -Value $Content -Encoding UTF8
  Write-Host "Updated: $Path" -ForegroundColor Green
}

Write-VetraPwaFile -Path $manifestPath -Content $manifestContent -Marker 'VETRA_CLINIC_PWA_MANIFEST'
Write-VetraPwaFile -Path $layoutPath -Content $layoutContent -Marker 'VETRA_CLINIC_PWA_LAYOUT'

Write-Host ''
Write-Host 'VETRA Clinic PWA files are ready.' -ForegroundColor Cyan
Write-Host 'No database, authentication, customer portal, or doctor-page logic was changed.'
Write-Host 'Next, run: npm run build' -ForegroundColor Cyan
