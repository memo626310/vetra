"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";
import { getClinicDb, getClinicContext } from "@/lib/clinic-db";
import { writeVetraThemeMode } from "@/lib/theme";
import { useStaffPermissions } from "@/lib/use-staff-permissions";

type Lang = "ar" | "en";
type Account = {
  id: string;
  clinic_id: string;
  name: string;
  account_type: "cash" | "bank" | "wallet" | "card" | "other";
  requires_session: boolean;
  current_balance: number;
  is_active: boolean;
  is_default: boolean;
};
type Invoice = {
  id: string;
  client_id: string | null;
  invoice_number: number;
  status: string;
  total: number | null;
  paid_amount: number | null;
  payment_method: string | null;
  issued_at: string | null;
  created_at: string;
  client?: { name?: string; phone?: string | null } | null;
};
type CustomerBalance = {
  key: string;
  clientId: string | null;
  name: string;
  phone: string | null;
  due: number;
  credit: number;
  invoices: Invoice[];
};
type ClientCredit = {
  id: string;
  client_id: string;
  invoice_id: string | null;
  direction: "credit" | "debit";
  amount: number;
  description: string | null;
  created_at: string;
  client?: { name?: string; phone?: string | null } | null;
};
type Transaction = {
  id: string;
  account_id: string;
  direction: "in" | "out";
  transaction_type: string;
  amount: number;
  description: string;
  category: string | null;
  payment_method: string | null;
  transaction_at: string;
  reference: string | null;
  counterparty_name: string | null;
  related_invoice_id: string | null;
};

const cashName: Record<string, { ar: string; en: string }> = {
  cash: { ar: "نقدي / خزنة", en: "Cash register" },
  bank: { ar: "بنك", en: "Bank" },
  wallet: { ar: "محفظة إلكترونية", en: "E-wallet" },
  card: { ar: "بطاقات", en: "Card payments" },
  other: { ar: "أخرى", en: "Other" },
};

const transactionName: Record<string, { ar: string; en: string }> = {
  invoice_payment: { ar: "تحصيل فاتورة", en: "Invoice payment" },
  income: { ar: "إيراد", en: "Income" },
  expense: { ar: "مصروف", en: "Expense" },
  supplier_payment: { ar: "دفع لمورد", en: "Supplier payment" },
  refund: { ar: "رد مبلغ لعميل", en: "Refund" },
  transfer_in: { ar: "تحويل وارد", en: "Transfer in" },
  transfer_out: { ar: "تحويل صادر", en: "Transfer out" },
  adjustment: { ar: "تسوية", en: "Adjustment" },
};

