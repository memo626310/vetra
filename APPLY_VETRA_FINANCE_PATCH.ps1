$ErrorActionPreference = 'Stop'

function Replace-One {
  param(
    [Parameter(Mandatory=$true)][string]$Text,
    [Parameter(Mandatory=$true)][string]$Pattern,
    [Parameter(Mandatory=$true)][string]$Replacement,
    [Parameter(Mandatory=$true)][string]$Label
  )
  $rx = [System.Text.RegularExpressions.Regex]::new(
    $Pattern,
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )
  $hits = $rx.Matches($Text).Count
  if ($hits -ne 1) {
    throw "Safe patch stopped at '$Label': expected one matching code section, found $hits. No source files have been changed."
  }
  return $rx.Replace($Text, $Replacement, 1)
}

$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot -or $LASTEXITCODE -ne 0) {
  throw 'Run this script from inside the VETRA Git repository.'
}
$repoRoot = $repoRoot.Trim()
$patchPath = Join-Path $PSScriptRoot 'VETRA_FINANCE_CASH_REGISTER_BASE.patch'
$pagePath = Join-Path $repoRoot 'app/invoices/new/page.tsx'
if (-not (Test-Path -LiteralPath $patchPath)) { throw "Base patch not found: $patchPath" }
if (-not (Test-Path -LiteralPath $pagePath)) { throw "Invoice page not found: $pagePath" }

$original = [System.IO.File]::ReadAllText($pagePath)
if ($original.Contains('vetra_record_invoice_payment') -or $original.Contains('type FinancialAccount =')) {
  throw 'The invoice finance integration already appears to exist in this file. Stopping to prevent duplicate edits.'
}

# Keep the source file's original newline style and UTF-8 BOM setting.
$newline = if ($original.Contains("`r`n")) { "`r`n" } else { "`n" }
$bytes = [System.IO.File]::ReadAllBytes($pagePath)
$hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
function Nl([string]$Value) {
  return $Value.Replace("`r`n", "`n").Replace("`n", $script:newline)
}

$page = $original

# 1) Add the receiving-account type without replacing any existing invoice code.
$typeBlock = Nl @'
type FinancialAccount = {
  id: string;
  name: string;
  account_type: "cash" | "bank" | "wallet" | "card" | "other";
  requires_session: boolean;
  is_default: boolean;
};

'@
$page = Replace-One $page 'type\s+InvoiceLine\s*=\s*\{' ($typeBlock + 'type InvoiceLine = {') 'insert financial-account type'

# 2) Add finance state alongside the existing product state.
$statePattern = 'const\s+\[products\s*,\s*setProducts\]\s*=\s*useState<Product\[\]>\(\[\]\);'
$stateAdd = Nl @'
const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  const [financialAccountId, setFinancialAccountId] = useState("");
  const [openRegisterAccountIds, setOpenRegisterAccountIds] = useState<string[]>([]);
'@
$page = Replace-One $page $statePattern ('$0' + $newline + '  ' + $stateAdd.TrimEnd()) 'insert financial-account state'

# 3) Load active financial accounts and open register sessions in the existing page load.
$page = Replace-One $page 'const\s+\[\s*clientsResult\s*,\s*productsResult\s*,\s*settingsResult\s*\]\s*=' 'const [clientsResult, productsResult, settingsResult, accountsResult, sessionsResult] =' 'extend invoice load results'
$accountQueries = Nl @'
        db
          .from("financial_accounts")
          .select("id,name,account_type,requires_session,is_default")
          .eq("clinic_id", context.clinic_id)
          .eq("is_active", true)
          .order("name"),
        db
          .from("cash_register_sessions")
          .select("account_id")
          .eq("clinic_id", context.clinic_id)
          .eq("status", "open"),
'@
$page = Replace-One $page 'db\s*\.from\("billing_settings"\)\s*\.select\("consultation_fee"\)\s*\.eq\("clinic_id",\s*context\.clinic_id\)\s*\.limit\(1\)\s*\.maybeSingle\(\),' ('$0' + $newline + $accountQueries.TrimEnd()) 'load financial accounts'
$accountResults = Nl @'

    if (!accountsResult.error) {
      setFinancialAccounts((accountsResult.data || []) as FinancialAccount[]);
    } else {
      setMessage(accountsResult.error.message);
    }
    if (!sessionsResult.error) {
      setOpenRegisterAccountIds((sessionsResult.data || []).map((row) => row.account_id));
    } else {
      setMessage(sessionsResult.error.message);
    }
