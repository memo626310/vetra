"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Buffer } from "buffer";

type MDBColumn = {
  name: string;
  type?: string;
  size?: number;
  nullable?: boolean;
  autoLong?: boolean;
  autoUUID?: boolean;
  precision?: number;
  scale?: number;
};

type MDBTable = {
  name: string;
  rowCount: number;
  columnCount: number;
  getColumns?(): MDBColumn[];
  getColumnNames(): string[];
  getData(options?: { rowOffset?: number; rowLimit?: number }): Record<string, unknown>[];
};

type MDBReaderLike = {
  getTableNames(options?: {
    normalTables?: boolean;
    systemTables?: boolean;
    linkedTables?: boolean;
  }): string[];
  getTable(name: string): MDBTable;
};

type ColumnProfile = {
  name: string;
  accessType: string;
  size: number | null;
  nullable: boolean | null;
  autoLong: boolean;
  autoUUID: boolean;
  precision: number | null;
  scale: number | null;
  nullCount: number;
  emptyStringCount: number;
  nonEmptyCount: number;
  runtimeTypes: Record<string, number>;
  invalidDateCount: number;
  distinctValueCount: number | null;
  duplicateOccurrences: number | null;
  trackingComplete: boolean;
  likelyIdentifier: boolean;
  likelyPrimaryKey: boolean;
  flags: string[];
};

type TableProfile = {
  name: string;
  isLinked: boolean;
  declaredRows: number;
  scannedRows: number;
  columnCount: number;
  scanComplete: boolean;
  scanError: string | null;
  likelyRole: string;
  columns: ColumnProfile[];
  flags: string[];
};

type RelationshipCandidate = {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  confidence: "high" | "medium";
  evidence: string;
  orphanDistinctValues: number | null;
  checkedDistinctValues: number | null;
  isVerifiedConstraint: false;
};

type InternalColumn = ColumnProfile & { values: Set<string> };
type InternalTable = { profile: TableProfile; table: MDBTable; columns: InternalColumn[] };

type Report = {
  format: "VETRA_SOURCE_AUDIT_V2";
  generatedAt: string;
  sourceFile: string;
  sourceSizeBytes: number;
  sourceSha256: string;
  sourceReadMode: "local-browser-only";
  importExecuted: false;
  targetDataModified: false;
  scanLimits: { chunkSize: number; maxRowsPerTable: number; maxDistinctValuesPerColumn: number };
  summary: { tableCount: number; totalDeclaredRows: number; totalScannedRows: number; tablesFullyScanned: number; tablesWithErrors: number; likelyRelationshipCount: number };
  tables: TableProfile[];
  relationshipCandidates: RelationshipCandidate[];
  interpretationWarnings: string[];
};

const CHUNK_SIZE = 1500;
const MAX_ROWS_PER_TABLE = 500_000;
const MAX_DISTINCT_VALUES = 100_000;

function normalizeName(value: string): string {
  let result = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (result.startsWith("tbl") && result.length > 3) result = result.slice(3);
  if (result.endsWith("ies") && result.length > 3) result = result.slice(0, -3) + "y";
  else if (result.endsWith("s") && !result.endsWith("ss") && result.length > 1) result = result.slice(0, -1);
  return result;
}

function looksLikeIdentifier(name: string): boolean {
  return /(^id$|(?:^|[_\s-])id$|id$|code$|barcode$|sku$|phone$|mobile$|email$|invoice.?no$|document.?no$|^رقم|^كود)/i.test(name.trim());
}

function looksLikeReference(name: string): boolean {
  return /(?:_id|id)$/i.test(name.trim()) && !/^id$/i.test(name.trim());
}

function looksLikeKeyName(name: string): boolean {
  return /(^id$|(?:^|[_\s-])id$|id$|^recno$|^recordid$|^rowid$|^.*code$|^.*barcode$|^.*sku$|^.*number$|^.*no$)/i.test(name.trim());
}

function canonicalValue(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return "__INVALID_DATE__";
    return `date:${value.toISOString()}`;
  }
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `number:${String(value)}`;
    return `number:${Object.is(value, -0) ? "0" : String(value)}`;
  }
  if (typeof value === "string") return `text:${value.trim().toLocaleLowerCase()}`;
  if (typeof value === "boolean") return `boolean:${value ? "1" : "0"}`;
  if (Buffer.isBuffer(value)) return `binary:${value.length}:${Buffer.from(value).toString("base64")}`;
  if (Array.isArray(value)) return `array:${value.length}`;
  return `object:${Object.prototype.toString.call(value)}`;
}

