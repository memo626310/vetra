"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const selectedBatchIdRef = useRef("");
  useEffect(() => { selectedBatchIdRef.current = selectedBatchId; }, [selectedBatchId]);
  const [clinicName, setClinicName] = useState("");
  const [canImport, setCanImport] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [sourceRows, setSourceRows] = useState<SourceRow[]>([]);
  const [targetInvoiceNumbers, setTargetInvoiceNumbers] = useState<number[]>([]);
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);
  // VETRA_REAL_IMPORT_PROGRESS_UI_V1 — percentage reflects committed import work units.
  const [importPercent, setImportPercent] = useState(0);
  const [importProgressLabel, setImportProgressLabel] = useState("");
  const [openTables, setOpenTables] = useState<Record<string, boolean>>({
    Customer: true,
    Product: true,
    SalesInvoices: true,
    SalesInvoiceDetails: false,
    Temp_stock: false,
    unsupported: false,
    technical: false,
  });

  const loadBatches = useCallback(async () => {
    setBusy(true); setError(""); setProgress("تحميل ملف المراجعة...");
    try {
      const [client, context] = await Promise.all([getClinicDb(), getClinicContext()]);
      setClinicName(context.clinic_name || "العيادة الحالية");
      setCanImport(["owner", "admin"].includes(String(context.role || "").toLowerCase()));
      const { data, error: readError } = await client.from("legacy_import_batches")
        .select("id,source_file_name,source_sha256,source_size_bytes,audit_version,status,source_table_counts,summary,created_at,completed_at")
        .order("created_at", { ascending: false }).limit(30);
      if (readError) throw new Error(`تعذر تحميل ملفات الاستيراد: ${readError.message}`);
      const list = (data || []) as Batch[];
      setBatches(list);
      const requestedId = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("batch") || ""
        : "";
      const requestedExists = requestedId && list.some((item) => item.id === requestedId);
      const currentId = selectedBatchIdRef.current;
      const nextId = requestedExists ? requestedId : (currentId && list.some((item) => item.id === currentId) ? currentId : list[0]?.id || "");
      setSelectedBatchId(nextId);
      if (!list.length) setMessage("لسه مفيش نسخة محفوظة ظاهرة للعيادة. ارجع لصفحة الاستيراد واختار قاعدة البيانات القديمة.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setBusy(false); setProgress(""); }
  }, []);

  useEffect(() => { void loadBatches(); }, [loadBatches]);

  const selectedBatch = useMemo(() => batches.find((batch) => batch.id === selectedBatchId) || null, [batches, selectedBatchId]);
  const groupedRows = useMemo(() => {
    const grouped = new Map<string, SourceRow[]>();
    for (const row of sourceRows) {
      const list = grouped.get(row.source_table) || [];
      list.push(row);
      grouped.set(row.source_table, list);
    }
    return grouped;
  }, [sourceRows]);
  const rowsOf = useCallback((name: string) => (groupedRows.get(name) || []).map((row) => row.payload || {}), [groupedRows]);

  const clients = rowsOf("Customer");
  const products = rowsOf("Product");
  const salesInvoices = rowsOf("SalesInvoices");
  const salesDetails = rowsOf("SalesInvoiceDetails");
  const stockRows = rowsOf("Temp_stock");
  const invoicesWithProblems = useMemo(() => {
    // Link each legacy invoice to the archived Customer row through its source customer ID.
    // This is display-only; it does not create or alter any migration mapping.
    const customerNamesById = new Map<string, string>();
    for (const customer of clients) {
      const customerId = sourceKey(customer.id ?? customer.customerId ?? customer.customer_id);
      const customerName = String(customer.name ?? customer.customerName ?? customer.customer_name ?? "").trim();
      if (customerId && customerName && !customerNamesById.has(customerId)) {
        customerNamesById.set(customerId, customerName);
      }
    }
    const detailsByInvoice = new Map<string, Record<string, unknown>[]>();
    for (const detail of salesDetails) {
      const key = sourceKey(detail.invoice_id);
      if (!key) continue;
      const list = detailsByInvoice.get(key) || [];
      list.push(detail);
      detailsByInvoice.set(key, list);
    }
    return salesInvoices.map((invoice) => {
      const number = sourceKey(invoice.invoice_no);
      const details = number ? detailsByInvoice.get(number) || [] : [];
      const total = asNumber(invoice.total);
      const lines = details.map((line) => ({ price: asNumber(line.price), final: asNumber(line.final_price), qty: asNumber(line.quantity) }));
      const invalid = lines.some((line) => line.price === null || line.final === null || line.qty === null || (line.qty ?? 0) <= 0);
      const sums = [
        lines.reduce((sum, line) => sum + (line.final ?? 0), 0),
        lines.reduce((sum, line) => sum + (line.final ?? 0) * (line.qty ?? 0), 0),
        lines.reduce((sum, line) => sum + (line.price ?? 0) * (line.qty ?? 0), 0),
      ];
      const reconciles = total !== null && !invalid && sums.some((sum) => Math.abs(sum - total) <= MONEY_TOLERANCE);
      const collision = number !== null && targetInvoiceNumbers.includes(Number(number));
      const customerId = sourceKey(invoice.cust_id ?? invoice.customerId ?? invoice.customer_id ?? invoice.customer_id_fk);
      const invoiceCustomerName = String(invoice.customer_name ?? invoice.customerName ?? invoice.cust_name ?? "").trim();
      const customerName = (customerId ? customerNamesById.get(customerId) : null) || invoiceCustomerName ||
        (customerId ? "العميل غير موجود في جدول العملاء" : "الفاتورة غير مرتبطة بعميل في المصدر");
      return { invoice, number: number || "—", customerName, total, detailsCount: details.length, calculated: sums[2], reconciles, collision };
    });
  }, [salesInvoices, salesDetails, targetInvoiceNumbers, clients]);
  const mismatchedInvoices = useMemo(() => invoicesWithProblems.filter((item) => !item.reconciles), [invoicesWithProblems]);
  const collisionInvoices = useMemo(() => invoicesWithProblems.filter((item) => item.collision), [invoicesWithProblems]);
  const blockCount = report?.issues.filter((issue) => issue.severity === "block").length || 0;

  async function runReview() {
    if (!selectedBatch) { setError("اختار نسخة البيانات الأول."); return; }
    setBusy(true); setError(""); setMessage(""); setProgress("تحميل البيانات القديمة ومقارنتها ببيانات العيادة..."); setReport(null); setImportResult(null);
    try {
      const client = await getClinicDb();
      const summary = selectedBatch.summary || {};
      const summaryArchiveVerified = summary.archiveVerified === true || summary.archiveVerified === "true";
      const sourceRows: SourceRow[] = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error: readError } = await client.from("legacy_import_source_rows")
          .select("id,source_table,source_key,source_row_number,row_fingerprint,payload")
          .eq("batch_id", selectedBatch.id)
          .order("source_table", { ascending: true })
          .order("source_row_number", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (readError) throw new Error(`تعذر قراءة النسخة المحفوظة: ${readError.message}`);
        const page = (data || []) as SourceRow[];
        sourceRows.push(...page);
        setProgress(`قراءة السجلات ${sourceRows.length.toLocaleString("en-US")}...`);
        if (page.length < PAGE_SIZE) break;
      }
      if (!sourceRows.length) throw new Error("الملف موجود لكن النسخة المحفوظة فارغة. ارجع لصفحة الاستيراد وأعد حفظ الملف.");
      const [targetClients, targetProducts, categories, invoices] = await Promise.all([
        fetchAll<{ id: string; name: string; phone: string | null; client_code: string }>(client, "clients", "id,name,phone,client_code"),
        fetchAll<{ id: string; name: string; barcode: string | null; unit: string | null; quantity: number; retail_price: number }>(client, "products", "id,name,barcode,unit,quantity,retail_price"),
        fetchAll<{ id: string; name: string }>(client, "product_categories", "id,name"),
        fetchAll<{ id: string; invoice_number: number; client_id: string }>(client, "invoices", "id,invoice_number,client_id"),
      ]);
      const built = buildReport(selectedBatch, sourceRows, { clients: targetClients, products: targetProducts, categories, invoices });
      const warnings = [...built.warnings];
      if (!summaryArchiveVerified) warnings.unshift("الأرشيف محفوظ لكن ملخص الدفعة لا يؤكد اكتماله؛ راجع صفحة الاستيراد قبل المتابعة.");
      setReport({ ...built, warnings });
      setSourceRows(sourceRows);
      setTargetInvoiceNumbers(invoices.map((invoice) => Number(invoice.invoice_number)));
      setMessage("اكتملت مراجعة البيانات. لم يتم تغيير أي بيانات تشغيلية.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setBusy(false); setProgress(""); }
  }

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
      const [client, clinicContext] = await Promise.all([
        getClinicDb(),
        getClinicContext(),
      ]);
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
          console.error("VETRA LEGACY IMPORT RPC ERROR", {
            phase,
            afterRow,
            limit,
            clinicId: clinicContext.clinic_id,
            projectRef: clinicContext.project_ref,
            code: stepError.code,
            details: stepError.details,
            hint: stepError.hint,
            message: stepError.message,
          });
          if (/vetra_import_legacy_batch_progress|function.*does not exist|Could not find the function/i.test(stepError.message)) {
            throw new Error("محرك الاستيراد المرحلي غير مثبت. شغّل ملف VETRA_IMPORT_PROGRESS_ENGINE.sql مرة واحدة في Shared Clinic Database، ثم أعد المحاولة.");
          }
          throw new Error(
            `فشلت خطوة ${phase} في مشروع العيادة ${clinicContext.project_ref || "غير معروف"} [${stepError.code || "بدون رمز"}]: ${stepError.message}${stepError.details ? ` — ${stepError.details}` : ""}${stepError.hint ? ` — ${stepError.hint}` : ""}`
          );
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
  function toggleTable(name: string) {
    setOpenTables((current) => ({ ...current, [name]: !current[name] }));
  }

  function cancelReview() {
    // Cancel returns to the import page; source archive and mapping are intentionally preserved.
    router.push("/settings/import");
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

  const sourceTableCounts = report?.countsBySourceTable || [];
  const labels: Record<string, string> = {
    Customer: "أصحاب الحيوانات / العملاء",
    Category: "التصنيفات الرئيسية",
    Subcategory: "التصنيفات الفرعية",
    Product: "الأصناف والمنتجات",
    SalesInvoices: "فواتير البيع",
    SalesInvoiceDetails: "تفاصيل فواتير البيع",
    Temp_stock: "أرصدة المخزون الحالية",
    productOperations: "حركات المخزون التاريخية",
    BuyInvoices: "فواتير الشراء",
    BuyInvoiceDetails: "تفاصيل المشتريات",
    Supplier: "الموردون",
    SupplierAccount: "حسابات الموردين",
    CustomerAccount: "حسابات العملاء",
    money_data: "الحركات المالية",
    masrofat: "المصروفات",
  };
  const issueTitle: Record<string, string> = {
    ARCHIVE_COUNT_MISMATCH: "عدد السجلات المحفوظة لا يطابق المصدر",
    EMPTY_CLIENT_NAME: "عميل بلا اسم",
    INVOICE_CUSTOMER_ORPHANS: "فاتورة مرتبطة بعميل غير موجود في النسخة القديمة",
    DETAIL_INVOICE_ORPHANS: "تفاصيل لا ترتبط بفاتورة معروفة",
    DETAIL_PRODUCT_ORPHANS: "تفاصيل مرتبطة بصنف غير موجود",
    INVALID_SALES_QUANTITY: "كمية بيع غير صالحة",
    PRODUCT_NAME_MISSING: "صنف بلا اسم",
    NEGATIVE_PRODUCT_PRICE: "سعر شراء أو بيع سالب",
    PRODUCT_CATEGORY_ORPHANS: "تصنيف صنف غير موجود",
    PRODUCT_SUBCATEGORY_ORPHANS: "تصنيف فرعي غير موجود",
    STOCK_PRODUCT_ORPHANS: "رصيد مخزون بلا صنف معروف",
    DUPLICATE_CUSTOMER_NAMES: "أسماء عملاء متكررة (لا تعني بالضرورة نفس الشخص)",
    DUPLICATE_PRODUCT_NAMES: "أسماء أصناف متكررة (قد تكون عبوات مختلفة)",
    MULTIPLE_STOCK_ROWS: "أكثر من رصيد للصنف نفسه",
    POSSIBLE_EXISTING_CLIENT_MATCH: "عميل قد يكون موجودًا بالفعل في VETRA",
    POSSIBLE_EXISTING_PRODUCT_MATCH: "صنف قد يكون موجودًا بالفعل في VETRA",
    POSSIBLE_EXISTING_CATEGORY_MATCH: "تصنيف قد يكون موجودًا بالفعل في VETRA",
    TARGET_INVOICE_NUMBER_COLLISION: "رقم فاتورة مستخدم بالفعل في VETRA",
    INVOICE_TOTAL_RECONCILIATION: "إجمالي فاتورة لا يتطابق مع تفاصيلها",
    INVOICES_WITHOUT_DETAILS: "فاتورة بلا تفاصيل",
    UNSUPPORTED_SOURCE_ROWS: "بيانات محفوظة بالأرشيف لعدم وجود وجهة مناسبة حاليًا",
  };

  const issueDescription: Record<string, string> = {
    INVOICE_TOTAL_RECONCILIATION: "لن نغيّر سعرًا أو إجماليًا تلقائيًا. ستظل هذه الفواتير وتفاصيلها محفوظة حتى نتأكد من طريقة الحساب الأصلية.",
    TARGET_INVOICE_NUMBER_COLLISION: "يمكن نقل الفاتورة برقم جديد فريد مع الاحتفاظ برقمها القديم في الملاحظات وسجل الربط.",
    MULTIPLE_STOCK_ROWS: "سنحافظ على الكميات كما هي في الأرشيف حتى نحدد الرصيد الصحيح، ولن نجمعها تلقائيًا.",
    DUPLICATE_CUSTOMER_NAMES: "سيتم الاحتفاظ بكل سجل مستقل. لا دمج اعتمادًا على الاسم فقط.",
    DUPLICATE_PRODUCT_NAMES: "سيظل كل صنف مستقلًا. تشابه الاسم لا يكفي لاعتبار العبوة أو المنتج واحدًا.",
    UNSUPPORTED_SOURCE_ROWS: "لن تُحذف هذه البيانات. ستظل في نسخة الأرشيف حتى نضيف لها وجهة مناسبة في VETRA.",
    POSSIBLE_EXISTING_CLIENT_MATCH: "سنتجنب دمج هذا السجل تلقائيًا لحماية ملف العميل الحالي.",
  };

  function moneyLabel(value: unknown) {
    const n = asNumber(value);
    return n === null ? "—" : `${n.toLocaleString("en-EG", { maximumFractionDigits: 2 })} ج.م`;
  }
  function dateLabel(value: unknown) {
    if (!value) return "—";
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("ar-EG");
  }
  function smallTableButton(name: string, title: string, count: number) {
    return <button type="button" onClick={() => toggleTable(name)} className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-right hover:bg-slate-50">
      <span className="font-bold text-slate-800">{title}</span>
      <span className="flex items-center gap-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold tabular-nums">{count.toLocaleString("en-US")}</span><span className="text-slate-400">{openTables[name] ? "−" : "+"}</span></span>
    </button>;
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-6 pb-28 text-slate-900 sm:px-6 sm:py-8 sm:pb-32">
      <div className="mx-auto max-w-7xl">
        <button type="button" onClick={cancelReview} className="mb-5 inline-flex py-2 text-sm font-semibold text-slate-500 hover:text-slate-900">← إلغاء والعودة لصفحة الاستيراد</button>
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-2xl">📋</div>
            <h1 className="text-2xl font-black sm:text-3xl">مراجعة بيانات الاستيراد</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">راجع بيانات النظام القديم قبل نقلها إلى {clinicName || "عيادتك"}. هننقل السجلات المتوافقة فقط، ونحتفظ بأي بيانات غير مؤكدة أو غير مدعومة في الأرشيف.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <div className="font-bold">{selectedBatch?.source_file_name || "ملف المصدر"}</div>
            <div className="mt-1 text-xs text-slate-500">الحالة: {selectedBatch?.status === "committed" ? "تم الاستيراد" : "بانتظار المراجعة"}</div>
          </div>
        </header>

        <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <select value={selectedBatchId} onChange={(event) => { setSelectedBatchId(event.target.value); setReport(null); setSourceRows([]); setImportResult(null); setImportPercent(0); setImportProgressLabel(""); }} disabled={busy || importing || batches.length === 0} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
              <option value="">اختار قاعدة بيانات محفوظة</option>
              {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.source_file_name} · {new Date(batch.created_at).toLocaleDateString("ar-EG")}</option>)}
            </select>
            <button type="button" onClick={() => void loadBatches()} disabled={busy || importing} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50">تحديث</button>
            <button type="button" onClick={() => void runReview()} disabled={busy || importing || !selectedBatch} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? "جاري الفحص..." : "فحص ومراجعة البيانات"}</button>
          </div>
          {progress && <p role="status" className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-900">{progress}</p>}
          {(importing || importPercent > 0) && <section className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4" aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-sm"><span className="font-bold text-violet-950">{importProgressLabel || "جاري تجهيز الاستيراد..."}</span><strong className="shrink-0 text-lg tabular-nums text-violet-950">{importPercent}%</strong></div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-violet-100" role="progressbar" aria-label="نسبة تقدم الاستيراد" aria-valuemin={0} aria-valuemax={100} aria-valuenow={importPercent}>
              <div className="h-full rounded-full bg-violet-600 transition-[width] duration-300" style={{ width: `${importPercent}%` }} />
            </div>
            <p className="mt-2 text-xs leading-5 text-violet-900">النسبة محسوبة من سجلات التصنيفات والعملاء والمنتجات والفواتير التي تم حفظ خطواتها بنجاح. كل دفعة مكتملة محفوظة، ويمكن استكمال العملية إذا حدث انقطاع.</p>
          </section>}
          {error && <p role="alert" className="mt-4 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{error}</p>}
          {message && !error && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">{message}</p>}
          {canImport === false && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">المراجعة متاحة، لكن تنفيذ الاستيراد الفعلي متاح لمالك العيادة أو المسؤول فقط.</p>}
        </section>

        {report && <>
          <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="إجمالي السجلات المحفوظة" value={report.sourceRowCount.toLocaleString("en-US")} />
            <Metric label="جداول المصدر" value={sourceTableCounts.length.toLocaleString("en-US")} />
            <Metric label="فواتير تحتاج مراجعة للإجمالي" value={report.checks.invoiceTotalsFailingAllHypotheses.toLocaleString("en-US")} danger={report.checks.invoiceTotalsFailingAllHypotheses > 0} />
            <Metric label="أرقام فواتير مستخدمة بالفعل" value={report.checks.invoiceNumberCollisions.toLocaleString("en-US")} danger={report.checks.invoiceNumberCollisions > 0} />
          </section>

          <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-extrabold">ملخص بسيط قبل الاستيراد</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">الاختلاف في بعض السجلات لا يعني أن قاعدة البيانات كلها غير صالحة. الأشياء السليمة يمكن نقلها، والحالات غير الواضحة تفضل محفوظة بدل ما نخمن فيها.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="font-extrabold text-emerald-900">بيانات يمكن تجهيزها للنقل</div><div className="mt-1 text-sm leading-6 text-emerald-900">العملاء ذوو البيانات المكتملة، التصنيفات، وبيانات الأصناف التي يمكن قراءتها بأمان. كميات المخزون لن تتغير قبل مطابقتها.</div></div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="font-extrabold text-amber-950">تحتاج مراجعة</div><div className="mt-1 text-sm leading-6 text-amber-950">فواتير إجمالياتها غير متطابقة، العملاء المحتمل تكرارهم، وبعض أرصدة المخزون. ستظل هذه السجلات في الأرشيف.</div></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="font-extrabold text-slate-900">ستظل محفوظة في الأرشيف</div><div className="mt-1 text-sm leading-6 text-slate-700">المشتريات والموردون والحسابات والحركات المالية التي ليس لها وجهة تشغيلية معتمدة حاليًا في VETRA.</div></div>
            </div>
          </section>

          <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-3"><h2 className="text-lg font-extrabold">العملاء والأصناف والفواتير — راجع البيانات نفسها</h2><p className="mt-1 text-sm leading-6 text-slate-500">افتح أي قسم لعرض أمثلة من البيانات الأصلية، وليس مجرد عدد أو عنوان للمشكلة.</p></div>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">
              <div>
                {smallTableButton("Customer", "أصحاب الحيوانات / العملاء", clients.length)}
                {openTables.Customer && <div className="overflow-x-auto border-t border-slate-100"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="px-3 py-3 text-right">الاسم</th><th className="px-3 py-3 text-right">الهاتف</th><th className="px-3 py-3 text-right">البريد الإلكتروني</th><th className="px-3 py-3 text-right">العنوان</th></tr></thead><tbody>{clients.slice(0,100).map((row,index)=><tr key={index} className="border-t border-slate-100"><td className="px-3 py-2 font-semibold">{String(row.name || "بدون اسم")}</td><td dir="ltr" className="px-3 py-2 text-right">{String(row.phone || "—")}</td><td dir="ltr" className="px-3 py-2 text-right">{String(row.email || "—")}</td><td className="px-3 py-2">{String(row.address || "—")}</td></tr>)}</tbody></table>{clients.length>100&&<p className="p-3 text-xs text-slate-500">يعرض أول 100 سجل؛ النسخة الكاملة محفوظة في الأرشيف.</p>}</div>}
              </div>
              <div>
                {smallTableButton("Product", "الأصناف والمنتجات", products.length)}
                {openTables.Product && <div className="overflow-x-auto border-t border-slate-100"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="px-3 py-3 text-right">اسم الصنف</th><th className="px-3 py-3 text-right">سعر الشراء</th><th className="px-3 py-3 text-right">سعر البيع</th><th className="px-3 py-3 text-right">حد التنبيه</th><th className="px-3 py-3 text-right">ملاحظة</th></tr></thead><tbody>{products.slice(0,100).map((row,index)=><tr key={index} className="border-t border-slate-100"><td className="px-3 py-2 font-semibold">{String(row.name || "بدون اسم")}</td><td className="px-3 py-2">{moneyLabel(row.buyPrice)}</td><td className="px-3 py-2">{moneyLabel(row.sellPrice)}</td><td className="px-3 py-2">{asNumber(row.miniQuantity)?.toLocaleString("en-US") ?? "—"}</td><td className="px-3 py-2 text-xs text-slate-600">كمية المخزون ستظل للمطابقة قبل اعتماد الرصيد</td></tr>)}</tbody></table>{products.length>100&&<p className="p-3 text-xs text-slate-500">يعرض أول 100 صنف؛ باقي الأصناف محفوظة أيضًا.</p>}</div>}
              </div>
              <div>
                {smallTableButton("SalesInvoices", "فواتير البيع", salesInvoices.length)}
                {openTables.SalesInvoices && <div className="overflow-x-auto border-t border-slate-100"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="px-3 py-3 text-right">رقم الفاتورة القديمة</th><th className="px-3 py-3 text-right">اسم صاحب الفاتورة</th><th className="px-3 py-3 text-right">التاريخ</th><th className="px-3 py-3 text-right">الإجمالي المسجل</th><th className="px-3 py-3 text-right">قيمة التفاصيل (سعر × كمية)</th><th className="px-3 py-3 text-right">نتيجة المراجعة</th></tr></thead><tbody>{invoicesWithProblems.slice(0,100).map((item,index)=><tr key={index} className="border-t border-slate-100"><td className="px-3 py-2 font-semibold">{String(item.number)}</td><td className="px-3 py-2 font-semibold">{String(item.customerName)}</td><td className="px-3 py-2">{dateLabel(item.invoice.date)}</td><td className="px-3 py-2">{moneyLabel(item.total)}</td><td className="px-3 py-2">{moneyLabel(item.calculated)}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs font-bold ${!item.reconciles ? "bg-red-100 text-red-800" : item.collision ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{!item.reconciles ? "تحتاج مراجعة" : item.collision ? "الرقم مستخدم — سيُعاد ترقيمه" : "الإجمالي متطابق"}</span></td></tr>)}</tbody></table>{salesInvoices.length>100&&<p className="p-3 text-xs text-slate-500">يعرض أول 100 فاتورة فقط. كل الفواتير تم فحصها، والمشاكل محسوبة على كامل البيانات.</p>}</div>}
              </div>
              <div>
                {smallTableButton("SalesInvoiceDetails", "تفاصيل بنود الفواتير", salesDetails.length)}
                {openTables.SalesInvoiceDetails && <div className="overflow-x-auto border-t border-slate-100"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="px-3 py-3 text-right">رقم الفاتورة القديمة</th><th className="px-3 py-3 text-right">اسم الصنف كما كان بالفاتورة</th><th className="px-3 py-3 text-right">الكمية</th><th className="px-3 py-3 text-right">السعر</th><th className="px-3 py-3 text-right">السعر النهائي</th></tr></thead><tbody>{salesDetails.slice(0,100).map((row,index)=><tr key={index} className="border-t border-slate-100"><td className="px-3 py-2">{String(row.invoice_id ?? "—")}</td><td className="px-3 py-2 font-semibold">{String(row.prod_name || "—")}</td><td className="px-3 py-2">{String(row.quantity ?? "—")}</td><td className="px-3 py-2">{moneyLabel(row.price)}</td><td className="px-3 py-2">{moneyLabel(row.final_price)}</td></tr>)}</tbody></table>{salesDetails.length>100&&<p className="p-3 text-xs text-slate-500">يعرض أول 100 بند؛ كل البنود محفوظة في الأرشيف.</p>}</div>}
              </div>
              <div>
                {smallTableButton("Temp_stock", "أرصدة المخزون في النظام القديم", stockRows.length)}
                {openTables.Temp_stock && <div className="overflow-x-auto border-t border-slate-100"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="px-3 py-3 text-right">معرّف الصنف القديم</th><th className="px-3 py-3 text-right">الكمية</th><th className="px-3 py-3 text-right">آخر كمية مسجلة</th><th className="px-3 py-3 text-right">الإجراء</th></tr></thead><tbody>{stockRows.slice(0,100).map((row,index)=><tr key={index} className="border-t border-slate-100"><td className="px-3 py-2">{String(row.prod_id ?? "—")}</td><td className="px-3 py-2">{String(row.quantity ?? "—")}</td><td className="px-3 py-2">{String(row.lastQuantity ?? "—")}</td><td className="px-3 py-2 text-xs text-amber-800">لن تتغير كمية VETRA قبل مطابقة الرصيد</td></tr>)}</tbody></table>{stockRows.length>100&&<p className="p-3 text-xs text-slate-500">يعرض أول 100 رصيد فقط.</p>}</div>}
              </div>
            </div>
          </section>

          <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-extrabold">حالات تحتاج مراجعة أو قرار</h2><p className="mt-1 text-sm text-slate-500">كل حالة موضّحة بلغة عادية. زر الاستيراد لن يغيّر أي قيمة غير مؤكدة تلقائيًا.</p></div><button type="button" onClick={downloadReport} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">تنزيل التقرير الكامل</button></div>
            <div className="mt-4 space-y-3">
              {report.issues.length === 0 ? <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">لم تظهر مشاكل ضمن قواعد الفحص الحالية. هذا لا يلغي فحص البيانات بعد النقل.</p> : report.issues.map((issue) => <details key={issue.code} className={`rounded-2xl border ${issue.severity === "block" ? "border-red-200 bg-red-50" : issue.severity === "review" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                <summary className="cursor-pointer list-none p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-extrabold text-slate-900">{issueTitle[issue.code] || issue.code}</span><span className={`rounded-full px-3 py-1 text-xs font-extrabold ${issue.severity === "block" ? "bg-red-100 text-red-800" : issue.severity === "review" ? "bg-amber-100 text-amber-900" : "bg-white text-slate-600"}`}>{issue.count.toLocaleString("en-US")} حالة</span></div></summary>
                <div className="px-4 pb-4 text-sm leading-7 text-slate-700"><p>{issue.detail}</p>{issueDescription[issue.code] && <p className="mt-2 rounded-xl bg-white/70 p-3 font-semibold">{issueDescription[issue.code]}</p>}
                  {issue.code === "INVOICE_TOTAL_RECONCILIATION" && <div className="mt-3 overflow-x-auto rounded-xl border border-red-100 bg-white"><table className="min-w-full text-sm"><thead className="bg-red-50"><tr><th className="px-3 py-2 text-right">رقم الفاتورة</th><th className="px-3 py-2 text-right">إجمالي الرأس</th><th className="px-3 py-2 text-right">قيمة التفاصيل</th><th className="px-3 py-2 text-right">البنود</th></tr></thead><tbody>{mismatchedInvoices.slice(0,100).map((item,index)=><tr key={index} className="border-t border-red-50"><td className="px-3 py-2">{String(item.number)}</td><td className="px-3 py-2">{moneyLabel(item.total)}</td><td className="px-3 py-2">{moneyLabel(item.calculated)}</td><td className="px-3 py-2">{item.detailsCount}</td></tr>)}</tbody></table><p className="p-3 text-xs text-slate-500">يُعرض حتى 100 مثال. كل حالة غير متطابقة ستظل في الأرشيف.</p></div>}
                  {issue.code === "TARGET_INVOICE_NUMBER_COLLISION" && <div className="mt-3 flex flex-wrap gap-2">{collisionInvoices.slice(0,40).map((item,index)=><span key={index} className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs">فاتورة {String(item.number)} — {moneyLabel(item.total)}</span>)}</div>}
                </div>
              </details>)}
            </div>
          </section>

          <section className="mb-6 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
            <button type="button" onClick={() => toggleTable("unsupported")} className="flex w-full items-center justify-between p-5 text-right sm:p-6"><div><h2 className="text-lg font-extrabold">بيانات هتفضل محفوظة في الأرشيف حاليًا</h2><p className="mt-1 text-sm text-slate-500">لن نحذفها أو نحولها إلى نوع مختلف من البيانات لمجرد عدم وجود جدول مطابق.</p></div><span className="text-xl text-slate-400">{openTables.unsupported ? "−" : "+"}</span></button>
            {openTables.unsupported && <div className="overflow-x-auto border-t border-slate-100"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="px-4 py-3 text-right">نوع البيانات</th><th className="px-4 py-3 text-right">عدد السجلات</th><th className="px-4 py-3 text-right">الحالة</th></tr></thead><tbody>{sourceTableCounts.filter((table) => !["Customer","Category","Subcategory","Product","SalesInvoices","SalesInvoiceDetails"].includes(table.name)).map((table)=><tr key={table.name} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{labels[table.name] || table.name}</td><td className="px-4 py-3 tabular-nums">{table.count.toLocaleString("en-US")}</td><td className="px-4 py-3 text-slate-600">{table.role.includes("غير مدعومة") || table.role.includes("أرشيف فقط") ? "أرشيف فقط حتى تجهيز وجهة مناسبة" : table.role.includes("مخزون") ? "مؤجل حتى مطابقة المخزون" : "مراجعة الربط قبل النقل"}</td></tr>)}</tbody></table></div>}
          </section>

          <details className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <summary className="cursor-pointer font-bold text-slate-700">تفاصيل تقنية إضافية (للدعم الفني)</summary>
            <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3"><b>رقم الدفعة:</b><span dir="ltr" className="mr-2 break-all">{report.batchId}</span></div><div className="rounded-xl bg-slate-50 p-3"><b>SHA-256:</b><span dir="ltr" className="mr-2 break-all">{report.sourceSha256}</span></div><div className="rounded-xl bg-slate-50 p-3"><b>أعداد سجلات الأرشيف:</b> {report.checks.archivedCountMatchesExpected ? "متطابقة" : "تحتاج مراجعة"}</div><div className="rounded-xl bg-slate-50 p-3"><b>الجداول التشغيلية تغيّرت أثناء الفحص:</b> لا</div></div>
            <div className="mt-3 space-y-2">{report.warnings.map((warning,index)=><p key={index} className="rounded-xl bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">{warning}</p>)}</div>
          </details>
        </>}

        {importResult && <section className="mb-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6"><h2 className="text-lg font-extrabold text-emerald-950">نتيجة الاستيراد</h2><p className="mt-1 text-sm text-emerald-900">نُقلت البيانات الآمنة التالية. باقي السجلات ما زالت محفوظة للمراجعة ولم تُحذف.</p><div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="عملاء تم نقلهم" value={String(importResult.clientsImported ?? 0)} /><Metric label="تصنيفات تم نقلها" value={String(importResult.categoriesImported ?? 0)} /><Metric label="أصناف تم نقلها" value={String(importResult.productsImported ?? 0)} /><Metric label="فواتير تم نقلها" value={String(importResult.invoicesImported ?? 0)} /></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-white p-3 text-sm">فواتير محتاجة مراجعة: <b>{String(importResult.invoicesHeldForReview ?? 0)}</b></div><div className="rounded-xl bg-white p-3 text-sm">سجلات غير مدعومة ظلت بالأرشيف: <b>{String(importResult.unsupportedRowsPreserved ?? 0)}</b></div></div></section>}

        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-slate-500">زر الاستيراد ينقل البيانات الآمنة فقط. البيانات الملتبسة أو غير المدعومة تظل محفوظة في الأرشيف.</p>
            <div className="flex gap-3"><button type="button" onClick={cancelReview} disabled={importing} className="flex-1 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-extrabold text-slate-700 disabled:opacity-50 sm:flex-none">إلغاء</button><button type="button" onClick={() => void importReadyRows()} disabled={!report || busy || importing || !report.checks.archivedCountMatchesExpected || canImport !== true} className="flex-1 rounded-xl bg-violet-700 px-6 py-3 text-sm font-extrabold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300 sm:flex-none">{importing ? "جاري الاستيراد..." : "Import — استيراد البيانات الجاهزة"}</button></div>
          </div>
        </footer>
      </div>
    </main>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className={`rounded-2xl border bg-white p-4 shadow-sm ${danger ? "border-red-200" : "border-slate-100"}`}><p className="text-xs font-semibold text-slate-500">{label}</p><p className={`mt-1 text-2xl font-black tabular-nums ${danger ? "text-red-700" : "text-slate-900"}`}>{value}</p></div>;
}
