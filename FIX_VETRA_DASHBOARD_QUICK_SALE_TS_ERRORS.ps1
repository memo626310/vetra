$ErrorActionPreference = 'Stop'

$target = Join-Path (Get-Location) 'app\dashboard\page.tsx'
if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
  throw "Could not find app\dashboard\page.tsx. Open PowerShell in the VETRA project root and run this script again."
}

$content = [System.IO.File]::ReadAllText($target)
$pattern = '(?m)(^[ \t]*const \[title, subtitle, icon\] = card;)\r?\n(?:[ \t]*\r?\n)*[ \t]*\+[ \t]*\r?\n[ \t]*cardColors\[index\];\r?\n(?:[ \t]*\r?\n)*[ \t]*\+[ \t]*\r?\n[ \t]*index === 0;'

$replacement = @'
$1
              const colors = cardColors[index % cardColors.length];
              const featured = index === 0;
              const quickSale = index === 1;
'@

if ($content -match '(?m)^\s*const colors = cardColors\[index % cardColors\.length\];\s*$' -and
    $content -match '(?m)^\s*const featured = index === 0;\s*$' -and
    $content -match '(?m)^\s*const quickSale = index === 1;\s*$') {
  Write-Host 'The dashboard card variables are already fixed. No file changes were made.' -ForegroundColor Green
  exit 0
}

$regex = [System.Text.RegularExpressions.Regex]::new($pattern)
$evaluator = [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $replacement.Replace('$1', $match.Groups[1].Value) }
$updated = $regex.Replace($content, $evaluator, 1)

if ($updated -ceq $content) {
  throw "The expected broken block was not found. No file changes were made. Please send the current lines around the t.cards.map section in app\dashboard\page.tsx; this script will not guess or overwrite a different version."
}

$backup = "$target.quick-sale-fix-$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
Copy-Item -LiteralPath $target -Destination $backup
$encoding = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($target, $updated, $encoding)

Write-Host 'Fixed the dashboard card variables:' -ForegroundColor Green
Write-Host ' - colors uses a safe modulo index (the page has 10 cards but only 9 color presets).' 
Write-Host ' - featured identifies card 1 (New Visit).' 
Write-Host ' - quickSale identifies card 2 (Quick Sale).' 
Write-Host "Backup created: $backup"
Write-Host ''
Write-Host 'Next run: npm run build' -ForegroundColor Cyan
