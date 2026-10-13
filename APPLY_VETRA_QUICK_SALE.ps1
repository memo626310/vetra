$ErrorActionPreference = "Stop"

function Replace-Once([string]$Text, [string]$Old, [string]$New, [string]$Label) {
  $count = [regex]::Matches($Text, [regex]::Escape($Old)).Count
  if ($count -ne 1) {
    throw "Patch stopped safely: expected one match for '$Label', found $count. No files have been changed."
  }
  return $Text.Replace($Old, $New)
}

$root = (Get-Location).Path
$dashboardPath = Join-Path $root "app\dashboard\page.tsx"
$invoicePath = Join-Path $root "app\invoices\new\page.tsx"
if (-not (Test-Path (Join-Path $root "package.json"))) {
  throw "Open PowerShell in the VETRA project root first. package.json was not found in: $root"
}
foreach ($path in @($dashboardPath, $invoicePath)) {
  if (-not (Test-Path $path)) { throw "Required file not found: $path" }
}

$dashboard = [System.IO.File]::ReadAllText($dashboardPath)
$invoice = [System.IO.File]::ReadAllText($invoicePath)
$dashboard = $dashboard -replace "`r`n", "`n"
$invoice = $invoice -replace "`r`n", "`n"

# 1) Add the Quick Sale tile immediately after New Visit in both languages.
$dashboard = Replace-Once $dashboard '      ["زيارة جديدة", "ابدأ كشف جديد", "🩺"],' ('      ["زيارة جديدة", "ابدأ كشف جديد", "🩺"],' + "`n" + '      ["بيع سريع", "إنشاء فاتورة بيع بسرعة", "🛒"],') "Arabic dashboard card"
$dashboard = Replace-Once $dashboard '      ["New Visit", "Start a new visit", "🩺"],' ('      ["New Visit", "Start a new visit", "🩺"],' + "`n" + '      ["Quick Sale", "Create a sales invoice fast", "🛒"],') "English dashboard card"

# 2) Make color selection safe now that the dashboard has one extra tile.
$dashboard = Replace-Once $dashboard '              const colors =' + "`n" + '                cardColors[index];' ('              const colors =' + "`n" + '                cardColors[index % cardColors.length];') "dashboard card colors"
$dashboard = Replace-Once $dashboard '              const featured =' + "`n" + '                index === 0;' ('              const featured =' + "`n" + '                index === 0;' + "`n" + "`n" + '              const quickSale =' + "`n" + '                index === 1;') "featured card flag"

# 3) Keep New Visit as the primary tile and give Quick Sale a restrained teal treatment.
$oldCardStyle = @'
                    featured
                      ? "bg-[#0B2540] text-white shadow-lg shadow-slate-900/20 hover:bg-[#123B54] hover:shadow-xl hover:shadow-slate-900/30"
                      : darkMode
                        ? "border border-white/[0.06] bg-[#181B21] text-white shadow-sm hover:border-white/[0.10] hover:bg-[#1C2026] hover:shadow-xl"
                        : "border border-slate-100 bg-white text-slate-800 shadow-sm hover:border-slate-200 hover:shadow-xl"
'@
$newCardStyle = @'
                    featured
                      ? "bg-[#0B2540] text-white shadow-lg shadow-slate-900/20 hover:bg-[#123B54] hover:shadow-xl hover:shadow-slate-900/30"
                      : quickSale
                        ? darkMode
                          ? "border border-teal-400/20 bg-teal-500/10 text-white shadow-sm hover:border-teal-300/30 hover:bg-teal-500/[0.14] hover:shadow-md"
                          : "border border-teal-100 bg-teal-50 text-slate-800 shadow-sm hover:border-teal-300 hover:shadow-md"
                        : darkMode
                          ? "border border-white/[0.06] bg-[#181B21] text-white shadow-sm hover:border-white/[0.10] hover:bg-[#1C2026] hover:shadow-xl"
                          : "border border-slate-100 bg-white text-slate-800 shadow-sm hover:border-slate-200 hover:shadow-xl"
'@
$dashboard = Replace-Once $dashboard $oldCardStyle.TrimEnd([char[]]@([char]13, [char]10)) $newCardStyle.TrimEnd([char[]]@([char]13, [char]10)) "dashboard card styling"

$oldIconStyle = @'
                      featured
                        ? "bg-white/15"
                        : `${darkMode ? colors.dark : colors.light} ${colors.icon}`
'@
$newIconStyle = @'
                      featured
                        ? "bg-white/15"
                        : quickSale
                          ? darkMode
                            ? "bg-teal-500/15 text-teal-300"
                            : "bg-teal-100 text-teal-700"
                          : `${darkMode ? colors.dark : colors.light} ${colors.icon}`
'@
$dashboard = Replace-Once $dashboard $oldIconStyle.TrimEnd([char[]]@([char]13, [char]10)) $newIconStyle.TrimEnd([char[]]@([char]13, [char]10)) "dashboard icon styling"

$oldOpenStyle = @'
                      featured
                        ? "text-white"
                        : "text-teal-500 sm:translate-y-1 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100"
