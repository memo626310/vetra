$ErrorActionPreference = 'Stop'

$projectRoot = (Get-Location).Path
$target = Join-Path $projectRoot 'app\settings\import\review\page.tsx'
if (-not (Test-Path -LiteralPath $target)) {
    throw "Run this script from the VETRA project root. Missing file: $target"
}

$content = [System.IO.File]::ReadAllText($target).Replace("`r`n", "`n").Replace("`r", "`n")
if ($content.Contains('VETRA_REAL_IMPORT_PROGRESS_UI_V1')) {
    throw 'The real import progress UI patch appears to be applied already. No files were changed.'
}

function Replace-Once([string]$Source, [string]$Old, [string]$New, [string]$Label) {
    $Source = $Source.Replace("`r`n", "`n").Replace("`r", "`n")
    $Old = $Old.Replace("`r`n", "`n").Replace("`r", "`n")
    $New = $New.Replace("`r`n", "`n").Replace("`r", "`n")
    $count = ([regex]::Matches($Source, [regex]::Escape($Old))).Count
    if ($count -ne 1) { throw "Expected one anchor for $Label; found $count. No files were written." }
    return $Source.Replace($Old, $New)
}

$oldState = @'
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);
'@
$newState = @'
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);
  // VETRA_REAL_IMPORT_PROGRESS_UI_V1 — percentage reflects committed import work units.
  const [importPercent, setImportPercent] = useState(0);
  const [importProgressLabel, setImportProgressLabel] = useState("");
'@
$content = Replace-Once $content $oldState $newState 'import progress state'

$startMarker = '  async function importReadyRows() {'
$endMarker = "`n  function toggleTable(name: string) {"
$start = $content.IndexOf($startMarker, [System.StringComparison]::Ordinal)
if ($start -lt 0) { throw 'Could not find importReadyRows() start. No files were written.' }
$end = $content.IndexOf($endMarker, $start, [System.StringComparison]::Ordinal)
if ($end -lt 0) { throw 'Could not find toggleTable() after importReadyRows(). No files were written.' }
if ($content.IndexOf($startMarker, $start + $startMarker.Length, [System.StringComparison]::Ordinal) -ge 0) {
    throw 'Multiple importReadyRows() functions found. No files were written.'
}

