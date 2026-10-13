$ErrorActionPreference = "Stop"

$root = (Get-Location).Path
$dashboardPath = Join-Path $root "app/dashboard/page.tsx"
$navigationPath = Join-Path $root "components/ClinicMobileNavigation.tsx"

foreach ($required in @($dashboardPath, $navigationPath)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required file not found: $required. Run this script from the VETRA project root."
  }
}

$dashboard = [System.IO.File]::ReadAllText($dashboardPath, [System.Text.Encoding]::UTF8)
$navigation = [System.IO.File]::ReadAllText($navigationPath, [System.Text.Encoding]::UTF8)
$dashboardMarker = "VETRA_DASHBOARD_CURRENT_DESIGN_POLISH_V1"
$navigationMarker = "VETRA_CLINIC_NAV_TEAL_POLISH_V1"

function Replace-ExactlyOnce([string]$Source, [string]$Old, [string]$New, [string]$Label) {
  $count = ([regex]::Matches($Source, [regex]::Escape($Old))).Count
  if ($count -ne 1) {
    throw "Expected exactly one match for '$Label' but found $count. No files were written."
  }
  return $Source.Replace($Old, $New)
}

if ($dashboard -notmatch [regex]::Escape($dashboardMarker)) {
  # Keep the existing VETRA Dashboard layout and just improve phone-sized behavior.
  $dashboard = Replace-ExactlyOnce $dashboard '<section className="min-w-0 flex-1 p-3 transition-colors duration-500 sm:p-8 lg:p-12">' '<section className="min-w-0 flex-1 px-3 pb-5 pt-3 transition-colors duration-500 sm:p-8 lg:p-12">' "dashboard section spacing"
  $dashboard = Replace-ExactlyOnce $dashboard '<header className="mb-6 flex items-start justify-between gap-3 sm:mb-10 sm:gap-4">' '<header className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:mb-10 sm:gap-4">' "dashboard header wrap"
  $dashboard = Replace-ExactlyOnce $dashboard '<div className="flex shrink-0 items-center gap-2">' '<div className="flex shrink-0 items-center gap-1.5 sm:gap-2">' "dashboard header controls spacing"
  $dashboard = Replace-ExactlyOnce $dashboard 'flex h-12 items-center gap-2 rounded-2xl border px-3 text-sm font-bold transition-all duration-300 hover:-translate-y-0.5 active:scale-95 sm:px-4' 'flex h-10 items-center gap-2 rounded-2xl border px-3 text-sm font-bold transition-all duration-300 active:scale-95 sm:h-12 sm:px-4 sm:hover:-translate-y-0.5' "language button mobile size"
  $dashboard = Replace-ExactlyOnce $dashboard 'flex h-12 w-12 items-center justify-center rounded-2xl border text-xl transition-all duration-500 hover:-translate-y-0.5 active:scale-90' 'flex h-10 w-10 items-center justify-center rounded-2xl border text-xl transition-all duration-500 active:scale-90 sm:h-12 sm:w-12 sm:hover:-translate-y-0.5' "theme button mobile size"
  $dashboard = Replace-ExactlyOnce $dashboard '<span>
                  {t.language}
                </span>' '<span className="hidden sm:inline">
                  {t.language}
                </span>' "hide language text on narrow screens"
  $dashboard = Replace-ExactlyOnce $dashboard 'className={`rounded-full px-3 py-1 text-xs font-bold ${
                      databaseStatus === "ready"' 'className={`hidden sm:inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                      databaseStatus === "ready"' "compact database status chip"
  $dashboard = Replace-ExactlyOnce $dashboard '<div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">' '<div className="grid grid-cols-2 gap-2.5 sm:gap-5 xl:grid-cols-4">' "dashboard card grid gap"
  $dashboard = Replace-ExactlyOnce $dashboard 'group relative min-h-[164px] overflow-hidden rounded-3xl p-4 transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.005] active:scale-[0.98] sm:min-h-[220px] sm:rounded-[32px] sm:p-7 sm:hover:-translate-y-2 sm:hover:scale-[1.01]' 'group relative min-h-[150px] overflow-hidden rounded-2xl p-3 transition-all duration-300 ease-out active:scale-[0.98] sm:min-h-[220px] sm:rounded-[32px] sm:p-7 sm:hover:-translate-y-2 sm:hover:scale-[1.01]' "dashboard card compact sizing"
  $dashboard = Replace-ExactlyOnce $dashboard '"bg-blue-600 text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500 hover:shadow-xl hover:shadow-blue-900/30"' '"bg-[#0B2540] text-white shadow-lg shadow-slate-900/20 hover:bg-[#123B54] hover:shadow-xl hover:shadow-slate-900/30"' "main card VETRA navy color"
  $dashboard = Replace-ExactlyOnce $dashboard '"translate-y-1 text-blue-500 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"' '"text-teal-500 sm:translate-y-1 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100"' "mobile always-visible card action"
  $dashboard = Replace-ExactlyOnce $dashboard 'import { vetraCore } from "@/lib/vetra-core";' ('import { vetraCore } from "@/lib/vetra-core";' + "`r`n" + '// ' + $dashboardMarker) "dashboard polish marker"
}

if ($navigation -notmatch [regex]::Escape($navigationMarker)) {
  $navigation = Replace-ExactlyOnce $navigation 'isActive(href) ? "text-blue-500" : ""' 'isActive(href) ? "text-teal-500" : ""' "active mobile navigation accent"
  $navigation = Replace-ExactlyOnce $navigation 'bg-blue-600 text-2xl text-white shadow-lg shadow-blue-600/25' 'bg-teal-500 text-2xl text-[#062D40] shadow-lg shadow-teal-600/25' "new visit mobile button accent"
  $navigation = Replace-ExactlyOnce $navigation '// VETRA_CLINIC_MOBILE_NAV_COMPONENT' ('// VETRA_CLINIC_MOBILE_NAV_COMPONENT' + "`r`n" + '// ' + $navigationMarker) "mobile nav polish marker"
}

# All substitutions and anchor checks complete before writing any file.
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
foreach ($file in @($dashboardPath, $navigationPath)) {
  $backup = "$file.bak-current-mobile-$timestamp"
  Copy-Item -LiteralPath $file -Destination $backup
  Write-Host "Backup: $backup" -ForegroundColor DarkGray
}
[System.IO.File]::WriteAllText($dashboardPath, $dashboard, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($navigationPath, $navigation, [System.Text.UTF8Encoding]::new($false))

Write-Host "VETRA current-design mobile refinement applied." -ForegroundColor Green
Write-Host "Preserved the existing dashboard structure, section order, routes, and desktop sidebar." -ForegroundColor Cyan
Write-Host "Polished mobile header spacing, reduced card padding, made Open visible to touch users, and aligned primary accents to teal/navy." -ForegroundColor Cyan
Write-Host "Next run: npm run build. Do not push unless it succeeds." -ForegroundColor Yellow