'@
$page = Replace-One $page 'if\s*\(settingsResult\.data\?\.consultation_fee\s*!=\s*null\)\s*\{\s*setConsultationFee\(Number\(settingsResult\.data\.consultation_fee\)\);\s*\}' ('$0' + $accountResults) 'handle finance account query results'

# 4) Select a sensible account automatically when the payment method changes.
$autoSelect = Nl @'

  useEffect(() => {
    if (!financialAccounts.length) {
      setFinancialAccountId("");
      return;
    }
    const preferredType = paymentMethod === "cash" ? "cash"
      : paymentMethod === "card" ? "card"
      : paymentMethod === "wallet" ? "wallet"
      : paymentMethod === "bank_transfer" ? "bank"
      : paymentMethod === "other" ? null : "cash";
    const candidates = preferredType
      ? financialAccounts.filter((account) => account.account_type === preferredType)
      : financialAccounts;
    const preferred = candidates.find((account) => account.is_default) || candidates[0];
    setFinancialAccountId((current) =>
      current && candidates.some((account) => account.id === current)
        ? current
        : preferred?.id || ""
    );
  }, [paymentMethod, financialAccounts]);
'@
$page = Replace-One $page 'useEffect\(\(\)\s*=>\s*\{\s*if\s*\(ready\)\s*loadPage\(\);\s*\},\s*\[ready\]\);' ('$0' + $autoSelect) 'insert receiving-account auto-selection'

# 5) Validate receipts before writing the invoice.
$paymentChecks = Nl @'

    if (!issueAfterSave && paid > 0) {
      setMessage(
        language === "ar"
          ? "التحصيل يتسجل مع إصدار الفاتورة فقط. صفّر المدفوع لحفظ مسودة، أو أصدر الفاتورة لتسجيله في الخزنة."
          : "A receipt is posted only when the invoice is issued. Set paid amount to zero to save a draft, or issue the invoice to record the receipt."
      );
      return;
    }

    if (paid > 0 && (!paymentMethod || !financialAccountId)) {
      setMessage(
        language === "ar"
          ? "اختار طريقة الدفع والحساب المالي قبل تسجيل التحصيل."
          : "Choose a payment method and financial account before recording a receipt."
      );
      return;
    }

    const selectedFinancialAccount = financialAccounts.find((account) => account.id === financialAccountId);
    if (issueAfterSave && paid > 0 && selectedFinancialAccount?.requires_session && !openRegisterAccountIds.includes(financialAccountId)) {
      setMessage(
        language === "ar"
          ? "افتح وردية الخزنة من صفحة الخزن قبل إصدار فاتورة بها تحصيل نقدي."
          : "Open the cash register session from Cash Registers before issuing an invoice with a cash receipt."
      );
      return;
    }

'@
$guardPattern = '(?<guard>if\s*\(paid\s*>\s*total\)\s*\{[\s\S]*?\})\s*(?<saving>setSaving\(true\);)'
$page = Replace-One $page $guardPattern ('$1' + $paymentChecks + '$2') 'validate paid amount and register session'

# 6) Drafts are saved unpaid; issued receipts are recorded through the ledger RPC.
$page = Replace-One $page 'payment_method:\s*paymentMethod\s*\|\|\s*null,' 'payment_method: null,' 'defer payment method until ledger receipt'
$page = Replace-One $page 'paid_amount:\s*paid,' 'paid_amount: 0,' 'defer paid amount until ledger receipt'
$page = Replace-One $page 'paid_at:\s*issueAfterSave\s*&&\s*paid\s*>=\s*total\s*&&\s*total\s*>\s*0\s*\?\s*new Date\(\)\.toISOString\(\)\s*:\s*null,' 'paid_at: null,' 'defer paid timestamp until ledger receipt'

