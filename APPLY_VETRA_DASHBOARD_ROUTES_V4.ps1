$ErrorActionPreference = 'Stop'

$repoRoot = (Get-Location).Path
$dashboardPath = Join-Path $repoRoot 'app/dashboard/page.tsx'

if (-not (Test-Path -LiteralPath $dashboardPath)) {
  throw "app/dashboard/page.tsx was not found. Run this script from the VETRA repository root."
}

$dashboard = Get-Content -LiteralPath $dashboardPath -Raw -Encoding UTF8
$original = $dashboard

function Stop-Safe([string]$Message) {
  throw "$Message No dashboard write was performed."
}

# ============================================================
# 1) Wire the sidebar routes.
# ============================================================
$navMatch = [regex]::Match(
  $dashboard,
  '(?ms)(const\s+navItems\s*=\s*)\[.*?\];'
)

if (-not $navMatch.Success) {
  Stop-Safe "Could not locate the dashboard navItems block."
}

$navBlock = $navMatch.Value

if ($navBlock -notmatch 't\.nav\.clients\s*,\s*["'']\/clients["'']') {
  $newNavBlock = @'
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
'@

  $dashboard = $dashboard.Remove($navMatch.Index, $navMatch.Length).Insert($navMatch.Index, $newNavBlock)
}

# ============================================================
# 2) Wire the sidebar onClick to href.
# ============================================================
if ($dashboard -notmatch 'onClick=\{\(\)\s*=>\s*goTo\(href\)\}') {

  $sidebarPattern = '(?ms)(\{navItems\.map\(\(\[icon,\s*title\](?:,\s*index)?\)\s*=>\s*\{.*?<button\s+key=\{title\}\s+)(?:onClick=\{.*?\}\s*)?(className=)'

  $sidebarMatch = [regex]::Match($dashboard, $sidebarPattern)

  if (-not $sidebarMatch.Success) {
    Stop-Safe "Could not safely locate the dashboard sidebar button handler."
  }

  $replacement = $sidebarMatch.Groups[1].Value +
                  'onClick={() => goTo(href)}' +
                  "`r`n                  " +
                  $sidebarMatch.Groups[2].Value

  $dashboard =
    $dashboard.Remove($sidebarMatch.Index, $sidebarMatch.Length).
    Insert($sidebarMatch.Index, $replacement)
}

# ============================================================
# 3) Wire the dashboard cards.
# ============================================================
if ($dashboard -notmatch 'goTo\("/appointments"\)') {

  $cardsStart = $dashboard.IndexOf('{t.cards.map')
  if ($cardsStart -lt 0) {
    $cardsStart = $dashboard.IndexOf('t.cards.map')
  }

  if ($cardsStart -lt 0) {
    Stop-Safe "Could not locate the dashboard cards map."
  }

  $handlerStart = $dashboard.IndexOf('onClick={() => {', $cardsStart)
  if ($handlerStart -lt 0) {
    Stop-Safe "Could not locate the dashboard card click handler."
  }

  # Find the matching closing brace for the arrow-function body.
  $depth = 0
  $seenOpen = $false
  $handlerEnd = -1

  for ($i = $handlerStart; $i -lt $dashboard.Length; $i++) {
    $ch = $dashboard[$i]

    if ($ch -eq '{') {
      $depth++
      $seenOpen = $true
    }
    elseif ($ch -eq '}') {
      $depth--

      if ($seenOpen -and $depth -eq 0) {
        $handlerEnd = $i + 1
        break
      }
    }
  }

  if ($handlerEnd -lt 0) {
    Stop-Safe "Could not safely match the dashboard card click-handler braces."
  }

  $newCardHandler = @'
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
'@

  $dashboard =
    $dashboard.Remove($handlerStart, $handlerEnd - $handlerStart).
    Insert($handlerStart, $newCardHandler.TrimEnd())
}

# ============================================================
# 4) Wire Settings button to the existing Profile page through
#    a tiny /settings redirect route.
# ============================================================
if ($dashboard -notmatch 'goTo\("/settings"\)') {

  $settingsStart = $dashboard.IndexOf('{/* Settings */}')
  if ($settingsStart -lt 0) {
    Stop-Safe "Could not locate the dashboard Settings section."
  }

  $settingsButton = $dashboard.IndexOf('<button', $settingsStart)
  if ($settingsButton -lt 0) {
    Stop-Safe "Could not locate the dashboard Settings button."
  }

  $settingsClass = $dashboard.IndexOf('className=', $settingsButton)
  if ($settingsClass -lt 0) {
    Stop-Safe "Could not locate the Settings button className."
  }

  $dashboard =
    $dashboard.Substring(0, $settingsClass) +
    'onClick={() => goTo("/settings")}' +
    "`r`n              " +
    $dashboard.Substring($settingsClass)
}

# ============================================================
# 5) Create ONLY missing route files.
#    Existing files are never overwritten.
# ============================================================

$placeholderComponent = @'
import Link from "next/link";

