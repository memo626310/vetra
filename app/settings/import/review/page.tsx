"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";

type Batch = {
  id: string;
  source_file_name: string;
  source_sha256: string;
  source_size_bytes: number;
  audit_version: string;
  status: string;
  source_table_counts: Record<string, number> | null;
  summary: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
};

type SourceRow = {
  id: string;
  source_table: string;
  source_key: string;
  source_row_number: number;
  row_fingerprint: string;
  payload: Record<string, unknown>;
};

type Issue = { code: string; count: number; severity: "block" | "review" | "info"; detail: string };
type TableCount = { name: string; count: number; expected: number | null; delta: number | null; role: string };
type ReviewReport = {
  generatedAt: string;
  batchId: string;
  sourceFile: string;
  sourceSha256: string;
  sourceRowCount: number;
  targetSnapshotCounts: { clients: number; products: number; categories: number; invoices: number };
  countsBySourceTable: TableCount[];
  issues: Issue[];
  checks: {
    archivedCountMatchesExpected: boolean;
    clientRowsWithoutName: number;
    invoiceCustomerOrphans: number;
    invoiceDetailsWithoutHeader: number;
    invoiceDetailsWithoutProduct: number;
    invoiceDetailsInvalidQuantity: number;
    productsWithoutName: number;
    productsWithNegativePrices: number;
    productCategoryOrphans: number;
    productSubcategoryOrphans: number;
    stockProductOrphans: number;
    duplicateCustomerNameGroups: number;
    duplicateProductNameGroups: number;
    multipleStockProductGroups: number;
    existingClientCandidates: number;
    existingProductNameCandidates: number;
    existingCategoryNameCandidates: number;
    invoiceNumberCollisions: number;
    invoicesWithoutDetails: number;
    invoiceTotalsFailingAllHypotheses: number;
    unsupportedRows: number;
  };
  importExecuted: false;
  businessTablesModified: false;
  warnings: string[];
};

const PAGE_SIZE = 500;
const MONEY_TOLERANCE = 0.03;
const UNSUPPORTED_TABLES = new Set([
  "BuyInvoiceDetails", "BuyInvoices", "CustomerAccount", "CustomerAccountTotal",
  "Employee", "Job", "Money", "money_data", "Supplier", "SupplierAccount",
  "SupplierAccountTotal", "masrofat", "masrofatTypes", "SalesInvoicesReturn",
  "SalesInvoiceDetailsReturn", "BuyInvoicesReturn", "BuyInvoiceDetailsReturn",
  "StockTransfer", "StockTransfereDetails", "aqsat", "aqsatDetails", "aqsatMonths",
  "EmployeeAccount", "employee_absent", "employee_attend", "employee_departure",
  "supplier_papers", "customer_papers", "bank", "roles", "shift", "Employees",
  "SalesInvoicesPrimary", "SalesInvoiceDetailsPrimary", "halekInvoices", "halekInvoiceDetails",
  "register", "act", "BarcodeBigSettings", "BarcodeSmallSettings", "productUnits",
  "productOperations", "Stock", "Temp_stock", "Unit", "Types", "miniQuan",
]);

function normalize(value: unknown): string {
  if (value == null) return "";
  return String(value).normalize("NFKC").toLocaleLowerCase().replace(/[\s\u200f\u200e]+/g, " ").trim();
}