function money(value: number | null | undefined, lang: Lang = "ar") {
  return `${new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))} ج.م`;
}
function dateText(value: string | null | undefined, lang: Lang = "ar") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
function sameLocalDay(value: string | null | undefined, now: Date) {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export default function FinancePage() {
  const router = useRouter();
  const { can, loaded: permissionsLoaded } = useStaffPermissions();
  const [lang, setLang] = useState<Lang>("ar");
  const [dark, setDark] = useState(true);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingPayment, setSavingPayment] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clientCredits, setClientCredits] = useState<ClientCredit[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [customerPayKey, setCustomerPayKey] = useState("");
  const [customerPayAmount, setCustomerPayAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "collections" | "accounts" | "activity">("overview");

  const isAr = lang === "ar";
  const activeInvoices = useMemo(() => invoices.filter((x) =>
    !["draft", "cancelled", "returned"].includes(x.status)
  ), [invoices]);
  const receivableInvoices = useMemo(() => activeInvoices.filter((x) =>
    Number(x.total || 0) - Number(x.paid_amount || 0) > 0.009
  ), [activeInvoices]);
  const customerBalances = useMemo<CustomerBalance[]>(() => {
    const grouped = new Map<string, CustomerBalance>();
    for (const invoice of receivableInvoices) {
      const name = invoice.client?.name || (isAr ? "عميل غير محدد" : "Unknown client");
      const phone = invoice.client?.phone || null;
      const key = invoice.client_id || `${name}|${phone || ""}`;
      const current = grouped.get(key) || { key, clientId: invoice.client_id, name, phone, due: 0, credit: 0, invoices: [] };
      current.due += Math.max(Number(invoice.total || 0) - Number(invoice.paid_amount || 0), 0);
      current.invoices.push(invoice);
      grouped.set(key, current);
    }
    for (const credit of clientCredits) {
      const name = credit.client?.name || (isAr ? "عميل غير محدد" : "Unknown client");
      const phone = credit.client?.phone || null;
      const key = credit.client_id || `${name}|${phone || ""}`;
      const current = grouped.get(key) || { key, clientId: credit.client_id, name, phone, due: 0, credit: 0, invoices: [] };
      current.credit += credit.direction === "credit" ? Number(credit.amount || 0) : -Number(credit.amount || 0);
      grouped.set(key, current);
    }
    return [...grouped.values()]
      .filter((customer) => customer.due > 0.009 || customer.credit > 0.009)
      .sort((a, b) => (b.due - a.due) || (b.credit - a.credit));
  }, [receivableInvoices, clientCredits, isAr]);
  const selectedInvoice = receivableInvoices.find((x) => x.id === invoiceId) || null;
  const selectedAccount = accounts.find((x) => x.id === accountId) || null;
  const today = new Date();
  const dailySales = activeInvoices.filter((x) => sameLocalDay(x.issued_at || x.created_at, today))
    .reduce((sum, x) => sum + Number(x.total || 0), 0);
  const dailyCollections = transactions.filter((x) =>
    x.direction === "in" && ["invoice_payment", "income"].includes(x.transaction_type) && sameLocalDay(x.transaction_at, today)
  ).reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const outstanding = activeInvoices.reduce((sum, x) =>
    sum + Math.max(Number(x.total || 0) - Number(x.paid_amount || 0), 0), 0);
  const balances = accounts.reduce((sum, x) => sum + Number(x.current_balance || 0), 0);
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() - 30);
  const last30Sales = activeInvoices.filter((x) => new Date(x.issued_at || x.created_at).getTime() >= thirtyDays.getTime())
    .reduce((sum, x) => sum + Number(x.total || 0), 0);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("vetra-language");
    const savedTheme = window.localStorage.getItem("vetra-theme");
    setLang(savedLanguage === "en" ? "en" : "ar");
    setDark(savedTheme !== "light");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dir = isAr ? "rtl" : "ltr";
    document.documentElement.lang = isAr ? "ar" : "en";
    document.documentElement.classList.toggle("dark", dark);
    window.localStorage.setItem("vetra-language", lang);
    writeVetraThemeMode(dark);
  }, [ready, lang, isAr, dark]);

  const loadData = useCallback(async () => {
    if (!permissionsLoaded) return;

    setLoading(true);
    setError("");
    try {
      const { data: { user } } = await vetraCore.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const context = await getClinicContext();

      // Check permissions: owner/admin OR staff with finance.view permission
      if (!["owner", "admin"].includes(context.role) && !can("finance_page", "view")) {
        setAuthorized(false);
        return;
      }

      setAuthorized(true);
      const db = await getClinicDb();
      const [accountResult, invoiceResult, transactionResult, creditResult] = await Promise.all([
        db.from("financial_account_balances")
          .select("id,clinic_id,name,account_type,requires_session,current_balance,is_active,is_default")
          .eq("clinic_id", context.clinic_id).eq("is_active", true).order("name"),
        db.from("invoices")
          .select("id,client_id,invoice_number,status,total,paid_amount,payment_method,issued_at,created_at,client:clients(name,phone)")
          .eq("clinic_id", context.clinic_id).order("created_at", { ascending: false }).limit(2000),
        db.from("financial_transactions")
          .select("id,account_id,direction,transaction_type,amount,description,category,payment_method,transaction_at,reference,counterparty_name,related_invoice_id")
          .eq("clinic_id", context.clinic_id).order("transaction_at", { ascending: false }).limit(200),
        db.from("client_credit_ledger")
          .select("id,client_id,invoice_id,direction,amount,description,created_at,client:clients(name,phone)")
          .eq("clinic_id", context.clinic_id).order("created_at", { ascending: false }).limit(2000),
      ]);
      if (accountResult.error) throw new Error(`${isAr ? "تعذر تحميل الخزن" : "Could not load accounts"}: ${accountResult.error.message}`);
      if (invoiceResult.error) throw new Error(`${isAr ? "تعذر تحميل الفواتير" : "Could not load invoices"}: ${invoiceResult.error.message}`);
      if (transactionResult.error) throw new Error(`${isAr ? "تعذر تحميل حركة الخزنة" : "Could not load transactions"}: ${transactionResult.error.message}`);
      if (creditResult.error && !/relation .*client_credit_ledger.*does not exist|client_credit_ledger.*not found/i.test(creditResult.error.message)) {
        throw new Error(`${isAr ? "تعذر تحميل أرصدة العملاء" : "Could not load customer credits"}: ${creditResult.error.message}`);
      }
      const accountRows = (accountResult.data || []) as Account[];
      const invoiceRows = (invoiceResult.data || []) as unknown as Invoice[];
      setAccounts(accountRows);
      setInvoices(invoiceRows);
      setTransactions((transactionResult.data || []) as Transaction[]);
      setClientCredits((creditResult.error ? [] : (creditResult.data || [])) as ClientCredit[]);
      const defaultAccount = accountRows.find((a) => a.account_type === "cash" && a.is_default) || accountRows[0];
      setAccountId((current) => current && accountRows.some((a) => a.id === current) ? current : defaultAccount?.id || "");
      const due = invoiceRows.find((i) => !["draft", "cancelled", "returned"].includes(i.status) && Number(i.total || 0) > Number(i.paid_amount || 0));
      setInvoiceId((current) => current && invoiceRows.some((i) => i.id === current) ? current : due?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finance data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [router, isAr, permissionsLoaded, can]);

  useEffect(() => {
    if (ready && permissionsLoaded) void loadData();
  }, [ready, permissionsLoaded, loadData]);

  useEffect(() => {
    if (!selectedAccount) return;
    const typeToMethod: Record<Account["account_type"], string> = {
      cash: "cash", bank: "bank_transfer", wallet: "wallet", card: "card", other: "other",
    };
    setMethod(typeToMethod[selectedAccount.account_type]);
  }, [accountId, selectedAccount]);

  async function ensureCashRegisterOpen(selectedAccountId: string) {
    const account = accounts.find((item) => item.id === selectedAccountId);
    if (!account?.requires_session) return;
    const db = await getClinicDb();
    const { error: sessionError } = await db.rpc("vetra_ensure_cash_register_open", {
      p_account_id: selectedAccountId,
    });
    if (sessionError) throw sessionError;
  }

  async function recordPayment() {
    if (!can("payments", "create")) {
      setError(isAr ? "لا تملك صلاحية تسجيل التحصيل." : "You do not have permission to record payments.");
      return;
    }
    setError("");
    setNotice("");
    if (!invoiceId || !accountId || !selectedInvoice) {
      setError(isAr ? "اختار الفاتورة والحساب المالي." : "Choose an invoice and account.");
      return;
    }
    const value = Number(amount);
    const remaining = Math.max(Number(selectedInvoice.total || 0) - Number(selectedInvoice.paid_amount || 0), 0);
    if (!Number.isFinite(value) || value <= 0 || value > remaining + 0.001) {
      setError(isAr ? `اكتب مبلغًا صحيحًا لا يتجاوز المتبقي (${money(remaining, lang)}).` : `Enter a valid amount up to the remaining ${money(remaining, lang)}.`);
      return;
    }
    setSavingPayment(true);
    try {
      await ensureCashRegisterOpen(accountId);
      const db = await getClinicDb();
      const { error: paymentError } = await db.rpc("vetra_record_invoice_payment", {
        p_invoice_id: invoiceId,
        p_account_id: accountId,
        p_amount: value,
        p_payment_method: method,
        p_reference: reference.trim() || null,
        p_notes: notes.trim() || null,
        p_session_id: null,
        p_idempotency_key: crypto.randomUUID(),
      });
      if (paymentError) throw paymentError;
      setNotice(isAr ? "تم تسجيل التحصيل وربطه بالفاتورة والخزنة." : "Payment recorded and linked to the invoice and account.");
      setShowPayment(false);
      setAmount("");
      setReference("");
      setNotes("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isAr ? "تعذر تسجيل التحصيل." : "Could not record payment."));
    } finally {
      setSavingPayment(false);
    }
  }

  function openCustomerPayment(customer: CustomerBalance, payAll: boolean) {
    setCustomerPayKey(customer.key);
    setCustomerPayAmount(payAll ? customer.due.toFixed(2) : "");
    setError("");
    setNotice("");
  }

  async function recordCustomerPayment(customer: CustomerBalance) {
    if (!can("payments", "create")) {
      setError(isAr ? "لا تملك صلاحية تسجيل التحصيل." : "You do not have permission to record payments.");
      return;
    }
    setError("");
    setNotice("");
    const value = Number(customerPayAmount);
    if (!accountId) {
      setError(isAr ? "اختار الحساب المالي أولًا." : "Choose a financial account first.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0 || value > customer.due + 0.001) {
      setError(isAr ? `اكتب مبلغًا صحيحًا لا يتجاوز إجمالي المستحق ${money(customer.due, lang)}.` : `Enter a valid amount up to the total due of ${money(customer.due, lang)}.`);
      return;
    }

    setSavingPayment(true);
    let applied = 0;
    try {
      await ensureCashRegisterOpen(accountId);
      const db = await getClinicDb();
      let remaining = Math.round(value * 100) / 100;
      const oldestFirst = [...customer.invoices].sort((a, b) => new Date(a.issued_at || a.created_at).getTime() - new Date(b.issued_at || b.created_at).getTime());

      for (const invoice of oldestFirst) {
        if (remaining < 0.01) break;
        const due = Math.max(Number(invoice.total || 0) - Number(invoice.paid_amount || 0), 0);
        const installment = Math.min(remaining, Math.round(due * 100) / 100);
        if (installment < 0.01) continue;

        const { error: paymentError } = await db.rpc("vetra_record_invoice_payment", {
          p_invoice_id: invoice.id,
          p_account_id: accountId,
          p_amount: installment,
          p_payment_method: method,
          p_reference: reference.trim() || null,
          p_notes: notes.trim() || (isAr ? "تحصيل مجمّع من مستحقات العميل" : "Bulk collection from customer balances"),
          p_session_id: null,
          p_idempotency_key: crypto.randomUUID(),
        });
        if (paymentError) throw paymentError;
        applied += installment;
        remaining = Math.round((remaining - installment) * 100) / 100;
      }

      setCustomerPayKey("");
      setCustomerPayAmount("");
      setReference("");
      setNotes("");
      setNotice(isAr ? `تم توزيع وتسجيل ${money(applied, lang)} على فواتير العميل.` : `${money(applied, lang)} was allocated across the customer's invoices.`);
      await loadData();
    } catch (err) {
      setError(applied > 0
        ? (isAr ? `تم تسجيل ${money(applied, lang)} قبل حدوث خطأ. حدّثنا البيانات؛ راجع الرصيد المتبقي قبل إعادة المحاولة.` : `${money(applied, lang)} was recorded before an error. Data has been refreshed; review the remaining balance before retrying.`)
        : err instanceof Error ? err.message : (isAr ? "تعذر تسجيل التحصيل المجمع." : "Could not record the bulk collection."));
      if (applied > 0) await loadData();
    } finally {
      setSavingPayment(false);
    }
  }

  const cardClass = `rounded-3xl border p-5 ${dark ? "border-white/[0.07] bg-[#13161B]" : "border-slate-100 bg-white shadow-sm"}`;
  const inputClass = `w-full rounded-xl border px-3 py-3 outline-none focus:border-blue-500 ${dark ? "border-white/10 bg-[#0F1115] text-white" : "border-slate-200 bg-slate-50 text-slate-900"}`;

  if (!ready || !permissionsLoaded || loading) return <main className={`flex min-h-screen items-center justify-center ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}><p>{isAr ? "جارٍ تحميل المالية..." : "Loading finance..."}</p></main>;
  if (authorized === false) return <main dir={isAr ? "rtl" : "ltr"} className={`flex min-h-screen items-center justify-center p-6 ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}><div className={cardClass}><h1 className="text-2xl font-black">{isAr ? "غير مصرح بالدخول" : "Access restricted"}</h1><p className="mt-3 text-sm text-slate-500">{isAr ? "إدارة المالية متاحة للمالك ومدير العيادة فقط." : "Finance is available to the clinic owner and admin only."}</p></div></main>;

  return (
    <main dir={isAr ? "rtl" : "ltr"} className={`min-h-screen ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}>
      <div className="mx-auto max-w-[1500px] space-y-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold text-blue-500">VETRA / FINANCE</p>
            <h1 className="text-3xl font-black">{isAr ? "المالية والمبيعات" : "Finance & Sales"}</h1>
            <p className="mt-2 text-sm text-slate-500">{isAr ? "المبيعات والتحصيل وأرصدة الخزن في شاشة واحدة." : "Sales, collections and account balances in one place."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setDark((v) => !v)} className={`rounded-xl border px-3 py-2 ${dark ? "border-white/10 bg-[#171A20]" : "border-slate-200 bg-white"}`}>{dark ? "☀️" : "🌙"}</button>
            <button onClick={() => setLang((v) => v === "ar" ? "en" : "ar")} className={`rounded-xl border px-3 py-2 ${dark ? "border-white/10 bg-[#171A20]" : "border-slate-200 bg-white"}`}>{isAr ? "English" : "عربي"}</button>
            {can("payments", "view") && <button onClick={() => router.push("/cash-register")} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white">{isAr ? "الخزن وحركة النقدية" : "Cash registers"}</button>}
            <button onClick={() => router.push("/invoices/new")} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">+ {isAr ? "فاتورة بيع" : "New sale"}</button>
            <button onClick={() => router.push("/invoices")} className={`rounded-xl border px-4 py-3 text-sm font-bold ${dark ? "border-white/10" : "border-slate-200 bg-white"}`}>{isAr ? "كل الفواتير" : "All invoices"}</button>
          </div>
        </header>

        {error && <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</div>}
        {notice && <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">{notice}</div>}

        {activeTab === "overview" && <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm leading-7 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          <strong>{isAr ? "ملاحظة على التحصيلات القديمة: " : "Legacy payments: "}</strong>
          {isAr ? "المدفوع المسجل داخل الفواتير القديمة يظل ظاهرًا كمدفوع/متبقي، لكنه لن يُنشئ حركة خزنة بأثر رجعي تلقائيًا حتى لا نكرر التحصيل. الحركات الجديدة فقط تُسجل في دفتر الخزنة من تاريخ تفعيل هذا التحديث." : "Amounts stored on existing invoices remain visible as paid/outstanding, but they are not automatically replayed into the cash ledger. This avoids duplicating collections; new receipts are posted to the ledger from this update onward."}
        </div>}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className={cardClass}><p className="text-sm text-slate-500">{isAr ? "مبيعات اليوم" : "Today's sales"}</p><p className="mt-3 text-2xl font-black">{money(dailySales, lang)}</p><p className="mt-2 text-xs text-slate-500">{isAr ? "الفواتير الصادرة غير الملغاة" : "Issued, non-cancelled invoices"}</p></div>
          <div className={cardClass}><p className="text-sm text-slate-500">{isAr ? "تحصيلات اليوم المسجلة" : "Today's ledger collections"}</p><p className="mt-3 text-2xl font-black text-emerald-500">{money(dailyCollections, lang)}</p><p className="mt-2 text-xs text-slate-500">{isAr ? "حركة مالية فعلية مسجلة" : "Posted incoming movements"}</p></div>
          <div className={cardClass}><p className="text-sm text-slate-500">{isAr ? "المتبقي على العملاء" : "Customer balances due"}</p><p className="mt-3 text-2xl font-black text-amber-500">{money(outstanding, lang)}</p><p className="mt-2 text-xs text-slate-500">{isAr ? "من الفواتير النشطة" : "From active invoices"}</p></div>
          <div className={cardClass}><p className="text-sm text-slate-500">{isAr ? "أرصدة الحسابات المالية" : "Financial account balances"}</p><p className="mt-3 text-2xl font-black">{money(balances, lang)}</p><p className="mt-2 text-xs text-slate-500">{isAr ? "الرصيد الافتتاحي + الحركات المسجلة" : "Opening balances + posted movements"}</p></div>
        </section>

        <nav className={`flex flex-wrap gap-2 rounded-2xl border p-2 ${dark ? "border-white/[0.07] bg-[#13161B]" : "border-slate-100 bg-white shadow-sm"}`} aria-label={isAr ? "أقسام المالية" : "Finance sections"}>
          {([
            ["overview", isAr ? "نظرة عامة" : "Overview"],
            ["collections", isAr ? "تحصيل العملاء" : "Customer collections"],
            ["accounts", isAr ? "الحسابات والخزن" : "Accounts & registers"],
            ["activity", isAr ? "حركة الحسابات" : "Account activity"],
          ] as const).map(([tab, label]) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${activeTab === tab ? "bg-blue-600 text-white" : dark ? "text-slate-400 hover:bg-white/5 hover:text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
              {label}
            </button>
          ))}
        </nav>

        {activeTab === "overview" && <section className={`${cardClass} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
          <div><h2 className="text-lg font-black">{isAr ? "مبيعات آخر 30 يومًا" : "Sales over the last 30 days"}</h2><p className="mt-1 text-sm text-slate-500">{isAr ? "قيمة الفواتير الصادرة، وليست صافي الربح." : "Issued invoice value, not net profit."}</p></div><p className="text-2xl font-black text-blue-500">{money(last30Sales, lang)}</p>
        </section>}

        {activeTab === "overview" && <section className={`${cardClass} flex flex-wrap gap-3`}>
          {can("payments", "create") && <button type="button" onClick={() => { setActiveTab("collections"); setShowPayment(true); }} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white">{isAr ? "تحصيل دفعة من عميل" : "Collect customer payment"}</button>}
          {can("payments", "create") && <button type="button" onClick={() => router.push("/cash-register")} className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white">{isAr ? "تسجيل مصروف أو مقبوض" : "Record expense or income"}</button>}
          <button type="button" onClick={() => router.push("/invoices/new")} className={`rounded-xl border px-4 py-3 text-sm font-bold ${dark ? "border-white/10" : "border-slate-200 bg-white"}`}>{isAr ? "إنشاء فاتورة بيع" : "Create sales invoice"}</button>
          <button type="button" onClick={() => router.push("/inventory/purchases")} className={`rounded-xl border px-4 py-3 text-sm font-bold ${dark ? "border-white/10" : "border-slate-200 bg-white"}`}>{isAr ? "مشتريات المخزون" : "Inventory purchases"}</button>
        </section>}

        {(activeTab === "accounts" || activeTab === "collections") && <section className={`grid gap-6 ${activeTab === "accounts" ? "" : "xl:grid-cols-1"}`}>
          {activeTab === "accounts" && <div className={cardClass}>
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">{isAr ? "الحسابات والخزن" : "Accounts & registers"}</h2><p className="mt-1 text-sm text-slate-500">{isAr ? "الرصيد الحالي محسوب من سجل الحركات." : "Current balances are calculated from the movement ledger."}</p></div>{can("payments", "view") && <button onClick={() => router.push("/cash-register")} className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white">{isAr ? "إدارة" : "Manage"}</button>}</div>
            <div className="mt-5 space-y-3">
              {accounts.map((account) => <div key={account.id} className={`flex items-center justify-between gap-3 rounded-2xl border p-4 ${dark ? "border-white/[0.06] bg-[#0F1115]" : "border-slate-100 bg-slate-50"}`}><div><p className="font-bold">{account.name}</p><p className="mt-1 text-xs text-slate-500">{cashName[account.account_type]?.[isAr ? "ar" : "en"] || account.account_type}{account.requires_session ? ` · ${isAr ? "وردية خزنة" : "Register sessions"}` : ""}</p></div><p className="text-left font-black">{money(account.current_balance, lang)}</p></div>)}
              {!accounts.length && <p className="rounded-xl border border-dashed p-5 text-sm text-slate-500">{isAr ? "لا توجد حسابات مالية. افتح إدارة الخزن لإنشاء الحسابات الافتراضية." : "No financial accounts yet. Open cash register management to create accounts."}</p>}
            </div>
          </div>}

          {activeTab === "collections" && <div className={cardClass}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-xl font-black">{isAr ? "تحصيل من فاتورة" : "Collect an invoice payment"}</h2><p className="mt-1 text-sm text-slate-500">{isAr ? "يدوّن التحصيل ويحدّث المتبقي على الفاتورة داخل معاملة واحدة." : "Posts the receipt and updates the invoice balance atomically."}</p></div>{can("payments", "create") && <button onClick={() => { setShowPayment((v) => !v); setError(""); }} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white">{showPayment ? (isAr ? "إغلاق" : "Close") : (isAr ? "+ تسجيل تحصيل" : "+ Record receipt")}</button>}</div>
            {showPayment && <div className="mt-5 space-y-4">
              <div><label className="mb-2 block text-sm font-semibold">{isAr ? "الفاتورة والعميل" : "Invoice & client"}</label><select value={invoiceId} onChange={(e) => { setInvoiceId(e.target.value); setAmount(""); }} className={inputClass}><option value="">{isAr ? "اختار الفاتورة" : "Select invoice"}</option>{receivableInvoices.map((x) => <option key={x.id} value={x.id}>#{x.invoice_number} · {x.client?.name || (isAr ? "عميل غير محدد" : "Unknown client")} · {isAr ? "متبقي" : "Due"} {money(Math.max(Number(x.total || 0) - Number(x.paid_amount || 0), 0), lang)}</option>)}</select></div>
              {selectedInvoice && <div className={`rounded-xl p-3 text-sm ${dark ? "bg-[#0F1115]" : "bg-slate-50"}`}><div className="flex justify-between"><span>{isAr ? "إجمالي الفاتورة" : "Invoice total"}</span><strong>{money(selectedInvoice.total, lang)}</strong></div><div className="mt-2 flex justify-between"><span>{isAr ? "المدفوع سابقًا" : "Previously paid"}</span><strong>{money(selectedInvoice.paid_amount, lang)}</strong></div><div className="mt-2 flex justify-between"><span>{isAr ? "المتبقي" : "Remaining"}</span><strong className="text-amber-500">{money(Math.max(Number(selectedInvoice.total || 0) - Number(selectedInvoice.paid_amount || 0), 0), lang)}</strong></div></div>}
              <div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-semibold">{isAr ? "الحساب المالي" : "Financial account"}</label><select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}><option value="">{isAr ? "اختار الحساب" : "Select account"}</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div><div><label className="mb-2 block text-sm font-semibold">{isAr ? "المبلغ المحصل" : "Amount received"}</label><input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0.00" /></div></div>
              <div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-semibold">{isAr ? "طريقة الدفع" : "Payment method"}</label><select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}><option value="cash">{isAr ? "نقدي" : "Cash"}</option><option value="bank_transfer">{isAr ? "تحويل بنكي" : "Bank transfer"}</option><option value="wallet">{isAr ? "محفظة" : "Wallet"}</option><option value="card">{isAr ? "بطاقة" : "Card"}</option><option value="other">{isAr ? "أخرى" : "Other"}</option></select></div><div><label className="mb-2 block text-sm font-semibold">{isAr ? "رقم مرجعي (اختياري)" : "Reference (optional)"}</label><input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} /></div></div>
              <div><label className="mb-2 block text-sm font-semibold">{isAr ? "ملاحظات (اختياري)" : "Notes (optional)"}</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></div>
              {selectedAccount?.requires_session && <p className="text-xs text-emerald-500">{isAr ? "لو الوردية مقفولة، هتتفتح تلقائيًا عند التحصيل." : "If the register is closed, it will open automatically when collecting payment."}</p>}
              <button onClick={recordPayment} disabled={savingPayment || !invoiceId || !accountId || !amount} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:opacity-50">{savingPayment ? (isAr ? "جارٍ التسجيل..." : "Recording...") : (isAr ? "تأكيد التحصيل" : "Confirm receipt")}</button>
            </div>}
          </div>}
        </section>
        }

        {activeTab === "collections" && <section className={cardClass}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-xl font-black">{isAr ? "مستحقات العملاء" : "Customer balances due"}</h2><p className="mt-1 text-sm text-slate-500">{isAr ? "الفواتير التي عليها مبالغ متبقية، مع تحصيل جزئي أو كامل." : "Bills with outstanding amounts, ready for partial or full collection."}</p></div>
            <p className="text-lg font-black text-amber-500">{money(outstanding, lang)}</p>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {customerBalances.map((customer) => (
              <div key={customer.key} className={`rounded-2xl border p-4 ${dark ? "border-white/[0.06] bg-[#0F1115]" : "border-slate-100 bg-slate-50"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-black">{customer.name}</p>{customer.phone && <p dir="ltr" className="mt-1 text-xs text-slate-500">{customer.phone}</p>}<p className="mt-1 text-xs text-slate-500">{customer.invoices.length} {isAr ? "فواتير مستحقة" : "invoices due"}</p></div><div className="flex flex-wrap items-center gap-2 sm:justify-end">{customer.due > 0.009 && <><p className="ml-2 font-black text-amber-500">{isAr ? "عليه " : "Due "}{money(customer.due, lang)}</p><button type="button" onClick={() => openCustomerPayment(customer, false)} disabled={savingPayment} className="rounded-lg border border-amber-400/40 px-3 py-2 text-xs font-bold text-amber-500">{isAr ? "دفعة جزئية من الإجمالي" : "Partial total payment"}</button><button type="button" onClick={() => openCustomerPayment(customer, true)} disabled={savingPayment} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">{isAr ? "تسديد كل الفواتير" : "Pay all invoices"}</button></>}{customer.credit > 0.009 && <p className="font-black text-emerald-500">{isAr ? "رصيده " : "Client credit "}{money(customer.credit, lang)}</p>}</div></div>
                <div className="mt-4 space-y-2">
                  {customer.invoices.map((invoice) => {
                    const due = Math.max(Number(invoice.total || 0) - Number(invoice.paid_amount || 0), 0);
                    return <div key={invoice.id} className="flex flex-col gap-3 rounded-xl border border-white/[0.06] p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold">#{invoice.invoice_number}</p><p className="mt-1 text-xs text-slate-500">{isAr ? "المتبقي" : "Due"}: {money(due, lang)}</p></div><div className="flex gap-2"><button type="button" onClick={() => { setInvoiceId(invoice.id); setAmount(""); setShowPayment(true); }} className="rounded-lg border border-amber-400/40 px-3 py-2 text-xs font-bold text-amber-500">{isAr ? "دفع جزئي" : "Partial"}</button><button type="button" onClick={() => { setInvoiceId(invoice.id); setAmount(String(due)); setShowPayment(true); }} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">{isAr ? "دفع الكل" : "Pay all"}</button></div></div>;
                  })}
                </div>
                {customerPayKey === customer.key && <div className={`mt-4 rounded-xl border p-4 ${dark ? "border-emerald-500/20 bg-[#13161B]" : "border-emerald-200 bg-white"}`}>
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                    <label className="block"><span className="mb-2 block text-xs font-bold text-slate-500">{isAr ? "حساب التحصيل" : "Collection account"}</span><select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}><option value="">{isAr ? "اختار الحساب" : "Select account"}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                    <label className="block"><span className="mb-2 block text-xs font-bold text-slate-500">{isAr ? "المبلغ من إجمالي المستحق" : "Amount from total due"}</span><input type="number" min="0.01" max={customer.due} step="0.01" value={customerPayAmount} onChange={(e) => setCustomerPayAmount(e.target.value)} className={inputClass} placeholder={customer.due.toFixed(2)} /></label>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{isAr ? "سيتم توزيع المبلغ على أقدم الفواتير أولًا." : "The amount will be applied to the oldest invoices first."}</p>
                  {selectedAccount?.requires_session && <p className="mt-2 text-xs text-emerald-500">{isAr ? "ستُفتح الوردية تلقائيًا عند التحصيل إذا كانت مغلقة." : "The register will open automatically for collection if closed."}</p>}
                  <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void recordCustomerPayment(customer)} disabled={savingPayment || !accountId || !customerPayAmount} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{savingPayment ? (isAr ? "جارٍ تسجيل الدفعات..." : "Recording payments...") : (isAr ? "تأكيد تحصيل الإجمالي" : "Confirm total collection")}</button><button type="button" onClick={() => { setCustomerPayKey(""); setCustomerPayAmount(""); }} disabled={savingPayment} className={`rounded-lg border px-4 py-2.5 text-sm font-bold ${dark ? "border-white/10" : "border-slate-200"}`}>{isAr ? "إلغاء" : "Cancel"}</button></div>
                </div>}
              </div>
            ))}
            {!customerBalances.length && <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500 lg:col-span-2">{isAr ? "لا توجد مبالغ مستحقة أو أرصدة دائنة للعملاء." : "No customer balances or credits."}</div>}
          </div>
        </section>}

        {activeTab === "activity" && <section className={cardClass}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black">{isAr ? "آخر حركات الخزنة" : "Latest ledger movements"}</h2><p className="mt-1 text-sm text-slate-500">{isAr ? "آخر 200 حركة مالية مسجلة." : "Latest 200 posted transactions."}</p></div>{can("payments", "view") && <button onClick={() => router.push("/cash-register")} className={`rounded-xl border px-4 py-2 text-sm font-bold ${dark ? "border-white/10" : "border-slate-200"}`}>{isAr ? "كشف حساب كامل" : "Full account statement"}</button>}</div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead><tr className="border-b text-right text-xs text-slate-500"><th className="px-3 py-3">{isAr ? "التاريخ" : "Date"}</th><th className="px-3 py-3">{isAr ? "الحركة" : "Movement"}</th><th className="px-3 py-3">{isAr ? "الوصف" : "Description"}</th><th className="px-3 py-3">{isAr ? "الحساب" : "Account"}</th><th className="px-3 py-3">{isAr ? "المبلغ" : "Amount"}</th></tr></thead><tbody>{transactions.slice(0, 20).map((t) => <tr key={t.id} className="border-b last:border-0"><td className="px-3 py-3 whitespace-nowrap text-slate-500">{dateText(t.transaction_at, lang)}</td><td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${t.direction === "in" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>{transactionName[t.transaction_type]?.[isAr ? "ar" : "en"] || t.transaction_type}</span></td><td className="px-3 py-3"><p className="font-semibold">{t.description}</p>{t.reference && <p className="mt-1 text-xs text-slate-500">{isAr ? "مرجع" : "Ref"}: {t.reference}</p>}</td><td className="px-3 py-3">{accounts.find((a) => a.id === t.account_id)?.name || "—"}</td><td className={`px-3 py-3 whitespace-nowrap font-black ${t.direction === "in" ? "text-emerald-500" : "text-rose-500"}`}>{t.direction === "in" ? "+" : "−"}{money(t.amount, lang)}</td></tr>)}{!transactions.length && <tr><td colSpan={5} className="px-3 py-12 text-center text-slate-500">{isAr ? "لا توجد حركات مالية حتى الآن." : "No financial movements yet."}</td></tr>}</tbody></table></div>
        </section>}
      </div>
    </main>
  );
}