type Props = {
  title: string;
  subtitle: string;
};

export default function DashboardModulePlaceholder({
  title,
  subtitle,
}: Props) {
  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#f7f9fc] px-5 py-8 text-slate-900"
    >
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center">
        <section className="w-full rounded-3xl border border-slate-100 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-3xl">
            🐾
          </div>

          <h1 className="mt-5 text-3xl font-black">{title}</h1>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">
            {subtitle}
          </p>

          <Link
            href="/dashboard"
            className="mt-7 inline-flex rounded-2xl bg-slate-900 px-6 py-3 text-sm font-bold text-white"
          >
            ← العودة للـDashboard
          </Link>
        </section>
      </div>
    </main>
  );
}
'@

$fullComponentPath = Join-Path $repoRoot 'components/DashboardModulePlaceholder.tsx'

if (-not (Test-Path -LiteralPath $fullComponentPath)) {
  Set-Content -LiteralPath $fullComponentPath -Value $placeholderComponent -Encoding UTF8
}

$appointmentsPage = @'
import DashboardModulePlaceholder from "@/components/DashboardModulePlaceholder";

export default function AppointmentsPage() {
  return (
    <DashboardModulePlaceholder
      title="المواعيد"
      subtitle="صفحة المواعيد موجودة الآن كـroute آمن، بدون تغيير أي منطق في الزيارات الحالية."
    />
  );
}
'@

$fullPath = Join-Path $repoRoot 'app/appointments/page.tsx'
if (-not (Test-Path -LiteralPath $fullPath)) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $fullPath) -Force | Out-Null
  Set-Content -LiteralPath $fullPath -Value $appointmentsPage -Encoding UTF8
}

$vaccinationsPage = @'
import DashboardModulePlaceholder from "@/components/DashboardModulePlaceholder";

export default function VaccinationsPage() {
  return (
    <DashboardModulePlaceholder
      title="التطعيمات"
      subtitle="صفحة التطعيمات موجودة الآن كـroute آمن، بدون تغيير سجل التطعيمات أو Client Portal."
    />
  );
}
'@

$fullPath = Join-Path $repoRoot 'app/vaccinations/page.tsx'
if (-not (Test-Path -LiteralPath $fullPath)) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $fullPath) -Force | Out-Null
  Set-Content -LiteralPath $fullPath -Value $vaccinationsPage -Encoding UTF8
}

$reportsPage = @'
import DashboardModulePlaceholder from "@/components/DashboardModulePlaceholder";

export default function ReportsPage() {
  return (
    <DashboardModulePlaceholder
      title="التقارير"
      subtitle="صفحة التقارير موجودة الآن كـroute آمن، بدون تعديل بيانات العيادة."
    />
  );
}
'@

$fullPath = Join-Path $repoRoot 'app/reports/page.tsx'
if (-not (Test-Path -LiteralPath $fullPath)) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $fullPath) -Force | Out-Null
  Set-Content -LiteralPath $fullPath -Value $reportsPage -Encoding UTF8
}

$financePage = @'
import { redirect } from "next/navigation";

export default function FinancePage() {
  redirect("/invoices");
}
'@

$fullPath = Join-Path $repoRoot 'app/finance/page.tsx'
if (-not (Test-Path -LiteralPath $fullPath)) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $fullPath) -Force | Out-Null
  Set-Content -LiteralPath $fullPath -Value $financePage -Encoding UTF8
}

$settingsPage = @'
import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/profile");
}
'@

$fullPath = Join-Path $repoRoot 'app/settings/page.tsx'
if (-not (Test-Path -LiteralPath $fullPath)) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $fullPath) -Force | Out-Null
  Set-Content -LiteralPath $fullPath -Value $settingsPage -Encoding UTF8
}

# ============================================================
# 6) Write dashboard only after all structural checks passed.
# ============================================================
if ($dashboard -ne $original) {
  $backupPath = "$dashboardPath.vetra-dashboard-backup-v4"
  Copy-Item -LiteralPath $dashboardPath -Destination $backupPath -Force
  Set-Content -LiteralPath $dashboardPath -Value $dashboard -Encoding UTF8
}

Write-Host ""
Write-Host "VETRA Dashboard Routes V4 applied successfully." -ForegroundColor Green
Write-Host "Backup: $dashboardPath.vetra-dashboard-backup-v4"
Write-Host ""
Write-Host "New/connected routes:"
Write-Host "  New Visit     -> /visits/new"
Write-Host "  Clients       -> /clients"
Write-Host "  Pets          -> /pets"
Write-Host "  Appointments  -> /appointments"
Write-Host "  Vaccinations  -> /vaccinations"
Write-Host "  Inventory     -> /inventory/products"
Write-Host "  Quick Lookup  -> /barcode-test"
Write-Host "  Finance       -> /finance -> /invoices"
Write-Host "  Reports       -> /reports"
Write-Host "  Settings      -> /settings -> /profile"
Write-Host ""
Write-Host "Existing route files were never overwritten."