function sourceKey(value: unknown): string | null {
  if (value == null || String(value).trim() === "") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "object" && value && "__vetra_type" in value) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function countDuplicateGroups(rows: Record<string, unknown>[], selector: (row: Record<string, unknown>) => string): number {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = selector(row);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

function role(name: string): string {
  const roles: Record<string, string> = {
    Customer: "عملاء",
    Category: "تصنيفات رئيسية",
    Subcategory: "تصنيفات فرعية",
    Product: "منتجات",
    SalesInvoices: "فواتير بيع",
    SalesInvoiceDetails: "تفاصيل فواتير بيع",
    Temp_stock: "أرصدة مخزون — تتطلب مطابقة",
    BuyInvoices: "فواتير شراء — غير مدعومة مباشرة",
    BuyInvoiceDetails: "تفاصيل شراء — غير مدعومة مباشرة",
    Supplier: "موردون — غير مدعومين مباشرة",
    CustomerAccount: "حسابات عملاء — غير مدعومة مباشرة",
    SupplierAccount: "حسابات موردين — غير مدعومة مباشرة",
    money_data: "حركات مالية — غير مدعومة مباشرة",
  };
  return roles[name] || (UNSUPPORTED_TABLES.has(name) ? "أرشيف فقط / وجهة غير معتمدة" : "يحتاج خريطة معتمدة");
}

async function fetchAll<T>(client: any, table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client.from(table).select(columns).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`قراءة ${table}: ${error.message}`);
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function countRefOrphans(rows: Record<string, unknown>[], field: string, keySet: Set<string>): number {
  return rows.filter((row) => {
    const key = sourceKey(row[field]);
    return key === null || !keySet.has(key);
  }).length;
}

function buildReport(
  batch: Batch,
  sourceRows: SourceRow[],
  target: { clients: any[]; products: any[]; categories: any[]; invoices: any[] },
): ReviewReport {
  const grouped = new Map<string, SourceRow[]>();
  for (const row of sourceRows) {
    const rows = grouped.get(row.source_table) || [];
    rows.push(row);
    grouped.set(row.source_table, rows);
  }
  const rowsOf = (name: string) => (grouped.get(name) || []).map((row) => row.payload || {});
  const customers = rowsOf("Customer");
  const categories = rowsOf("Category");
  const subcategories = rowsOf("Subcategory");
  const products = rowsOf("Product");
  const salesInvoices = rowsOf("SalesInvoices");
  const salesDetails = rowsOf("SalesInvoiceDetails");
  const stock = rowsOf("Temp_stock");

  const customerIds = new Set(customers.map((row) => sourceKey(row.id)).filter((v): v is string => v !== null));
  const productIds = new Set(products.map((row) => sourceKey(row.id)).filter((v): v is string => v !== null));
  const categoryIds = new Set(categories.map((row) => sourceKey(row.id)).filter((v): v is string => v !== null));
  const subcategoryIds = new Set(subcategories.map((row) => sourceKey(row.id)).filter((v): v is string => v !== null));
  const invoiceNumbers = new Set(salesInvoices.map((row) => sourceKey(row.invoice_no)).filter((v): v is string => v !== null));

  const targetClientNamePhone = new Set(target.clients.map((row) => `${normalize(row.name)}|${normalize(row.phone)}`).filter((key) => !key.startsWith("|")));
  const existingClientCandidates = customers.filter((row) => {
    const name = normalize(row.name); const phone = normalize(row.phone);
    return Boolean(name && phone && targetClientNamePhone.has(`${name}|${phone}`));
  }).length;
  const targetProductNames = new Set(target.products.map((row) => normalize(row.name)).filter(Boolean));
  const targetCategoryNames = new Set(target.categories.map((row) => normalize(row.name)).filter(Boolean));
  const targetInvoiceNumbers = new Set(target.invoices.map((row) => String(row.invoice_number)));
  const existingProductNameCandidates = products.filter((row) => normalize(row.name) && targetProductNames.has(normalize(row.name))).length;
  const existingCategoryNameCandidates = categories.filter((row) => normalize(row.name) && targetCategoryNames.has(normalize(row.name))).length;
  const invoiceNumberCollisions = salesInvoices.filter((row) => row.invoice_no != null && targetInvoiceNumbers.has(String(row.invoice_no))).length;

  const duplicateCustomerNameGroups = countDuplicateGroups(customers, (row) => normalize(row.name));
  const duplicateProductNameGroups = countDuplicateGroups(products, (row) => normalize(row.name));
  const stockProductCounts = new Map<string, number>();
  for (const row of stock) {
    const key = sourceKey(row.prod_id);
    if (key) stockProductCounts.set(key, (stockProductCounts.get(key) || 0) + 1);
  }
  const multipleStockProductGroups = [...stockProductCounts.values()].filter((count) => count > 1).length;

  const invoiceCustomerOrphans = countRefOrphans(salesInvoices, "cust_id", customerIds);
  const invoiceDetailsWithoutHeader = salesDetails.filter((row) => {
    const key = sourceKey(row.invoice_id);
    return key === null || !invoiceNumbers.has(key);
  }).length;
  const invoiceDetailsWithoutProduct = countRefOrphans(salesDetails, "prod_id", productIds);
  const invoiceDetailsInvalidQuantity = salesDetails.filter((row) => {
    const quantity = asNumber(row.quantity);
    return quantity === null || quantity <= 0;
  }).length;
  const clientRowsWithoutName = customers.filter((row) => !normalize(row.name)).length;
  const productsWithoutName = products.filter((row) => !normalize(row.name)).length;
  const productsWithNegativePrices = products.filter((row) => {
    const buy = asNumber(row.buyPrice); const sell = asNumber(row.sellPrice);
    return (buy !== null && buy < 0) || (sell !== null && sell < 0);
  }).length;
  const productCategoryOrphans = products.filter((row) => {
    const key = sourceKey(row.catId);
    return key !== null && !categoryIds.has(key);
  }).length;
  const productSubcategoryOrphans = products.filter((row) => {
    const key = sourceKey(row.subcatId);
    return key !== null && !subcategoryIds.has(key);
  }).length;
  const stockProductOrphans = countRefOrphans(stock, "prod_id", productIds);

  const detailsByInvoice = new Map<string, Record<string, unknown>[]>();
  for (const detail of salesDetails) {
    const key = sourceKey(detail.invoice_id);
    if (!key) continue;
    const group = detailsByInvoice.get(key) || [];
    group.push(detail);
    detailsByInvoice.set(key, group);
  }
  let invoicesWithoutDetails = 0;
  let invoiceTotalsFailingAllHypotheses = 0;
  for (const invoice of salesInvoices) {
    const invoiceNo = sourceKey(invoice.invoice_no);
    const details = invoiceNo ? detailsByInvoice.get(invoiceNo) || [] : [];
    if (!details.length) { invoicesWithoutDetails += 1; continue; }
    const headerTotal = asNumber(invoice.total);
    if (headerTotal === null) continue;
    const values = details.map((row) => ({ price: asNumber(row.price), final: asNumber(row.final_price), qty: asNumber(row.quantity) }));
    if (values.some((row) => row.price === null || row.final === null || row.qty === null)) continue;
    const sums = [
      values.reduce((sum, row) => sum + (row.final as number), 0),
      values.reduce((sum, row) => sum + (row.final as number) * (row.qty as number), 0),
      values.reduce((sum, row) => sum + (row.price as number) * (row.qty as number), 0),
    ];
    if (sums.every((sum) => Math.abs(sum - headerTotal) > MONEY_TOLERANCE)) invoiceTotalsFailingAllHypotheses += 1;
  }

  const expectedCounts = batch.source_table_counts || {};
  const names = [...new Set([...Object.keys(expectedCounts), ...grouped.keys()])].sort();
  const countsBySourceTable = names.map((name) => {
    const count = grouped.get(name)?.length || 0;
    const expectedValue = Number(expectedCounts[name]);
    const expected = Number.isFinite(expectedValue) ? expectedValue : null;
    return { name, count, expected, delta: expected === null ? null : count - expected, role: role(name) };
  });
  const archivedCountMatchesExpected = countsBySourceTable.every((table) => table.expected === null || table.count === table.expected);

  const unsupportedRows = sourceRows.filter((row) => UNSUPPORTED_TABLES.has(row.source_table) || !["Customer", "Category", "Subcategory", "Product", "SalesInvoices", "SalesInvoiceDetails"].includes(row.source_table)).length;
  const issues: Issue[] = [];
  const add = (code: string, count: number, severity: Issue["severity"], detail: string) => { if (count > 0) issues.push({ code, count, severity, detail }); };
  add("ARCHIVE_COUNT_MISMATCH", countsBySourceTable.filter((table) => table.delta !== null && table.delta !== 0).length, "block", "عدد السجلات في الأرشيف لا يطابق عدد السجلات المتوقع في ملخص الدفعة. لا تستمر قبل استكمال الأرشيف.");
  add("EMPTY_CLIENT_NAME", clientRowsWithoutName, "block", "عملاء من غير اسم لا يمكن نقلهم إلى clients بأمان.");
  add("INVOICE_CUSTOMER_ORPHANS", invoiceCustomerOrphans, "block", "فواتير تشير إلى cust_id غير موجود في جدول Customer المؤرشف.");
  add("DETAIL_INVOICE_ORPHANS", invoiceDetailsWithoutHeader, "block", "تفاصيل بيع لا تجد رأس فاتورة مطابقًا برقم invoice_no.");
  add("DETAIL_PRODUCT_ORPHANS", invoiceDetailsWithoutProduct, "block", "تفاصيل بيع تشير إلى منتج غير موجود في Product.");
  add("INVALID_SALES_QUANTITY", invoiceDetailsInvalidQuantity, "block", "تفاصيل فواتير تحتوي على كمية غير صالحة أو غير موجبة.");
  add("PRODUCT_NAME_MISSING", productsWithoutName, "block", "منتجات بلا اسم؛ لا يمكن استيرادها بأمان.");
  add("NEGATIVE_PRODUCT_PRICE", productsWithNegativePrices, "block", "يوجد سعر شراء أو بيع سالب ويحتاج مراجعة.");
  add("PRODUCT_CATEGORY_ORPHANS", productCategoryOrphans, "review", "بعض المنتجات تشير إلى تصنيف رئيسي غير موجود في المصدر المؤرشف.");
  add("PRODUCT_SUBCATEGORY_ORPHANS", productSubcategoryOrphans, "review", "بعض المنتجات تشير إلى تصنيف فرعي غير موجود في المصدر المؤرشف.");
  add("STOCK_PRODUCT_ORPHANS", stockProductOrphans, "block", "أرصدة مخزون تشير إلى منتج مفقود من المصدر.");
  add("DUPLICATE_CUSTOMER_NAMES", duplicateCustomerNameGroups, "review", "أسماء العملاء المتكررة تحتاج مراجعة؛ لا دمج آليًا.");
  add("DUPLICATE_PRODUCT_NAMES", duplicateProductNameGroups, "review", "أسماء المنتجات المتكررة قد تمثل أحجام أو عبوات مختلفة؛ لا دمج آليًا.");
  add("MULTIPLE_STOCK_ROWS", multipleStockProductGroups, "block", "أكثر من صف مخزون لبعض المنتجات؛ لا تُجمع الأرصدة تلقائيًا.");
  add("POSSIBLE_EXISTING_CLIENT_MATCH", existingClientCandidates, "review", "عميل قد يطابق عميلًا حاليًا بالاسم والهاتف؛ يتطلب مراجعة يدوية.");
  add("POSSIBLE_EXISTING_PRODUCT_MATCH", existingProductNameCandidates, "review", "منتجات مصدر أسماؤها موجودة حاليًا؛ الاسم وحده لا يثبت التطابق.");
  add("POSSIBLE_EXISTING_CATEGORY_MATCH", existingCategoryNameCandidates, "review", "تصنيفات المصدر قد تتطابق مع تصنيفات حالية؛ لا تدمج تلقائيًا.");
  add("TARGET_INVOICE_NUMBER_COLLISION", invoiceNumberCollisions, "block", "أرقام فواتير المصدر تتعارض مع أرقام موجودة في العيادة، ويلزم تخصيص أرقام جديدة مع حفظ الرقم الأصلي.");
  add("INVOICE_TOTAL_RECONCILIATION", invoiceTotalsFailingAllHypotheses, "block", "إجمالي رأس الفاتورة لا يتطابق مع أي صيغة مرشحة (final_price أو final_price × quantity أو price × quantity). لا تغيّر المبالغ تلقائيًا.");
  add("INVOICES_WITHOUT_DETAILS", invoicesWithoutDetails, "review", "فواتير بلا تفاصيل قد تكون خدمة أو بيانات ناقصة؛ لا تنشئ أصنافًا تلقائيًا.");
  add("UNSUPPORTED_SOURCE_ROWS", unsupportedRows, "review", "سجلات لا تملك وجهة تشغيلية معتمدة في VETRA الحالية. تظل محفوظة بالأرشيف حتى تصميم وجهة مناسبة.");

  return {
    generatedAt: new Date().toISOString(),
    batchId: batch.id,
    sourceFile: batch.source_file_name,
    sourceSha256: batch.source_sha256,
    sourceRowCount: sourceRows.length,
    targetSnapshotCounts: { clients: target.clients.length, products: target.products.length, categories: target.categories.length, invoices: target.invoices.length },
    countsBySourceTable,
    issues: issues.sort((a, b) => (a.severity === "block" ? 0 : a.severity === "review" ? 1 : 2) - (b.severity === "block" ? 0 : b.severity === "review" ? 1 : 2) || b.count - a.count),
    checks: {
      archivedCountMatchesExpected,
      clientRowsWithoutName,
      invoiceCustomerOrphans,
      invoiceDetailsWithoutHeader,
      invoiceDetailsWithoutProduct,
      invoiceDetailsInvalidQuantity,
      productsWithoutName,
      productsWithNegativePrices,
      productCategoryOrphans,
      productSubcategoryOrphans,
      stockProductOrphans,
      duplicateCustomerNameGroups,
      duplicateProductNameGroups,
      multipleStockProductGroups,
      existingClientCandidates,
      existingProductNameCandidates,
      existingCategoryNameCandidates,
      invoiceNumberCollisions,
      invoicesWithoutDetails,
      invoiceTotalsFailingAllHypotheses,
      unsupportedRows,
    },
    importExecuted: false,
    businessTablesModified: false,
    warnings: [
      "هذه مراجعة read-only تعتمد على محتوى الأرشيف وصورة بيانات العيادة الحالية تحت صلاحيات العيادة.",
      "المطابقة حسب الاسم أو الهاتف مرشحة فقط؛ لا يتم إنشاء خرائط معتمدة أو دمج تلقائي.",
      "لا يتم اعتماد معنى total أو price أو final_price من دون إثبات قاعدة الحساب الأصلية.",
      "لا يتم تعديل كمية المنتجات ولا إنشاء حركات مخزون في هذه المرحلة.",
      "الموردون والمشتريات والحسابات والحركات المالية غير مدعومة في جداول VETRA التشغيلية الحالية، وتظل في الأرشيف.",
    ],
  };
}

export default function LegacyImportReviewPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [report, setReport] = useState<ReviewReport | null>(null);

  const loadBatches = useCallback(async () => {
    setBusy(true); setError(""); setMessage(""); setProgress("تحميل دفعات الأرشيف...");
    try {
      const [client, context] = await Promise.all([getClinicDb(), getClinicContext()]);
      setClinicName(context.clinic_name || "العيادة الحالية");
      const { data, error: readError } = await client.from("legacy_import_batches")
        .select("id,source_file_name,source_sha256,source_size_bytes,audit_version,status,source_table_counts,summary,created_at,completed_at")
        .order("created_at", { ascending: false }).limit(30);
      if (readError) throw new Error(`تعذر قراءة دفعات الأرشيف: ${readError.message}`);
      const list = (data || []) as Batch[];
      setBatches(list);
      if (list.length) setSelectedBatchId((current) => current || list[0].id);
      if (!list.length) setMessage("مفيش دفعات أرشيف ظاهرة للعيادة الحالية. نفّذ مرحلة الأرشفة أولًا من /settings/import/staging.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setBusy(false); setProgress(""); }
  }, []);

  useEffect(() => { void loadBatches(); }, [loadBatches]);

  const selectedBatch = useMemo(() => batches.find((batch) => batch.id === selectedBatchId) || null, [batches, selectedBatchId]);
  const blockCount = report?.issues.filter((issue) => issue.severity === "block").length || 0;
  const reviewCount = report?.issues.filter((issue) => issue.severity === "review").length || 0;

  async function runReview() {
    if (!selectedBatch) { setError("اختار دفعة أرشيف أولًا."); return; }
    setBusy(true); setError(""); setMessage(""); setReport(null);
    try {
      const client = await getClinicDb();
      const summary = selectedBatch.summary || {};
      const summaryArchiveVerified = summary.archiveVerified === true && summary.sourceRowsStored === true;
      setProgress("قراءة سجلات المصدر من أرشيف العيادة...");
      const sourceRows: SourceRow[] = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error: readError } = await client.from("legacy_import_source_rows")
          .select("id,source_table,source_key,source_row_number,row_fingerprint,payload")
          .eq("batch_id", selectedBatch.id)
          .order("source_table", { ascending: true })
          .order("source_row_number", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (readError) throw new Error(`تعذر قراءة الأرشيف: ${readError.message}. تأكد من تشغيل SQL المرحلتين 2 و3.`);
        const page = (data || []) as SourceRow[];
        sourceRows.push(...page);
        setProgress(`قراءة الأرشيف: ${sourceRows.length.toLocaleString("en-US")} سجل...`);
        if (page.length < PAGE_SIZE) break;
      }
      if (!sourceRows.length) throw new Error("الدفعة موجودة لكن مفيش سجلات مصدر داخل الأرشيف. شغّل مرحلة الأرشفة واختار نفس الملف لاستكمالها.");

      setProgress("قراءة بيانات العيادة الحالية للمقارنة...");
      const [clients, products, categories, invoices] = await Promise.all([
        fetchAll<{ id: string; name: string; phone: string | null; client_code: string }>(client, "clients", "id,name,phone,client_code"),
        fetchAll<{ id: string; name: string; barcode: string | null; unit: string | null; quantity: number; retail_price: number }>(client, "products", "id,name,barcode,unit,quantity,retail_price"),
        fetchAll<{ id: string; name: string }>(client, "product_categories", "id,name"),
        fetchAll<{ id: string; invoice_number: number; client_id: string }>(client, "invoices", "id,invoice_number,client_id"),
      ]);
      const result = buildReport(selectedBatch, sourceRows, { clients, products, categories, invoices });
      const warnings = [...result.warnings];
      if (!summaryArchiveVerified) warnings.unshift("ملخص الدفعة لا يثبت أن الأرشيف اكتمل حسب مرحلة 3؛ راجع صفحة الأرشفة وحالة الدفعة.");
      setReport({ ...result, warnings });
      setMessage(`اكتملت المراجعة للدفعة ${selectedBatch.id}. لم يتم تعديل أي جدول تشغيلي.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setBusy(false); setProgress(""); }
  }

  function downloadReport() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `VETRA-import-review-${report.batchId}.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/settings/import/staging" className="mb-5 inline-flex py-2 text-sm font-semibold text-slate-500 hover:text-slate-900">← أرشفة المصدر</Link>
        <header className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-2xl">🧪</div>
            <h1 className="text-2xl font-black sm:text-3xl">مراجعة الترحيل التجريبية — Phase 4</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">{clinicName || "العيادة الحالية"} · قراءة فقط. تقارن الأرشيف مع بيانات العيادة، وتكشف المراجع المفقودة وتعارضات الفواتير والمخزون. لا يوجد زر ترحيل في هذه المرحلة.</p>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">🔒 لا كتابة في الجداول التشغيلية</span>
        </header>

        <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-extrabold">1. اختار نسخة الأرشيف</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">الصفحة تقرأ بيانات العيادة من خلال اتصال VETRA المعتاد، وبالتالي تخضع لعزل العيادة الحالي. لو مفيش دفعات، نفّذ الأرشفة الأول.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <select value={selectedBatchId} onChange={(event) => { setSelectedBatchId(event.target.value); setReport(null); }} disabled={busy || batches.length === 0} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
              <option value="">اختار دفعة أرشيف</option>
              {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.source_file_name} · {new Date(batch.created_at).toLocaleString("en-GB")} · {batch.status}</option>)}
            </select>
            <button type="button" onClick={() => void loadBatches()} disabled={busy} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50">تحديث الدفعات</button>
            <button type="button" onClick={() => void runReview()} disabled={busy || !selectedBatch} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? "جاري الفحص..." : "تشغيل Dry Run"}</button>
          </div>
          {selectedBatch && <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3"><b>Batch ID:</b> <span dir="ltr" className="break-all">{selectedBatch.id}</span></div>
            <div className="rounded-xl bg-slate-50 p-3"><b>SHA-256:</b> <span dir="ltr" className="break-all">{selectedBatch.source_sha256}</span></div>
          </div>}
          {progress && <p role="status" className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-900">{progress}</p>}
          {error && <p role="alert" className="mt-4 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{error}</p>}
          {message && !error && <p role="status" className="mt-4 break-words rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">{message}</p>}
        </section>

        {report && <>
          <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Metric label="سجلات الأرشيف" value={report.sourceRowCount.toLocaleString("en-US")} />
            <Metric label="عملاء حاليون" value={report.targetSnapshotCounts.clients.toLocaleString("en-US")} />
            <Metric label="منتجات حالية" value={report.targetSnapshotCounts.products.toLocaleString("en-US")} />
            <Metric label="فواتير حالية" value={report.targetSnapshotCounts.invoices.toLocaleString("en-US")} />
            <Metric label="مشاكل مانعة" value={blockCount.toLocaleString("en-US")} danger={blockCount > 0} />
          </section>

          <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-extrabold">2. تقرير المشاكل</h2><p className="mt-1 text-sm text-slate-500">{blockCount} فئة مانعة · {reviewCount} فئة تحتاج مراجعة</p></div>
              <button type="button" onClick={downloadReport} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700">تنزيل تقرير JSON</button>
            </div>
            {report.issues.length === 0 ? <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">لم تُكتشف مشاكل ضمن القواعد الموجودة. هذا ليس تصريحًا بالتنفيذ؛ يلزم اعتماد مطابقة الحقول ومراجعة المعادلات.</p> : <div className="mt-4 space-y-3">{report.issues.map((issue) => <div key={issue.code} className={`rounded-2xl border p-4 ${issue.severity === "block" ? "border-red-200 bg-red-50" : issue.severity === "review" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}><div className="flex flex-wrap items-center justify-between gap-2"><span dir="ltr" className="font-bold">{issue.code}</span><span className={`rounded-full px-3 py-1 text-xs font-extrabold ${issue.severity === "block" ? "bg-red-100 text-red-800" : issue.severity === "review" ? "bg-amber-100 text-amber-900" : "bg-white text-slate-600"}`}>{issue.severity === "block" ? "مانع" : issue.severity === "review" ? "مراجعة" : "معلومة"} · {issue.count.toLocaleString("en-US")}</span></div><p className="mt-2 text-sm leading-6">{issue.detail}</p></div>)}</div>}
          </section>

          <section className="mb-6 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
            <div className="p-5 sm:p-6"><h2 className="text-lg font-extrabold">3. تطابق أعداد الجداول المؤرشفة</h2><p className="mt-1 text-sm text-slate-500">هذه مقارنة مع ملخص الدفعة، وليست مقارنة مع كل metadata المعلن داخل ملف Access.</p></div>
            <div className="overflow-x-auto"><table className="min-w-full border-collapse text-sm"><thead className="bg-slate-50"><tr><th className="px-4 py-3 text-right">جدول المصدر</th><th className="px-4 py-3 text-right">السجلات في الأرشيف</th><th className="px-4 py-3 text-right">المتوقع في الملخص</th><th className="px-4 py-3 text-right">الوصف</th><th className="px-4 py-3 text-right">الحالة</th></tr></thead><tbody>{report.countsBySourceTable.map((table) => <tr key={table.name} className="border-t border-slate-100"><td dir="ltr" className="px-4 py-3 font-bold">{table.name}</td><td className="px-4 py-3 tabular-nums">{table.count.toLocaleString("en-US")}</td><td className="px-4 py-3 tabular-nums">{table.expected === null ? "—" : table.expected.toLocaleString("en-US")}</td><td className="px-4 py-3 text-slate-500">{table.role}</td><td className="px-4 py-3">{table.delta === null ? <span className="text-slate-500">لا يوجد رقم متوقع</span> : table.delta === 0 ? <span className="font-bold text-emerald-700">متطابق</span> : <span className="font-bold text-red-700">فرق {table.delta}</span>}</td></tr>)}</tbody></table></div>
          </section>

          <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 sm:p-6">
            <h2 className="text-lg font-extrabold">4. قواعد الأمان في هذه المرحلة</h2>
            <div className="mt-4 space-y-2">{report.warnings.map((warning, index) => <p key={index} className="rounded-xl bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">• {warning}</p>)}</div>
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold leading-6 text-red-900">الحالة: Dry Run فقط. importExecuted = false وbusinessTablesModified = false. لا يوجد في هذه الصفحة أي INSERT أو UPDATE أو DELETE.</div>
          </section>
        </>}
      </div>
    </main>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className={`rounded-2xl border bg-white p-4 shadow-sm ${danger ? "border-red-200" : "border-slate-100"}`}><p className="text-xs font-semibold text-slate-400">{label}</p><p className={`mt-1 text-2xl font-black tabular-nums ${danger ? "text-red-700" : "text-slate-900"}`}>{value}</p></div>;
}
