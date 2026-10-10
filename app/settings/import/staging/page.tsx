"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { Buffer } from "buffer";
import { getClinicDb, getClinicContext } from "@/lib/clinic-db";

type MDBColumn = { name: string; type?: string; autoLong?: boolean; autoUUID?: boolean };
type MDBTable = {
  name: string;
  rowCount: number;
  getColumns?(): MDBColumn[];
  getColumnNames(): string[];
  getData(options?: { rowOffset?: number; rowLimit?: number }): Record<string, unknown>[];
};
type MDBReaderLike = {
  getTableNames(options?: { normalTables?: boolean; systemTables?: boolean; linkedTables?: boolean }): string[];
  getTable(name: string): MDBTable;
};
type StagedRow = {
  batch_id: string;
  source_table: string;
  source_key: string;
  source_row_number: number;
  row_fingerprint: string;
  payload: Record<string, unknown>;
  updated_at: string;
};
type TableSummary = { name: string; count: number; keyColumn: string | null; error?: string };

type ScanResult = {
  file: File;
  sha256: string;
  tables: { table: MDBTable; name: string; rows: Record<string, unknown>[]; declaredCount: number; keyColumn: string | null; keys: Map<string, number> }[];
  summary: TableSummary[];
  totalRows: number;
  countMismatches: number;
  invalidTables: number;
};

const READ_CHUNK = 1000;
const WRITE_CHUNK = 50;
const MAX_ROWS_PER_TABLE = 500_000;
const MAX_TOTAL_ROWS = 100_000;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

function keyValue(value: unknown): string | null {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? `date:${value.toISOString()}` : null;
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (Buffer.isBuffer(value)) return `binary:${Buffer.from(value).toString("base64")}`;
  if (typeof value === "object") return `object:${JSON.stringify(toFingerprintValue(value))}`;
  return `${typeof value}:${String(value).trim()}`;
}

// Stable hashing representation matching the previous Dry Run page.
function toFingerprintValue(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : "[invalid-date]";
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `[binary:${value.length}:${Buffer.from(value).toString("base64")}]`;
  if (Array.isArray(value)) return value.map(toFingerprintValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) out[k] = toFingerprintValue((value as Record<string, unknown>)[k]);
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value;
}