function likelyRole(tableName: string): string {
  const name = normalizeName(tableName);
  if (/customer|client|cust|account/.test(name)) return "عميل / حساب محتمل";
  if (/supplier|vendor|provider/.test(name)) return "مورد محتمل";
  if (/product|item|stock|inventory|goods|material/.test(name)) return "منتج / مخزون محتمل";
  if (/category|subcategory|group/.test(name)) return "تصنيف محتمل";
  if (/salesinvoicedetail|saleinvoicedetail|invoiceitem|invoicedetail|salesbilldetail/.test(name)) return "تفاصيل فاتورة بيع محتملة";
  if (/salesinvoice|saleinvoice|invoiceheader|salesbill/.test(name)) return "رأس فاتورة بيع محتمل";
  if (/buyinvoicedetail|purchaseinvoicedetail|purchasedetail/.test(name)) return "تفاصيل فاتورة شراء محتملة";
  if (/buyinvoice|purchaseinvoice|purchasebill/.test(name)) return "رأس فاتورة شراء محتمل";
  if (/payment|money|transaction|receipt|cash|accounttotal/.test(name)) return "حركة مالية محتملة";
  if (/pet|animal|patient/.test(name)) return "حيوان محتمل";
  if (/visit|exam|consult|medical|treatment|vaccine/.test(name)) return "سجل طبي محتمل";
  return "غير محدد — يحتاج مراجعة";
}

