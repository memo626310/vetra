"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";
import { getClinicDb, getClinicContext } from "@/lib/clinic-db";

type Lang = "ar" | "en";
type AccountType = "cash" | "bank" | "wallet" | "card" | "other";
type Account = {
  id: string; clinic_id: string; name: string; account_type: AccountType;
  requires_session: boolean; opening_balance: number; current_balance: number;
  is_active: boolean; is_default: boolean;
};
type RegisterSession = {
  id: string; account_id: string; status: "open" | "closed";
  opening_expected_balance: number; opening_counted_balance: number; opening_difference: number;
  expected_closing_balance: number | null; counted_closing_balance: number | null; closing_difference: number | null;
  opened_at: string; closed_at: string | null; opening_notes: string | null; closing_notes: string | null;
};
type Transaction = {
  id: string; account_id: string; session_id: string | null; direction: "in" | "out";
  transaction_type: string; amount: number; description: string; category: string | null;
  payment_method: string | null; reference: string | null; counterparty_name: string | null;
  related_invoice_id: string | null; transaction_at: string;
};

const accountLabels: Record<AccountType, { ar: string; en: string }> = {
  cash: { ar: "خزنة نقدية", en: "Cash register" },
  bank: { ar: "حساب بنكي", en: "Bank account" },
  wallet: { ar: "محفظة إلكترونية", en: "E-wallet" },
  card: { ar: "حساب مدفوعات البطاقات", en: "Card settlement" },
  other: { ar: "حساب آخر", en: "Other account" },
};
const transactionLabels: Record<string, { ar: string; en: string }> = {
  invoice_payment: { ar: "تحصيل فاتورة", en: "Invoice receipt" }, income: { ar: "إيراد", en: "Income" },
  expense: { ar: "مصروف", en: "Expense" }, supplier_payment: { ar: "دفع لمورد", en: "Supplier payment" },
  refund: { ar: "رد مبلغ", en: "Refund" }, transfer_in: { ar: "تحويل وارد", en: "Transfer in" },
  transfer_out: { ar: "تحويل صادر", en: "Transfer out" }, adjustment: { ar: "تسوية", en: "Adjustment" },
};
const cash = (value: number | null | undefined, lang: Lang) => `${new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} ج.م`;
const dateTime = (value: string | null | undefined, lang: Lang) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-EG", { dateStyle: "medium", timeStyle: "short" }).format(d);
};