// Payload serialization preserves binary bytes using an explicit base64 wrapper.
function toPayloadValue(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : { __vetra_type: "invalid_date" };
  if (typeof value === "bigint") return { __vetra_type: "bigint", value: value.toString() };
  if (Buffer.isBuffer(value)) return { __vetra_type: "binary_base64", byte_length: value.length, value: Buffer.from(value).toString("base64") };
  if (Array.isArray(value)) return value.map(toPayloadValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) out[k] = toPayloadValue((value as Record<string, unknown>)[k]);
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return { __vetra_type: "non_finite_number", value: String(value) };
  return value;
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function chooseKey(rows: Record<string, unknown>[], columns: MDBColumn[]): { keyColumn: string | null; keys: Map<string, number> } {
  const names = columns.map((c) => c.name);
  const candidates = Array.from(new Set([
    ...names.filter((n) => /^id$/i.test(n)),
    ...names.filter((n) => /^(invoice_no|invoice_number|document_no|recordid|recno)$/i.test(n)),
    ...names.filter((n) => /(?:^|[_\s-])id$/i.test(n)),
    ...columns.filter((c) => c.autoLong || c.autoUUID).map((c) => c.name),
    ...names.filter((n) => /(?:code|barcode|number|no)$/i.test(n)),
  ]));
  for (const name of candidates) {
    if (!rows.length) continue;
    const counts = new Map<string, number>();
    let valid = true;
    for (const row of rows) {
      const k = keyValue(row[name]);
      if (k === null) { valid = false; break; }
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    if (valid && [...counts.values()].every((count) => count === 1)) return { keyColumn: name, keys: counts };
  }
  return { keyColumn: null, keys: new Map() };
}

async function readAllRows(table: MDBTable): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  while (true) {
    if (offset >= MAX_ROWS_PER_TABLE) throw new Error(`الجدول تجاوز حد ${MAX_ROWS_PER_TABLE.toLocaleString("en-US")} صف.`);
    const chunk = table.getData({ rowOffset: offset, rowLimit: Math.min(READ_CHUNK, MAX_ROWS_PER_TABLE - offset) });
    if (!chunk.length) break;
    rows.push(...chunk);
    offset += chunk.length;
    if (rows.length > MAX_ROWS_PER_TABLE) throw new Error("تجاوز الحد الوقائي لعدد الصفوف.");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return rows;
}

function getSourceKey(table: ScanResult["tables"][number], row: Record<string, unknown>, rowIndex: number): { key: string; column: string | null } {
  if (table.keyColumn) {
    const value = keyValue(row[table.keyColumn]);
    if (value !== null && table.keys.get(value) === 1) return { key: `${table.keyColumn}:${value}`, column: table.keyColumn };
  }
  return { key: `row:${rowIndex + 1}`, column: null };
}

export default function LegacySourceStagingPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [staged, setStaged] = useState(0);
  const [batchId, setBatchId] = useState("");
  const [clinicName, setClinicName] = useState("");

  async function scanFile(file: File) {
    setError(""); setMessage(""); setScan(null); setStaged(0); setBatchId(""); setClinicName("");
    if (!/\.(mdb|accdb)$/i.test(file.name)) { setError("اختار ملف Access بصيغة MDB أو ACCDB."); return; }
    if (!file.size || file.size > MAX_FILE_BYTES) { setError("الملف فارغ أو أكبر من 100 ميجابايت."); return; }
    setBusy(true);
    try {
      setProgress("حساب بصمة الملف...");
      const buffer = await file.arrayBuffer();
      const sourceHash = await sha256(buffer);
      setProgress("تحميل قارئ Access...");
      const m = await import("mdb-reader");
      (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer = Buffer;
      const Reader = m.default as unknown as new (buffer: Buffer) => MDBReaderLike;
      const reader = new Reader(Buffer.from(buffer));
      const tableNames = Array.from(new Set(reader.getTableNames({ normalTables: true, systemTables: false, linkedTables: false })))
        .filter((name) => !/^MSys/i.test(name) && !/^sysdiagrams$/i.test(name));
      if (!tableNames.length) throw new Error("لم يتم العثور على جداول مستخدم قابلة للقراءة.");
      const tables: ScanResult["tables"] = [];
      const summary: TableSummary[] = [];
      let totalRows = 0;
      let countMismatches = 0;
      let invalidTables = 0;
      for (let i = 0; i < tableNames.length; i++) {
        const name = tableNames[i];
        setProgress(`قراءة الجدول ${i + 1}/${tableNames.length}: ${name}`);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        try {
          const table = reader.getTable(name);
          const rows = await readAllRows(table);
          totalRows += rows.length;
          if (totalRows > MAX_TOTAL_ROWS) throw new Error(`تجاوز إجمالي الصفوف الحد الوقائي ${MAX_TOTAL_ROWS.toLocaleString("en-US")}.`);
          const columns = table.getColumns?.() || table.getColumnNames().map((n) => ({ name: n }));
          const key = chooseKey(rows, columns);
          const declaredCount = Number(table.rowCount || 0);
          if (declaredCount !== rows.length) countMismatches++;
          tables.push({ table, name, rows, declaredCount, keyColumn: key.keyColumn, keys: key.keys });
          summary.push({ name, count: rows.length, keyColumn: key.keyColumn });
        } catch (caught) {
          invalidTables++;
          summary.push({ name, count: 0, keyColumn: null, error: caught instanceof Error ? caught.message : String(caught) });
        }
      }
      if (invalidTables > 0) throw new Error(`تعذر قراءة ${invalidTables} جدول. لم نرفع أي سجلات. أصلح فحص المصدر أولًا.`);
      setScan({ file, sha256: sourceHash, tables, summary, totalRows, countMismatches, invalidTables });
      setMessage(`اكتمل الفحص المحلي: ${tables.length} جدول و${totalRows.toLocaleString("en-US")} سجل. لم يتم رفع أو تعديل أي شيء بعد.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false); setProgress("");
    }
  }

  async function archiveSource() {
    if (!scan) return;
    if (scan.invalidTables > 0) { setError("لا يمكن حفظ نسخة مصدر مع وجود جداول لم تُقرأ بالكامل."); return; }
    if (!window.confirm(`تحذير: سيتم إرسال كل سجلات المصدر، بما فيها أسماء العملاء وبيانات الاتصال والفواتير والحسابات، إلى جدول أرشيف خاص بعيادتك داخل Shared Clinic Database. لن نكتب في جداول VETRA التشغيلية. الملف ${scan.file.name}، عدد السجلات ${scan.totalRows.toLocaleString("en-US")}. هل توافق على حفظ نسخة الأرشيف؟`)) return;
    setBusy(true); setError(""); setMessage(""); setStaged(0);
    try {
      const db = await getClinicDb();
      const context = await getClinicContext();
      setClinicName(context.clinic_name || "العيادة الحالية");
      setProgress("البحث عن سجل لهذا الملف...");
      const existing = await db.from("legacy_import_batches")
        .select("id,status,source_file_name")
        .eq("source_sha256", scan.sha256)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      if (existing.error) throw new Error(`تعذر البحث عن سجل الاستيراد: ${existing.error.message}. شغّل SQL المرحلتين 2 و3 أولًا.`);
      let id = existing.data?.id as string | undefined;
      if (existing.data?.status === "committed" || existing.data?.status === "importing") {
        throw new Error(`السجل ${existing.data.id} حالته ${existing.data.status}; لا يمكن تغييره من هذه الصفحة.`);
      }
      if (!id) {
        const { data, error: insertError } = await db.from("legacy_import_batches").insert({
          source_file_name: scan.file.name,
          source_sha256: scan.sha256,
          source_size_bytes: scan.file.size,
          audit_version: "phase3-source-archive-v1",
          status: "needs_review",
          source_table_counts: Object.fromEntries(scan.summary.map((t) => [t.name, t.count])),
          summary: { phase: "source_archive_staging", sourceRowsStored: false, businessDataWritten: false },
        }).select("id").single();
        if (insertError || !data) throw new Error(`تعذر إنشاء سجل الأرشيف: ${insertError?.message || "لم يرجع ID"}`);
        id = data.id;
      }
      setBatchId(id);
      let uploaded = 0;
      const now = new Date().toISOString();
      for (const table of scan.tables) {
        for (let offset = 0; offset < table.rows.length; offset += WRITE_CHUNK) {
          const rawChunk = table.rows.slice(offset, offset + WRITE_CHUNK);
          const payloadRows: StagedRow[] = [];
          for (let j = 0; j < rawChunk.length; j++) {
            const row = rawChunk[j];
            const rowIndex = offset + j;
            const sourceKey = getSourceKey(table, row, rowIndex);
            const normalizedForHash = JSON.stringify(toFingerprintValue(row));
            const fingerprint = await sha256Text(normalizedForHash);
            payloadRows.push({
              batch_id: id,
              source_table: table.name,
              source_key: sourceKey.key,
              source_row_number: rowIndex + 1,
              row_fingerprint: fingerprint,
              payload: toPayloadValue(row) as Record<string, unknown>,
              updated_at: now,
            });
          }
          const { error: writeError } = await db.from("legacy_import_source_rows")
            .upsert(payloadRows, { onConflict: "batch_id,source_table,source_row_number" });
          if (writeError) throw new Error(`توقف رفع أرشيف جدول ${table.name} عند صف ${offset + 1}: ${writeError.message}. أعد اختيار نفس الملف لاستكمال العملية؛ الصفوف تستخدم upsert قابلاً لإعادة المحاولة.`);
          uploaded += payloadRows.length;
          setStaged(uploaded);
          setProgress(`حفظ النسخة المصدرية: ${uploaded.toLocaleString("en-US")} / ${scan.totalRows.toLocaleString("en-US")}`);
        }
      }
      setProgress("التحقق من عدد السجلات المؤرشفة داخل قاعدة البيانات...");
      const { count: archivedCount, error: countError } = await db
        .from("legacy_import_source_rows")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", id);
      if (countError) throw new Error(`تعذر التحقق من عدد سجلات الأرشيف: ${countError.message}`);
      if (archivedCount !== scan.totalRows) {
        throw new Error(`فشل التحقق النهائي: المصدر يحتوي ${scan.totalRows} سجلًا، بينما الأرشيف يحتوي ${archivedCount ?? "عددًا غير معروف"}. لم يتم اعتماد اكتمال الأرشيف. أعد اختيار نفس الملف لاستكمال المحاولة.`);
      }

      const { error: updateError } = await db.from("legacy_import_batches").update({
        status: "needs_review",
        summary: {
          phase: "source_archive_staging",
          sourceRowsStored: true,
          sourcePayloadRowsStored: archivedCount,
          sourceRowsRead: scan.totalRows,
          countMismatchTables: scan.countMismatches,
          businessDataWritten: false,
          archiveVerified: true,
          archiveCompletedAt: new Date().toISOString(),
          note: "Original source payload is archived in clinic-scoped staging table; count matched the source scan; no operational VETRA table was changed.",
        }, updated_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      }).eq("id", id);
      if (updateError) throw new Error(`تم رفع الصفوف لكن تعذر تحديث ملخص الدفعة: ${updateError.message}. الصفوف لا تزال محفوظة ويمكن إعادة العملية.`);
      setMessage(`تم حفظ ${uploaded.toLocaleString("en-US")} سجل في أرشيف المصدر للعيادة ${context.clinic_name || "الحالية"}. رقم الدفعة: ${id}. لم يتم تعديل العملاء أو المنتجات أو الفواتير أو المخزون.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false); setProgress("");
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void scanFile(file);
    event.target.value = "";
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/settings/import/dry-run" className="mb-5 inline-flex py-2 text-sm font-semibold text-slate-500 hover:text-slate-900">← العودة لصفحة Dry Run</Link>
        <header className="mb-7">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-3xl">🗃️</div>
          <h1 className="text-2xl font-black sm:text-3xl">أرشفة المصدر قبل الترحيل</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">هذه مرحلة منفصلة عن الاستيراد التشغيلي. تُحفظ نسخة من سجلات Access في جدول staging خاص بالعيادة؛ لا تكتب أي بيانات في العملاء أو المنتجات أو الفواتير أو المخزون.</p>
        </header>

        <section className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <h2 className="font-extrabold text-amber-950">تنبيه خصوصية مهم</h2>
          <p className="mt-2 text-sm leading-7 text-amber-950">عند الضغط على زر الأرشفة، سيتم إرسال بيانات المصدر الأصلية إلى قاعدة Shared Clinic Database، وقد تتضمن أسماء العملاء وأرقام هواتفهم والحسابات المالية. لا يتم الرفع تلقائيًا عند اختيار الملف. لن يبدأ الرفع إلا بعد موافقتك الصريحة في نافذة التأكيد.</p>
        </section>

        <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-extrabold">1. اختر ملف Access وافحصه محليًا</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">الاختيار وحده لا يرفع الملف. نحسب بصمته ونقرأ جميع الجداول قبل إتاحة زر الأرشفة. أقصى حجم 100 MB، والحد الإجمالي 100,000 سجل في هذه المرحلة.</p>
          <input ref={inputRef} type="file" accept=".mdb,.accdb,application/x-msaccess" onChange={onFileChange} className="sr-only" />
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="mt-4 rounded-2xl bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? "جاري التنفيذ..." : "اختيار ملف MDB / ACCDB"}</button>
          {scan && <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Metric label="الجداول المقروءة" value={String(scan.tables.length)} />
            <Metric label="إجمالي السجلات" value={scan.totalRows.toLocaleString("en-US")} />
            <Metric label="اختلافات عددية" value={String(scan.countMismatches)} warning={scan.countMismatches > 0} />
          </div>}
          {scan && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600"><div>الملف: <b>{scan.file.name}</b> · {(scan.file.size / 1024 / 1024).toFixed(2)} MB</div><div dir="ltr" className="break-all">SHA-256: {scan.sha256}</div></div>}
          {busy && <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-900">{progress}</div>}
          {error && <div role="alert" className="mt-4 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{error}</div>}
          {message && !error && <div role="status" className="mt-4 break-words rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">{message}</div>}
        </section>

        {scan && <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-extrabold">2. مراجعة الجداول قبل الأرشفة</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-slate-50"><tr><th className="px-3 py-3 text-right">الجدول</th><th className="px-3 py-3 text-right">السجلات</th><th className="px-3 py-3 text-right">مفتاح التتبّع المقترح</th></tr></thead>
              <tbody>{scan.summary.map((t) => <tr key={t.name} className="border-t border-slate-100"><td dir="ltr" className="px-3 py-2 font-semibold">{t.name}</td><td className="px-3 py-2 tabular-nums">{t.count.toLocaleString("en-US")}</td><td dir="ltr" className="px-3 py-2">{t.keyColumn || "row number fallback"}</td></tr>)}</tbody>
            </table>
          </div>
          <button type="button" disabled={busy || !scan || scan.totalRows === 0} onClick={() => void archiveSource()} className="mt-5 rounded-2xl bg-violet-700 px-5 py-3.5 text-sm font-extrabold text-white hover:bg-violet-800 disabled:opacity-50">حفظ نسخة المصدر في أرشيف العيادة</button>
          {staged > 0 && <p className="mt-3 text-sm font-bold text-slate-700">تم رفع {staged.toLocaleString("en-US")} سجل.</p>}
          {batchId && <p className="mt-2 break-all text-xs text-slate-500">Batch ID: {batchId}</p>}
          <p className="mt-4 text-xs leading-6 text-slate-500">الأرشفة لا تعني الموافقة على الترحيل. بعد الأرشفة سنستخدم هذه النسخة لفحص الربط والمعادلات وتوليد نتائج Dry Run قابلة للتكرار. يجب حفظ نسخة احتياطية من قاعدة العيادة أولًا.</p>
        </section>}
      </div>
    </main>
  );
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${warning ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-white"}`}><p className="text-xs font-semibold text-slate-500">{label}</p><p className={`mt-1 text-2xl font-black tabular-nums ${warning ? "text-amber-800" : "text-slate-900"}`}>{value}</p></div>;
}
