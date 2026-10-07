$ErrorActionPreference = "Stop"

$root = (Get-Location).Path
$visitPath = Join-Path $root "app\visits\new\page.tsx"
$componentPath = Join-Path $root "components\BSAVAFormularyPicker.tsx"
$payloadComponent = Join-Path $root "BSAVAFormularyPicker_v4_clinic_concentration.tsx"

foreach ($p in @($visitPath, $payloadComponent)) {
    if (-not (Test-Path -LiteralPath $p)) {
        throw "Missing required file: $p"
    }
}

function Read-Utf8([string]$Path) {
    [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}
function Write-Utf8NoBom([string]$Path, [string]$Content) {
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $enc)
}
function Backup-Once([string]$Path) {
    $bak = "$Path.bak"
    if (-not (Test-Path -LiteralPath $bak)) {
        Copy-Item -LiteralPath $Path -Destination $bak -Force
    }
}

$visit = Read-Utf8 $visitPath
$component = Read-Utf8 $payloadComponent

# The integration was already installed; this updater only makes the component
# TypeScript-safe and cleans the temporary root-level source file that would
# otherwise be included by Next/TypeScript during build.
if (-not $visit.Contains("BSAVAFormularyPicker")) {
    throw "New Visit does not contain BSAVAFormularyPicker. Install the previous integration first."
}

Backup-Once $componentPath
Write-Utf8NoBom $componentPath $component

# Remove the temporary source file from project root after copying it into
# components/. This prevents duplicate type-checking of the staging file.
Remove-Item -LiteralPath $payloadComponent -Force

Write-Host ""
Write-Host "VETRA Formulary TypeScript fix installed." -ForegroundColor Green
Write-Host "Nullable volume calculations are type-safe." -ForegroundColor Cyan
Write-Host "Temporary root-level component source removed." -ForegroundColor Cyan
Write-Host ""
Write-Host "Next: npm run build" -ForegroundColor Yellow
