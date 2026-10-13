$ErrorActionPreference = "Stop"

$target = Join-Path (Get-Location) "app\invoices\new\page.tsx"
if (-not (Test-Path -LiteralPath $target)) {
    throw "لم أجد app\invoices\new\page.tsx. افتح PowerShell من المجلد الرئيسي لمشروع VETRA ثم أعد التشغيل."
}

$content = [System.IO.File]::ReadAllText($target, [System.Text.Encoding]::UTF8)
$original = $content

function Replace-Text {
    param(
        [Parameter(Mandatory=$true)][string]$Old,
        [Parameter(Mandatory=$true)][string]$New,
        [Parameter(Mandatory=$true)][string]$Label
    )
    if ($script:content.Contains($Old)) {
        $script:content = $script:content.Replace($Old, $New)
        Write-Host "تم: $Label" -ForegroundColor Green
    } elseif ($script:content.Contains($New)) {
        Write-Host "موجود بالفعل: $Label" -ForegroundColor DarkGray
    } else {
        Write-Warning "لم أتعرف على الجزء المتوقع: $Label — سأتركه كما هو."
    }
}

# إصلاح النص العربي الذي دخل بترميز خاطئ.
Replace-Text '"Ø¨ÙŠØ¹ Ø³Ø±ÙŠØ¹"' '"بيع سريع"' 'عنوان البيع السريع'
$invoiceTitlePattern = '(?m)^([ \t]*:[ \t]*\(language === "ar" \? ")[^"]+(" : "New Invoice"\)\})[ \t]*$'
if ([regex]::IsMatch($content, $invoiceTitlePattern)) {
    $content = [regex]::Replace($content, $invoiceTitlePattern, '${1}فاتورة جديدة${2}', 1)
    Write-Host "تم: عنوان الفاتورة الجديدة" -ForegroundColor Green
} elseif ($content.Contains('"فاتورة جديدة"')) {
    Write-Host "موجود بالفعل: عنوان الفاتورة الجديدة" -ForegroundColor DarkGray
} else {
    Write-Warning "لم أتعرف على نص عنوان الفاتورة الجديدة؛ سأتركه كما هو."
}

# جعل عرض الصفحة والحاويات قابلاً للانكماش داخل شاشة الهاتف.
Replace-Text 'className={`min-h-screen ${' 'className={`min-h-screen w-full min-w-0 overflow-x-clip ${' 'منع التمدد الأفقي للصفحة'
Replace-Text 'className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8 lg:px-10"' 'className="mx-auto w-full min-w-0 max-w-[1500px] px-3 py-4 sm:px-6 sm:py-6 lg:px-10"' 'هوامش مناسبة للموبايل'
Replace-Text 'className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"' 'className="mb-5 flex min-w-0 flex-col gap-3 sm:mb-6 sm:gap-4 lg:flex-row lg:items-center lg:justify-between"' 'تجاوب رأس الصفحة'
Replace-Text 'className="text-3xl font-black"' 'className="break-words text-2xl font-black leading-tight sm:text-3xl"' 'حجم عنوان مناسب للشاشة الصغيرة'
Replace-Text '<div className="flex gap-3">' '<div className="flex shrink-0 flex-wrap gap-2 self-start">' 'أزرار اللغة والمظهر'
Replace-Text 'className="grid gap-6 xl:grid-cols-[1fr_380px]"' 'className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_380px]"' 'شبكة الصفحة الرئيسية'
Replace-Text '<div className="space-y-6">' '<div className="min-w-0 space-y-4 sm:space-y-6">' 'عمود المحتوى'
Replace-Text '<aside className="space-y-6">' '<aside className="min-w-0 space-y-4 sm:space-y-6">' 'عمود الملخص'
Replace-Text 'className={`rounded-3xl border p-5 ${' 'className={`min-w-0 rounded-2xl border p-3 sm:rounded-3xl sm:p-5 ${' 'تقليل الحواف الداخلية على الموبايل'

# لا نعرض عمودي العميل والحيوان جنباً إلى جنب إلا على الشاشات الكبيرة.
Replace-Text 'className="grid gap-4 md:grid-cols-2"' 'className="grid min-w-0 grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2"' 'حقول العميل والحيوان'
Replace-Text 'className="grid gap-2 md:grid-cols-2"' 'className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2"' 'شبكة المنتجات'
Replace-Text 'className={`rounded-2xl border px-4 py-3.5 outline-none focus:border-blue-500 ${' 'className={`min-w-0 w-full rounded-2xl border px-4 py-3.5 outline-none focus:border-blue-500 ${' 'حقول الخدمة لا تتجاوز عرض الموبايل'
Replace-Text 'className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"' 'className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 sm:w-auto sm:px-5"' 'زر مسح الباركود'
Replace-Text 'className={`flex items-center justify-between rounded-2xl border p-4 text-right transition hover:-translate-y-0.5 ${' 'className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-3 text-right transition sm:p-4 sm:hover:-translate-y-0.5 ${' 'بطاقات المنتجات ومنع تمدد الاسم'
Replace-Text 'className="grid gap-3 md:grid-cols-[1fr_180px_auto]"' 'className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto]"' 'حقول إضافة الخدمات'
Replace-Text '<div className="overflow-x-auto">' '<div className="max-w-full overflow-x-auto overscroll-x-contain">' 'تمرير جدول الفاتورة داخل حدوده'
Replace-Text 'className={`sticky top-5 rounded-3xl border p-5 ${' 'className={`min-w-0 rounded-2xl border p-3 sm:rounded-3xl sm:p-5 xl:sticky xl:top-5 ${' 'ملخص الفاتورة على الموبايل'

if ($content -eq $original) {
    Write-Host "لم يتغير الملف؛ قد تكون التعديلات مطبقة بالفعل أو أن نسختك مختلفة." -ForegroundColor Yellow
    exit 0
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$target.backup-$stamp"
[System.IO.File]::Copy($target, $backup, $false)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($target, $content, $utf8NoBom)

Write-Host "`nتم حفظ التعديلات." -ForegroundColor Green
Write-Host "النسخة الاحتياطية: $backup" -ForegroundColor Cyan
Write-Host "الملف المعدل: $target" -ForegroundColor Cyan
Write-Host "الخطوة التالية: npm run build" -ForegroundColor Yellow