'@
$newOpenStyle = @'
                      featured
                        ? "text-white"
                        : quickSale
                          ? darkMode ? "text-teal-300" : "text-teal-700"
                          : "text-teal-500 sm:translate-y-1 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100"
'@
$dashboard = Replace-Once $dashboard $oldOpenStyle.TrimEnd([char[]]@([char]13, [char]10)) $newOpenStyle.TrimEnd([char[]]@([char]13, [char]10)) "dashboard open action styling"

# 4) Route the new second tile to the existing invoice creation flow; shift other indexes safely.
$oldSwitch = @'
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
'@
$newSwitch = @'
                    switch (index) {
                      case 0:
                        goTo("/visits/new");
                        break;
                      case 1:
                        goTo("/invoices/new?mode=quick-sale");
                        break;
                      case 2:
                        goTo("/clients");
                        break;
                      case 3:
                        goTo("/pets");
                        break;
                      case 4:
                        goTo("/appointments");
                        break;
                      case 5:
                        goTo("/vaccinations");
                        break;
                      case 6:
                        goTo("/inventory/products");
                        break;
                      case 7:
                        goTo("/barcode-test");
                        break;
                      case 8:
                        goTo("/finance");
                        break;
                      case 9:
                        goTo("/reports");
                        break;
                      default:
                        goTo("/dashboard");
                    }
'@
$dashboard = Replace-Once $dashboard $oldSwitch.TrimEnd([char[]]@([char]13, [char]10)) $newSwitch.TrimEnd([char[]]@([char]13, [char]10)) "dashboard navigation targets"

# 5) Show a Quick Sale heading when the existing invoice builder is opened from this shortcut.
$invoice = Replace-Once $invoice '  const [showScanner, setShowScanner] = useState(false);' ('  const [showScanner, setShowScanner] = useState(false);' + "`n" + '  const [quickSaleMode, setQuickSaleMode] = useState(false);') "invoice quick-sale mode state"
$invoice = Replace-Once $invoice '    setVisitId(params.get("visit") || "");' ('    setVisitId(params.get("visit") || "");' + "`n" + '    setQuickSaleMode(params.get("mode") === "quick-sale");') "invoice mode query"
$invoice = Replace-Once $invoice '{language === "ar" ? "فاتورة جديدة" : "New Invoice"}' '{quickSaleMode' + "`n" + '                ? language === "ar" ? "بيع سريع" : "Quick Sale"' + "`n" + '                : language === "ar" ? "فاتورة جديدة" : "New Invoice"}' "invoice header title"

# 6) Allow USB barcode scanners or typed barcode + Enter, while preserving click-to-search and camera scan.
$oldSearchInput = @'
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder={
'@
$newSearchInput = @'
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    const query = productSearch.trim();
                    if (!query) return;
                    const exactBarcode = products.find(
                      (product) => product.barcode?.trim().toLowerCase() === query.toLowerCase()
                    );
                    if (exactBarcode) {
                      addProduct(exactBarcode);
                      return;
                    }
                    if (filteredProducts.length === 1) {
                      addProduct(filteredProducts[0]);
                      return;
                    }
                    if (filteredProducts.length === 0) {
                      void findProductByBarcode(query);
                    }
                  }}
                  placeholder={
'@
$invoice = Replace-Once $invoice $oldSearchInput.TrimEnd([char[]]@([char]13, [char]10)) $newSearchInput.TrimEnd([char[]]@([char]13, [char]10)) "product search enter handler"

# Validate all intended changes before writing anything.
if (-not $dashboard.Contains('["بيع سريع", "إنشاء فاتورة بيع بسرعة", "🛒"]')) { throw "Arabic Quick Sale card validation failed." }
if (-not $dashboard.Contains('["Quick Sale", "Create a sales invoice fast", "🛒"]')) { throw "English Quick Sale card validation failed." }
if (-not $dashboard.Contains('goTo("/invoices/new?mode=quick-sale");')) { throw "Quick Sale navigation validation failed." }
if (-not $invoice.Contains('setQuickSaleMode(params.get("mode") === "quick-sale");')) { throw "Invoice mode validation failed." }
if (-not $invoice.Contains('if (event.key !== "Enter") return;')) { throw "Barcode keyboard input validation failed." }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dashboardBackup = "$dashboardPath.bak-quick-sale-$stamp"
$invoiceBackup = "$invoicePath.bak-quick-sale-$stamp"
Copy-Item -LiteralPath $dashboardPath -Destination $dashboardBackup
Copy-Item -LiteralPath $invoicePath -Destination $invoiceBackup
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($dashboardPath, $dashboard, $utf8NoBom)
[System.IO.File]::WriteAllText($invoicePath, $invoice, $utf8NoBom)

Write-Host "VETRA Quick Sale patch applied." -ForegroundColor Green
Write-Host "Dashboard: added Quick Sale directly beside New Visit." -ForegroundColor Cyan
Write-Host "Quick Sale opens the existing invoice page with product search, typed barcode + Enter, and camera barcode scan." -ForegroundColor Cyan
Write-Host "Backups:" -ForegroundColor Yellow
Write-Host "  $dashboardBackup"
Write-Host "  $invoiceBackup"
Write-Host "Next: run npm run build. Do not push until the build passes." -ForegroundColor Yellow