$newFunction = @'
  async function importReadyRows() {
    if (!selectedBatch || !report) return;
    if (!window.confirm("سيتم نقل السجلات المتوافقة فقط. سيُنفّذ الاستيراد على دفعات صغيرة، وسيتم حفظ تقدم كل دفعة بنجاح. البيانات غير المؤكدة أو غير المدعومة ستظل في الأرشيف. متابعة الاستيراد؟")) return;

    setImporting(true);
    setBusy(false);
    setError("");
    setMessage("");
    setProgress("");
    let latestPercent = importPercent;

    const updatePercent = (percent: number, label: string) => {
      latestPercent = Math.max(0, Math.min(100, Math.floor(percent)));
      setImportPercent(latestPercent);
      setImportProgressLabel(label);
    };

    try {
      const client = await getClinicDb();
      const { data: currentBatch, error: progressReadError } = await client
        .from("legacy_import_batches")
        .select("summary")
        .eq("id", selectedBatch.id)
        .maybeSingle();
      if (progressReadError) throw new Error(`تعذر قراءة آخر نقطة محفوظة للاستيراد: ${progressReadError.message}`);

      const summary = (currentBatch?.summary || selectedBatch.summary || {}) as Record<string, unknown>;
      const saved = (summary.lastImportProgress || {}) as Record<string, unknown>;
      const savedPhase = String(saved.phase || "");
      const savedCursor = Math.max(0, Number(saved.afterRow || 0));
      const savedPhaseDone = saved.phaseDone === true || saved.phaseDone === "true";
      const sourceCounts = selectedBatch.source_table_counts || {};
      const rowCount = (name: string) => Math.max(0, Number(sourceCounts[name] || 0));
      const categoryRows = rowCount("Category") + rowCount("Subcategory");
      const clientRows = rowCount("Customer");
      const productRows = rowCount("Product");
      const invoiceRows = rowCount("SalesInvoices");
      const totalRows = Math.max(1, categoryRows + clientRows + productRows + invoiceRows);
      const percentFor = (done: number) => Math.min(99, Math.floor((done / totalRows) * 100));

      if (savedPhase === "complete") {
        const previousResult = summary.lastImportRun as Record<string, unknown> | undefined;
        setImportResult(previousResult || {});
        updatePercent(100, "الاستيراد مكتمل بالفعل.");
        setMessage("الدفعة تم استيرادها بالفعل؛ لم نكرر إدخال السجلات.");
        return;
      }

      let phaseIndex = 0;
      let invoiceCursor = 0;
      let completedRows = 0;
      switch (savedPhase) {
        case "categories":
          phaseIndex = 1;
          completedRows = categoryRows;
          break;
        case "clients":
          phaseIndex = 2;
          completedRows = categoryRows + clientRows;
          break;
        case "products":
          phaseIndex = 3;
          completedRows = categoryRows + clientRows + productRows;
          break;
        case "invoices":
          invoiceCursor = Math.min(invoiceRows, savedCursor);
          completedRows = categoryRows + clientRows + productRows + invoiceCursor;
          phaseIndex = savedPhaseDone ? 4 : 3;
          break;
        default:
          phaseIndex = 0;
          completedRows = 0;
      }

      const callImportStep = async (phase: string, afterRow = 0, limit = 20) => {
        const { data, error: stepError } = await client.rpc("vetra_import_legacy_batch_progress", {
          p_batch_id: selectedBatch.id,
          p_phase: phase,
          p_after_row: afterRow,
          p_limit: limit,
        });
        if (stepError) {
          if (/vetra_import_legacy_batch_progress|function.*does not exist|Could not find the function/i.test(stepError.message)) {
            throw new Error("محرك الاستيراد المرحلي غير مثبت. شغّل ملف VETRA_IMPORT_PROGRESS_ENGINE.sql مرة واحدة في Shared Clinic Database، ثم أعد المحاولة.");
          }
          throw new Error(stepError.message);
        }
        const value = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
        if (!value) throw new Error(`لم تُرجع خطوة ${phase} تأكيدًا للحفظ.`);
        return value;
      };

      const phases = ["categories", "clients", "products", "invoices", "finalize"] as const;
      for (let phaseNumber = phaseIndex; phaseNumber < phases.length; phaseNumber++) {
        const phase = phases[phaseNumber];

        if (phase === "invoices") {
          let cursor = invoiceCursor;
          while (cursor < invoiceRows) {
            const chunkSize = Math.min(20, invoiceRows - cursor);
            const startInvoice = cursor + 1;
            const endInvoice = Math.min(invoiceRows, cursor + chunkSize);
            updatePercent(percentFor(completedRows), `استيراد الفواتير: جاري حفظ الدفعة ${startInvoice}–${endInvoice} من ${invoiceRows.toLocaleString("en-US")}`);
            const step = await callImportStep("invoices", cursor, chunkSize);
            const serverCursor = Number(step.afterRow);
            const nextCursor = Number.isFinite(serverCursor) ? Math.max(cursor + chunkSize, serverCursor) : cursor + chunkSize;
            if (nextCursor <= cursor) throw new Error("لم يتقدم مؤشر الفواتير. أوقفنا العملية لمنع تكرار نفس الدفعة.");
            cursor = Math.min(invoiceRows, nextCursor);
            completedRows = categoryRows + clientRows + productRows + cursor;
            updatePercent(percentFor(completedRows), `تم حفظ التقدم حتى الفاتورة ${cursor.toLocaleString("en-US")} من ${invoiceRows.toLocaleString("en-US")}`);
          }
          continue;
        }

        if (phase === "finalize") {
          updatePercent(Math.max(99, percentFor(totalRows)), "التحقق من النتائج النهائية...");
          const result = await callImportStep("finalize", 0, 20);
          setImportResult(result);
          updatePercent(100, "اكتمل الاستيراد بنجاح.");
          setMessage("انتهت عملية الاستيراد. التفاصيل أدناه توضح ما تم نقله وما تُرك محفوظًا للمراجعة.");
          continue;
        }

        const label = phase === "categories"
          ? "استيراد التصنيفات"
          : phase === "clients"
            ? "استيراد العملاء"
            : "استيراد المنتجات";
        updatePercent(percentFor(completedRows), `${label}...`);
        await callImportStep(phase, 0, 20);
        completedRows += phase === "categories" ? categoryRows : phase === "clients" ? clientRows : productRows;
        updatePercent(percentFor(completedRows), `اكتملت خطوة ${label}.`);
      }

      await loadBatches();
      const { data: updatedBatch, error: updatedBatchError } = await client
        .from("legacy_import_batches")
        .select("id,source_file_name,source_sha256,source_size_bytes,audit_version,status,source_table_counts,summary,created_at,completed_at")
        .eq("id", selectedBatch.id)
        .maybeSingle();
      if (!updatedBatchError && updatedBatch) {
        setBatches((current) => current.map((batch) => batch.id === selectedBatch.id ? updatedBatch as Batch : batch));
        setClinicName((current) => current || "العيادة الحالية");
      }
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught);
      setError(`${detail}\nتوقف التنفيذ عند ${latestPercent}%. تم حفظ كل دفعة ناجحة بشكل مستقل؛ اضغط زر الاستيراد مرة أخرى لاستكمال العملية من آخر نقطة محفوظة، دون إعادة السجلات التي اكتملت.`);
    } finally {
      setImporting(false);
      setProgress("");
    }
  }
