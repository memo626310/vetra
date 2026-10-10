"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { Buffer } from "buffer";
import { getClinicDb, getClinicContext } from "@/lib/clinic-db";

type MDBColumn = {
  name: string;
  type?: string;
  autoLong?: boolean;
  autoUUID?: boolean;
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
  getTableNames(options?: { normalTables?: boolean; systemTables?: boolean; linkedTables?: boolean }): string[];
  getTable(name: string): MDBTable;
};
type SourceTable = {
  name: string;
  declaredRows: number;
  actualRows: Record<string, unknown>[];
  columns: MDBColumn[];
  keyColumn: string | null;
  keyCounts: Map<string, number>;
  scanError: string | null;
};
type TargetSnapshot = {
  clients: { id: string; name: string; phone: string | null; client_code: string }[];
  products: { id: string; name: string; barcode: string | null; quantity: number; retail_price: number }[];
  categories: { id: string; name: string }[];
  invoices: { id: string; invoice_number: number }[];
};
type DryRunResult = {
  sourceFile: string;
  sourceSizeBytes: number;
  sourceSha256: string;
  generatedAt: string;
  observedTableCount: number;
  ignoredSystemTables: string[];
  tables: { name: string; declaredRows: number; actualRows: number; countMismatch: boolean; keyColumn: string | null; duplicateKeyCount: number; scanError: string | null; suggestedTarget: string | null; unsupported: boolean }[];
  rowRecords: {
    source_table: string;
    source_key: string;
    source_row_number: number;
    source_key_column: string | null;
    row_fingerprint: string;
    candidate_target_table: string | null;
    decision: "candidate" | "needs_review" | "unsupported";
    status: "profiled" | "needs_review";
    issue_codes: string[];
  }[];
  sourceValidation: { code: string; count: number; detail: string }[];
  destinationComparison: { clientsRead: number; productsRead: number; categoriesRead: number; invoicesRead: number; matchingClientCandidates: number; matchingProductNameCandidates: number; matchingCategoryCandidates: number; invoiceNumberCollisions: number };
  summary: { userTables: number; totalRows: number; recordsLogged: number; issueRows: number; unsupportedRows: number; incompleteTables: number };
};

const CHUNK_SIZE = 1000;
const WRITE_CHUNK_SIZE = 200;
const MAX_ROWS_PER_TABLE = 500_000;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const IGNORED_SYSTEM_TABLES = (name: string) => /^MSys/i.test(name) || /^sysdiagrams$/i.test(name);

const TARGET_BY_SOURCE: Record<string, string> = {
  Customer: "clients",
  Product: "products",
  Category: "product_categories",
  Subcategory: "product_categories",
  SalesInvoices: "invoices",
  SalesInvoiceDetails: "invoice_items",
  Temp_stock: "inventory_movements (requires reconciliation)",
};

const UNSUPPORTED_BUSINESS_TABLES = new Set([
  "Supplier", "SupplierAccount", "SupplierAccount1", "SupplierAccountTotal",
  "BuyInvoices", "BuyInvoiceDetails", "BuyInvoicesReturn", "BuyInvoiceDetailsReturn",
  "CustomerAccount", "CustomerAccountTotal", "money_data", "Money", "masrofat", "masrofatTypes",
  "aqsat", "aqsatDetails", "aqsatMonths", "CustomerAccountTotal",
]);

function normalize(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function valueKey(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? `date:${value.toISOString()}` : "invalid-date";
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (Buffer.isBuffer(value)) return `binary:${Buffer.from(value).toString("base64")}`;
  if (typeof value === "object") return `object:${JSON.stringify(toSerializable(value))}`;
  return `${typeof value}:${String(value).trim()}`;
}

function toSerializable(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : "[invalid-date]";
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `[binary:${value.length}:${Buffer.from(value).toString("base64")}]`;
  if (Array.isArray(value)) return value.map(toSerializable);
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      output[key] = toSerializable((value as Record<string, unknown>)[key]);
    }
    return output;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value;
}