$receiptBlock = Nl @'
    if (issueAfterSave && paid > 0) {
      const { error: receiptError } = await db.rpc("vetra_record_invoice_payment", {
        p_invoice_id: invoice.id,
        p_account_id: financialAccountId,
        p_amount: paid,
        p_payment_method: paymentMethod,
        p_reference: null,
        p_notes: notes.trim() || null,
        p_session_id: null,
        p_idempotency_key: `initial-invoice-payment:${invoice.id}`,
      });

      if (receiptError) {
        setMessage(
          language === "ar"
            ? `تم إصدار الفاتورة، لكن التحصيل لم يُسجل في الخزنة: ${receiptError.message}. سجّل التحصيل من صفحة المالية.`
            : `The invoice was issued, but the receipt was not posted: ${receiptError.message}. Record it from the Finance page.`
        );
        setSaving(false);
        setTimeout(() => router.push(`/invoices/${invoice.id}`), 1200);
        return;
      }
    }

'@
$receiptPattern = '(?<issued>if\s*\(issueAfterSave\)\s*\{\s*const\s*\{\s*error:\s*issueError\s*\}\s*=\s*await\s+db\.rpc\("issue_invoice",\s*\{\s*p_invoice_id:\s*invoice\.id,\s*\}\);[\s\S]*?\n\s*\}\s*\})\s*(?<success>setSuccess\()'
$receiptEscaped = $receiptBlock.Replace('$', '$$')
$page = Replace-One $page $receiptPattern ('$1' + $receiptEscaped + '$2') 'record initial invoice receipt'

# 7) Add the receiving-account selector after the existing payment-method selector.
$accountControl = Nl @'

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-500">
                    {language === "ar" ? "الحساب المستلم للمبلغ" : "Account receiving payment"}
                  </label>
                  <select
                    value={financialAccountId}
                    onChange={(e) => setFinancialAccountId(e.target.value)}
                    className={`w-full rounded-2xl border px-4 py-3 outline-none ${
                      darkMode
                        ? "border-white/[0.07] bg-[#0F1115]"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <option value="">
                      {language === "ar" ? "اختار الخزنة أو الحساب" : "Select a receiving account"}
                    </option>
                    {financialAccounts
                      .filter((account) => {
                        if (paymentMethod === "cash") return account.account_type === "cash";
                        if (paymentMethod === "card") return account.account_type === "card";
                        if (paymentMethod === "wallet") return account.account_type === "wallet";
                        if (paymentMethod === "bank_transfer") return account.account_type === "bank";
                        return true;
                      })
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}{account.requires_session ? (language === "ar" ? " · وردية خزنة" : " · Register session") : ""}
                        </option>
                      ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500">
                    {language === "ar"
                      ? "لو طريقة الدفع نقدي، لازم تكون الوردية مفتوحة قبل إصدار الفاتورة."
                      : "For cash payments, the register session must be open before issuing the invoice."}
                  </p>
                </div>
'@
$accountControlEscaped = $accountControl.Replace('$', '$$')
$uiPattern = '(<option\s+value="other">Other</option>\s*</select>\s*</div>)(\s*<div>)'
$page = Replace-One $page $uiPattern ('$1' + $accountControlEscaped + '$2') 'add receiving-account selector'

# Stage changes before modifying the checkout; source replacements must all succeed first.
$tempPath = "$pagePath.vetra-finance.tmp"
$backupPath = "$pagePath.before-finance-$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
$encoding = [System.Text.UTF8Encoding]::new($hasBom)
[System.IO.File]::WriteAllText($tempPath, $page, $encoding)

Write-Host 'Checking finance dashboard, cash-register and migration changes...' -ForegroundColor Cyan
git -C $repoRoot apply --check --recount $patchPath
if ($LASTEXITCODE -ne 0) {
  Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
  throw 'The base finance patch does not match this checkout. No source files were changed.'
}

Copy-Item -LiteralPath $pagePath -Destination $backupPath
Write-Host "Invoice backup created: $backupPath" -ForegroundColor DarkGray

git -C $repoRoot apply --recount $patchPath
if ($LASTEXITCODE -ne 0) {
  Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
  throw 'Git could not apply the checked base patch. The invoice file is still unchanged; inspect git status before retrying.'
}

Move-Item -LiteralPath $tempPath -Destination $pagePath -Force
Write-Host 'Finance patch applied, including guarded invoice-to-ledger integration.' -ForegroundColor Green
Write-Host 'Next: run VETRA_FINANCE_CASH_REGISTER.sql on the Shared Clinic Database, then run npm run build.' -ForegroundColor Yellow
