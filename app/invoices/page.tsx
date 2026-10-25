"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";
import { getClinicDb, getClinicContext } from "@/lib/clinic-db";
import { writeVetraThemeMode } from "@/lib/theme";
import { useStaffPermissions } from "@/lib/use-staff-permissions";

type Invoice = {
  id: string;
  clinic_id: string;
  invoice_number: number;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  paid_amount: number;
  payment_method: string | null;
  created_at: string;
  issued_at: string | null;
  client: { name: string } | null;
  pet: { name: string } | null;
};

type InvoiceItemCost = {
  invoice_id: string;
  item_type: "product" | "service";
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
  product: { last_purchase_price: number | null; wholesale_price: number | null } | null;
};

const statusOptions = [
  { value: "all", ar: "كل الحالات", en: "All statuses" },
  { value: "draft", ar: "مسودة", en: "Draft" },
  { value: "issued", ar: "صادرة", en: "Issued" },
  { value: "paid", ar: "مدفوعة", en: "Paid" },
  { value: "partially_paid", ar: "مدفوعة جزئيًا", en: "Partially paid" },
  { value: "unpaid", ar: "غير مدفوعة", en: "Unpaid" },
  {
    value: "partially_returned",
    ar: "مرتجع جزئي",
    en: "Partially returned",
  },
  { value: "returned", ar: "مرتجعة", en: "Returned" },
  { value: "cancelled", ar: "ملغاة", en: "Cancelled" },
];

const statusStyle: Record<string, string> = {
  draft:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  issued:
    "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  paid:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  partially_paid:
    "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  unpaid:
    "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300",
  partially_returned:
    "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
  returned:
    "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300",
  cancelled:
    "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
};

const statusLabel = (status: string) => {
  const item = statusOptions.find((x) => x.value === status);
  return item ? `${item.ar} / ${item.en}` : status;
};

const invoiceDateValue = (invoice: Invoice) => invoice.issued_at || invoice.created_at;
const invoiceDateTimestamp = (invoice: Invoice) => new Date(invoiceDateValue(invoice)).getTime();

