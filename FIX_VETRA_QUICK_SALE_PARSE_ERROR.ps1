$ErrorActionPreference = 'Stop'

$target = Join-Path (Get-Location) 'app\invoices\new\page.tsx'
if (-not (Test-Path -LiteralPath $target)) {
  throw "Cannot find app\invoices\new\page.tsx. Run this script from your VETRA project root."
}

$source = [System.IO.File]::ReadAllText($target, [System.Text.Encoding]::UTF8)
$pattern = '(?s)<h1 className="text-3xl font-black">\s*\{quickSaleMode\s*</h1>\s*<p className="mt-1 text-sm text-slate-500">\s*\{language === "ar"\s*\?\s*"منتجات \+ خدمات في فاتورة واحدة"\s*:\s*"Products \+ services in one invoice"\s*\}\s*</p>'

$replacement = @'
<h1 className="text-3xl font-black">
              {quickSaleMode
                ? (language === "ar" ? "بيع سريع" : "Quick Sale")
                : (language === "ar" ? "فاتورة جديدة" : "New Invoice")}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {quickSaleMode
                ? (language === "ar" ? "أضف المنتجات بالبحث أو الباركود وأصدر الفاتورة بسرعة" : "Add products by search or barcode and issue the invoice quickly")
                : (language === "ar" ? "منتجات + خدمات في فاتورة واحدة" : "Products + services in one invoice")}
            </p>
'@

if ([regex]::IsMatch($source, $pattern)) {
  $backup = "$target.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $target -Destination $backup
  $updated = [regex]::Replace($source, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $replacement }, 1)
  if ($updated -eq $source) { throw 'Replacement did not change the file; refusing to continue.' }
  [System.IO.File]::WriteAllText($target, $updated, (New-Object System.Text.UTF8Encoding($true)))
  Write-Host "Fixed malformed Quick Sale heading and subtitle." -ForegroundColor Green
  Write-Host "Backup: $backup" -ForegroundColor Cyan
} elseif ($source -match '<h1 className="text-3xl font-black">\s*\{quickSaleMode\s*</h1>') {
  $backup = "$target.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $target -Destination $backup
  $heading = @'
<h1 className="text-3xl font-black">
              {quickSaleMode
                ? (language === "ar" ? "بيع سريع" : "Quick Sale")
                : (language === "ar" ? "فاتورة جديدة" : "New Invoice")}
            </h1>
'@
  $updated = [regex]::Replace($source, '<h1 className="text-3xl font-black">\s*\{quickSaleMode\s*</h1>', [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $heading }, 1)
  [System.IO.File]::WriteAllText($target, $updated, (New-Object System.Text.UTF8Encoding($true)))
  Write-Host "Fixed malformed Quick Sale heading." -ForegroundColor Green
  Write-Host "Backup: $backup" -ForegroundColor Cyan
} elseif ($source -match '\{quickSaleMode\s*\?\s*\(language === "ar" \? "بيع سريع"') {
  Write-Host 'The Quick Sale heading already appears to be fixed. No changes made.' -ForegroundColor Yellow
} else {
  throw 'Could not find the expected malformed heading. No files were changed; send the current lines around the <h1> to inspect safely.'
}

$verified = [System.IO.File]::ReadAllText($target, [System.Text.Encoding]::UTF8)
if ($verified -match '<h1 className="text-3xl font-black">\s*\{quickSaleMode\s*</h1>') {
  throw 'Verification failed: malformed heading remains in the file.'
}
Write-Host 'Verification passed: malformed Quick Sale heading is no longer present.' -ForegroundColor Green
Write-Host 'Next, run: npm run build' -ForegroundColor Cyan