export default function CashRegisterPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("ar");
  const [dark, setDark] = useState(true);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sessions, setSessions] = useState<RegisterSession[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("cash");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [openAccountId, setOpenAccountId] = useState("");
  const [openingCount, setOpeningCount] = useState("0");
  const [closingCounts, setClosingCounts] = useState<Record<string, string>>({});
  const [closingNotes, setClosingNotes] = useState<Record<string, string>>({});

  const [movementAccountId, setMovementAccountId] = useState("");
  const [movementDirection, setMovementDirection] = useState<"in" | "out">("out");
  const [movementType, setMovementType] = useState("expense");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementDescription, setMovementDescription] = useState("");
  const [movementCategory, setMovementCategory] = useState("مصروفات تشغيل");
  const [movementCounterparty, setMovementCounterparty] = useState("");
  const [movementReference, setMovementReference] = useState("");

  const [transferSourceId, setTransferSourceId] = useState("");
  const [transferDestinationId, setTransferDestinationId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDescription, setTransferDescription] = useState("تحويل بين الحسابات");
  const isAr = lang === "ar";

  const accountSessions = useMemo(() => {
    const m = new Map<string, RegisterSession>();
    sessions.filter((s) => s.status === "open").forEach((s) => m.set(s.account_id, s));
    return m;
  }, [sessions]);
  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.current_balance || 0), 0);
  const totalCash = accounts.filter((a) => a.account_type === "cash").reduce((sum, a) => sum + Number(a.current_balance || 0), 0);
  const openSessionCount = sessions.filter((s) => s.status === "open").length;

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
    window.localStorage.setItem("vetra-theme", dark ? "dark" : "light");
  }, [ready, isAr, lang, dark]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { user } } = await vetraCore.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const context = await getClinicContext();
      if (!["owner", "admin"].includes(context.role)) { setAuthorized(false); return; }
      setAuthorized(true);
      const db = await getClinicDb();
      const [accountResult, sessionResult, transactionResult] = await Promise.all([
        db.from("financial_account_balances").select("id,clinic_id,name,account_type,requires_session,opening_balance,current_balance,is_active,is_default")
          .eq("clinic_id", context.clinic_id).order("name"),
        db.from("cash_register_sessions").select("id,account_id,status,opening_expected_balance,opening_counted_balance,opening_difference,expected_closing_balance,counted_closing_balance,closing_difference,opened_at,closed_at,opening_notes,closing_notes")
          .eq("clinic_id", context.clinic_id).order("opened_at", { ascending: false }).limit(100),
        db.from("financial_transactions").select("id,account_id,session_id,direction,transaction_type,amount,description,category,payment_method,reference,counterparty_name,related_invoice_id,transaction_at")
          .eq("clinic_id", context.clinic_id).order("transaction_at", { ascending: false }).limit(250),
      ]);
      if (accountResult.error) throw new Error(accountResult.error.message);
      if (sessionResult.error) throw new Error(sessionResult.error.message);
      if (transactionResult.error) throw new Error(transactionResult.error.message);
      const accountRows = (accountResult.data || []) as Account[];
      const sessionRows = (sessionResult.data || []) as RegisterSession[];
      setAccounts(accountRows);
      setSessions(sessionRows);
      setTransactions((transactionResult.data || []) as Transaction[]);
      setOpenAccountId((current) => current && accountRows.some((a) => a.id === current && a.requires_session && a.is_active && !sessionRows.some((s) => s.account_id === current && s.status === "open")) ? current : accountRows.find((a) => a.requires_session && a.is_active && !sessionRows.some((s) => s.account_id === a.id && s.status === "open"))?.id || "");
      setMovementAccountId((current) => current && accountRows.some((a) => a.id === current && a.is_active) ? current : accountRows.find((a) => a.account_type === "cash" && a.is_default)?.id || accountRows.find((a) => a.is_active)?.id || "");
      setTransferSourceId((current) => current && accountRows.some((a) => a.id === current) ? current : accountRows[0]?.id || "");
      setTransferDestinationId((current) => current && accountRows.some((a) => a.id === current) ? current : accountRows.find((a) => a.id !== accountRows[0]?.id)?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load cash register data.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { if (ready) void loadData(); }, [ready, loadData]);

  async function createAccount() {
    setError(""); setNotice("");
    if (!accountName.trim()) { setError(isAr ? "اكتب اسم الحساب." : "Enter an account name."); return; }
    const value = Number(openingBalance || 0);
    if (!Number.isFinite(value) || value < 0) { setError(isAr ? "الرصيد الافتتاحي غير صحيح." : "Invalid opening balance."); return; }
    setSaving(true);
    try {
      const db = await getClinicDb();
      const { error: createError } = await db.rpc("vetra_create_financial_account", {
        p_name: accountName.trim(), p_account_type: accountType, p_opening_balance: value, p_notes: null,
      });
      if (createError) throw createError;
      setAccountName(""); setOpeningBalance("0");
      setNotice(isAr ? "تم إنشاء الحساب المالي." : "Financial account created.");
      await loadData();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create account."); }
    finally { setSaving(false); }
  }

  async function openRegister() {
    setError(""); setNotice("");
    const value = Number(openingCount);
    if (!openAccountId) { setError(isAr ? "اختار خزنة نقدية." : "Select a cash register."); return; }
    if (!Number.isFinite(value) || value < 0) { setError(isAr ? "عدّ النقدية الافتتاحية بشكل صحيح." : "Enter a valid opening cash count."); return; }
    setSaving(true);
    try {
      const db = await getClinicDb();
      const { error: openError } = await db.rpc("vetra_open_cash_register", { p_account_id: openAccountId, p_counted_opening: value, p_notes: null });
      if (openError) throw openError;
      setNotice(isAr ? "تم فتح وردية الخزنة." : "Cash register session opened.");
      await loadData();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not open register."); }
    finally { setSaving(false); }
  }

  async function closeRegister(session: RegisterSession) {
    setError(""); setNotice("");
    const raw = closingCounts[session.id];
    const value = Number(raw);
    if (raw == null || raw.trim() === "" || !Number.isFinite(value) || value < 0) {
      setError(isAr ? "أدخل النقدية الفعلية التي عدّيتها قبل الإغلاق." : "Enter the counted cash before closing."); return;
    }
    setSaving(true);
    try {
      const db = await getClinicDb();
      const { error: closeError } = await db.rpc("vetra_close_cash_register", { p_session_id: session.id, p_counted_closing: value, p_notes: closingNotes[session.id]?.trim() || null });
      if (closeError) throw closeError;
      setNotice(isAr ? "تم إغلاق الوردية وحساب العجز/الزيادة." : "Session closed and variance calculated.");
      await loadData();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not close register."); }
    finally { setSaving(false); }
  }

  async function postMovement() {
    setError(""); setNotice("");
    const value = Number(movementAmount);
    if (!movementAccountId || !Number.isFinite(value) || value <= 0 || !movementDescription.trim()) {
      setError(isAr ? "اختار الحساب، واكتب مبلغًا ووصفًا صحيحين." : "Select an account and enter a valid amount and description."); return;
    }
    setSaving(true);
    try {
      const db = await getClinicDb();
      const { error: movementError } = await db.rpc("vetra_post_financial_transaction", {
        p_account_id: movementAccountId,
        p_direction: movementDirection,
        p_transaction_type: movementType,
        p_amount: value,
        p_description: movementDescription.trim(),
        p_category: movementCategory.trim() || null,
        p_payment_method: accounts.find((a) => a.id === movementAccountId)?.account_type || null,
        p_reference: movementReference.trim() || null,
        p_counterparty_name: movementCounterparty.trim() || null,
        p_session_id: null,
        p_idempotency_key: crypto.randomUUID(),
      });
      if (movementError) throw movementError;
      setMovementAmount(""); setMovementDescription(""); setMovementCounterparty(""); setMovementReference("");
      setNotice(isAr ? "تم تسجيل الحركة المالية." : "Financial movement recorded.");
      await loadData();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not post transaction."); }
    finally { setSaving(false); }
  }

  async function transferMoney() {
    setError(""); setNotice("");
    const value = Number(transferAmount);
    if (!transferSourceId || !transferDestinationId || transferSourceId === transferDestinationId || !Number.isFinite(value) || value <= 0 || !transferDescription.trim()) {
      setError(isAr ? "اختار حسابين مختلفين واكتب مبلغ التحويل." : "Choose two different accounts and enter a valid transfer amount."); return;
    }
    setSaving(true);
    try {
      const db = await getClinicDb();
      const { error: transferError } = await db.rpc("vetra_transfer_between_accounts", {
        p_source_account_id: transferSourceId, p_destination_account_id: transferDestinationId,
        p_amount: value, p_description: transferDescription.trim(), p_reference: null,
        p_source_session_id: null, p_destination_session_id: null, p_idempotency_key: crypto.randomUUID(),
      });
      if (transferError) throw transferError;
      setTransferAmount("");
      setNotice(isAr ? "تم تسجيل التحويل من الحساب الأول للثاني دون احتسابه إيرادًا أو مصروفًا." : "Transfer recorded without counting it as income or expense.");
      await loadData();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not transfer funds."); }
    finally { setSaving(false); }
  }

  const cardClass = `rounded-3xl border p-5 ${dark ? "border-white/[0.07] bg-[#13161B]" : "border-slate-100 bg-white shadow-sm"}`;
  const inputClass = `w-full rounded-xl border px-3 py-3 outline-none focus:border-blue-500 ${dark ? "border-white/10 bg-[#0F1115] text-white" : "border-slate-200 bg-slate-50 text-slate-900"}`;
  const labelClass = "mb-2 block text-sm font-semibold text-slate-500";

  if (!ready || loading) return <main className={`flex min-h-screen items-center justify-center ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}><p>{isAr ? "جارٍ تحميل الخزن..." : "Loading cash registers..."}</p></main>;
  if (authorized === false) return <main dir={isAr ? "rtl" : "ltr"} className={`flex min-h-screen items-center justify-center p-6 ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}><div className={cardClass}><h1 className="text-2xl font-black">{isAr ? "غير مصرح بالدخول" : "Access restricted"}</h1><p className="mt-3 text-sm text-slate-500">{isAr ? "إدارة الخزن متاحة للمالك ومدير العيادة فقط." : "Cash register management is available to the owner and admin only."}</p></div></main>;

  return (
    <main dir={isAr ? "rtl" : "ltr"} className={`min-h-screen ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}>
      <div className="mx-auto max-w-[1500px] space-y-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><button onClick={() => router.push("/finance")} className="mb-2 text-sm text-blue-500">← {isAr ? "المالية" : "Finance"}</button><p className="text-sm font-semibold text-indigo-500">VETRA / CASH REGISTER</p><h1 className="mt-2 text-3xl font-black">{isAr ? "الخزن وحركة النقدية" : "Cash registers & transactions"}</h1><p className="mt-2 text-sm text-slate-500">{isAr ? "افتح الوردية، سجّل المقبوضات والمصروفات، واقفل على النقدية الفعلية." : "Open a session, post incoming/outgoing movements, and close against counted cash."}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => setDark((v) => !v)} className={`rounded-xl border px-3 py-2 ${dark ? "border-white/10 bg-[#171A20]" : "border-slate-200 bg-white"}`}>{dark ? "☀️" : "🌙"}</button><button onClick={() => setLang((v) => v === "ar" ? "en" : "ar")} className={`rounded-xl border px-3 py-2 ${dark ? "border-white/10 bg-[#171A20]" : "border-slate-200 bg-white"}`}>{isAr ? "English" : "عربي"}</button><button onClick={() => router.push("/invoices")} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">{isAr ? "المبيعات والفواتير" : "Sales invoices"}</button></div></header>

        {error && <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</div>}
        {notice && <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">{notice}</div>}

        <section className="grid gap-4 sm:grid-cols-3"><div className={cardClass}><p className="text-sm text-slate-500">{isAr ? "إجمالي أرصدة الحسابات" : "Total account balances"}</p><p className="mt-3 text-2xl font-black">{cash(totalBalance, lang)}</p></div><div className={cardClass}><p className="text-sm text-slate-500">{isAr ? "أرصدة الخزن النقدية" : "Cash register balances"}</p><p className="mt-3 text-2xl font-black text-emerald-500">{cash(totalCash, lang)}</p></div><div className={cardClass}><p className="text-sm text-slate-500">{isAr ? "الورديات المفتوحة" : "Open register sessions"}</p><p className="mt-3 text-2xl font-black">{openSessionCount}</p></div></section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className={cardClass}><h2 className="text-xl font-black">{isAr ? "الحسابات المالية" : "Financial accounts"}</h2><p className="mt-1 text-sm text-slate-500">{isAr ? "أنشئ خزنة أو بنكًا أو محفظة. الرصيد الافتتاحي هو نقطة بداية الدفتر." : "Create a register, bank or wallet. Opening balance is the ledger starting point."}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>{isAr ? "اسم الحساب" : "Account name"}</label><input value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputClass} placeholder={isAr ? "مثال: خزنة فرع الشروق" : "e.g. Shorouk cash register"}/></div><div><label className={labelClass}>{isAr ? "نوع الحساب" : "Account type"}</label><select value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)} className={inputClass}>{(Object.keys(accountLabels) as AccountType[]).map((t) => <option key={t} value={t}>{accountLabels[t][isAr ? "ar" : "en"]}</option>)}</select></div><div><label className={labelClass}>{isAr ? "الرصيد الافتتاحي" : "Opening balance"}</label><input type="number" min="0" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className={inputClass}/></div><div className="flex items-end"><button disabled={saving} onClick={createAccount} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white disabled:opacity-50">{isAr ? "إضافة الحساب" : "Create account"}</button></div></div>
          </div>
          <div className={cardClass}><h2 className="text-xl font-black">{isAr ? "فتح وردية خزنة" : "Open a register session"}</h2><p className="mt-1 text-sm text-slate-500">{isAr ? "سجّل ما عدّيته فعلًا. النظام يحتفظ برصيد الدفتر والفارق عند الفتح." : "Enter the cash actually counted. The system records ledger balance and opening variance."}</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>{isAr ? "الخزنة" : "Register"}</label><select value={openAccountId} onChange={(e) => setOpenAccountId(e.target.value)} className={inputClass}><option value="">{isAr ? "اختار خزنة" : "Select register"}</option>{accounts.filter((a) => a.requires_session && a.is_active && !accountSessions.has(a.id)).map((a) => <option key={a.id} value={a.id}>{a.name} · {cash(a.current_balance, lang)}</option>)}</select></div><div><label className={labelClass}>{isAr ? "النقدية الفعلية عند الفتح" : "Counted opening cash"}</label><input type="number" min="0" step="0.01" value={openingCount} onChange={(e) => setOpeningCount(e.target.value)} className={inputClass}/></div><div className="sm:col-span-2"><button disabled={saving || !openAccountId} onClick={openRegister} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:opacity-50">{isAr ? "فتح الوردية" : "Open session"}</button></div></div></div>
        </section>

        <section className={cardClass}><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">{isAr ? "أرصدة الحسابات" : "Account balances"}</h2><p className="mt-1 text-sm text-slate-500">{isAr ? "التحويل بين الحسابات يغيّر الرصيد ولا يُحسب مبيعات أو مصروفات." : "Transfers move balances without counting as sales or expenses."}</p></div><button onClick={() => router.push("/finance")} className={`rounded-xl border px-3 py-2 text-sm font-bold ${dark ? "border-white/10" : "border-slate-200"}`}>{isAr ? "لوحة المالية" : "Finance dashboard"}</button></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{accounts.map((a) => <div key={a.id} className={`rounded-2xl border p-4 ${dark ? "border-white/[0.06] bg-[#0F1115]" : "border-slate-100 bg-slate-50"}`}><div className="flex items-start justify-between gap-2"><div><p className="font-bold">{a.name}</p><p className="mt-1 text-xs text-slate-500">{accountLabels[a.account_type]?.[isAr ? "ar" : "en"] || a.account_type}{a.is_default ? ` · ${isAr ? "افتراضي" : "Default"}` : ""}</p></div><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${accountSessions.has(a.id) ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-500/10 text-slate-500"}`}>{a.requires_session ? accountSessions.has(a.id) ? (isAr ? "مفتوحة" : "Open") : (isAr ? "مغلقة" : "Closed") : (isAr ? "بدون وردية" : "No session")}</span></div><p className="mt-4 text-2xl font-black">{cash(a.current_balance, lang)}</p><p className="mt-1 text-xs text-slate-500">{isAr ? "رصيد دفتري" : "Ledger balance"}</p></div>)}{!accounts.length && <p className="text-sm text-slate-500">{isAr ? "شغّل سكربت المالية لإنشاء الحسابات الافتراضية." : "Run the finance SQL migration to seed default accounts."}</p>}</div></section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className={cardClass}><h2 className="text-xl font-black">{isAr ? "تسجيل مقبوضات أو مصروفات" : "Post income or expense"}</h2><p className="mt-1 text-sm text-slate-500">{isAr ? "التحصيل من الفاتورة يُسجّل من صفحة المالية لتحديث رصيد الفاتورة معه." : "Invoice receipts should be recorded from Finance so the invoice balance updates too."}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>{isAr ? "الحساب" : "Account"}</label><select value={movementAccountId} onChange={(e) => setMovementAccountId(e.target.value)} className={inputClass}><option value="">{isAr ? "اختار حسابًا" : "Select account"}</option>{accounts.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div><div><label className={labelClass}>{isAr ? "نوع الحركة" : "Movement type"}</label><select value={movementDirection} onChange={(e) => { const d = e.target.value as "in" | "out"; setMovementDirection(d); setMovementType(d === "in" ? "income" : "expense"); }} className={inputClass}><option value="in">{isAr ? "مقبوض / إيراد" : "Incoming / income"}</option><option value="out">{isAr ? "مصروف / مدفوع" : "Outgoing / expense"}</option></select></div><div><label className={labelClass}>{isAr ? "التصنيف" : "Category"}</label><select value={movementType} onChange={(e) => setMovementType(e.target.value)} className={inputClass}>{movementDirection === "in" ? <option value="income">{isAr ? "إيراد آخر" : "Other income"}</option> : <><option value="expense">{isAr ? "مصروف تشغيل" : "Operating expense"}</option><option value="supplier_payment">{isAr ? "دفع لمورد" : "Supplier payment"}</option><option value="refund">{isAr ? "رد مبلغ" : "Refund"}</option></>}</select></div><div><label className={labelClass}>{isAr ? "المبلغ" : "Amount"}</label><input type="number" min="0.01" step="0.01" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} className={inputClass}/></div><div><label className={labelClass}>{isAr ? "بند الحركة" : "Category label"}</label><input value={movementCategory} onChange={(e) => setMovementCategory(e.target.value)} className={inputClass}/></div><div><label className={labelClass}>{isAr ? "اسم الطرف الآخر" : "Counterparty"}</label><input value={movementCounterparty} onChange={(e) => setMovementCounterparty(e.target.value)} className={inputClass}/></div><div><label className={labelClass}>{isAr ? "الوصف" : "Description"}</label><input value={movementDescription} onChange={(e) => setMovementDescription(e.target.value)} className={inputClass}/></div><div><label className={labelClass}>{isAr ? "رقم مرجعي" : "Reference"}</label><input value={movementReference} onChange={(e) => setMovementReference(e.target.value)} className={inputClass}/></div><div className="sm:col-span-2"><button disabled={saving} onClick={postMovement} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50">{isAr ? "تسجيل الحركة" : "Post movement"}</button></div></div>
          </div>
          <div className={cardClass}><h2 className="text-xl font-black">{isAr ? "تحويل بين الحسابات" : "Transfer between accounts"}</h2><p className="mt-1 text-sm text-slate-500">{isAr ? "يُسجّل خروجًا من الحساب الأول ودخولًا في الثاني بنفس القيمة وبمرجع واحد." : "Creates matching outgoing and incoming movements with one transfer reference."}</p><div className="mt-4 space-y-3"><div><label className={labelClass}>{isAr ? "من حساب" : "From account"}</label><select value={transferSourceId} onChange={(e) => setTransferSourceId(e.target.value)} className={inputClass}><option value="">{isAr ? "الحساب المصدر" : "Source account"}</option>{accounts.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div><div><label className={labelClass}>{isAr ? "إلى حساب" : "To account"}</label><select value={transferDestinationId} onChange={(e) => setTransferDestinationId(e.target.value)} className={inputClass}><option value="">{isAr ? "الحساب المستلم" : "Destination account"}</option>{accounts.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div><div><label className={labelClass}>{isAr ? "المبلغ" : "Amount"}</label><input type="number" min="0.01" step="0.01" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} className={inputClass}/></div><div><label className={labelClass}>{isAr ? "سبب التحويل" : "Description"}</label><input value={transferDescription} onChange={(e) => setTransferDescription(e.target.value)} className={inputClass}/></div><button disabled={saving} onClick={transferMoney} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white disabled:opacity-50">{isAr ? "تأكيد التحويل" : "Confirm transfer"}</button></div></div>
        </section>

        <section className={cardClass}><h2 className="text-xl font-black">{isAr ? "الورديات" : "Register sessions"}</h2><p className="mt-1 text-sm text-slate-500">{isAr ? "اقفل الوردية بعد عدّ النقدية الفعلية. الفارق محفوظ للمراجعة ولا يتعدل تلقائيًا." : "Close after physically counting cash. Variance is saved for review and is never silently adjusted."}</p><div className="mt-4 space-y-3">{sessions.slice(0, 30).map((s) => <div key={s.id} className={`rounded-2xl border p-4 ${dark ? "border-white/[0.06] bg-[#0F1115]" : "border-slate-100 bg-slate-50"}`}><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><strong>{accounts.find((a) => a.id === s.account_id)?.name || "—"}</strong><span className={`rounded-full px-2 py-1 text-xs font-bold ${s.status === "open" ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-500/10 text-slate-500"}`}>{s.status === "open" ? (isAr ? "وردية مفتوحة" : "Open session") : (isAr ? "مغلقة" : "Closed")}</span></div><p className="mt-1 text-xs text-slate-500">{isAr ? "فتح" : "Opened"}: {dateTime(s.opened_at, lang)}{s.closed_at ? ` · ${isAr ? "إغلاق" : "Closed"}: ${dateTime(s.closed_at, lang)}` : ""}</p><div className="mt-3 flex flex-wrap gap-4 text-sm"><span>{isAr ? "دفتر الفتح" : "Expected opening"}: <b>{cash(s.opening_expected_balance, lang)}</b></span><span>{isAr ? "العد الفعلي" : "Counted opening"}: <b>{cash(s.opening_counted_balance, lang)}</b></span><span className={Number(s.opening_difference || 0) === 0 ? "text-emerald-500" : "text-amber-500"}>{isAr ? "فرق الفتح" : "Opening variance"}: <b>{cash(s.opening_difference, lang)}</b></span></div>{s.status === "closed" && <div className="mt-3 flex flex-wrap gap-4 text-sm"><span>{isAr ? "الرصيد المتوقع عند الإغلاق" : "Expected close"}: <b>{cash(s.expected_closing_balance, lang)}</b></span><span>{isAr ? "العد الفعلي" : "Counted close"}: <b>{cash(s.counted_closing_balance, lang)}</b></span><span className={Number(s.closing_difference || 0) === 0 ? "text-emerald-500" : "text-amber-500"}>{isAr ? "فرق الإغلاق" : "Closing variance"}: <b>{cash(s.closing_difference, lang)}</b></span></div>}</div>{s.status === "open" && <div className="grid min-w-[260px] gap-2 sm:grid-cols-[1fr_1fr_auto]"><input type="number" min="0" step="0.01" value={closingCounts[s.id] || ""} onChange={(e) => setClosingCounts((v) => ({ ...v, [s.id]: e.target.value }))} className={inputClass} placeholder={isAr ? "النقدية بعد العد" : "Counted cash"}/><input value={closingNotes[s.id] || ""} onChange={(e) => setClosingNotes((v) => ({ ...v, [s.id]: e.target.value }))} className={inputClass} placeholder={isAr ? "ملاحظة" : "Note"}/><button disabled={saving} onClick={() => closeRegister(s)} className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{isAr ? "إغلاق" : "Close"}</button></div>}</div></div>)}{!sessions.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">{isAr ? "لا توجد ورديات مسجلة بعد." : "No register sessions yet."}</p>}</div></section>

        <section className={cardClass}><h2 className="text-xl font-black">{isAr ? "كشف حركة الحسابات" : "Financial movement ledger"}</h2><p className="mt-1 text-sm text-slate-500">{isAr ? "آخر 250 حركة. حركات الفواتير مرتبطة بمعرّف الفاتورة ويمكن مراجعتها من صفحة المالية." : "Latest 250 movements. Invoice receipts are linked to their invoice and can be reviewed in Finance."}</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-right text-xs text-slate-500"><th className="px-3 py-3">{isAr ? "التاريخ" : "Date"}</th><th className="px-3 py-3">{isAr ? "الحساب" : "Account"}</th><th className="px-3 py-3">{isAr ? "نوع الحركة" : "Type"}</th><th className="px-3 py-3">{isAr ? "الوصف" : "Description"}</th><th className="px-3 py-3">{isAr ? "الطرف" : "Counterparty"}</th><th className="px-3 py-3">{isAr ? "المبلغ" : "Amount"}</th></tr></thead><tbody>{transactions.map((t) => <tr key={t.id} className="border-b last:border-0"><td className="whitespace-nowrap px-3 py-3 text-slate-500">{dateTime(t.transaction_at, lang)}</td><td className="px-3 py-3">{accounts.find((a) => a.id === t.account_id)?.name || "—"}</td><td className="px-3 py-3">{transactionLabels[t.transaction_type]?.[isAr ? "ar" : "en"] || t.transaction_type}</td><td className="px-3 py-3"><p className="font-semibold">{t.description}</p>{t.reference && <p className="mt-1 text-xs text-slate-500">{t.reference}</p>}</td><td className="px-3 py-3">{t.counterparty_name || "—"}</td><td className={`whitespace-nowrap px-3 py-3 font-black ${t.direction === "in" ? "text-emerald-500" : "text-rose-500"}`}>{t.direction === "in" ? "+" : "−"}{cash(t.amount, lang)}</td></tr>)}{!transactions.length && <tr><td colSpan={6} className="px-3 py-12 text-center text-slate-500">{isAr ? "لا توجد حركات مالية بعد." : "No movements recorded yet."}</td></tr>}</tbody></table></div></section>
      </div>
    </main>
  );
}