function runtimeType(value: unknown): string {
  if (value == null) return "null";
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? "Date" : "InvalidDate";
  if (typeof value === "bigint") return "bigint";
  if (Buffer.isBuffer(value)) return "binary";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function metadataFor(column: MDBColumn): Omit<ColumnProfile, "nullCount" | "emptyStringCount" | "nonEmptyCount" | "runtimeTypes" | "invalidDateCount" | "distinctValueCount" | "duplicateOccurrences" | "trackingComplete" | "likelyPrimaryKey" | "flags"> {
  const type = String(column.type || "unknown");
  return {
    name: column.name,
    accessType: type,
    size: Number.isFinite(column.size) ? Number(column.size) : null,
    nullable: typeof column.nullable === "boolean" ? column.nullable : null,
    autoLong: Boolean(column.autoLong),
    autoUUID: Boolean(column.autoUUID),
    precision: Number.isFinite(column.precision) ? Number(column.precision) : null,
    scale: Number.isFinite(column.scale) ? Number(column.scale) : null,
    likelyIdentifier: looksLikeIdentifier(column.name),
  };
}

function buildFlags(profile: ColumnProfile): string[] {
  const flags: string[] = [];
  if (profile.nullable === false && profile.nullCount > 0) {
    flags.push(`العمود معلن NOT NULL لكن وُجد ${profile.nullCount} قيمة فارغة/null.`);
  }
  if (profile.likelyIdentifier && profile.nullCount > 0) {
    flags.push(`حقل يبدو كمعرّف ويحتوي على ${profile.nullCount} قيمة null.`);
  }
  if (profile.likelyIdentifier && profile.emptyStringCount > 0) {
    flags.push(`حقل معرّف محتمل يحتوي على ${profile.emptyStringCount} نص فارغ.`);
  }
  if (profile.duplicateOccurrences !== null && profile.duplicateOccurrences > 0 && looksLikeKeyName(profile.name)) {
    flags.push(`قيم مكررة في حقل مرشح كمفتاح: ${profile.duplicateOccurrences} تكرار بعد أول ظهور.`);
  }
  if (profile.invalidDateCount > 0) {
    flags.push(`وجد ${profile.invalidDateCount} قيمة تاريخ غير صالحة.`);
  }
  if (!profile.trackingComplete && profile.likelyIdentifier) {
    flags.push("تتبع القيم المميزة وصل إلى الحد الآمن؛ لا يُعتمد على اختبار التفرد لهذا العمود.");
  }
  return flags;
}

function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.slice(0, 600);
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export default function DatabaseImportAuditPage() {
  const readerRef = useRef<MDBReaderLike | null>(null);
  const internalTablesRef = useRef<InternalTable[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [fileSha256, setFileSha256] = useState("");
  const [tables, setTables] = useState<TableProfile[]>([]);
  const [relationships, setRelationships] = useState<RelationshipCandidate[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [sampleRows, setSampleRows] = useState<Record<string, unknown>[]>([]);
  const [showSample, setShowSample] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ tableName: "", tableIndex: 0, tableTotal: 0, rows: 0 });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const totalDeclaredRows = tables.reduce((sum, table) => sum + table.declaredRows, 0);
  const totalScannedRows = tables.reduce((sum, table) => sum + table.scannedRows, 0);
  const fullyScannedTables = tables.filter((table) => table.scanComplete && !table.scanError).length;
  const erroredTables = tables.filter((table) => Boolean(table.scanError) || !table.scanComplete).length;
  const allScanned = tables.length > 0 && erroredTables === 0 && fullyScannedTables === tables.length;

  const activeTable = useMemo(
    () => tables.find((table) => table.name === selectedTable),
    [tables, selectedTable]
  );

  async function inspectFile(file: File) {
    setError("");
    setMessage("");
    setTables([]);
    setRelationships([]);
    setSelectedTable("");
    setSampleRows([]);
    setShowSample(false);
    setFileSha256("");
    readerRef.current = null;
    internalTablesRef.current = [];

    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "mdb" && extension !== "accdb") {
      setError("اختار ملف Microsoft Access بصيغة .mdb أو .accdb.");
      return;
    }
    if (!file.size) {
      setError("الملف فاضي.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("حجم الملف أكبر من 100 ميجابايت. استخدم نسخة أصغر من قاعدة البيانات.");
      return;
    }

    setLoading(true);
    setFileName(file.name);
    setFileSize(file.size);
    setProgress({ tableName: "قراءة الملف والتحقق من بصمته", tableIndex: 0, tableTotal: 0, rows: 0 });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const digest = await globalThis.crypto.subtle.digest("SHA-256", arrayBuffer);
      const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      setFileSha256(sha256);
            const module = await import("mdb-reader");
      const MDBReader = module.default as unknown as new (buffer: Buffer) => MDBReaderLike;
      (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer = Buffer;
      const reader = new MDBReader(Buffer.from(arrayBuffer));
      readerRef.current = reader;

      const normalNames = reader.getTableNames({ normalTables: true, systemTables: false, linkedTables: false });
      let linkedNames: string[] = [];
      try {
        linkedNames = reader.getTableNames({ normalTables: false, systemTables: false, linkedTables: true });
      } catch {
        linkedNames = [];
      }
      const linkedSet = new Set(linkedNames);
      const names = Array.from(new Set([...normalNames, ...linkedNames]));
      if (!names.length) throw new Error("لم يتم العثور على جداول مستخدم قابلة للقراءة.");

      const results: InternalTable[] = [];
      setProgress({ tableName: "تحليل الجداول", tableIndex: 0, tableTotal: names.length, rows: 0 });

      for (let tableIndex = 0; tableIndex < names.length; tableIndex += 1) {
        const name = names[tableIndex];
        setProgress({ tableName: name, tableIndex: tableIndex + 1, tableTotal: names.length, rows: 0 });
        await yieldToBrowser();

        try {
          const table = reader.getTable(name);
          const definitions = table.getColumns?.() || table.getColumnNames().map((columnName) => ({ name: columnName }));
          const columns: InternalColumn[] = definitions.map((definition) => {
            const base = metadataFor(definition);
            const shouldTrack = base.likelyIdentifier || looksLikeReference(base.name) || /^(name|productname|customername|clientname|itemname|phone|mobile|email|barcode|sku)$/i.test(base.name);
            return {
              ...base,
              nullCount: 0,
              emptyStringCount: 0,
              nonEmptyCount: 0,
              runtimeTypes: {},
              invalidDateCount: 0,
              distinctValueCount: null,
              duplicateOccurrences: null,
              trackingComplete: true,
              likelyPrimaryKey: false,
              flags: [],
              values: new Set<string>(),
              ...(shouldTrack ? { distinctValueCount: 0, duplicateOccurrences: 0 } : {}),
            };
          });

          let scannedRows = 0;
          let scanComplete = false;
          let scanError: string | null = null;

          try {
            while (true) {
              if (scannedRows >= MAX_ROWS_PER_TABLE) {
                scanError = `توقف الفحص عند الحد الوقائي ${MAX_ROWS_PER_TABLE.toLocaleString("en-US")} صف. يلزم فحص كامل خارج المتصفح قبل الاستيراد.`;
                break;
              }
              const batch = table.getData({ rowOffset: scannedRows, rowLimit: Math.min(CHUNK_SIZE, MAX_ROWS_PER_TABLE - scannedRows) });
              if (!batch.length) {
                scanComplete = true;
                break;
              }

              for (const row of batch) {
                for (const column of columns) {
                  const value = row[column.name];
                  if (value == null) {
                    column.nullCount += 1;
                    continue;
                  }

                  column.nonEmptyCount += 1;
                  if (typeof value === "string" && value.trim() === "") column.emptyStringCount += 1;
                  const kind = runtimeType(value);
                  column.runtimeTypes[kind] = (column.runtimeTypes[kind] || 0) + 1;

                  if (value instanceof Date && !Number.isFinite(value.getTime())) column.invalidDateCount += 1;

                  if (column.distinctValueCount !== null && column.duplicateOccurrences !== null) {
                    const key = canonicalValue(value);
                    if (key !== null) {
                      if (column.values.has(key)) {
                        column.duplicateOccurrences += 1;
                      } else if (column.values.size < MAX_DISTINCT_VALUES) {
                        column.values.add(key);
                        column.distinctValueCount = column.values.size;
                      } else {
                        column.trackingComplete = false;
                      }
                    }
                  }
                }
                scannedRows += 1;
              }

              setProgress({ tableName: name, tableIndex: tableIndex + 1, tableTotal: names.length, rows: scannedRows });
              if (batch.length < CHUNK_SIZE) {
                scanComplete = scannedRows === Number(table.rowCount || 0);
                if (!scanComplete && scannedRows < Number(table.rowCount || 0)) {
                  scanError = `عدد السجلات المقروءة (${scannedRows}) لا يطابق عدد السجلات المعلن (${table.rowCount}).`;
                }
                break;
              }
              await yieldToBrowser();
            }
          } catch (caught) {
            scanError = safeError(caught);
          }

          const finalColumns = columns.map((column) => {
            const candidatePrimary = looksLikeKeyName(column.name) &&
              Number(table.rowCount || 0) > 0 &&
              column.trackingComplete &&
              column.nullCount === 0 &&
              column.emptyStringCount === 0 &&
              column.distinctValueCount === Number(table.rowCount || 0);
            const finalized: ColumnProfile = {
              name: column.name,
              accessType: column.accessType,
              size: column.size,
              nullable: column.nullable,
              autoLong: column.autoLong,
              autoUUID: column.autoUUID,
              precision: column.precision,
              scale: column.scale,
              nullCount: column.nullCount,
              emptyStringCount: column.emptyStringCount,
              nonEmptyCount: column.nonEmptyCount,
              runtimeTypes: column.runtimeTypes,
              invalidDateCount: column.invalidDateCount,
              distinctValueCount: column.distinctValueCount,
              duplicateOccurrences: column.duplicateOccurrences,
              trackingComplete: column.trackingComplete,
              likelyIdentifier: column.likelyIdentifier,
              likelyPrimaryKey: candidatePrimary,
              flags: [],
            };
            finalized.flags = buildFlags(finalized);
            return finalized;
          });

          const tableFlags: string[] = [];
          if (linkedSet.has(name)) tableFlags.push("جدول مرتبط محتمل؛ يجب التأكد من أن بياناته موجودة داخل الملف وليست على مصدر خارجي.");
          if (!scanComplete) tableFlags.push("الفحص غير مكتمل. ممنوع اعتماد الاستيراد اعتمادًا على هذه النتيجة.");
          if (finalColumns.some((column) => looksLikeKeyName(column.name) && column.duplicateOccurrences !== null && column.duplicateOccurrences > 0)) {
            tableFlags.push("وجدت أعمدة مرشحة كمفاتيح بها قيم مكررة؛ قد يكون المفتاح مركبًا أو توجد مشكلة في البيانات.");
          }

          results.push({
            profile: {
              name,
              isLinked: linkedSet.has(name),
              declaredRows: Number(table.rowCount || 0),
              scannedRows,
              columnCount: Number(table.columnCount || definitions.length),
              scanComplete: scanComplete && scannedRows === Number(table.rowCount || 0),
              scanError,
              likelyRole: likelyRole(name),
              columns: finalColumns,
              flags: tableFlags,
            },
            table,
            columns,
          });
        } catch (caught) {
          results.push({
            profile: {
              name,
              isLinked: linkedSet.has(name),
              declaredRows: 0,
              scannedRows: 0,
              columnCount: 0,
              scanComplete: false,
              scanError: safeError(caught),
              likelyRole: likelyRole(name),
              columns: [],
              flags: ["تعذر فتح الجدول؛ لا يمكن اعتماد البيانات قبل حل المشكلة."],
            },
            table: { name, rowCount: 0, columnCount: 0, getColumnNames: () => [], getData: () => [] },
            columns: [],
          });
        }
      }

      const relationshipCandidates = buildRelationshipCandidates(results);
      internalTablesRef.current = results;
      setTables(results.map((result) => result.profile).sort((a, b) => b.declaredRows - a.declaredRows || a.name.localeCompare(b.name)));
      setRelationships(relationshipCandidates);
      setSelectedTable(results[0]?.profile.name || "");
      setMessage(`اكتمل فحص ${results.length} جدول. لم يتم استيراد أو تعديل أي بيانات.`);
    } catch (caught) {
      console.error("VETRA SOURCE AUDIT ERROR:", caught);
      setError(`تعذر فحص ملف Access. ${safeError(caught)}`);
      setFileName("");
      setFileSize(0);
      setFileSha256("");
      readerRef.current = null;
      internalTablesRef.current = [];
    } finally {
      setLoading(false);
    }
  }

  function buildRelationshipCandidates(internalTables: InternalTable[]): RelationshipCandidate[] {
    const output: RelationshipCandidate[] = [];
    const tableNames = internalTables.map((item) => item.profile.name);

    for (const source of internalTables) {
      for (const column of source.columns) {
        if (!looksLikeReference(column.name)) continue;
        let sourceBase = column.name.toLowerCase().replace(/[_\s-]*id$/i, "").replace(/[^a-z0-9]/g, "");
        if (!sourceBase || sourceBase === "id") continue;

        const candidateTargets = internalTables.filter((target) => {
          if (target.profile.name === source.profile.name || !target.profile.scanComplete) return false;
          return normalizeName(target.profile.name) === normalizeName(sourceBase);
        });

        for (const target of candidateTargets) {
          const targetKey = target.columns.find((item) =>
            item.name.toLowerCase() === "id" ||
            normalizeName(item.name) === `${normalizeName(target.profile.name)}id` ||
            item.likelyPrimaryKey
          );
          if (!targetKey) continue;

          const sourceReady = source.profile.scanComplete && column.trackingComplete && column.values.size > 0;
          const targetReady = targetKey.trackingComplete && targetKey.values.size > 0;
          let orphanDistinctValues: number | null = null;
          let checkedDistinctValues: number | null = null;
          if (sourceReady && targetReady) {
            const keySet = targetKey.values;
            checkedDistinctValues = column.values.size;
            let missing = 0;
            for (const value of column.values) if (!keySet.has(value)) missing += 1;
            orphanDistinctValues = missing;
          }

          output.push({
            sourceTable: source.profile.name,
            sourceColumn: column.name,
            targetTable: target.profile.name,
            targetColumn: targetKey.name,
            confidence: normalizeName(target.profile.name) === normalizeName(sourceBase) ? "high" : "medium",
            evidence: "تطابق اسم العمود واسم الجدول فقط؛ لم يتم إثبات العلاقة من Access ولا تُعد هذه مطابقة معتمدة.",
            orphanDistinctValues,
            checkedDistinctValues,
            isVerifiedConstraint: false,
          });
        }
      }
    }
    return output.sort((a, b) => (b.orphanDistinctValues ?? -1) - (a.orphanDistinctValues ?? -1));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void inspectFile(file);
    event.target.value = "";
  }

  function previewTable(tableName: string) {
    setSelectedTable(tableName);
    setShowSample(false);
    setSampleRows([]);
  }

  function toggleSample() {
    if (!readerRef.current || !selectedTable) return;
    if (showSample) {
      setShowSample(false);
      return;
    }
    try {
      setSampleRows(readerRef.current.getTable(selectedTable).getData({ rowLimit: 3 }));
      setShowSample(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر عرض عينة البيانات.");
    }
  }
    function makeReport(): Report {
    const orderedTables = [...tables].sort((a, b) => a.name.localeCompare(b.name));

    return {
      format: "VETRA_SOURCE_AUDIT_V2",
      generatedAt: new Date().toISOString(),
      sourceFile: fileName,
      sourceSizeBytes: fileSize,
      sourceSha256: fileSha256,
      sourceReadMode: "local-browser-only",
      importExecuted: false,
      targetDataModified: false,
      scanLimits: {
        chunkSize: CHUNK_SIZE,
        maxRowsPerTable: MAX_ROWS_PER_TABLE,
        maxDistinctValuesPerColumn: MAX_DISTINCT_VALUES,
      },
      summary: {
        tableCount: tables.length,
        totalDeclaredRows,
        totalScannedRows,
        tablesFullyScanned: fullyScannedTables,
        tablesWithErrors: erroredTables,
        likelyRelationshipCount: relationships.length,
      },
      tables: orderedTables,
      relationshipCandidates: relationships,
      interpretationWarnings: [
        "تقرير الهيكل والفحص لا يحتوي على قيم السجلات أو أسماء العملاء أو أرقام هواتفهم.",
        "الحقول التي تبدو كمفاتيح أو علاقات مرشحة بالاسم والتحليل فقط وليست علاقات مؤكدة من قاعدة المصدر.",
        "لا يوجد أي كود استيراد أو كتابة إلى قاعدة VETRA في هذه الصفحة.",
        "إذا كان أي جدول غير مكتمل أو فشل في القراءة، فالتقرير غير صالح لاعتماد الاستيراد النهائي.",
        "عدد القيم المميزة قد يكون حدًا أدنى إذا وصل تتبع العمود إلى الحد الآمن المحدد.",
      ],
    };
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(makeReport(), null, 2));
      setMessage("تم نسخ تقرير فحص المصدر بدون بيانات العملاء. ابعته هنا لمراجعة المطابقة.");
      setError("");
    } catch {
      setError("تعذر النسخ التلقائي. استخدم زر تنزيل تقرير JSON.");
    }
  }

  function downloadReport() {
    const blob = new Blob(
      [JSON.stringify(makeReport(), null, 2)],
      { type: "application/json;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `${fileName.replace(/\.[^.]+$/, "") || "database"}-audit.json`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);

    setMessage("تم تنزيل تقرير فحص المصدر. التقرير لا يحتوي على بيانات السجلات الفعلية.");
    setError("");
  }

  const inputClass = "sr-only";

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#f7f9fc] px-4 py-6 text-slate-900 sm:px-6 sm:py-8"
    >
      <div className="mx-auto max-w-7xl">
        <Link
          href="/settings"
          className="mb-5 inline-flex rounded-xl px-1 py-2 text-sm font-semibold text-slate-500 transition hover:text-slate-900"
        >
          ← الإعدادات
        </Link>

        <header className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-3xl">
              🛡️
            </div>

            <h1 className="text-2xl font-black sm:text-3xl">
              فحص قاعدة البيانات قبل الاستيراد
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500 sm:text-base">
              تحليل محلي للهيكل والقيم الفارغة والقيم المكررة والحقول المرشحة للمفاتيح والعلاقات.
              هذه المرحلة لا تكتب أي بيانات إلى VETRA ولا تعتمد علاقات بالتخمين.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            🔒 الملف لا يُرفع إلى خادم
          </div>
        </header>

        <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-extrabold">1. فحص ملف Access</h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            اختار ملف MDB أو ACCDB. تتم قراءة الجداول داخل علامة التبويب الحالية فقط.
            يُسجل التقرير بصمة SHA-256 لتحديد الملف نفسه عند المراجعة.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".mdb,.accdb,application/x-msaccess"
            onChange={handleFileChange}
            className={inputClass}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="mt-5 inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"
          >
            {loading
              ? "جاري الفحص..."
              : fileName
                ? "اختيار ملف آخر"
                : "اختيار ملف MDB / ACCDB"}
          </button>

          {fileName && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                📄 {fileName} · {(fileSize / (1024 * 1024)).toFixed(2)} MB
              </div>

              <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <span className="font-bold">SHA-256:</span>{" "}
                <span dir="ltr" className="break-all">
                  {fileSha256 || "جاري الحساب..."}
                </span>
              </div>
            </div>
          )}

          {loading && (
            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-blue-900">
                <span dir="ltr">{progress.tableName}</span>

                <span>
                  {progress.tableTotal
                    ? `جدول ${progress.tableIndex} من ${progress.tableTotal}`
                    : "تهيئة الفحص"}
                </span>
              </div>

              <p className="mt-2 text-xs text-blue-800">
                تمت قراءة {progress.rows.toLocaleString("en-US")} سجل من الجدول الحالي.
              </p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-5 whitespace-pre-wrap rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700"
            >
              {error}
            </div>
          )}

          {message && !error && (
            <div
              role="status"
              className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-800"
            >
              {message}
            </div>
          )}
        </section>

        {tables.length > 0 && (
          <>
            <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label="عدد الجداول"
                value={tables.length.toLocaleString("en-US")}
              />

              <Metric
                label="عدد السجلات المعلن"
                value={totalDeclaredRows.toLocaleString("en-US")}
              />

              <Metric
                label="السجلات التي فُحصت"
                value={totalScannedRows.toLocaleString("en-US")}
              />

              <Metric
                label="الجداول غير المكتملة"
                value={erroredTables.toLocaleString("en-US")}
                danger={erroredTables > 0}
              />
            </section>

            <section className="mb-6 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <h2 className="text-lg font-extrabold">
                    2. تحليل الجداول والحقول
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    البيانات المعروضة هنا وصفية. أي مفتاح أو علاقة مكتشفة بالاسم تحتاج تحققًا قبل الاستيراد.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyReport()}
                    className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
                  >
                    نسخ تقرير الفحص
                  </button>

                  <button
                    type="button"
                    onClick={downloadReport}
                    className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
                  >
                    تنزيل JSON
                  </button>
                </div>
              </div>

              <div className="grid lg:grid-cols-[minmax(270px,0.8fr)_minmax(0,1.7fr)]">
                <div className="max-h-[640px] overflow-y-auto border-b border-slate-100 p-3 lg:border-b-0 lg:border-l">
                  {tables.map((table) => (
                    <button
                      key={table.name}
                      type="button"
                      onClick={() => previewTable(table.name)}
                      className={`mb-2 flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-right transition ${
                        selectedTable === table.name
                          ? "border-blue-200 bg-blue-50 text-blue-900"
                          : "border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-white"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          dir="ltr"
                          className="block break-all text-sm font-bold"
                        >
                          {table.name}
                        </span>

                        <span className="mt-1 block text-xs text-slate-500">
                          {table.likelyRole}
                        </span>

                        {table.isLinked && (
                          <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">
                            مرتبط محتمل
                          </span>
                        )}

                        {!table.scanComplete && (
                          <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-800">
                            الفحص ناقص
                          </span>
                        )}
                      </span>

                      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-500">
                        {table.declaredRows.toLocaleString("en-US")}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="min-w-0 p-5 sm:p-6">
                  {activeTable ? (
                    <>
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3
                            dir="ltr"
                            className="break-all text-lg font-black text-slate-900"
                          >
                            {activeTable.name}
                          </h3>

                          <p className="mt-1 text-sm text-slate-500">
                            {activeTable.scannedRows.toLocaleString("en-US")} /{" "}
                            {activeTable.declaredRows.toLocaleString("en-US")} سجل مفحوص ·{" "}
                            {activeTable.columnCount} عمود
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={toggleSample}
                          className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
                        >
                          {showSample ? "إخفاء العينة" : "عرض 3 سجلات محليًا"}
                        </button>
                      </div>

                      {activeTable.scanError && (
                        <div className="mb-4 whitespace-pre-wrap rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-semibold text-red-800">
                          خطأ الفحص: {activeTable.scanError}
                        </div>
                      )}

                      {activeTable.flags.length > 0 && (
                        <div className="mb-4 space-y-2">
                          {activeTable.flags.map((flag) => (
                            <div
                              key={flag}
                              className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900"
                            >
                              ⚠️ {flag}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="overflow-x-auto rounded-2xl border border-slate-200">
                        <table className="min-w-full border-collapse text-xs">
                          <thead className="bg-slate-50 text-slate-600">
                            <tr>
                              <th className="px-3 py-3 text-right font-extrabold">العمود / النوع</th>
                              <th className="px-3 py-3 text-right font-extrabold">NULL</th>
                              <th className="px-3 py-3 text-right font-extrabold">فارغ نصيًا</th>
                              <th className="px-3 py-3 text-right font-extrabold">مميز / تكرار</th>
                              <th className="px-3 py-3 text-right font-extrabold">الاستنتاج</th>
                            </tr>
                          </thead>

                          <tbody>
                            {activeTable.columns.map((column) => (
                              <tr
                                key={column.name}
                                className="border-t border-slate-100 align-top"
                              >
                                <td className="max-w-52 px-3 py-3">
                                  <span
                                    dir="ltr"
                                    className="block break-all font-bold text-slate-800"
                                  >
                                    {column.name}
                                  </span>

                                  <span
                                    dir="ltr"
                                    className="mt-1 block text-slate-500"
                                  >
                                    {column.accessType}
                                    {column.size != null ? ` · size ${column.size}` : ""}
                                    {column.precision != null ? ` · p${column.precision}` : ""}
                                    {column.scale != null ? ` s${column.scale}` : ""}
                                  </span>

                                  {column.nullable === false && (
                                    <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">
                                      NOT NULL
                                    </span>
                                  )}

                                  {column.autoLong && (
                                    <span className="mt-1 mr-1 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-800">
                                      AutoNumber
                                    </span>
                                  )}
                                </td>

                                <td className="px-3 py-3 tabular-nums">
                                  {column.nullCount.toLocaleString("en-US")}
                                </td>

                                <td className="px-3 py-3 tabular-nums">
                                  {column.emptyStringCount.toLocaleString("en-US")}
                                </td>

                                <td className="px-3 py-3 tabular-nums">
                                  {column.distinctValueCount == null
                                    ? "—"
                                    : column.distinctValueCount.toLocaleString("en-US")}

                                  <span className="mt-1 block text-slate-500">
                                    تكرار:{" "}
                                    {column.duplicateOccurrences == null
                                      ? "غير متتبع"
                                      : column.duplicateOccurrences.toLocaleString("en-US")}
                                  </span>

                                  {!column.trackingComplete && (
                                    <span className="mt-1 block text-amber-700">
                                      حد التتبع
                                    </span>
                                  )}
                                </td>

                                <td className="min-w-40 px-3 py-3">
                                  {column.likelyPrimaryKey && (
                                    <span className="mb-1 inline-block rounded-full bg-emerald-100 px-2 py-1 font-bold text-emerald-800">
                                      مرشح مفتاح فريد
                                    </span>
                                  )}

                                  {column.flags.map((flag) => (
                                    <p
                                      key={flag}
                                      className="mb-1 max-w-64 leading-5 text-amber-800"
                                    >
                                      {flag}
                                    </p>
                                  ))}

                                  {Object.entries(column.runtimeTypes).map(([kind, count]) => (
                                    <span
                                      key={kind}
                                      dir="ltr"
                                      className="mb-1 ml-1 inline-block rounded bg-slate-100 px-1.5 py-1 text-[10px] text-slate-600"
                                    >
                                      {kind}: {count}
                                    </span>
                                  ))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {showSample && (
                        <div className="mt-5 overflow-x-auto rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
                          <p className="mb-3 text-xs font-bold leading-5 text-amber-900">
                            عينة محلية فقط من أول 3 سجلات. قد تحتوي على بيانات شخصية؛ لن تدخل ضمن التقرير المنسوخ أو الملف المنزّل.
                          </p>

                          {sampleRows.length === 0 ? (
                            <p className="text-sm text-slate-500">لا توجد سجلات للعرض.</p>
                          ) : (
                            <table className="min-w-full border-collapse text-xs">
                              <thead>
                                <tr>
                                  {activeTable.columns.map((column) => (
                                    <th
                                      key={column.name}
                                      dir="ltr"
                                      className="border-b border-amber-200 px-3 py-2 text-right font-extrabold"
                                    >
                                      {column.name}
                                    </th>
                                  ))}
                                </tr>
                              </thead>

                              <tbody>
                                {sampleRows.map((row, rowIndex) => (
                                  <tr key={rowIndex}>
                                    {activeTable.columns.map((column) => (
                                      <td
                                        key={column.name}
                                        dir="ltr"
                                        className="max-w-48 border-b border-amber-100 px-3 py-2 align-top text-slate-700"
                                      >
                                        <span className="block max-h-20 overflow-auto break-words">
                                          {displayValue(row[column.name])}
                                        </span>
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">اختار جدول من القائمة.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold">3. العلاقات المحتملة</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    اكتشاف بالاسم فقط، وليس إثباتًا لعلاقات مفاتيح خارجية. لا تستخدم هذه القائمة وحدها للنقل.
                  </p>
                </div>

                <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold">
                  {relationships.length}
                </span>
              </div>

              {relationships.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  لم يتم العثور على علاقات واضحة بالأسماء. هذا لا يثبت عدم وجود علاقات في قاعدة المصدر.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full border-collapse text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-3 text-right">المصدر</th>
                        <th className="px-3 py-3 text-right">الهدف المرشح</th>
                        <th className="px-3 py-3 text-right">قيم مرجعية مفقودة مميزة</th>
                        <th className="px-3 py-3 text-right">الثقة</th>
                      </tr>
                    </thead>

                    <tbody>
                      {relationships.map((item) => (
                        <tr
                          key={`${item.sourceTable}.${item.sourceColumn}->${item.targetTable}.${item.targetColumn}`}
                          className="border-t border-slate-100"
                        >
                          <td className="px-3 py-3">
                            <span dir="ltr" className="block font-bold">
                              {item.sourceTable}.{item.sourceColumn}
                            </span>
                          </td>

                          <td className="px-3 py-3">
                            <span dir="ltr">
                              {item.targetTable}.{item.targetColumn}
                            </span>
                          </td>

                          <td className="px-3 py-3">
                            {item.orphanDistinctValues == null
                              ? "لم يمكن حسابها بالكامل"
                              : item.orphanDistinctValues.toLocaleString("en-US")}
                          </td>

                          <td className="px-3 py-3">
                            {item.confidence === "high"
                              ? "تطابق تسمية أقوى"
                              : "تطابق تسمية أضعف"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section
              className={`rounded-3xl border p-5 sm:p-6 ${
                allScanned
                  ? "border-amber-200 bg-amber-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <h2
                className={`font-extrabold ${
                  allScanned ? "text-amber-950" : "text-red-950"
                }`}
              >
                4. حالة الجاهزية
              </h2>

              <p
                className={`mt-2 text-sm leading-7 ${
                  allScanned ? "text-amber-900" : "text-red-900"
                }`}
              >
                {allScanned
                  ? "الفحص الوصفي اكتمل لكل الجداول التي قرأناها. هذا لا يعني أن الملف جاهز للاستيراد بعد؛ نحتاج مطابقة تقرير المصدر مع أعمدة وقيود VETRA، والتحقق من التكرارات والمعادلات المحاسبية، ثم تجربة Dry Run بلا كتابة. زر الاستيراد غير موجود عمدًا في هذه المرحلة."
                  : "لا يمكن اعتماد الاستيراد؛ يوجد جدول واحد على الأقل لم يُفحص بالكامل أو حدث فيه خطأ. يجب حل الخطأ أو استخدام أداة فحص أخرى قبل بناء خطة الترحيل."}
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        danger ? "border-red-200" : "border-slate-100"
      }`}
    >
      <p className="text-xs font-semibold text-slate-400">{label}</p>
      <p
        className={`mt-1 text-2xl font-black tabular-nums ${
          danger ? "text-red-700" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function displayValue(value: unknown): string {
  if (value == null) return "—";

  if (value instanceof Date) {
    return Number.isFinite(value.getTime())
      ? value.toISOString()
      : "[تاريخ غير صالح]";
  }

  if (typeof value === "bigint") return value.toString();

  if (Buffer.isBuffer(value)) {
    return `[بيانات ثنائية: ${value.length} bytes]`;
  }

  if (Array.isArray(value)) return `[${value.length} عنصر]`;

  if (typeof value === "object") return "[قيمة مركبة]";

  return String(value);
}