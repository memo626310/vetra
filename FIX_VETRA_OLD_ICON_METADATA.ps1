$ErrorActionPreference = "Stop"
$ProjectRoot = (Get-Location).Path
$LayoutPath = Join-Path $ProjectRoot "app/client-interface/layout.tsx"
$ManifestPath = Join-Path $ProjectRoot "app/client-interface/manifest.ts"
$RequiredAssets = @(
  (Join-Path $ProjectRoot "public/vetra-client-icons-20261012/icon-180.png"),
  (Join-Path $ProjectRoot "public/vetra-client-icons-20261012/icon-192.png"),
  (Join-Path $ProjectRoot "public/vetra-client-icons-20261012/icon-512.png"),
  (Join-Path $ProjectRoot "public/vetra-client-icons-20261012/icon-maskable-512.png")
)

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "package.json"))) {
  throw "Run this script from the VETRA project root (folder containing package.json). Current folder: $ProjectRoot"
}
if (-not (Test-Path -LiteralPath $LayoutPath)) {
  throw "Missing app/client-interface/layout.tsx. No files were changed."
}
if (-not (Test-Path -LiteralPath $ManifestPath)) {
  throw "Missing app/client-interface/manifest.ts. No files were changed."
}
$MissingAssets = @($RequiredAssets | Where-Object { -not (Test-Path -LiteralPath $_) })
if ($MissingAssets.Count -gt 0) {
  throw ("Expected updated VETRA icon assets are missing locally. No files were changed:`n" + ($MissingAssets -join "`n") + "`nRe-run the asset installation patch first, then run this fix.")
}

$LayoutContent = [System.IO.File]::ReadAllText($LayoutPath)
$OldBlock = @'
  icons: {
    apple: [
      {
        url: "/client-interface/icons/icon-180",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
'@
$NewBlock = @'
  icons: {
    icon: [
      {
        url: "/vetra-client-icons-20261012/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/vetra-client-icons-20261012/icon-512.png",
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
'@

if ($LayoutContent.Contains('/vetra-client-icons-20261012/icon-180.png') -and
    $LayoutContent.Contains('/vetra-client-icons-20261012/icon-192.png') -and
    -not $LayoutContent.Contains('/client-interface/icons/icon-180')) {
  Write-Host "Client icon metadata already points to the new VETRA logo. No change needed." -ForegroundColor Green
  exit 0
}
if (-not $LayoutContent.Contains($OldBlock)) {
  throw "The expected old icon metadata block was not found exactly. No files were changed. Send me app/client-interface/layout.tsx so I can adapt the patch safely."
}

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupDir = Join-Path $ProjectRoot ".vetra-icon-backup\metadata-fix-$Stamp"
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
Copy-Item -LiteralPath $LayoutPath -Destination (Join-Path $BackupDir "layout.tsx") -Force
$Updated = $LayoutContent.Replace($OldBlock, $NewBlock)
if ($Updated -eq $LayoutContent) {
  throw "Replacement produced no changes. No files were changed."
}
[System.IO.File]::WriteAllText($LayoutPath, $Updated, [System.Text.UTF8Encoding]::new($false))

$Verified = [System.IO.File]::ReadAllText($LayoutPath)
if (-not $Verified.Contains('/vetra-client-icons-20261012/icon-180.png') -or
    -not $Verified.Contains('/vetra-client-icons-20261012/icon-192.png') -or
    $Verified.Contains('/client-interface/icons/icon-180')) {
  Copy-Item -LiteralPath (Join-Path $BackupDir "layout.tsx") -Destination $LayoutPath -Force
  throw "Post-write verification failed. The original layout.tsx was restored."
}

Write-Host "Fixed: client layout metadata now uses the new static VETRA logo icons." -ForegroundColor Green
Write-Host "Changed only: app/client-interface/layout.tsx" -ForegroundColor Green
Write-Host "Backup: $BackupDir" -ForegroundColor DarkGray
Write-Host "Next: run npm run build. If it passes, commit and push the layout.tsx change." -ForegroundColor Cyan