'@

$content = $content.Substring(0, $start) + $newFunction + $content.Substring($end)

$progressAnchor = @'
          {progress && <p role="status" className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-900">{progress}</p>}
'@
$progressUi = @'
          {progress && <p role="status" className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-900">{progress}</p>}
          {(importing || importPercent > 0) && <section className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4" aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-sm"><span className="font-bold text-violet-950">{importProgressLabel || "جاري تجهيز الاستيراد..."}</span><strong className="shrink-0 text-lg tabular-nums text-violet-950">{importPercent}%</strong></div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-violet-100" role="progressbar" aria-label="نسبة تقدم الاستيراد" aria-valuemin={0} aria-valuemax={100} aria-valuenow={importPercent}>
              <div className="h-full rounded-full bg-violet-600 transition-[width] duration-300" style={{ width: `${importPercent}%` }} />
            </div>
            <p className="mt-2 text-xs leading-5 text-violet-900">النسبة محسوبة من سجلات التصنيفات والعملاء والمنتجات والفواتير التي تم حفظ خطواتها بنجاح. كل دفعة مكتملة محفوظة، ويمكن استكمال العملية إذا حدث انقطاع.</p>
          </section>}
'@
$content = Replace-Once $content $progressAnchor $progressUi 'import progress bar UI'

$selectionAnchor = 'onChange={(event) => { setSelectedBatchId(event.target.value); setReport(null); setSourceRows([]); setImportResult(null); }}'
$selectionReplacement = 'onChange={(event) => { setSelectedBatchId(event.target.value); setReport(null); setSourceRows([]); setImportResult(null); setImportPercent(0); setImportProgressLabel(""); }}'
$content = Replace-Once $content $selectionAnchor $selectionReplacement 'reset progress when batch changes'

$backup = "$target.backup-import-progress-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
[System.IO.File]::Copy($target, $backup, $false)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($target, $content, $utf8NoBom)
Write-Host "Applied real import progress UI and resumable chunk calls." -ForegroundColor Green
Write-Host "Backup: $backup" -ForegroundColor Cyan
Write-Host "Next: run the SQL file VETRA_IMPORT_PROGRESS_ENGINE.sql in the Shared Clinic Database, then run npm run build." -ForegroundColor Yellow