async function sha256Text(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function addIssue(map: Map<string, string[]>, table: string, rowIndex: number, issue: string) {
  const key = `${table}#${rowIndex + 1}`;
  const existing = map.get(key) || [];
  if (!existing.includes(issue)) existing.push(issue);
  map.set(key, existing);
}

function idSet(rows: Record<string, unknown>[], key: string): Set<string> {
  const result = new Set<string>();
  for (const row of rows) {
    const value = valueKey(row[key]);
    if (value !== null) result.add(value);
  }
  return result;
}

function firstValue(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  return undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getSourceKey(table: SourceTable, row: Record<string, unknown>, rowIndex: number): { key: string; column: string | null } {
  if (table.keyColumn) {
    const value = valueKey(row[table.keyColumn]);
    if (value !== null && table.keyCounts.get(value) === 1) return { key: `${table.keyColumn}:${value}`, column: table.keyColumn };
  }
  // Row number is an explicit fallback, not a claim that the old record has a stable primary key.
  return { key: `row:${rowIndex + 1}`, column: null };
}

async function readAllRows(table: MDBTable): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  while (true) {
    if (offset >= MAX_ROWS_PER_TABLE) throw new Error(`تجاوز الجدول حد ${MAX_ROWS_PER_TABLE} سجل.`);
    const requested = Math.min(CHUNK_SIZE, MAX_ROWS_PER_TABLE - offset);
    const chunk = table.getData({ rowOffset: offset, rowLimit: requested });
    if (!chunk.length) break;
    all.push(...chunk);
    offset += chunk.length;
    // Always make another read, even after a short batch: Access metadata can under-report rowCount.
    if (chunk.length > requested) throw new Error("مكتبة القراءة أعادت عدد صفوف أكبر من المطلوب.");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return all;
}

function pickUniqueKey(rows: Record<string, unknown>[], columns: MDBColumn[]): { keyColumn: string | null; keyCounts: Map<string, number> } {
  const names = columns.map((c) => c.name);
  const preferred = [
    ...names.filter((name) => /^id$/i.test(name)),
    ...names.filter((name) => /^(invoice_no|invoice_number|document_no|recordid|recno)$/i.test(name)),
    ...names.filter((name) => /(?:^|[_\s-])id$/i.test(name)),
    ...columns.filter((c) => c.autoLong || c.autoUUID).map((c) => c.name),
    ...names.filter((name) => /(?:code|barcode|number|no)$/i.test(name)),
  ];
  const candidates = Array.from(new Set(preferred));
  for (const name of candidates) {
    if (!rows.length) continue;
    const counts = new Map<string, number>();
    let usable = true;
    for (const row of rows) {
      const key = valueKey(row[name]);
      if (key === null) { usable = false; break; }
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    if (usable && [...counts.values()].every((n) => n === 1)) return { keyColumn: name, keyCounts: counts };
  }
  const emptyCounts = new Map<string, number>();
  return { keyColumn: null, keyCounts: emptyCounts };
}

async function fetchAll<T>(client: Awaited<ReturnType<typeof getClinicDb>>, tableName: string, columns: string): Promise<T[]> {
  const result: T[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from(tableName).select(columns).range(offset, offset + pageSize - 1);
    if (error) throw new Error(`${tableName}: ${error.message}`);
    const page = (data || []) as T[];
    result.push(...page);
    if (page.length < pageSize) break;
  }
  return result;
}

export default function ImportDryRunPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [savedBatchId, setSavedBatchId] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [targetReadError, setTargetReadError] = useState("");

  async function runDryRun(file: File) {
    setLoading(true);
    setError("");
    setMessage("");
    setResult(null);
    setSavedBatchId("");
    setTargetReadError("");
    setClinicName("");

    if (!/\.(mdb|accdb)$/i.test(file.name)) {
      setError("اختار ملف Access بصيغة MDB أو ACCDB.");
      setLoading(false);
      return;
    }
    if (!file.size || file.size > MAX_FILE_BYTES) {
      setError("حجم الملف غير صالح أو أكبر من 100 ميجابايت.");
      setLoading(false);
      return;
    }

    try {
      setProgress("قراءة الملف وحساب بصمة SHA-256...");
      const bytes = await file.arrayBuffer();
      const fileDigest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      const sourceFileHash = Array.from(new Uint8Array(fileDigest)).map((b) => b.toString(16).padStart(2, "0")).join("");

      setProgress("فتح قاعدة Access...");
      const module = await import("mdb-reader");
      (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer = Buffer;
      const Reader = module.default as unknown as new (buffer: Buffer) => MDBReaderLike;
      const reader = new Reader(Buffer.from(bytes));
      const names = Array.from(new Set(reader.getTableNames({ normalTables: true, systemTables: false, linkedTables: false })));
      if (!names.length) throw new Error("لم يتم العثور على جداول قابلة للقراءة.");

      const tableMap = new Map<string, SourceTable>();
      const ignored: string[] = [];
      for (let index = 0; index < names.length; index += 1) {
        const name = names[index];
        setProgress(`قراءة الجدول ${index + 1}/${names.length}: ${name}`);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (IGNORED_SYSTEM_TABLES(name)) { ignored.push(name); continue; }
        try {
          const table = reader.getTable(name);
          const columns = table.getColumns?.() || table.getColumnNames().map((columnName) => ({ name: columnName }));
          const actualRows = await readAllRows(table);
          const { keyColumn, keyCounts } = pickUniqueKey(actualRows, columns);
          tableMap.set(name, {
            name,
            declaredRows: Number(table.rowCount || 0),
            actualRows,
            columns,
            keyColumn,
            keyCounts,
            scanError: null,
          });
        } catch (caught) {
          tableMap.set(name, {
            name,
            declaredRows: 0,
            actualRows: [],
            columns: [],
            keyColumn: null,
            keyCounts: new Map(),
            scanError: caught instanceof Error ? caught.message : String(caught),
          });
        }
      }

      const issuesByRow = new Map<string, string[]>();
      const warnings: { code: string; count: number; detail: string }[] = [];
      const getRows = (name: string) => tableMap.get(name)?.actualRows || [];
      const customerIds = idSet(getRows("Customer"), "id");
      const productIds = idSet(getRows("Product"), "id");
      const categoryIds = idSet(getRows("Category"), "id");
      const subcategoryIds = idSet(getRows("Subcategory"), "id");
      const invoiceNumbers = idSet(getRows("SalesInvoices"), "invoice_no");
      const purchaseInvoiceNumbers = idSet(getRows("BuyInvoices"), "invoice_no");
      const supplierIds = idSet(getRows("Supplier"), "id");

      let emptyCustomerNames = 0;
      for (const [index, row] of getRows("Customer").entries()) {
        if (!normalize(row.name)) { emptyCustomerNames += 1; addIssue(issuesByRow, "Customer", index, "EMPTY_REQUIRED_NAME"); }
      }
      if (emptyCustomerNames) warnings.push({ code: "EMPTY_CUSTOMER_NAME", count: emptyCustomerNames, detail: "عملاء بلا اسم؛ لا يمكن ترحيلهم كعملاء صالحين قبل حل المشكلة." });

      let orphanInvoiceCustomers = 0;
      for (const [index, row] of getRows("SalesInvoices").entries()) {
        const ref = valueKey(row.cust_id);
        if (ref === null || !customerIds.has(ref)) { orphanInvoiceCustomers += 1; addIssue(issuesByRow, "SalesInvoices", index, "ORPHAN_CUSTOMER_REFERENCE"); }
        if (!(row.date instanceof Date) || !Number.isFinite(row.date.getTime())) addIssue(issuesByRow, "SalesInvoices", index, "INVALID_INVOICE_DATE");
        if (isFiniteNumber(row.total) && row.total < 0) addIssue(issuesByRow, "SalesInvoices", index, "NEGATIVE_INVOICE_TOTAL");
      }
      if (orphanInvoiceCustomers) warnings.push({ code: "INVOICE_CUSTOMER_ORPHANS", count: orphanInvoiceCustomers, detail: "فواتير تشير إلى cust_id غير موجود في Customer؛ لن تُرحّل حتى يتحدد العميل الصحيح." });

      let orphanDetailInvoices = 0;
      let orphanDetailProducts = 0;
      let invalidDetailQuantities = 0;
      for (const [index, row] of getRows("SalesInvoiceDetails").entries()) {
        const invoiceRef = valueKey(row.invoice_id);
        const productRef = valueKey(row.prod_id);
        if (invoiceRef === null || !invoiceNumbers.has(invoiceRef)) { orphanDetailInvoices += 1; addIssue(issuesByRow, "SalesInvoiceDetails", index, "ORPHAN_INVOICE_REFERENCE"); }
        if (productRef === null || !productIds.has(productRef)) { orphanDetailProducts += 1; addIssue(issuesByRow, "SalesInvoiceDetails", index, "ORPHAN_PRODUCT_REFERENCE"); }
        if (!isFiniteNumber(row.quantity) || row.quantity <= 0) { invalidDetailQuantities += 1; addIssue(issuesByRow, "SalesInvoiceDetails", index, "INVALID_QUANTITY"); }
        for (const priceKey of ["price", "final_price", "discount"]) {
          if (isFiniteNumber(row[priceKey]) && row[priceKey] < 0) addIssue(issuesByRow, "SalesInvoiceDetails", index, `NEGATIVE_${priceKey.toUpperCase()}`);
        }
      }
      if (orphanDetailInvoices) warnings.push({ code: "DETAIL_INVOICE_ORPHANS", count: orphanDetailInvoices, detail: "تفاصيل فواتير لا تجد SalesInvoices.invoice_no مطابقًا." });
      if (orphanDetailProducts) warnings.push({ code: "DETAIL_PRODUCT_ORPHANS", count: orphanDetailProducts, detail: "تفاصيل بيع تشير إلى منتجات غير موجودة في Product." });
      if (invalidDetailQuantities) warnings.push({ code: "INVALID_SALES_QUANTITY", count: invalidDetailQuantities, detail: "تفاصيل بيع فيها كمية صفرية أو سالبة أو غير رقمية." });

      // Money reconciliation only tests candidate interpretations; it does not assume what final_price means.
      const detailGroups = new Map<string, Record<string, unknown>[]>();
      for (const row of getRows("SalesInvoiceDetails")) {
        const key = valueKey(row.invoice_id);
        if (key === null) continue;
        const rows = detailGroups.get(key) || [];
        rows.push(row);
        detailGroups.set(key, rows);
      }
      const mismatchByHypothesis = { sumFinalPrice: 0, sumFinalPriceTimesQuantity: 0, sumPriceTimesQuantity: 0 };
      let invoicesWithoutDetails = 0;
      let invoicesMismatchAllHypotheses = 0;
      const moneyTolerance = 0.03;
      for (const [index, invoice] of getRows("SalesInvoices").entries()) {
        const key = valueKey(invoice.invoice_no);
        const details = key ? (detailGroups.get(key) || []) : [];
        if (!details.length) { invoicesWithoutDetails += 1; addIssue(issuesByRow, "SalesInvoices", index, "INVOICE_HAS_NO_DETAILS"); continue; }
        const headerTotal = Number(invoice.total);
        if (!Number.isFinite(headerTotal)) { addIssue(issuesByRow, "SalesInvoices", index, "INVALID_HEADER_TOTAL"); continue; }
        let sumFinal = 0;
        let sumFinalTimesQuantity = 0;
        let sumPriceTimesQuantity = 0;
        let valid = true;
        for (const detail of details) {
          const price = Number(detail.price);
          const finalPrice = Number(detail.final_price);
          const quantity = Number(detail.quantity);
          if (![price, finalPrice, quantity].every(Number.isFinite)) { valid = false; break; }
          sumFinal += finalPrice;
          sumFinalTimesQuantity += finalPrice * quantity;
          sumPriceTimesQuantity += price * quantity;
        }
        if (!valid) continue;
        const mismatches = {
          sumFinalPrice: Math.abs(sumFinal - headerTotal) > moneyTolerance,
          sumFinalPriceTimesQuantity: Math.abs(sumFinalTimesQuantity - headerTotal) > moneyTolerance,
          sumPriceTimesQuantity: Math.abs(sumPriceTimesQuantity - headerTotal) > moneyTolerance,
        };
        if (mismatches.sumFinalPrice) mismatchByHypothesis.sumFinalPrice += 1;
        if (mismatches.sumFinalPriceTimesQuantity) mismatchByHypothesis.sumFinalPriceTimesQuantity += 1;
        if (mismatches.sumPriceTimesQuantity) mismatchByHypothesis.sumPriceTimesQuantity += 1;
        if (Object.values(mismatches).every(Boolean)) {
          invoicesMismatchAllHypotheses += 1;
          addIssue(issuesByRow, "SalesInvoices", index, "HEADER_DETAIL_TOTAL_NEEDS_REVIEW");
        }
      }
      if (invoicesWithoutDetails) warnings.push({ code: "INVOICES_WITHOUT_DETAILS", count: invoicesWithoutDetails, detail: "فواتير بلا تفاصيل. قد تكون فاتورة خدمة/ملخص أو بيانات ناقصة؛ لا تُنشأ أصناف تلقائيًا." });
      warnings.push({ code: "HEADER_DETAIL_TOTAL_RECONCILIATION", count: invoicesMismatchAllHypotheses, detail: `اختبرنا 3 تفسيرات مرشحة لإجمالي الفاتورة (sum(final_price)، وsum(final_price × quantity)، وsum(price × quantity)). عدد الفواتير غير المطابقة لكل تفسير: ${mismatchByHypothesis.sumFinalPrice}، ${mismatchByHypothesis.sumFinalPriceTimesQuantity}، ${mismatchByHypothesis.sumPriceTimesQuantity} على الترتيب. ${invoicesMismatchAllHypotheses} فاتورة لم تطابق أيًا منها بهامش 0.03. هذا فحص فقط؛ الضرائب والخصومات ومعنى final_price يحتاجون تأكيدًا قبل اعتماد الإجماليات.` });

      const duplicateNameGroups = (rows: Record<string, unknown>[]) => {
        const counts = new Map<string, number>();
        for (const row of rows) { const key = normalize(row.name); if (key) counts.set(key, (counts.get(key) || 0) + 1); }
        return [...counts.values()].filter((count) => count > 1).length;
      };
      const customerDuplicateNameGroups = duplicateNameGroups(getRows("Customer"));
      const productDuplicateNameGroups = duplicateNameGroups(getRows("Product"));
      if (customerDuplicateNameGroups) warnings.push({ code: "DUPLICATE_CUSTOMER_NAME_GROUPS", count: customerDuplicateNameGroups, detail: "أسماء عملاء متكررة بعد تجاهل المسافات وحالة الحروف. لا ندمج أي عميل تلقائيًا." });
      if (productDuplicateNameGroups) warnings.push({ code: "DUPLICATE_PRODUCT_NAME_GROUPS", count: productDuplicateNameGroups, detail: "أسماء منتجات متكررة بعد تطبيع بسيط. قد تكون وحدات/عبوات مختلفة؛ لا ندمجها تلقائيًا." });

      const stockProductCounts = new Map<string, number>();
      for (const row of getRows("Temp_stock")) { const key = valueKey(row.prod_id); if (key !== null) stockProductCounts.set(key, (stockProductCounts.get(key) || 0) + 1); }
      const duplicateStockProductGroups = [...stockProductCounts.values()].filter((count) => count > 1).length;
      if (duplicateStockProductGroups) {
        for (const [index, row] of getRows("Temp_stock").entries()) {
          const key = valueKey(row.prod_id);
          if (key !== null && (stockProductCounts.get(key) || 0) > 1) addIssue(issuesByRow, "Temp_stock", index, "MULTIPLE_STOCK_ROWS_FOR_PRODUCT");
        }
        warnings.push({ code: "MULTIPLE_STOCK_ROWS_FOR_PRODUCT", count: duplicateStockProductGroups, detail: "يوجد أكثر من صف مخزون لبعض المنتجات. لن نجمع الكميات تلقائيًا قبل فهم معنى كل صف ومصدر الرصيد." });
      }

      let orphanProductCategories = 0;
      let orphanProductSubcategories = 0;
      for (const [index, row] of getRows("Product").entries()) {
        const categoryRef = valueKey(row.catId);
        const subcategoryRef = valueKey(row.subcatId);
        if (categoryRef !== null && !categoryIds.has(categoryRef)) { orphanProductCategories += 1; addIssue(issuesByRow, "Product", index, "ORPHAN_CATEGORY_REFERENCE"); }
        if (subcategoryRef !== null && !subcategoryIds.has(subcategoryRef)) { orphanProductSubcategories += 1; addIssue(issuesByRow, "Product", index, "ORPHAN_SUBCATEGORY_REFERENCE"); }
        if (!normalize(row.name)) addIssue(issuesByRow, "Product", index, "EMPTY_REQUIRED_NAME");
        if (isFiniteNumber(row.buyPrice) && row.buyPrice < 0) addIssue(issuesByRow, "Product", index, "NEGATIVE_PURCHASE_PRICE");
        if (isFiniteNumber(row.sellPrice) && row.sellPrice < 0) addIssue(issuesByRow, "Product", index, "NEGATIVE_RETAIL_PRICE");
      }
      if (orphanProductCategories) warnings.push({ code: "PRODUCT_CATEGORY_ORPHANS", count: orphanProductCategories, detail: "منتجات تشير إلى catId غير موجود في Category." });
      if (orphanProductSubcategories) warnings.push({ code: "PRODUCT_SUBCATEGORY_ORPHANS", count: orphanProductSubcategories, detail: "منتجات تشير إلى subcatId غير موجود في Subcategory." });

      let orphanStockProducts = 0;
      for (const [index, row] of getRows("Temp_stock").entries()) {
        const productRef = valueKey(row.prod_id);
        if (productRef === null || !productIds.has(productRef)) { orphanStockProducts += 1; addIssue(issuesByRow, "Temp_stock", index, "ORPHAN_STOCK_PRODUCT_REFERENCE"); }
        if (!isFiniteNumber(row.quantity)) addIssue(issuesByRow, "Temp_stock", index, "INVALID_STOCK_QUANTITY");
      }
      if (orphanStockProducts) warnings.push({ code: "STOCK_PRODUCT_ORPHANS", count: orphanStockProducts, detail: "أرصدة مخزون تشير إلى prod_id غير موجود في Product." });

      let orphanPurchaseSuppliers = 0;
      for (const [index, row] of getRows("BuyInvoices").entries()) {
        const ref = valueKey(row.supp_id);
        if (ref === null || !supplierIds.has(ref)) { orphanPurchaseSuppliers += 1; addIssue(issuesByRow, "BuyInvoices", index, "ORPHAN_SUPPLIER_REFERENCE"); }
      }
      if (orphanPurchaseSuppliers) warnings.push({ code: "PURCHASE_SUPPLIER_ORPHANS", count: orphanPurchaseSuppliers, detail: "فواتير شراء لا تجد موردًا مطابقًا." });
      for (const [index, row] of getRows("BuyInvoiceDetails").entries()) {
        const invoiceRef = valueKey(row.invoice_id);
        const productRef = valueKey(row.prod_id);
        if (invoiceRef === null || !purchaseInvoiceNumbers.has(invoiceRef)) addIssue(issuesByRow, "BuyInvoiceDetails", index, "ORPHAN_PURCHASE_INVOICE_REFERENCE");
        if (productRef === null || !productIds.has(productRef)) addIssue(issuesByRow, "BuyInvoiceDetails", index, "ORPHAN_PURCHASE_PRODUCT_REFERENCE");
      }
      for (const [index, row] of getRows("CustomerAccount").entries()) {
        const ref = valueKey(row.cust_id);
        if (ref === null || !customerIds.has(ref)) addIssue(issuesByRow, "CustomerAccount", index, "ORPHAN_ACCOUNT_CUSTOMER_REFERENCE");
      }
      for (const [index, row] of getRows("SupplierAccount").entries()) {
        const ref = valueKey(row.supp_id);
        if (ref === null || !supplierIds.has(ref)) addIssue(issuesByRow, "SupplierAccount", index, "ORPHAN_ACCOUNT_SUPPLIER_REFERENCE");
      }

      setProgress("مقارنة المرشحين ببيانات VETRA الحالية عبر صلاحيات العيادة...");
      const destination: TargetSnapshot = { clients: [], products: [], categories: [], invoices: [] };
      let targetError = "";
      try {
        const [context, client, product, category, invoice] = await Promise.all([
          getClinicContext(),
          getClinicDb(),
          getClinicDb(),
          getClinicDb(),
          getClinicDb(),
        ]);
        setClinicName(context.clinic_name || "العيادة الحالية");
        const [clients, products, categories, invoices] = await Promise.all([
          fetchAll<TargetSnapshot["clients"][number]>(client, "clients", "id,name,phone,client_code"),
          fetchAll<TargetSnapshot["products"][number]>(product, "products", "id,name,barcode,quantity,retail_price"),
          fetchAll<TargetSnapshot["categories"][number]>(category, "product_categories", "id,name"),
          fetchAll<TargetSnapshot["invoices"][number]>(invoice, "invoices", "id,invoice_number"),
        ]);
        destination.clients = clients;
        destination.products = products;
        destination.categories = categories;
        destination.invoices = invoices;
      } catch (caught) {
        targetError = caught instanceof Error ? caught.message : String(caught);
        setTargetReadError(targetError);
      }

      const clientExact = new Set(destination.clients.map((row) => `${normalize(row.name)}|${normalize(row.phone)}`));
      const productNames = new Set(destination.products.map((row) => normalize(row.name)));
      const categoryNames = new Set(destination.categories.map((row) => normalize(row.name)));
      const existingInvoiceNumbers = new Set(destination.invoices.map((row) => String(row.invoice_number)));
      let matchingClientCandidates = 0;
      for (const row of getRows("Customer")) {
        if (clientExact.has(`${normalize(row.name)}|${normalize(row.phone)}`) && normalize(row.name)) matchingClientCandidates += 1;
      }
      let matchingProductNameCandidates = 0;
      for (const row of getRows("Product")) if (productNames.has(normalize(row.name)) && normalize(row.name)) matchingProductNameCandidates += 1;
      let matchingCategoryCandidates = 0;
      for (const row of getRows("Category")) if (categoryNames.has(normalize(row.name)) && normalize(row.name)) matchingCategoryCandidates += 1;
      let invoiceNumberCollisions = 0;
      for (const row of getRows("SalesInvoices")) if (existingInvoiceNumbers.has(String(row.invoice_no))) invoiceNumberCollisions += 1;

      const allSourceTables = Array.from(tableMap.values());
      const rowRecords: DryRunResult["rowRecords"] = [];
      let recordNumber = 0;
      for (const table of allSourceTables) {
        if (table.scanError) continue;
        for (let rowIndex = 0; rowIndex < table.actualRows.length; rowIndex += 1) {
          const row = table.actualRows[rowIndex];
          recordNumber += 1;
          const key = getSourceKey(table, row, rowIndex);
          const sourceRowHash = await sha256Text(JSON.stringify(toSerializable(row)));
          const rowIssues = [...(issuesByRow.get(`${table.name}#${rowIndex + 1}`) || [])];
          if (!key.column) rowIssues.push("NO_UNIQUE_SOURCE_KEY_ROW_NUMBER_FALLBACK");
          const mappedTarget = TARGET_BY_SOURCE[table.name] || null;
          const unsupported = !mappedTarget || UNSUPPORTED_BUSINESS_TABLES.has(table.name) || table.name.startsWith("employee_");
          if (unsupported) rowIssues.push("NO_APPROVED_TARGET_TABLE");
          if (mappedTarget && !targetError) rowIssues.push("FIELD_MAPPING_NOT_APPROVED");
          rowRecords.push({
            source_table: table.name,
            source_key: key.key,
            source_row_number: rowIndex + 1,
            source_key_column: key.column,
            row_fingerprint: sourceRowHash,
            candidate_target_table: mappedTarget,
            decision: unsupported ? "unsupported" : (rowIssues.length ? "needs_review" : "candidate"),
            status: rowIssues.length ? "needs_review" : "profiled",
            issue_codes: Array.from(new Set(rowIssues)),
          });
        }
      }

      const tableProfiles = allSourceTables.map((table) => {
        const keyValues = table.keyColumn ? table.actualRows.map((row) => valueKey(row[table.keyColumn!])) : [];
        const duplicateKeyCount = table.keyColumn ? keyValues.filter((v) => v !== null && table.keyCounts.get(v) !== 1).length : table.actualRows.length;
        return {
          name: table.name,
          declaredRows: table.declaredRows,
          actualRows: table.actualRows.length,
          countMismatch: table.declaredRows !== table.actualRows.length,
          keyColumn: table.keyColumn,
          duplicateKeyCount,
          scanError: table.scanError,
          suggestedTarget: TARGET_BY_SOURCE[table.name] || null,
          unsupported: !TARGET_BY_SOURCE[table.name] || UNSUPPORTED_BUSINESS_TABLES.has(table.name) || table.name.startsWith("employee_"),
        };
      });
      const failedTables = tableProfiles.filter((t) => t.scanError).length;
      if (tableProfiles.some((t) => t.countMismatch)) {
        const mismatches = tableProfiles.filter((t) => t.countMismatch);
        warnings.push({ code: "DECLARED_COUNT_MISMATCH", count: mismatches.length, detail: `اختلاف بين العدد المعلن والمقروء في: ${mismatches.map((t) => `${t.name} (${t.declaredRows} مقابل ${t.actualRows})`).join(", ")}. القراءة الفعلية تمت حتى رجوع صفحة فارغة، لكن يلزم مراجعة سبب اختلاف البيانات الوصفية.` });
      }
      if (targetError) warnings.push({ code: "DESTINATION_READ_FAILED", count: 1, detail: `فشل فحص بيانات العيادة الحالية: ${targetError}` });
      if (invoiceNumberCollisions) warnings.push({ code: "TARGET_INVOICE_NUMBER_COLLISIONS", count: invoiceNumberCollisions, detail: "أرقام فواتير قديمة تتصادم مع أرقام موجودة حاليًا؛ يجب تعيين أرقام جديدة أو سياسة مطابقة قبل الترحيل." });
      if (matchingClientCandidates) warnings.push({ code: "POSSIBLE_EXISTING_CLIENT_MATCH", count: matchingClientCandidates, detail: "عملاء قد يتطابقون بالاسم والهاتف مع سجلات موجودة. هذا مجرد مرشح للمراجعة ولن يتم الدمج تلقائيًا." });
      if (matchingProductNameCandidates) warnings.push({ code: "POSSIBLE_EXISTING_PRODUCT_MATCH", count: matchingProductNameCandidates, detail: "منتجات أسماؤها تطابق منتجات موجودة. يلزم مقارنة الباركود والوحدة قبل الدمج." });

      const issueRows = rowRecords.filter((r) => r.issue_codes.length > 0).length;
      const unsupportedRows = rowRecords.filter((r) => r.decision === "unsupported").length;
      const totalRows = allSourceTables.reduce((sum, table) => sum + table.actualRows.length, 0);
      const dryRun: DryRunResult = {
        sourceFile: file.name,
        sourceSizeBytes: file.size,
        sourceSha256: sourceFileHash,
        generatedAt: new Date().toISOString(),
        observedTableCount: names.length,
        ignoredSystemTables: ignored,
        tables: tableProfiles,
        rowRecords,
        sourceValidation: warnings,
        destinationComparison: {
          clientsRead: destination.clients.length,
          productsRead: destination.products.length,
          categoriesRead: destination.categories.length,
          invoicesRead: destination.invoices.length,
          matchingClientCandidates,
          matchingProductNameCandidates,
          matchingCategoryCandidates,
          invoiceNumberCollisions,
        },
        summary: {
          userTables: allSourceTables.length,
          totalRows,
          recordsLogged: rowRecords.length,
          issueRows,
          unsupportedRows,
          incompleteTables: failedTables,
        },
      };
      setResult(dryRun);
      setMessage(targetError ? "اكتمل فحص المصدر، لكن مقارنة VETRA لم تكتمل؛ لن يُسمح بحفظ سجل Dry Run قبل نجاح المقارنة." : "اكتمل الفحص المحلي ومقارنة العيادة. لم يتم إدخال أو تعديل أي بيانات تشغيلية.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  async function saveTrackingLog() {
    if (!result) return;
    if (targetReadError) {
      setError("لا يمكن حفظ سجل Dry Run لأن قراءة بيانات VETRA الحالية فشلت. أصلح خطأ القراءة ثم أعد الفحص.");
      return;
    }
    if (result.summary.incompleteTables > 0) {
      setError("لا يمكن حفظ سجل الفحص النهائي مع وجود جداول تعذر قراءتها. أصلح الخطأ ثم أعد الفحص.");
      return;
    }
    if (!window.confirm("سيتم حفظ سجل فحص فقط (بصمة الملف، معرّفات المصدر، وبصمات الصفوف وأكواد المشاكل). لن يتم إدخال أو تعديل أي عميل أو منتج أو فاتورة أو مخزون. نكمل؟")) return;

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const db = await getClinicDb();
      const existing = await db
        .from("legacy_import_batches")
        .select("id,status,created_at")
        .eq("source_sha256", result.sourceSha256)
        .eq("audit_version", "phase2-v1")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing.error) throw new Error(`فحص سجل الاستيراد السابق: ${existing.error.message}`);
      if (existing.data) {
        setSavedBatchId(existing.data.id);
        setMessage(`هذا الملف مسجل بالفعل في VETRA بسجل ${existing.data.id}. لم يتم إنشاء نسخة مكررة.`);
        setSaving(false);
        return;
      }

      const tableCounts = Object.fromEntries(result.tables.map((table) => [table.name, table.actualRows]));
      const summary = {
        ...result.summary,
        sourceValidation: result.sourceValidation,
        destinationComparison: result.destinationComparison,
        observedTableCount: result.observedTableCount,
        ignoredSystemTables: result.ignoredSystemTables,
        businessDataWritten: false,
        sourceRowsStored: false,
        note: "Metadata/fingerprints only. No source record values or business rows were stored.",
      };
      const { data: batch, error: batchError } = await db
        .from("legacy_import_batches")
        .insert({
          source_file_name: result.sourceFile,
          source_sha256: result.sourceSha256,
          source_size_bytes: result.sourceSizeBytes,
          audit_version: "phase2-v1",
          status: "needs_review",
          source_table_counts: tableCounts,
          summary,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (batchError || !batch) throw new Error(`إنشاء سجل الفحص فشل: ${batchError?.message || "لم يتم إرجاع رقم السجل"}`);

      let inserted = 0;
      try {
        for (let offset = 0; offset < result.rowRecords.length; offset += WRITE_CHUNK_SIZE) {
          const chunk = result.rowRecords.slice(offset, offset + WRITE_CHUNK_SIZE).map((row) => ({
            batch_id: batch.id,
            source_table: row.source_table,
            source_key: row.source_key,
            source_row_number: row.source_row_number,
            source_key_column: row.source_key_column,
            row_fingerprint: row.row_fingerprint,
            candidate_target_table: row.candidate_target_table,
            decision: row.decision,
            status: row.status,
            issue_codes: row.issue_codes,
            updated_at: new Date().toISOString(),
          }));
          const { error: recordsError } = await db.from("legacy_import_records").insert(chunk);
          if (recordsError) throw new Error(`حفظ سجلات الصفوف عند ${inserted.toLocaleString("en-US")}: ${recordsError.message}`);
          inserted += chunk.length;
          setMessage(`حفظ سجل الفحص: ${inserted.toLocaleString("en-US")} / ${result.rowRecords.length.toLocaleString("en-US")} سجل. لا يوجد ترحيل لبيانات العيادة.`);
        }
      } catch (recordError) {
        await db.from("legacy_import_batches").update({ status: "failed", summary: { ...summary, trackingRowsInserted: inserted, trackingError: recordError instanceof Error ? recordError.message : String(recordError) }, updated_at: new Date().toISOString(), completed_at: new Date().toISOString() }).eq("id", batch.id);
        throw recordError;
      }
      await db.from("legacy_import_batches").update({ status: "needs_review", summary: { ...summary, trackingRowsInserted: inserted }, updated_at: new Date().toISOString(), completed_at: new Date().toISOString() }).eq("id", batch.id);
      setSavedBatchId(batch.id);
      setMessage(`تم حفظ سجل الفحص بنجاح. رقم السجل: ${batch.id}. عدد الصفوف المتتبعة: ${inserted.toLocaleString("en-US")}. لم يتم تعديل بيانات العملاء أو المنتجات أو الفواتير أو المخزون.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  function downloadJson() {
    if (!result) return;
    // Exclude row-level fingerprints/key information from the locally downloaded human report by default.
    const { rowRecords, ...summary } = result;
    const blob = new Blob([JSON.stringify({ ...summary, rowRecordsExcluded: rowRecords.length, note: "Full row tracking metadata is saved only to the current clinic tracking tables when explicitly requested." }, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${result.sourceFile.replace(/\.[^.]+$/, "")}-dry-run-summary.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void runDryRun(file);
    event.target.value = "";
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/settings/import" className="mb-5 inline-flex rounded-xl py-2 text-sm font-semibold text-slate-500 hover:text-slate-900">← فحص هيكل قاعدة Access</Link>
        <header className="mb-7">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-3xl">🧪</div>
          <h1 className="text-2xl font-black sm:text-3xl">Dry Run — مراجعة الترحيل</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500 sm:text-base">يفحص سجلات Access فعليًا، والعلاقات المفقودة، والتطابقات المحتملة مع بيانات العيادة الحالية. لا يكتب في جداول العملاء أو المنتجات أو الفواتير أو المخزون.</p>
          {clinicName && <p className="mt-3 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">العيادة التي تمت مقارنتها: {clinicName}</p>}
        </header>

        <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-extrabold">1. فحص محلي ومقارنة آمنة</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">المصدر يُقرأ داخل المتصفح. المقارنة مع VETRA تتم من خلال اتصال العيادة الحالي وسياسات عزل البيانات. لا تُرفع السجلات الأصلية ولا أسماء العملاء داخل تقرير الفحص.</p>
          <input ref={fileInputRef} type="file" accept=".mdb,.accdb,application/x-msaccess" onChange={onFileChange} className="sr-only" />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading || saving} className="mt-5 rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60">{loading ? "جاري الفحص..." : "اختيار ملف MDB / ACCDB"}</button>
          {loading && <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-900">{progress}</div>}
          {targetReadError && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">تعذرت مقارنة بيانات VETRA: {targetReadError}</div>}
          {error && <div role="alert" className="mt-4 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{error}</div>}
          {message && !error && <div role="status" className="mt-4 break-words rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">{message}</div>}
        </section>

        {result && <>
          <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="جداول المصدر" value={String(result.summary.userTables)} />
            <Metric label="سجلات مقروءة فعليًا" value={result.summary.totalRows.toLocaleString("en-US")} />
            <Metric label="صفوف تحتاج مراجعة" value={result.summary.issueRows.toLocaleString("en-US")} danger={result.summary.issueRows > 0} />
            <Metric label="سجلات خارج نطاق VETRA الحالي" value={result.summary.unsupportedRows.toLocaleString("en-US")} danger={result.summary.unsupportedRows > 0} />
          </section>

          <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-extrabold">2. مقارنة VETRA الحالية</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <SmallMetric label="عملاء حاليون" value={result.destinationComparison.clientsRead} />
              <SmallMetric label="منتجات حالية" value={result.destinationComparison.productsRead} />
              <SmallMetric label="تصنيفات حالية" value={result.destinationComparison.categoriesRead} />
              <SmallMetric label="فواتير حالية" value={result.destinationComparison.invoicesRead} />
              <SmallMetric label="عملاء متطابقون محتملًا" value={result.destinationComparison.matchingClientCandidates} warning />
              <SmallMetric label="أسماء منتجات متشابهة" value={result.destinationComparison.matchingProductNameCandidates} warning />
              <SmallMetric label="تصنيفات موجودة بالفعل" value={result.destinationComparison.matchingCategoryCandidates} warning />
              <SmallMetric label="تصادم أرقام فواتير" value={result.destinationComparison.invoiceNumberCollisions} danger={result.destinationComparison.invoiceNumberCollisions > 0} />
            </div>
            <p className="mt-4 text-xs leading-6 text-slate-500">التطابقات المحتملة لا تعني دمجًا تلقائيًا. سنطلب قاعدة مطابقة صريحة ومراجعة للأسماء والهواتف والباركود قبل أي استيراد فعلي.</p>
          </section>

          <section className="mb-6 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5 sm:p-6"><h2 className="text-lg font-extrabold">3. نتيجة كل جدول</h2><p className="mt-1 text-sm leading-6 text-slate-500">عدد Access المعلن قد يختلف عن عدد السجلات المقروءة؛ اختلاف العدد يظل تحذيرًا للمراجعة.</p></div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">
                <thead className="bg-slate-50"><tr><th className="px-3 py-3 text-right">الجدول</th><th className="px-3 py-3 text-right">المعلن</th><th className="px-3 py-3 text-right">المقروء</th><th className="px-3 py-3 text-right">مفتاح المصدر المرشح</th><th className="px-3 py-3 text-right">الوجهة المرشحة</th><th className="px-3 py-3 text-right">الحالة</th></tr></thead>
                <tbody>{result.tables.map((table) => <tr key={table.name} className="border-t border-slate-100 align-top"><td dir="ltr" className="px-3 py-3 font-bold">{table.name}</td><td className="px-3 py-3 tabular-nums">{table.declaredRows}</td><td className="px-3 py-3 tabular-nums">{table.actualRows}</td><td dir="ltr" className="px-3 py-3">{table.keyColumn || "row number fallback"}{table.duplicateKeyCount ? ` · ${table.duplicateKeyCount} غير فريد` : ""}</td><td dir="ltr" className="max-w-56 px-3 py-3">{table.suggestedTarget || "غير مدعومة حاليًا"}</td><td className="px-3 py-3">{table.scanError ? <span className="font-bold text-red-700">خطأ: {table.scanError}</span> : table.countMismatch ? <span className="font-bold text-amber-700">اختلاف عدد</span> : table.unsupported ? <span className="text-slate-500">تحتاج وجهة منفصلة</span> : <span className="font-bold text-emerald-700">فُحص</span>}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-extrabold">4. تحذيرات الفحص</h2>
            {result.sourceValidation.length === 0 ? <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">لم تُكتشف تحذيرات ضمن قواعد الفحص الحالية، لكن ده لا يعني إن الترحيل معتمد؛ لازم مراجعة خريطة الحقول والأرصدة.</p> : <div className="mt-4 space-y-3">{result.sourceValidation.map((issue) => <div key={issue.code} className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span dir="ltr" className="font-bold text-amber-950">{issue.code}</span><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-amber-900">{issue.count.toLocaleString("en-US")}</span></div><p className="mt-2 text-sm leading-6 text-amber-900">{issue.detail}</p></div>)}</div>}
          </section>

          <section className="mb-8 rounded-3xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
            <h2 className="font-extrabold text-amber-950">5. تسجيل سجل الفحص</h2>
            <p className="mt-2 text-sm leading-7 text-amber-900">عند التسجيل، سيتم حفظ اسم الملف وبصمته، وعدد السجلات، ومعرّفات الصفوف القديمة وبصماتها وأكواد الأخطاء فقط في جدول تتبّع منفصل. لن يتم حفظ قيم العملاء أو المنتجات داخل جدول التتبّع، ولن تتم كتابة أي شيء في جداول التشغيل الحالية.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={downloadJson} className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">تنزيل ملخص JSON</button>
              <button type="button" onClick={() => void saveTrackingLog()} disabled={saving || loading || Boolean(targetReadError) || result.summary.incompleteTables > 0 || Boolean(savedBatchId)} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "جاري حفظ سجل الفحص..." : savedBatchId ? "تم تسجيل الفحص" : "حفظ سجل الفحص فقط"}</button>
            </div>
            {savedBatchId && <p className="mt-4 break-all text-xs font-semibold text-emerald-900">رقم سجل الفحص: {savedBatchId}</p>}
            <p className="mt-4 text-xs leading-6 text-amber-900">لا يوجد زر استيراد في هذه المرحلة عمدًا. جميع سجلات المصدر تظل في حالة مراجعة حتى نعتمد خريطة الحقول وقواعد التسوية.</p>
          </section>
        </>}
      </div>
    </main>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className={`rounded-2xl border bg-white p-4 shadow-sm ${danger ? "border-red-200" : "border-slate-100"}`}><p className="text-xs font-semibold text-slate-400">{label}</p><p className={`mt-1 text-2xl font-black tabular-nums ${danger ? "text-red-700" : "text-slate-900"}`}>{value}</p></div>;
}

function SmallMetric({ label, value, warning = false, danger = false }: { label: string; value: number; warning?: boolean; danger?: boolean }) {
  const color = danger && value > 0 ? "text-red-700" : warning && value > 0 ? "text-amber-700" : "text-slate-900";
  return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs leading-5 text-slate-500">{label}</p><p className={`mt-1 text-xl font-black tabular-nums ${color}`}>{value.toLocaleString("en-US")}</p></div>;
}