export default function InvoicesPage() {
  const router = useRouter();
  const { loaded: permissionsLoaded, can } = useStaffPermissions();

  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [darkMode, setDarkMode] = useState(true);
  const [ready, setReady] = useState(false);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceProfits, setInvoiceProfits] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [draftActionId, setDraftActionId] = useState("");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    const savedTheme = localStorage.getItem("vetra-theme");
    const savedLanguage = localStorage.getItem("vetra-language");

    setDarkMode(savedTheme !== "light");
    setLanguage(savedLanguage === "en" ? "en" : "ar");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;

    writeVetraThemeMode(darkMode);
    localStorage.setItem("vetra-language", language);
  }, [darkMode, language, ready]);

  async function checkAdminAndLoad() {
    if (!permissionsLoaded) return;
    setLoading(true);
    setMessage("");

    try {
      const {
        data: { user },
      } = await vetraCore.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const context = await getClinicContext();

      if (!can("invoices", "view")) {
        setAuthorized(false);
        setLoading(false);
        return;
      }

      setAuthorized(true);

      const db = await getClinicDb();

      const [invoiceResult, itemResult] = await Promise.all([
        db.from("invoices").select(`
          id,
          clinic_id,
          invoice_number,
          status,
          subtotal,
          discount,
          total,
          paid_amount,
          payment_method,
          created_at,
          issued_at,
          client:clients(name),
          pet:pets(name)
        `)
        .eq("clinic_id", context.clinic_id)
        .order("created_at", { ascending: false }),
        db.from("invoice_items").select(`
          invoice_id,
          item_type,
          quantity,
          unit_price,
          discount,
          total,
          product:products(last_purchase_price, wholesale_price)
        `).eq("clinic_id", context.clinic_id),
      ]);

      if (invoiceResult.error) {
        console.error("INVOICES LOAD ERROR:", invoiceResult.error);

        setMessage(
          invoiceResult.error.message || "حصل خطأ أثناء تحميل الفواتير"
        );

        setInvoices([]);
      } else {
        setInvoices((invoiceResult.data || []) as unknown as Invoice[]);
      }

      if (itemResult.error) {
        console.error("INVOICE ITEMS LOAD ERROR:", itemResult.error);
        setInvoiceProfits({});
      } else {
        const profitByInvoice: Record<string, number> = {};
        for (const rawItem of (itemResult.data || []) as unknown as InvoiceItemCost[]) {
          const itemTotal = Number(rawItem.total || (Number(rawItem.quantity || 0) * Number(rawItem.unit_price || 0) - Number(rawItem.discount || 0)));
          const costPerUnit = rawItem.item_type === "product"
            ? Number(rawItem.product?.last_purchase_price ?? rawItem.product?.wholesale_price ?? 0)
            : 0;
          profitByInvoice[rawItem.invoice_id] = (profitByInvoice[rawItem.invoice_id] || 0) + itemTotal - Number(rawItem.quantity || 0) * costPerUnit;
        }
        setInvoiceProfits(profitByInvoice);
      }
    } catch (error) {
      console.error("INVOICES LOAD ERROR:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "حصل خطأ أثناء تحميل الفواتير"
      );

      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }

  async function issueDraft(invoice: Invoice) {
    if (invoice.status !== "draft") return;
    if (!can("invoices", "edit")) return;
    setDraftActionId(invoice.id);
    setMessage("");
    try {
      const db = await getClinicDb();
      const { error } = await db.rpc("issue_invoice", { p_invoice_id: invoice.id });
      if (error) throw error;
      await checkAdminAndLoad();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (language === "ar" ? "تعذر إصدار المسودة." : "Could not issue this draft."));
    } finally {
      setDraftActionId("");
    }
  }

  async function deleteDraft(invoice: Invoice) {
    if (invoice.status !== "draft") return;
    if (!can("invoices", "delete")) return;
    const confirmed = window.confirm(language === "ar"
      ? `حذف المسودة رقم ${invoice.invoice_number}؟ لا يمكن التراجع عن ذلك.`
      : `Delete draft invoice ${invoice.invoice_number}? This cannot be undone.`);
    if (!confirmed) return;
    setDraftActionId(invoice.id);
    setMessage("");
    try {
      const db = await getClinicDb();
      const { error: itemsError } = await db.from("invoice_items").delete().eq("invoice_id", invoice.id).eq("clinic_id", invoice.clinic_id);
      if (itemsError) throw itemsError;
      const { error } = await db.from("invoices").delete().eq("id", invoice.id).eq("clinic_id", invoice.clinic_id).eq("status", "draft");
      if (error) throw error;
      await checkAdminAndLoad();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (language === "ar" ? "تعذر حذف المسودة." : "Could not delete this draft."));
    } finally {
      setDraftActionId("");
    }
  }

  useEffect(() => {
    if (!ready || !permissionsLoaded) return;
    const timer = window.setTimeout(() => void checkAdminAndLoad(), 0);
    return () => window.clearTimeout(timer);
  }, [ready, permissionsLoaded, can]);

  const periodInvoices = useMemo(() => {
    const start = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const end = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return invoices.filter((invoice) => {
      const timestamp = invoiceDateTimestamp(invoice);
      return timestamp >= start && timestamp <= end;
    });
  }, [invoices, fromDate, toDate]);

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();

    return periodInvoices.filter((invoice) => {
      const matchesStatus =
        status === "all" || invoice.status === status;

      const numberText = String(invoice.invoice_number);
      const clientName =
        invoice.client?.name?.toLowerCase() || "";
      const petName =
        invoice.pet?.name?.toLowerCase() || "";

      const matchesSearch =
        !query ||
        numberText.includes(query) ||
        clientName.includes(query) ||
        petName.includes(query);

      return matchesStatus && matchesSearch;
    }).sort((a, b) => invoiceDateTimestamp(b) - invoiceDateTimestamp(a));
  }, [periodInvoices, search, status]);

  const reportInvoices = periodInvoices.filter((invoice) => !["draft", "cancelled"].includes(invoice.status));
  const reportTotals = reportInvoices.reduce(
    (totals, invoice) => ({
      sales: totals.sales + Number(invoice.total || 0),
      paid: totals.paid + Number(invoice.paid_amount || 0),
      remaining: totals.remaining + Math.max(Number(invoice.total || 0) - Number(invoice.paid_amount || 0), 0),
      profit: totals.profit + Number(invoiceProfits[invoice.id] || 0),
    }),
    { sales: 0, paid: 0, remaining: 0, profit: 0 }
  );

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("en-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const formatDate = (value: string) =>
    new Date(value).toLocaleString(
      language === "ar" ? "ar-EG" : "en-US",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    );

  if (!ready || loading) {
    return (
      <main
        className={`flex min-h-screen items-center justify-center ${
          darkMode
            ? "bg-[#0F1115] text-white"
            : "bg-[#F7F8FA] text-slate-800"
        }`}
      >
        <div className="text-center">
          <div className="mb-3 text-4xl">🧾</div>
          <p className="text-sm text-slate-500">
            Loading invoices...
          </p>
        </div>
      </main>
    );
  }

  if (authorized === false) {
    return (
      <main
        dir={language === "ar" ? "rtl" : "ltr"}
        className={`flex min-h-screen items-center justify-center px-6 ${
          darkMode
            ? "bg-[#0F1115] text-white"
            : "bg-[#F7F8FA] text-slate-800"
        }`}
      >
        <div
          className={`w-full max-w-md rounded-3xl border p-8 text-center shadow-sm ${
            darkMode
              ? "border-white/[0.06] bg-[#13161B]"
              : "border-slate-100 bg-white"
          }`}
        >
          <div className="mb-4 text-5xl">🔒</div>

          <h1 className="text-2xl font-bold">
            {language === "ar"
              ? "غير مصرح بالدخول"
              : "Access restricted"}
          </h1>

          <p className="mt-3 text-sm text-slate-500">
            {language === "ar"
              ? "لا تملك صلاحية عرض صفحة الفواتير. اطلب من مدير العيادة تفعيلها لحسابك."
              : "You do not have permission to view invoices. Ask your clinic admin to enable this page for your account."}
          </p>

          <button
            onClick={() => router.push("/dashboard")}
            className="mt-6 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {language === "ar"
              ? "العودة للرئيسية"
              : "Back to dashboard"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      dir={language === "ar" ? "rtl" : "ltr"}
      className={`min-h-screen transition-colors duration-300 ${
        darkMode
          ? "bg-[#0F1115] text-white"
          : "bg-[#F7F8FA] text-slate-800"
      }`}
    >
      <div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8 lg:px-10">
        <header className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <button
              onClick={() => router.push("/dashboard")}
              className="mb-3 text-sm font-medium text-slate-500 transition hover:text-blue-600"
            >
              ←{" "}
              {language === "ar"
                ? "الرئيسية"
                : "Dashboard"}
            </button>

            <h1 className="text-3xl font-black tracking-tight">
              {language === "ar"
                ? "الفواتير"
                : "Invoices"}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              {language === "ar"
                ? "إدارة الفواتير والمبيعات والمدفوعات"
                : "Manage invoices, sales and payments"}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setStatus((current) => current === "draft" ? "all" : "draft")}
              aria-label={language === "ar" ? "عرض مسودات الفواتير" : "Show invoice drafts"}
              aria-pressed={status === "draft"}
              title={language === "ar" ? "مسودات الفواتير" : "Invoice drafts"}
              className={`relative inline-flex h-12 w-12 items-center justify-center rounded-2xl border transition ${
                status === "draft"
                  ? "border-amber-400/50 bg-amber-500/15 text-amber-500"
                  : darkMode
                    ? "border-white/10 bg-[#171A20] text-slate-300 hover:bg-[#1D2129]"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 3.75h7l4.25 4.5v11A1.75 1.75 0 0 1 16.5 21h-9A1.75 1.75 0 0 1 5.75 19.25v-13.5A2 2 0 0 1 7.75 3.75Z" />
                <path d="M14 4v5h4M8.5 13h7M8.5 16.5h7" />
              </svg>
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-5 text-slate-950">{invoices.filter((invoice) => invoice.status === "draft").length}</span>
            </button>
            <button
              onClick={() => {
                setDarkMode((value) => !value);
              }}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                darkMode
                  ? "border-white/10 bg-[#171A20] hover:bg-[#1D2129]"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>

            <button
              onClick={() =>
                setLanguage((value) =>
                  value === "ar" ? "en" : "ar"
                )
              }
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                darkMode
                  ? "border-white/10 bg-[#171A20] hover:bg-[#1D2129]"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              {language === "ar"
                ? "English"
                : "عربي"}
            </button>

            {can("invoices", "create") && <button
              onClick={() => router.push("/invoices/new")}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700"
            >
              +{" "}
              {language === "ar"
                ? "فاتورة جديدة"
                : "New Invoice"}
            </button>}
          </div>
        </header>

        {message && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            {message}
          </div>
        )}

        <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div
            className={`rounded-3xl border p-5 ${
              darkMode
                ? "border-white/[0.06] bg-[#13161B]"
                : "border-slate-100 bg-white"
            }`}
          >
            <p className="text-sm text-slate-500">{language === "ar" ? "فواتير الفترة" : "Period invoices"}</p>
            <p className="mt-2 text-3xl font-black">{reportInvoices.length}</p>
          </div>

          <div
            className={`rounded-3xl border p-5 ${
              darkMode
                ? "border-white/[0.06] bg-[#13161B]"
                : "border-slate-100 bg-white"
            }`}
          >
            <p className="text-sm text-slate-500">{language === "ar" ? "إجمالي المبيعات" : "Total sales"}</p>
            <p className="mt-2 text-2xl font-black">{formatMoney(reportTotals.sales)} <span className="text-sm font-semibold text-slate-500">EGP</span></p>
          </div>

          <div className={`rounded-3xl border p-5 ${darkMode ? "border-white/[0.06] bg-[#13161B]" : "border-slate-100 bg-white"}`}>
            <p className="text-sm text-slate-500">{language === "ar" ? "إجمالي الربح التقديري" : "Estimated profit"}</p>
            <p className="mt-2 text-2xl font-black text-emerald-500">{can("financial_sensitive_data", "view") ? formatMoney(reportTotals.profit) : "••••••"} <span className="text-sm font-semibold text-slate-500">EGP</span></p>
          </div>

          <div className={`rounded-3xl border p-5 ${darkMode ? "border-white/[0.06] bg-[#13161B]" : "border-slate-100 bg-white"}`}>
            <p className="text-sm text-slate-500">{language === "ar" ? "إجمالي المدفوع" : "Total paid"}</p>
            <p className="mt-2 text-2xl font-black text-blue-500">{formatMoney(reportTotals.paid)} <span className="text-sm font-semibold text-slate-500">EGP</span></p>
          </div>

          <div className={`rounded-3xl border p-5 ${darkMode ? "border-white/[0.06] bg-[#13161B]" : "border-slate-100 bg-white"}`}>
            <p className="text-sm text-slate-500">{language === "ar" ? "إجمالي المتبقي" : "Total remaining"}</p>
            <p className="mt-2 text-2xl font-black text-amber-500">{formatMoney(reportTotals.remaining)} <span className="text-sm font-semibold text-slate-500">EGP</span></p>
          </div>
        </section>

        <section
          className={`mb-6 rounded-3xl border p-4 ${
            darkMode
              ? "border-white/[0.06] bg-[#13161B]"
              : "border-slate-100 bg-white"
          }`}
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_190px]">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400">
                🔎
              </span>

              <input
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                placeholder={
                  language === "ar"
                    ? "ابحث برقم الفاتورة أو العميل أو الحيوان..."
                    : "Search invoice number, client or pet..."
                }
                className={`w-full rounded-2xl border px-12 py-3.5 text-sm outline-none transition focus:border-blue-500 ${
                  darkMode
                    ? "border-white/[0.07] bg-[#0F1115] text-white placeholder:text-slate-600"
                    : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400"
                }`}
              />
            </div>

            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value)
              }
              className={`rounded-2xl border px-4 py-3.5 text-sm outline-none transition focus:border-blue-500 ${
                darkMode
                  ? "border-white/[0.07] bg-[#0F1115] text-white"
                  : "border-slate-200 bg-slate-50 text-slate-800"
              }`}
            >
              {statusOptions.map((item) => (
                <option
                  key={item.value}
                  value={item.value}
                >
                  {language === "ar"
                    ? item.ar
                    : item.en}
                </option>
              ))}
            </select>

            <label className="text-xs font-semibold text-slate-500">
              {language === "ar" ? "من تاريخ" : "From date"}
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(event) => setFromDate(event.target.value)}
                className={`mt-1 w-full rounded-2xl border px-4 py-3 text-sm font-normal outline-none transition focus:border-blue-500 ${darkMode ? "border-white/[0.07] bg-[#0F1115] text-white" : "border-slate-200 bg-slate-50 text-slate-800"}`}
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              {language === "ar" ? "إلى تاريخ" : "To date"}
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(event) => setToDate(event.target.value)}
                className={`mt-1 w-full rounded-2xl border px-4 py-3 text-sm font-normal outline-none transition focus:border-blue-500 ${darkMode ? "border-white/[0.07] bg-[#0F1115] text-white" : "border-slate-200 bg-slate-50 text-slate-800"}`}
              />
            </label>
          </div>
          {(fromDate || toDate) && <button type="button" onClick={() => { setFromDate(""); setToDate(""); }} className="mt-3 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">{language === "ar" ? "مسح الفترة" : "Clear date range"}</button>}
        </section>

        <section
          className={`overflow-hidden rounded-3xl border ${
            darkMode
              ? "border-white/[0.06] bg-[#13161B]"
              : "border-slate-100 bg-white"
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr
                  className={`border-b text-right text-xs font-semibold text-slate-500 ${
                    darkMode
                      ? "border-white/[0.06]"
                      : "border-slate-100"
                  }`}
                >
                  <th className="px-5 py-4">#</th>

                  <th className="px-5 py-4">
                    {language === "ar"
                      ? "العميل"
                      : "Client"}
                  </th>

                  <th className="px-5 py-4">
                    {language === "ar"
                      ? "الحيوان"
                      : "Pet"}
                  </th>

                  <th className="px-5 py-4">
                    {language === "ar"
                      ? "التاريخ"
                      : "Date"}
                  </th>

                  <th className="px-5 py-4">
                    {language === "ar"
                      ? "الحالة"
                      : "Status"}
                  </th>

                  <th className="px-5 py-4">
                    {language === "ar"
                      ? "الإجمالي"
                      : "Total"}
                  </th>

                  <th className="px-5 py-4">
                    {language === "ar"
                      ? "الإجراءات"
                      : "Actions"}
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredInvoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className={`border-b transition last:border-b-0 ${
                      darkMode
                        ? "border-white/[0.04] hover:bg-white/[0.02]"
                        : "border-slate-100 hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-5 py-5 font-bold">
                      INV-
                      {String(
                        invoice.invoice_number
                      ).padStart(6, "0")}
                    </td>

                    <td className="px-5 py-5 font-semibold">
                      {invoice.client?.name || "—"}
                    </td>

                    <td className="px-5 py-5 text-slate-500">
                      {invoice.pet?.name || "—"}
                    </td>

                    <td className="px-5 py-5 text-slate-500">
                      {formatDate(invoiceDateValue(invoice))}
                    </td>

                    <td className="px-5 py-5">
                      <span
                        className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${
                          statusStyle[
                            invoice.status
                          ] || statusStyle.draft
                        }`}
                      >
                        {statusLabel(
                          invoice.status
                        )}
                      </span>
                    </td>

                    <td className="px-5 py-5 font-bold">
                      {formatMoney(
                        Number(
                          invoice.total || 0
                        )
                      )}{" "}
                      EGP
                    </td>

                    <td className="px-5 py-5">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => router.push(`/invoices/${invoice.id}`)}
                          className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
                        >
                          {language === "ar" ? "فتح" : "Open"}
                        </button>
                        {invoice.status === "draft" && can("invoices", "edit") && <button
                          onClick={() => router.push(`/invoices/new?draft=${encodeURIComponent(invoice.id)}`)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                        >
                          {language === "ar" ? "تعديل" : "Edit"}
                        </button>}
                        {invoice.status === "draft" && can("invoices", "edit") && <button
                          disabled={draftActionId === invoice.id}
                          onClick={() => void issueDraft(invoice)}
                          className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {draftActionId === invoice.id ? "…" : language === "ar" ? "إصدار" : "Issue"}
                        </button>}
                        {invoice.status === "draft" && can("invoices", "delete") && <button
                          disabled={draftActionId === invoice.id}
                          onClick={() => void deleteDraft(invoice)}
                          className="rounded-xl border border-rose-300/40 px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                        >
                          {language === "ar" ? "حذف" : "Delete"}
                        </button>}
                      </div>
                    </td>
                  </tr>
                ))}

                {!filteredInvoices.length && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-16 text-center text-slate-500"
                    >
                      <div className="mb-3 text-4xl">
                        🧾
                      </div>

                      <p className="font-semibold">
                        {language === "ar"
                          ? "لا توجد فواتير مطابقة"
                          : "No matching invoices"}
                      </p>

                      <p className="mt-1 text-xs">
                        {language === "ar"
                          ? "ابدأ بإنشاء فاتورة جديدة."
                          : "Start by creating a new invoice."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
