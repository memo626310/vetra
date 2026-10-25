"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";
import { vetraCore } from "@/lib/vetra-core";
import { writeVetraThemeMode } from "@/lib/theme";
import { useStaffPermissions } from "@/lib/use-staff-permissions";

type Purchase = {
  id: string;
  supplier_name: string;
  account_id: string;
  total_amount: number;
  invoice_reference: string | null;
  notes: string | null;
  created_at: string;
};
type Account = { id: string; name: string };
type ProductOption = { id: string; name: string; unit: string | null; is_active?: boolean };
type PurchaseItem = {
  id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  product?: { name?: string; unit?: string | null } | null;
};
type EditableLine = { product_id: string; quantity: string; unit_cost: string };

function formatPurchaseMoney(value: number) {
  return `${new Intl.NumberFormat("en-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} EGP`;
}

function errorText(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}

export default function PurchaseHistoryPage() {
  const { can: canSee } = useStaffPermissions();
  const money = (value: number) => canSee("financial_sensitive_data", "view") ? formatPurchaseMoney(value) : "••••••";
  const router = useRouter();
  const { can, loaded: permissionsLoaded } = useStaffPermissions();
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [dark, setDark] = useState(true);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("all");
  const [now] = useState(() => Date.now());
  const [expandedId, setExpandedId] = useState("");
  const [itemsByPurchase, setItemsByPurchase] = useState<Record<string, PurchaseItem[]>>({});
  const [loadingDetails, setLoadingDetails] = useState("");
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [editProducts, setEditProducts] = useState<ProductOption[]>([]);
  const [editSupplier, setEditSupplier] = useState("");
  const [editAccountId, setEditAccountId] = useState("");
  const [editReference, setEditReference] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLines, setEditLines] = useState<EditableLine[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const isAr = language === "ar";
  const inputClass = `w-full rounded-xl border px-3 py-3 outline-none focus:border-cyan-500 ${dark ? "border-white/10 bg-[#0F1115] text-white" : "border-slate-200 bg-slate-50 text-slate-900"}`;
  const cardClass = `rounded-2xl border ${dark ? "border-white/[0.07] bg-[#13161B]" : "border-slate-100 bg-white shadow-sm"}`;

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("vetra-language");
    const savedTheme = window.localStorage.getItem("vetra-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLanguage(savedLanguage === "en" ? "en" : "ar");
    setDark(savedTheme !== "light");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dir = isAr ? "rtl" : "ltr";
    document.documentElement.lang = isAr ? "ar" : "en";
    document.documentElement.classList.toggle("dark", dark);
    window.localStorage.setItem("vetra-language", language);
    writeVetraThemeMode(dark);
  }, [ready, isAr, dark, language]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { user } } = await vetraCore.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const context = await getClinicContext();
      if (!["owner", "admin"].includes(context.role) && !can("inventory", "view")) { setAuthorized(false); return; }
      setAuthorized(true);
      const db = await getClinicDb();
      const [purchaseResult, accountResult] = await Promise.all([
        db.from("inventory_purchases").select("id,supplier_name,account_id,total_amount,invoice_reference,notes,created_at").eq("clinic_id", context.clinic_id).order("created_at", { ascending: false }).limit(1000),
        db.from("financial_account_balances").select("id,name").eq("clinic_id", context.clinic_id),
      ]);
      if (purchaseResult.error) throw purchaseResult.error;
      if (accountResult.error) throw accountResult.error;
      setPurchases((purchaseResult.data || []) as Purchase[]);
      setAccounts((accountResult.data || []) as Account[]);
    } catch (loadError) {
      const detail = errorText(loadError, isAr ? "تعذر تحميل فواتير الشراء." : "Could not load purchase invoices.");
      setError(/inventory_purchases|schema cache|does not exist/i.test(detail)
        ? (isAr ? "سجل المشتريات غير مُثبت على قاعدة بيانات العيادة. شغّل ملف إعداد المشتريات ثم أعد المحاولة." : "Purchase history is not installed on this clinic database. Run the inventory purchases SQL setup and retry.")
        : detail);
    } finally {
      setLoading(false);
    }
  }, [isAr, router, can, permissionsLoaded]);

  useEffect(() => {
    // Data loading synchronizes this view with the active clinic database.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready && permissionsLoaded) void loadData();
  }, [ready, permissionsLoaded, loadData]);

  const filteredPurchases = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const cutoff = period === "all" ? 0 : now - Number(period) * 24 * 60 * 60 * 1000;
    return purchases.filter((purchase) => {
      const matchesDate = period === "all" || new Date(purchase.created_at).getTime() >= cutoff;
      const matchesSearch = !query || [purchase.supplier_name, purchase.invoice_reference || "", purchase.notes || "", purchase.id]
        .some((value) => value.toLocaleLowerCase().includes(query));
      return matchesDate && matchesSearch;
    });
  }, [purchases, search, period, now]);

  const filteredTotal = filteredPurchases.reduce((sum, purchase) => sum + Number(purchase.total_amount || 0), 0);
  const editTotal = editLines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cost || 0), 0);

  async function startEdit(purchase: Purchase) {
    if (!can("financial_sensitive_data", "view") || !can("inventory", "edit") || !can("finance_page", "view")) { setError(isAr ? "لا تملك صلاحية تعديل فواتير الشراء والخزنة." : "You do not have permission to edit purchase invoices."); return; }
    setEditError("");
    setLoadingDetails(purchase.id);
    try {
      const db = await getClinicDb();
      const [itemsResult, productsResult] = await Promise.all([
        db.from("inventory_purchase_items").select("id,product_id,quantity,unit_cost,line_total,product:products(name,unit)").eq("purchase_id", purchase.id).order("created_at", { ascending: true }),
        db.from("products").select("id,name,unit,is_active").eq("clinic_id", (await getClinicContext()).clinic_id).eq("is_active", true).order("name"),
      ]);
      if (itemsResult.error) throw itemsResult.error;
      if (productsResult.error) throw productsResult.error;
      const lines = (itemsResult.data || []) as PurchaseItem[];
      setEditProducts(productsResult.data as ProductOption[] || []);
      setEditLines(lines.map((item) => ({ product_id: item.product_id, quantity: String(item.quantity), unit_cost: String(item.unit_cost) })));
      setEditSupplier(purchase.supplier_name);
      setEditAccountId(purchase.account_id);
      setEditReference(purchase.invoice_reference || "");
      setEditNotes(purchase.notes || "");
      setEditingPurchase(purchase);
    } catch (editLoadError) {
      setError(errorText(editLoadError, isAr ? "تعذر تحميل الفاتورة للتعديل." : "Could not load invoice for editing."));
    } finally {
      setLoadingDetails("");
    }
  }

  async function saveEdit() {
    if (!can("financial_sensitive_data", "view") || !can("inventory", "edit") || !can("finance_page", "view")) { setEditError(isAr ? "لا تملك صلاحية تعديل فواتير الشراء والخزنة." : "You do not have permission to edit purchase invoices."); return; }
    if (!editingPurchase || !editSupplier.trim() || !editAccountId || !editLines.length) {
      setEditError(isAr ? "أكمل المورد والخزنة وأضف صنفًا واحدًا على الأقل." : "Enter a supplier, choose a vault, and add at least one item.");
      return;
    }
    if (editLines.some((line) => !line.product_id || Number(line.quantity) <= 0 || Number(line.unit_cost) < 0 || !Number.isFinite(Number(line.quantity)) || !Number.isFinite(Number(line.unit_cost)))) {
      setEditError(isAr ? "راجع الأصناف والكميات وأسعار الشراء." : "Check the products, quantities, and unit costs.");
      return;
    }
    setSavingEdit(true);
    setEditError("");
    try {
      const db = await getClinicDb();
      const { error: updateError } = await db.rpc("vetra_update_inventory_purchase", {
        p_purchase_id: editingPurchase.id,
        p_supplier_name: editSupplier.trim(),
        p_account_id: editAccountId,
        p_items: editLines.map((line) => ({ product_id: line.product_id, quantity: Number(line.quantity), unit_cost: Number(line.unit_cost) })),
        p_invoice_reference: editReference.trim() || null,
        p_notes: editNotes.trim() || null,
        p_idempotency_key: crypto.randomUUID(),
      });
      if (updateError) throw updateError;
      setEditingPurchase(null);
      setItemsByPurchase((current) => { const next = { ...current }; delete next[editingPurchase.id]; return next; });
      await loadData();
    } catch (saveError) {
      const detail = errorText(saveError, isAr ? "تعذر حفظ تعديل الفاتورة." : "Could not save invoice changes.");
      setEditError(/vetra_update_inventory_purchase|schema cache|does not exist/i.test(detail)
        ? (isAr ? "تحديث تعديل فواتير الشراء غير مُثبت على قاعدة العيادة. أعد تشغيل ملف supabase/tenant-sql/vetra_inventory_purchases.sql ثم حاول مجددًا." : "Purchase invoice editing is not installed on this clinic database. Re-run supabase/tenant-sql/vetra_inventory_purchases.sql and retry.")
        : detail);
    } finally {
      setSavingEdit(false);
    }
  }

  async function toggleDetails(purchaseId: string) {
    if (expandedId === purchaseId) { setExpandedId(""); return; }
    setExpandedId(purchaseId);
    if (itemsByPurchase[purchaseId]) return;
    setLoadingDetails(purchaseId);
    try {
      const db = await getClinicDb();
      const { data, error: itemsError } = await db.from("inventory_purchase_items")
        .select("id,product_id,quantity,unit_cost,line_total,product:products(name,unit)")
        .eq("purchase_id", purchaseId)
        .order("created_at", { ascending: true });
      if (itemsError) throw itemsError;
      setItemsByPurchase((current) => ({ ...current, [purchaseId]: (data || []) as PurchaseItem[] }));
    } catch (itemsError) {
      setError(errorText(itemsError, isAr ? "تعذر تحميل تفاصيل الفاتورة." : "Could not load invoice details."));
      setExpandedId("");
    } finally {
      setLoadingDetails("");
    }
  }

  function dateText(value: string) {
    return new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  if (!ready || !permissionsLoaded || authorized === null || loading) return <main className={`flex min-h-screen items-center justify-center ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}><p>{isAr ? "جارٍ تحميل سجل المشتريات..." : "Loading purchase history..."}</p></main>;
  if (authorized === false) return <main className={`flex min-h-screen items-center justify-center p-6 ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}><div className={`${cardClass} p-6`}><h1 className="text-2xl font-black">{isAr ? "غير مصرح بالدخول" : "Access restricted"}</h1><p className="mt-3 text-sm text-slate-500">{isAr ? "سجل المشتريات متاح للمالك ومدير العيادة فقط." : "Purchase history is available to the clinic owner and admin only."}</p></div></main>;

  return (
    <main dir={isAr ? "rtl" : "ltr"} className={`min-h-screen ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}>
      <div className="mx-auto max-w-[1250px] space-y-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button type="button" onClick={() => router.push("/inventory/purchases")} className="mb-3 text-sm text-slate-500 hover:text-cyan-500">← {isAr ? "العودة للمشتريات" : "Back to purchases"}</button>
            <p className="text-sm font-semibold text-cyan-500">VETRA / INVENTORY</p>
            <h1 className="mt-2 text-3xl font-black">{isAr ? "فواتير الشراء السابقة" : "Purchase history"}</h1>
            <p className="mt-2 text-sm text-slate-500">{isAr ? "راجع مشتريات الموردين وتفاصيل الأصناف المسجلة." : "Review supplier purchases and the items recorded on each bill."}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDark((value) => !value)} className={`rounded-xl border px-3 py-2 ${dark ? "border-white/10 bg-[#171A20]" : "border-slate-200 bg-white"}`} title={isAr ? "تغيير المظهر" : "Toggle theme"}>{dark ? "☀️" : "🌙"}</button>
            <button type="button" onClick={() => setLanguage((value) => value === "ar" ? "en" : "ar")} className={`rounded-xl border px-3 py-2 text-sm font-bold ${dark ? "border-white/10 bg-[#171A20]" : "border-slate-200 bg-white"}`}>{isAr ? "English" : "عربي"}</button>
            <button type="button" onClick={() => router.push("/inventory/purchases")} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-bold text-white">+ {isAr ? "فاتورة شراء" : "New purchase"}</button>
          </div>
        </header>

        {error && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

        <section className="grid gap-4 sm:grid-cols-3">
          <div className={`${cardClass} p-5`}><p className="text-sm text-slate-500">{isAr ? "عدد الفواتير" : "Invoices"}</p><p className="mt-2 text-2xl font-black">{filteredPurchases.length}</p></div>
          <div className={`${cardClass} p-5`}><p className="text-sm text-slate-500">{isAr ? "إجمالي المشتريات المعروضة" : "Displayed purchase total"}</p><p className="mt-2 text-2xl font-black text-cyan-500">{money(filteredTotal)}</p></div>
          <div className={`${cardClass} p-5`}><p className="text-sm text-slate-500">{isAr ? "عدد الموردين" : "Suppliers"}</p><p className="mt-2 text-2xl font-black">{new Set(filteredPurchases.map((purchase) => purchase.supplier_name)).size}</p></div>
        </section>

        <section className={`${cardClass} p-5`}>
          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <input value={search} onChange={(event) => setSearch(event.target.value)} className={inputClass} placeholder={isAr ? "ابحث باسم المورد أو رقم الفاتورة..." : "Search supplier or invoice reference..."} />
            <select value={period} onChange={(event) => setPeriod(event.target.value)} className={inputClass}>
              <option value="all">{isAr ? "كل الفترات" : "All time"}</option>
              <option value="30">{isAr ? "آخر 30 يومًا" : "Last 30 days"}</option>
              <option value="90">{isAr ? "آخر 90 يومًا" : "Last 90 days"}</option>
              <option value="365">{isAr ? "آخر سنة" : "Last year"}</option>
            </select>
          </div>
        </section>

        <section className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
              <thead><tr className={`border-b text-right text-xs text-slate-500 ${dark ? "border-white/[0.07]" : "border-slate-100"}`}>
                <th className="px-4 py-4">{isAr ? "التاريخ" : "Date"}</th><th className="px-4 py-4">{isAr ? "المورد" : "Supplier"}</th><th className="px-4 py-4">{isAr ? "رقم الفاتورة" : "Invoice reference"}</th><th className="px-4 py-4">{isAr ? "الخزنة" : "Vault"}</th><th className="px-4 py-4">{isAr ? "الإجمالي" : "Total"}</th><th className="px-4 py-4" />
              </tr></thead>
              <tbody>
                {filteredPurchases.map((purchase) => (
                  <FragmentPurchase key={purchase.id} purchase={purchase} accountName={accounts.find((account) => account.id === purchase.account_id)?.name || "—"} expanded={expandedId === purchase.id} items={itemsByPurchase[purchase.id]} loadingDetails={loadingDetails === purchase.id} dark={dark} isAr={isAr} onToggle={() => void toggleDetails(purchase.id)} onEdit={() => void startEdit(purchase)} canEdit={can("financial_sensitive_data", "view") && can("inventory", "edit") && can("finance_page", "view")} dateText={dateText} />
                ))}
                {!filteredPurchases.length && <tr><td colSpan={6} className="px-4 py-16 text-center text-slate-500">{isAr ? (search ? "لا توجد فواتير تطابق البحث." : "لا توجد فواتير شراء مسجلة حتى الآن.") : (search ? "No purchase invoices match your search." : "No purchase invoices have been recorded yet.")}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {editingPurchase && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><section dir={isAr ? "rtl" : "ltr"} className={`max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-7 ${dark ? "border-white/10 bg-[#13161B] text-white" : "border-slate-200 bg-white text-slate-900"}`}>
        <header className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-xl font-black">{isAr ? "تعديل فاتورة الشراء" : "Edit purchase invoice"}</h2><p className="mt-1 text-xs text-slate-500">{isAr ? "سيتم تحديث المخزون وتسجيل فرق المبلغ في الخزنة تلقائيًا." : "Stock and the vault ledger will be adjusted automatically."}</p></div><button type="button" onClick={() => setEditingPurchase(null)} className="rounded-lg px-3 py-2 text-xl text-slate-500" aria-label={isAr ? "إغلاق" : "Close"}>×</button></header>
        {editError && <div role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{editError}</div>}
        <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-bold text-slate-500">{isAr ? "المورد" : "Supplier"}</span><input value={editSupplier} onChange={(event) => setEditSupplier(event.target.value)} className={inputClass} /></label><label><span className="mb-1 block text-xs font-bold text-slate-500">{isAr ? "الخزنة" : "Vault"}</span><select value={editAccountId} onChange={(event) => setEditAccountId(event.target.value)} className={inputClass}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label><span className="mb-1 block text-xs font-bold text-slate-500">{isAr ? "رقم فاتورة المورد" : "Supplier invoice reference"}</span><input value={editReference} onChange={(event) => setEditReference(event.target.value)} className={inputClass} /></label><label><span className="mb-1 block text-xs font-bold text-slate-500">{isAr ? "ملاحظات" : "Notes"}</span><input value={editNotes} onChange={(event) => setEditNotes(event.target.value)} className={inputClass} /></label></div>
        <div className="mt-6 flex items-center justify-between gap-3"><h3 className="font-black">{isAr ? "أصناف الفاتورة" : "Invoice items"}</h3><button type="button" onClick={() => setEditLines((current) => [...current, { product_id: "", quantity: "1", unit_cost: "0" }])} className="rounded-lg border border-cyan-500/30 px-3 py-2 text-xs font-bold text-cyan-500">+ {isAr ? "إضافة صنف" : "Add item"}</button></div>
        <div className="mt-3 space-y-2">{editLines.map((line, index) => <div key={`${line.product_id}-${index}`} className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_110px_140px_40px] ${dark ? "border-white/[0.07] bg-[#0F1115]" : "border-slate-100 bg-slate-50"}`}><select value={line.product_id} onChange={(event) => setEditLines((current) => current.map((item, i) => i === index ? { ...item, product_id: event.target.value } : item))} className={inputClass}><option value="">{isAr ? "اختار المنتج" : "Select product"}</option>{editProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.unit || "piece"}</option>)}</select><input aria-label={isAr ? "الكمية" : "Quantity"} type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setEditLines((current) => current.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))} className={inputClass} /><input aria-label={isAr ? "سعر الوحدة" : "Unit cost"} type="number" min="0" step="0.01" value={line.unit_cost} onChange={(event) => setEditLines((current) => current.map((item, i) => i === index ? { ...item, unit_cost: event.target.value } : item))} className={inputClass} /><button type="button" onClick={() => setEditLines((current) => current.filter((_, i) => i !== index))} className="rounded-lg text-xl text-rose-400" aria-label={isAr ? "حذف الصنف" : "Remove item"}>×</button></div>)}</div>
        <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-lg font-black">{isAr ? "الإجمالي الجديد:" : "New total:"} <span className="text-cyan-500">{money(editTotal)}</span></p><div className="flex gap-2"><button type="button" onClick={() => setEditingPurchase(null)} className={`rounded-xl border px-4 py-3 text-sm font-bold ${dark ? "border-white/10" : "border-slate-200"}`}>{isAr ? "إلغاء" : "Cancel"}</button><button type="button" onClick={() => void saveEdit()} disabled={savingEdit} className="rounded-xl bg-cyan-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{savingEdit ? (isAr ? "جارٍ الحفظ..." : "Saving...") : (isAr ? "حفظ التعديل" : "Save changes")}</button></div></div>
      </section></div>}
    </main>
  );
}

