"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Invoice = {
  id: string;
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

const statusOptions = [
  { value: "all", ar: "كل الحالات", en: "All statuses" },
  { value: "draft", ar: "مسودة", en: "Draft" },
  { value: "issued", ar: "صادرة", en: "Issued" },
  { value: "paid", ar: "مدفوعة", en: "Paid" },
  { value: "partially_paid", ar: "مدفوعة جزئيًا", en: "Partially paid" },
  { value: "unpaid", ar: "غير مدفوعة", en: "Unpaid" },
  { value: "partially_returned", ar: "مرتجع جزئي", en: "Partially returned" },
  { value: "returned", ar: "مرتجعة", en: "Returned" },
  { value: "cancelled", ar: "ملغاة", en: "Cancelled" },
];

const statusStyle: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  issued: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  partially_paid:
    "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  unpaid: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300",
  partially_returned:
    "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
  returned:
    "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300",
  cancelled: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
};

const statusLabel = (status: string) => {
  const item = statusOptions.find((x) => x.value === status);
  return item ? `${item.ar} / ${item.en}` : status;
};

export default function InvoicesPage() {
  const router = useRouter();

  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [darkMode, setDarkMode] = useState(true);
  const [ready, setReady] = useState(false);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    const savedTheme = localStorage.getItem("vetra-theme");
    const savedLanguage = localStorage.getItem("vetra-language");

    setDarkMode(savedTheme !== "light");
    setLanguage(savedLanguage === "en" ? "en" : "ar");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;

    localStorage.setItem("vetra-theme", darkMode ? "dark" : "light");
    localStorage.setItem("vetra-language", language);
  }, [darkMode, language, ready]);

  async function checkAdminAndLoad() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      setAuthorized(false);
      setLoading(false);
      return;
    }

    setAuthorized(true);

    const { data, error } = await supabase
      .from("invoices")
      .select(`
        id,
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
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setMessage(error.message || "حصل خطأ أثناء تحميل الفواتير");
      setInvoices([]);
    } else {
      setInvoices((data || []) as unknown as Invoice[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (ready) {
      checkAdminAndLoad();
    }
  }, [ready]);

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const matchesStatus = status === "all" || invoice.status === status;

      const numberText = String(invoice.invoice_number);
      const clientName = invoice.client?.name?.toLowerCase() || "";
      const petName = invoice.pet?.name?.toLowerCase() || "";

      const matchesSearch =
        !query ||
        numberText.includes(query) ||
        clientName.includes(query) ||
        petName.includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [invoices, search, status]);

  const totalVisible = filteredInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total || 0),
    0
  );

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("en-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const formatDate = (value: string) =>
    new Date(value).toLocaleString(language === "ar" ? "ar-EG" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  if (!ready || loading) {
    return (
      <main
        className={`flex min-h-screen items-center justify-center ${
          darkMode ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"
        }`}
      >
        <div className="text-center">
          <div className="mb-3 text-4xl">🧾</div>
          <p className="text-sm text-slate-500">Loading invoices...</p>
        </div>
      </main>
    );
  }

  if (authorized === false) {
    return (
      <main
        dir={language === "ar" ? "rtl" : "ltr"}
        className={`flex min-h-screen items-center justify-center px-6 ${
          darkMode ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"
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
            {language === "ar" ? "غير مصرح بالدخول" : "Access restricted"}
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            {language === "ar"
              ? "الفواتير والبيانات المالية متاحة للـ Admin فقط."
              : "Invoices and financial data are available to Admin users only."}
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {language === "ar" ? "العودة للرئيسية" : "Back to dashboard"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      dir={language === "ar" ? "rtl" : "ltr"}
      className={`min-h-screen transition-colors duration-300 ${
        darkMode ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"
      }`}
    >
      <div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8 lg:px-10">
        <header className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <button
              onClick={() => router.push("/")}
              className="mb-3 text-sm font-medium text-slate-500 transition hover:text-blue-600"
            >
              ← {language === "ar" ? "الرئيسية" : "Dashboard"}
            </button>

            <h1 className="text-3xl font-black tracking-tight">
              {language === "ar" ? "الفواتير" : "Invoices"}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              {language === "ar"
                ? "إدارة الفواتير والمبيعات والمدفوعات"
                : "Manage invoices, sales and payments"}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
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
              onClick={() => setLanguage((value) => (value === "ar" ? "en" : "ar"))}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                darkMode
                  ? "border-white/10 bg-[#171A20] hover:bg-[#1D2129]"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              {language === "ar" ? "English" : "عربي"}
            </button>

            <button
              onClick={() => router.push("/invoices/new")}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700"
            >
              + {language === "ar" ? "فاتورة جديدة" : "New Invoice"}
            </button>
          </div>
        </header>

        {message && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            {message}
          </div>
        )}

        <section className="mb-6 grid gap-4 sm:grid-cols-2">
          <div
            className={`rounded-3xl border p-5 ${
              darkMode
                ? "border-white/[0.06] bg-[#13161B]"
                : "border-slate-100 bg-white"
            }`}
          >
            <p className="text-sm text-slate-500">
              {language === "ar" ? "الفواتير الظاهرة" : "Visible invoices"}
            </p>
            <p className="mt-2 text-3xl font-black">
              {filteredInvoices.length}
            </p>
          </div>

          <div
            className={`rounded-3xl border p-5 ${
              darkMode
                ? "border-white/[0.06] bg-[#13161B]"
                : "border-slate-100 bg-white"
            }`}
          >
            <p className="text-sm text-slate-500">
              {language === "ar" ? "إجمالي الظاهر" : "Visible total"}
            </p>
            <p className="mt-2 text-3xl font-black">
              {formatMoney(totalVisible)}{" "}
              <span className="text-base font-semibold text-slate-500">EGP</span>
            </p>
          </div>
        </section>

        <section
          className={`mb-6 rounded-3xl border p-4 ${
            darkMode
              ? "border-white/[0.06] bg-[#13161B]"
              : "border-slate-100 bg-white"
          }`}
        >
          <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400">
                🔎
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
              onChange={(e) => setStatus(e.target.value)}
              className={`rounded-2xl border px-4 py-3.5 text-sm outline-none transition focus:border-blue-500 ${
                darkMode
                  ? "border-white/[0.07] bg-[#0F1115] text-white"
                  : "border-slate-200 bg-slate-50 text-slate-800"
              }`}
            >
              {statusOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {language === "ar" ? item.ar : item.en}
                </option>
              ))}
            </select>
          </div>
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
                    darkMode ? "border-white/[0.06]" : "border-slate-100"
                  }`}
                >
                  <th className="px-5 py-4">#</th>
                  <th className="px-5 py-4">
                    {language === "ar" ? "العميل" : "Client"}
                  </th>
                  <th className="px-5 py-4">
                    {language === "ar" ? "الحيوان" : "Pet"}
                  </th>
                  <th className="px-5 py-4">
                    {language === "ar" ? "التاريخ" : "Date"}
                  </th>
                  <th className="px-5 py-4">
                    {language === "ar" ? "الحالة" : "Status"}
                  </th>
                  <th className="px-5 py-4">
                    {language === "ar" ? "الإجمالي" : "Total"}
                  </th>
                  <th className="px-5 py-4">
                    {language === "ar" ? "فتح" : "Open"}
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
                      INV-{String(invoice.invoice_number).padStart(6, "0")}
                    </td>

                    <td className="px-5 py-5 font-semibold">
                      {invoice.client?.name || "—"}
                    </td>

                    <td className="px-5 py-5 text-slate-500">
                      {invoice.pet?.name || "—"}
                    </td>

                    <td className="px-5 py-5 text-slate-500">
                      {formatDate(invoice.created_at)}
                    </td>

                    <td className="px-5 py-5">
                      <span
                        className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${
                          statusStyle[invoice.status] || statusStyle.draft
                        }`}
                      >
                        {statusLabel(invoice.status)}
                      </span>
                    </td>

                    <td className="px-5 py-5 font-bold">
                      {formatMoney(Number(invoice.total || 0))} EGP
                    </td>

                    <td className="px-5 py-5">
                      <button
                        onClick={() => router.push(`/invoices/${invoice.id}`)}
                        className="rounded-xl bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
                      >
                        {language === "ar" ? "فتح" : "Open"}
                      </button>
                    </td>
                  </tr>
                ))}

                {!filteredInvoices.length && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-16 text-center text-slate-500"
                    >
                      <div className="mb-3 text-4xl">🧾</div>
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