function FragmentPurchase({ purchase, accountName, expanded, items, loadingDetails, dark, isAr, onToggle, onEdit, canEdit, dateText }: {
  purchase: Purchase;
  accountName: string;
  expanded: boolean;
  items?: PurchaseItem[];
  loadingDetails: boolean;
  dark: boolean;
  isAr: boolean;
  onToggle: () => void;
  onEdit: () => void;
  canEdit: boolean;
  dateText: (value: string) => string;
}) {
  const { can } = useStaffPermissions();
  const money = (value: number) => can("financial_sensitive_data", "view") ? formatPurchaseMoney(value) : "••••••";
  return <>
    <tr className={`border-b ${dark ? "border-white/[0.05]" : "border-slate-100"}`}>
      <td className="px-4 py-4 whitespace-nowrap text-slate-500">{dateText(purchase.created_at)}</td>
      <td className="px-4 py-4 font-bold">{purchase.supplier_name}</td>
      <td className="px-4 py-4">{purchase.invoice_reference || "—"}</td>
      <td className="px-4 py-4">{accountName}</td>
      <td className="px-4 py-4 whitespace-nowrap font-black">{money(Number(purchase.total_amount || 0))}</td>
      <td className="px-4 py-4"><div className="flex gap-2"><button type="button" onClick={onToggle} className="rounded-lg border border-cyan-500/30 px-3 py-2 text-xs font-bold text-cyan-500">{expanded ? (isAr ? "إخفاء" : "Hide") : (isAr ? "التفاصيل" : "Details")}</button>{canEdit && <button type="button" onClick={onEdit} className="rounded-lg border border-amber-500/30 px-3 py-2 text-xs font-bold text-amber-500">{isAr ? "تعديل" : "Edit"}</button>}</div></td>
    </tr>
    {expanded && <tr className={dark ? "bg-[#0F1115]" : "bg-slate-50"}><td colSpan={6} className="px-4 py-4">
      {purchase.notes && <p className="mb-3 text-xs text-slate-500">{isAr ? "ملاحظات:" : "Notes:"} {purchase.notes}</p>}
      {loadingDetails ? <p className="py-4 text-center text-sm text-slate-500">{isAr ? "جارٍ تحميل التفاصيل..." : "Loading details..."}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-xs"><thead><tr className="text-right text-slate-500"><th className="px-3 py-2">{isAr ? "الصنف" : "Product"}</th><th className="px-3 py-2">{isAr ? "الكمية" : "Quantity"}</th><th className="px-3 py-2">{isAr ? "سعر الوحدة" : "Unit cost"}</th><th className="px-3 py-2">{isAr ? "الإجمالي" : "Line total"}</th></tr></thead><tbody>{(items || []).map((item) => <tr key={item.id} className="border-t border-white/[0.06]"><td className="px-3 py-3 font-semibold">{item.product?.name || item.product_id}</td><td className="px-3 py-3">{Number(item.quantity)} {item.product?.unit || ""}</td><td className="px-3 py-3">{money(Number(item.unit_cost))}</td><td className="px-3 py-3 font-bold">{money(Number(item.line_total))}</td></tr>)}{!items?.length && <tr><td colSpan={4} className="px-3 py-5 text-center text-slate-500">{isAr ? "لا توجد تفاصيل أصناف لهذه الفاتورة." : "No item details found for this invoice."}</td></tr>}</tbody></table></div>}
    </td></tr>}
  </>;
}
