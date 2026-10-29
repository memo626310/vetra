"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";
import { vetraCore } from "@/lib/vetra-core";
import { writeVetraThemeMode } from "@/lib/theme";
import { useStaffPermissions } from "@/lib/use-staff-permissions";
import { clearFormDraft, getFormDraftStorageKey, readFormDraft, writeFormDraft } from "@/lib/form-drafts";

type Supplier = { id: string; name: string; phone: string | null; notes: string | null };
type Category = { id: string; name: string };
type Product = { id: string; name: string; barcode: string | null; unit: string | null; quantity: number; wholesale_price: number | null; retail_price: number | null; last_purchase_price: number | null; expiry_date: string | null; reorder_level: number | null };
type Account = { id: string; name: string; account_type: string; current_balance: number; is_default: boolean };
type Line = { key: string; product_id: string; quantity: string; unit_cost: string };

function money(value: number) {
  return `${new Intl.NumberFormat("en-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} EGP`;
}

export default function InventoryPurchasesPage() {
  const router = useRouter();
  const { can, loaded: permissionsLoaded } = useStaffPermissions();
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [dark, setDark] = useState(true);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [supplierId, setSupplierId] = useState("");
  const [invoiceReference, setInvoiceReference] = useState("");
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState("");
  const [paymentType, setPaymentType] = useState<"cash" | "credit">("cash");
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showProductResults, setShowProductResults] = useState(false);
  const [activeProductIndex, setActiveProductIndex] = useState(0);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [newSupplierNotes, setNewSupplierNotes] = useState("");
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductCategoryId, setNewProductCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [newProductBarcode, setNewProductBarcode] = useState("");
  const [newProductUnit, setNewProductUnit] = useState("piece");
  const [newProductWholesalePrice, setNewProductWholesalePrice] = useState("");
  const [newProductRetailPrice, setNewProductRetailPrice] = useState("");
  const [newProductReorderLevel, setNewProductReorderLevel] = useState("0");
  const [newProductExpiryDate, setNewProductExpiryDate] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  const isAr = language === "ar";
  const inputClass = `w-full rounded-xl border px-3 py-3 outline-none focus:border-cyan-500 ${dark ? "border-white/10 bg-[#0F1115] text-white" : "border-slate-200 bg-slate-50 text-slate-900"}`;
  const cardClass = `rounded-3xl border p-5 sm:p-6 ${dark ? "border-white/[0.07] bg-[#13161B]" : "border-slate-100 bg-white shadow-sm"}`;
  const selectedProduct = products.find((product) => product.id === productId);
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const productQuery = productSearch.trim().toLocaleLowerCase();
  const matchingProducts = products.filter((product) => !productQuery || product.name.toLocaleLowerCase().includes(productQuery) || product.barcode?.toLocaleLowerCase().includes(productQuery)).slice(0, 20);
  const total = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cost || 0), 0);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("vetra-language");
    const savedTheme = window.localStorage.getItem("vetra-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLanguage(savedLanguage === "en" ? "en" : "ar");
    setDark(savedTheme !== "light");
    void getFormDraftStorageKey("inventory-purchase").then((key) => {
      if (key) {
        const draft = readFormDraft<{
          supplierId: string; invoiceReference: string; notes: string; accountId: string; paymentType?: "cash" | "credit"; productSearch?: string;
          productId: string; quantity: string; unitCost: string; lines: Line[];
          showSupplierForm: boolean; newSupplierName: string; newSupplierPhone: string; newSupplierNotes: string;
          showProductForm: boolean; newProductName: string; newProductCategoryId: string; newCategoryName: string;
          newProductBarcode: string; newProductUnit: string; newProductWholesalePrice: string;
          newProductRetailPrice: string; newProductReorderLevel: string; newProductExpiryDate: string;
        }>(key);
        if (draft) {
          setSupplierId(draft.supplierId || ""); setInvoiceReference(draft.invoiceReference || "");
          setNotes(draft.notes || ""); setAccountId(draft.accountId || "");
          setPaymentType(draft.paymentType === "credit" ? "credit" : "cash"); setProductSearch(draft.productSearch || "");
          setProductId(draft.productId || ""); setQuantity(draft.quantity || ""); setUnitCost(draft.unitCost || "");
          setLines(Array.isArray(draft.lines) ? draft.lines : []);
          setShowSupplierForm(Boolean(draft.showSupplierForm)); setNewSupplierName(draft.newSupplierName || "");
          setNewSupplierPhone(draft.newSupplierPhone || ""); setNewSupplierNotes(draft.newSupplierNotes || "");
          setShowProductForm(Boolean(draft.showProductForm)); setNewProductName(draft.newProductName || "");
          setNewProductCategoryId(draft.newProductCategoryId || ""); setNewCategoryName(draft.newCategoryName || "");
          setNewProductBarcode(draft.newProductBarcode || ""); setNewProductUnit(draft.newProductUnit || "piece");
          setNewProductWholesalePrice(draft.newProductWholesalePrice || ""); setNewProductRetailPrice(draft.newProductRetailPrice || "");
          setNewProductReorderLevel(draft.newProductReorderLevel || "0"); setNewProductExpiryDate(draft.newProductExpiryDate || "");
        }
        setDraftKey(key);
      }
      setDraftRestored(true);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!draftRestored || !draftKey) return;
    writeFormDraft(draftKey, {
      supplierId, invoiceReference, notes, accountId, paymentType, productSearch, productId, quantity, unitCost, lines,
      showSupplierForm, newSupplierName, newSupplierPhone, newSupplierNotes,
      showProductForm, newProductName, newProductCategoryId, newCategoryName,
      newProductBarcode, newProductUnit, newProductWholesalePrice, newProductRetailPrice,
      newProductReorderLevel, newProductExpiryDate,
    });
  }, [draftRestored, draftKey, supplierId, invoiceReference, notes, accountId, paymentType, productSearch, productId, quantity, unitCost,
    lines, showSupplierForm, newSupplierName, newSupplierPhone, newSupplierNotes, showProductForm,
    newProductName, newProductCategoryId, newCategoryName, newProductBarcode, newProductUnit,
    newProductWholesalePrice, newProductRetailPrice, newProductReorderLevel, newProductExpiryDate]);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dir = isAr ? "rtl" : "ltr";
    document.documentElement.lang = isAr ? "ar" : "en";
    document.documentElement.classList.toggle("dark", dark);
    window.localStorage.setItem("vetra-language", language);
    writeVetraThemeMode(dark);
  }, [ready, isAr, dark, language]);

  async function loadData() {
    if (!permissionsLoaded) return;
    setLoading(true);
    setError("");
    try {
      const { data: { user } } = await vetraCore.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const context = await getClinicContext();
      const isOwnerOrAdmin = ["owner", "admin"].includes(context.role);
      const canCreatePurchase = permissionsLoaded && can("inventory", "view") && can("inventory", "create") && can("finance_page", "view");
      if (!isOwnerOrAdmin && !canCreatePurchase) { setAuthorized(false); return; }
      setAuthorized(true);
      const db = await getClinicDb();
      const [supplierResult, productResult, categoryResult, accountResult] = await Promise.all([
        db.from("inventory_suppliers").select("id,name,phone,notes").eq("clinic_id", context.clinic_id).eq("is_active", true).order("name"),
        db.from("products").select("id,name,barcode,unit,quantity,wholesale_price,retail_price,last_purchase_price,expiry_date,reorder_level").eq("clinic_id", context.clinic_id).eq("is_active", true).order("name"),
        db.from("product_categories").select("id,name").eq("clinic_id", context.clinic_id).order("name"),
        db.from("financial_account_balances").select("id,name,account_type,current_balance,is_default").eq("clinic_id", context.clinic_id).eq("is_active", true).order("name"),
      ]);
      if (supplierResult.error) throw supplierResult.error;
      if (productResult.error) throw productResult.error;
      if (categoryResult.error) throw categoryResult.error;
      if (accountResult.error) throw accountResult.error;
      const nextAccounts = (accountResult.data || []) as Account[];
      setSuppliers((supplierResult.data || []) as Supplier[]);
      setProducts((productResult.data || []) as Product[]);
      setCategories((categoryResult.data || []) as Category[]);
      setAccounts(nextAccounts);
      setAccountId((current) => current && nextAccounts.some((account) => account.id === current)
        ? current
        : nextAccounts.find((account) => account.account_type === "cash" && account.is_default)?.id
          || nextAccounts.find((account) => account.account_type === "cash")?.id
          || nextAccounts[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : (isAr ? "تعذر تحميل بيانات المشتريات." : "Could not load purchase data."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ready && permissionsLoaded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadData();
    }
    // loadData reads the current session and clinic context when the page becomes ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, permissionsLoaded]);

  function selectProduct(nextId: string) {
    setProductId(nextId);
    setProductSearch("");
    setShowProductResults(false);
    setActiveProductIndex(0);
    setError("");
    const product = products.find((item) => item.id === nextId);
    setUnitCost(product && can("financial_sensitive_data", "view") ? String(product.last_purchase_price ?? product.wholesale_price ?? "") : "");
  }

  function scanBarcode(rawValue = barcodeInput) {
    const code = rawValue.trim();
    if (!code) return;
    const product = products.find((item) => item.barcode?.trim() === code);
    setBarcodeInput("");
    if (!product) {
      setProductId("");
      setProductSearch("");
      setShowProductResults(false);
      setNewProductBarcode(code);
      setShowProductForm(true);
      setError(isAr ? "الباركود غير مسجل. أكمل بيانات المنتج الجديد ثم احفظه." : "Barcode not found. Complete the new product details and save it.");
      return;
    }
    selectProduct(product.id);
    setQuantity("1");
    setNotice(isAr ? `تم اختيار ${product.name}. راجع الرصيد الحالي والكمية وسعر الشراء ثم أضفه للفاتورة.` : `${product.name} selected. Review current stock, quantity and cost, then add it to the invoice.`);
    window.setTimeout(() => quantityInputRef.current?.focus(), 0);
  }

  function addLine() {
    const lineQuantity = Number(quantity);
    const lineCost = Number(unitCost);
    if (!selectedProduct || !unitCost.trim() || !Number.isFinite(lineQuantity) || lineQuantity <= 0 || !Number.isFinite(lineCost) || lineCost < 0) {
      setError(isAr ? "اختار صنفًا واكتب كمية وسعر شراء صحيحين." : "Choose a product and enter a valid quantity and unit cost.");
      return;
    }
    setError("");
    setLines((current) => {
      const existing = current.find((line) => line.product_id === productId);
      if (existing) return current.map((line) => line.product_id === productId ? { ...line, quantity: String(Number(line.quantity) + lineQuantity), unit_cost: String(lineCost) } : line);
      return [...current, { key: crypto.randomUUID(), product_id: productId, quantity: String(lineQuantity), unit_cost: String(lineCost) }];
    });
    setProductId("");
    setProductSearch("");
    setQuantity("");
    setUnitCost("");
    window.setTimeout(() => barcodeInputRef.current?.focus(), 0);
  }

  async function saveCategory() {
    if (!can("inventory", "create")) { setError(isAr ? "لا تملك صلاحية إنشاء مشتريات أو أصناف المخزون." : "You do not have permission to create inventory records."); return; }
    const name = newCategoryName.trim();
    if (!name) {
      setError(isAr ? "اكتب اسم التصنيف." : "Enter a category name.");
      return;
    }
    setSavingCategory(true);
    setError("");
    try {
      const context = await getClinicContext();
      const db = await getClinicDb();
      const { data, error: categoryError } = await db
        .from("product_categories")
        .insert({ clinic_id: context.clinic_id, name })
        .select("id,name")
        .single();
      if (categoryError) {
        if (categoryError.code === "23505") throw new Error(isAr ? "هذا التصنيف موجود بالفعل." : "This category already exists.");
        throw categoryError;
      }
      if (data) {
        setCategories((current) => [...current, data as Category].sort((a, b) => a.name.localeCompare(b.name)));
        setNewProductCategoryId(data.id);
      }
      setNewCategoryName("");
      setNotice(isAr ? "تمت إضافة التصنيف." : "Category added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : (isAr ? "تعذر إضافة التصنيف." : "Could not add the category."));
    } finally {
      setSavingCategory(false);
    }
  }

  async function saveSupplier() {
    if (!can("inventory", "create")) { setError(isAr ? "لا تملك صلاحية إنشاء مشتريات أو أصناف المخزون." : "You do not have permission to create inventory records."); return; }
    if (!newSupplierName.trim()) { setError(isAr ? "اكتب اسم المورد." : "Enter a supplier name."); return; }
    setSavingSupplier(true);
    setError("");
    try {
      const db = await getClinicDb();
      const { data, error: supplierError } = await db.rpc("vetra_create_inventory_supplier", {
        p_name: newSupplierName.trim(),
        p_phone: newSupplierPhone.trim() || null,
        p_notes: newSupplierNotes.trim() || null,
      });
      if (supplierError) throw supplierError;
      await loadData();
      if (typeof data === "string") setSupplierId(data);
      setNewSupplierName("");
      setNewSupplierPhone("");
      setNewSupplierNotes("");
      setShowSupplierForm(false);
      setNotice(isAr ? "تمت إضافة المورد." : "Supplier added.");
    } catch (err) {
      const detail = err instanceof Error
        ? err.message
        : err && typeof err === "object" && "message" in err
          ? String(err.message)
          : "";
      if (/vetra_create_inventory_supplier|function .* does not exist|schema cache/i.test(detail)) {
        setError(isAr
          ? "إعداد قاعدة بيانات المشتريات غير مكتمل. شغّل ملف supabase/tenant-sql/vetra_inventory_purchases.sql على قاعدة بيانات العيادة ثم أعد المحاولة."
          : "Inventory purchasing is not installed on this clinic database. Run supabase/tenant-sql/vetra_inventory_purchases.sql on the clinic database, then retry.");
      } else {
        setError(detail || (isAr ? "تعذر إضافة المورد." : "Could not add supplier."));
      }
    } finally { setSavingSupplier(false); }
  }

  async function saveProduct() {
    if (!can("inventory", "create")) { setError(isAr ? "لا تملك صلاحية إنشاء مشتريات أو أصناف المخزون." : "You do not have permission to create inventory records."); return; }
    if (!newProductName.trim()) {
      setError(isAr ? "اكتب اسم الصنف." : "Enter an item name.");
      return;
    }
    if (!newProductCategoryId) {
      setError(isAr ? "اختار تصنيفًا للمنتج الجديد." : "Choose a category for the new product.");
      return;
    }

    setSavingProduct(true);
    setError("");
    try {
      const context = await getClinicContext();
      const db = await getClinicDb();
      const { data, error: productError } = await db
        .from("products")
        .insert({
          clinic_id: context.clinic_id,
          name: newProductName.trim(),
          category_id: newProductCategoryId || null,
          barcode: newProductBarcode.trim() || null,
          unit: newProductUnit.trim() || "piece",
          quantity: 0,
          wholesale_price: Number(newProductWholesalePrice) || 0,
          retail_price: Number(newProductRetailPrice) || 0,
          last_purchase_price: Number(newProductWholesalePrice) || 0,
          expiry_date: newProductExpiryDate || null,
          reorder_level: Number(newProductReorderLevel) || 0,
          notes: null,
          is_active: true,
        })
        .select("id,name,barcode,unit,quantity,wholesale_price,retail_price,last_purchase_price,expiry_date,reorder_level")
        .single();
      if (productError) throw productError;

      const createdProduct = data as Product;
      setProducts((current) => [...current, createdProduct].sort((a, b) => a.name.localeCompare(b.name)));
      setProductId(createdProduct.id);
      setProductSearch("");
      setShowProductResults(false);
      setUnitCost(newProductWholesalePrice);
      setNewProductName("");
      setNewProductCategoryId("");
      setNewProductBarcode("");
      setNewProductUnit("piece");
      setNewProductWholesalePrice("");
      setNewProductRetailPrice("");
      setNewProductReorderLevel("0");
      setNewProductExpiryDate("");
      setShowProductForm(false);
      setNotice(isAr ? "تمت إضافة الصنف. اكتب الكمية وسعر الشراء لإضافته للفاتورة." : "Item added. Enter its quantity and purchase cost to add it to the bill.");
    } catch (err) {
      setError(err instanceof Error ? err.message : (isAr ? "تعذر إضافة الصنف." : "Could not add the item."));
    } finally {
      setSavingProduct(false);
    }
  }

  async function savePurchase() {
    if (!can("finance_page", "view")) { setError(isAr ? "تحتاج صلاحية تسجيل حركة الخزنة لتسجيل فاتورة الشراء." : "Payment creation permission is required to post a purchase bill."); return; }
    if (!can("inventory", "create")) { setError(isAr ? "لا تملك صلاحية إنشاء مشتريات أو أصناف المخزون." : "You do not have permission to create inventory records."); return; }
    setError("");
    setNotice("");
    if (!selectedSupplier || (paymentType === "cash" && !selectedAccount) || !lines.length || !Number.isFinite(total) || total <= 0) {
      setError(isAr ? "اختار المورد ونوع الدفع والخزنة للكاش وأضف صنفًا واحدًا على الأقل بإجمالي أكبر من صفر." : "Choose a supplier, payment type and cash vault, then add items with a positive total.");
      return;
    }
    if (lines.some((line) => !products.some((product) => product.id === line.product_id) || !line.unit_cost.trim() || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 || !Number.isFinite(Number(line.unit_cost)) || Number(line.unit_cost) < 0)) {
      setError(isAr ? "راجع الأصناف والكميات وأسعار الشراء." : "Check products, quantities and unit costs.");
      return;
    }
    setSaving(true);
    try {
      const db = await getClinicDb();
      const { error: purchaseError } = await db.rpc("vetra_create_inventory_purchase", {
        p_supplier_name: selectedSupplier.name,
        p_account_id: paymentType === "cash" ? accountId : null,
        // Cash is the RPC default, including on clinics awaiting the credit upgrade.
        ...(paymentType === "credit" ? { p_payment_type: paymentType } : {}),
        p_items: lines.map((line) => ({ product_id: line.product_id, quantity: Number(line.quantity), unit_cost: Number(line.unit_cost) })),
        p_invoice_reference: invoiceReference.trim() || null,
        p_notes: notes.trim() || null,
        p_idempotency_key: crypto.randomUUID(),
      });
      if (purchaseError) throw purchaseError;
      setLines([]);
      setInvoiceReference("");
      setNotes("");
      clearFormDraft(draftKey);
      setNotice(paymentType === "credit"
        ? (isAr ? "تم تسجيل فاتورة شراء آجلة وزيادة المخزون. المبلغ مستحق للمورد ولم يُخصم من الخزنة." : "Credit purchase invoice recorded and stock increased. The amount is owed to the supplier; no vault debit was made.")
        : (isAr ? "تم تسجيل فاتورة الشراء وزيادة المخزون وخصم المبلغ من الخزنة." : "Purchase invoice recorded, stock increased, and the bill deducted from the vault."));
      await loadData();
    } catch (err) {
      const detail = err && typeof err === "object" && "message" in err ? String(err.message) : "";
      setError(/vetra_create_inventory_purchase|schema cache|payment_type/i.test(detail)
        ? (isAr ? "يلزم تحديث قاعدة بيانات العيادة بملف supabase/tenant-sql/vetra_inventory_purchases.sql لدعم الكاش والآجل." : "Update the clinic database with supabase/tenant-sql/vetra_inventory_purchases.sql to support cash and credit purchases.")
        : detail || (isAr ? "تعذر تسجيل فاتورة الشراء." : "Could not record the purchase."));
    } finally { setSaving(false); }
  }

  if (!ready || loading) return <main className={`flex min-h-screen items-center justify-center ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}><p>{isAr ? "جارٍ تحميل المشتريات..." : "Loading purchases..."}</p></main>;
  if (authorized === false) return <main className={`flex min-h-screen items-center justify-center p-6 ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}><div className={cardClass}><h1 className="text-2xl font-black">{isAr ? "غير مصرح بالدخول" : "Access restricted"}</h1><p className="mt-3 text-sm text-slate-500">{isAr ? "إدارة المشتريات متاحة للمالك ومدير العيادة فقط." : "Purchases are available to the clinic owner and admin only."}</p></div></main>;

  return (
    <main dir={isAr ? "rtl" : "ltr"} className={`min-h-screen ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}>
      <div className="mx-auto max-w-[1250px] space-y-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><button type="button" onClick={() => router.push("/dashboard")} className="mb-3 text-sm text-slate-500 hover:text-cyan-500">← {isAr ? "الرئيسية" : "Dashboard"}</button><p className="text-sm font-semibold text-cyan-500">VETRA / INVENTORY</p><h1 className="mt-2 text-3xl font-black">{isAr ? "فاتورة شراء" : "Purchase invoice"}</h1><p className="mt-2 text-sm text-slate-500">{isAr ? "سجل فاتورة المورد وزوّد المخزون، مع الدفع كاش أو آجل." : "Record a supplier invoice, increase stock, and choose cash or credit."}</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => router.push("/inventory/purchases/history")} className={`rounded-xl border px-4 py-2 text-sm font-bold ${dark ? "border-cyan-500/30 bg-[#171A20] text-cyan-400" : "border-cyan-200 bg-white text-cyan-700"}`}>{isAr ? "فواتير الشراء السابقة" : "Purchase history"}</button><button type="button" onClick={() => setDark((value) => !value)} className={`rounded-xl border px-3 py-2 ${dark ? "border-white/10 bg-[#171A20]" : "border-slate-200 bg-white"}`}>{dark ? "☀️" : "🌙"}</button><button type="button" onClick={() => setLanguage((value) => value === "ar" ? "en" : "ar")} className={`rounded-xl border px-3 py-2 text-sm font-bold ${dark ? "border-white/10 bg-[#171A20]" : "border-slate-200 bg-white"}`}>{isAr ? "English" : "عربي"}</button></div>
        </header>

        {error && <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
        {notice && <div role="status" className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}

        <section className={cardClass}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div><label className="mb-2 block text-sm font-bold">{isAr ? "المورد" : "Supplier"}</label><div className="flex gap-2"><select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass}><option value="">{isAr ? "اختار المورد" : "Select supplier"}</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.phone ? ` · ${supplier.phone}` : ""}</option>)}</select><button type="button" onClick={() => setShowSupplierForm((value) => !value)} className="shrink-0 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-bold text-white">+ {isAr ? "مورد" : "Supplier"}</button></div></div>
            <fieldset><legend className="mb-2 text-sm font-bold">{isAr ? "نوع الدفع" : "Payment type"}</legend><div className="flex gap-2">{(["cash", "credit"] as const).map((type) => <label key={type} className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold ${paymentType === type ? "border-cyan-500 bg-cyan-500/10 text-cyan-500" : dark ? "border-white/10" : "border-slate-200"}`}><input type="radio" name="purchase-payment-type" value={type} checked={paymentType === type} onChange={() => setPaymentType(type)} className="accent-cyan-600" />{type === "cash" ? (isAr ? "كاش" : "Cash") : (isAr ? "آجل" : "Credit")}</label>)}</div></fieldset>
            {paymentType === "cash" ? <label className="block"><span className="mb-2 block text-sm font-bold">{isAr ? "الخزنة" : "Vault"}</span><select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}><option value="">{isAr ? "اختار الخزنة" : "Select vault"}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {money(Number(account.current_balance || 0))}</option>)}</select>{selectedAccount?.account_type === "cash" && <span className="mt-1 block text-xs text-amber-500">{isAr ? "الخزنة النقدية تحتاج وردية مفتوحة." : "The cash vault needs an open register session."}</span>}</label> : <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500">{isAr ? "فاتورة آجلة: تُضاف الكميات للمخزون وتظل قيمة الفاتورة مستحقة للمورد، بدون خصم من الخزنة." : "Credit invoice: stock increases and the invoice remains owed to the supplier, with no vault debit."}</div>}
            <label className="block"><span className="mb-2 block text-sm font-bold">{isAr ? "رقم فاتورة المورد" : "Supplier invoice reference"}</span><input value={invoiceReference} onChange={(e) => setInvoiceReference(e.target.value)} className={inputClass} placeholder={isAr ? "اختياري" : "Optional"} /></label>
          </div>

          {showSupplierForm && <div className={`mt-5 rounded-2xl border p-4 ${dark ? "border-white/[0.06] bg-[#0F1115]" : "border-slate-100 bg-slate-50"}`}><div className="grid gap-3 md:grid-cols-3"><input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} className={inputClass} placeholder={isAr ? "اسم المورد *" : "Supplier name *"} /><input value={newSupplierPhone} onChange={(e) => setNewSupplierPhone(e.target.value)} className={inputClass} placeholder={isAr ? "التليفون" : "Phone"} /><input value={newSupplierNotes} onChange={(e) => setNewSupplierNotes(e.target.value)} className={inputClass} placeholder={isAr ? "ملاحظات" : "Notes"} /></div><button type="button" onClick={() => void saveSupplier()} disabled={savingSupplier} className="mt-3 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{savingSupplier ? (isAr ? "جارٍ الحفظ..." : "Saving...") : (isAr ? "حفظ المورد" : "Save supplier")}</button></div>}

          <div className={`mt-5 rounded-2xl border p-4 ${dark ? "border-white/[0.06] bg-[#0F1115]" : "border-slate-100 bg-slate-50"}`}>
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-base font-black">{isAr ? "اختيار الصنف بالباركود" : "Select product by barcode"}</h2><p className="text-xs text-slate-500">{isAr ? "استخدم قارئ الباركود ثم Enter أو الكاميرا، وراجع الرصيد والكمية قبل الإضافة." : "Use a barcode reader and Enter, or the camera, then review stock and quantity before adding."}</p></div>
              <span className="text-xs font-bold text-cyan-500">{isAr ? "الماسح المدمج" : "Integrated scanner"}</span>
            </div>
            <div className="flex gap-2">
              <input aria-label={isAr ? "قارئ الباركود" : "Barcode reader"} ref={barcodeInputRef} value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); scanBarcode(); } }} className={inputClass} placeholder={isAr ? "امسح الباركود هنا..." : "Scan barcode here..."} inputMode="numeric" autoComplete="off" />
              <button type="button" onClick={() => scanBarcode()} className="shrink-0 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold text-white">{isAr ? "بحث" : "Find"}</button>
              <button type="button" onClick={() => setShowScanner(true)} className={`shrink-0 rounded-xl border px-4 py-3 text-sm font-bold ${dark ? "border-white/10 bg-[#171A20]" : "border-slate-200 bg-white"}`} title={isAr ? "فتح كاميرا مسح الباركود" : "Open barcode camera scanner"}>📷</button>
            </div>
          </div>

          <div className={`mt-5 rounded-2xl border p-4 ${dark ? "border-white/[0.06] bg-[#0F1115]" : "border-slate-100 bg-slate-50"}`}>
            <div className="grid gap-3 lg:grid-cols-[1.6fr_0.7fr_0.9fr_auto] lg:items-end">
              <div>
                <label htmlFor="purchase-product-search" className="mb-2 block text-xs font-bold text-slate-500">{isAr ? "بحث عن صنف" : "Search products"}</label>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setShowProductResults(false); }}>
                    <input id="purchase-product-search" role="combobox" aria-autocomplete="list" aria-expanded={showProductResults} aria-controls="purchase-product-results" aria-activedescendant={showProductResults && matchingProducts[activeProductIndex] ? `purchase-product-${matchingProducts[activeProductIndex].id}` : undefined} autoComplete="off" className={inputClass} placeholder={isAr ? "اكتب اسم الصنف أو الباركود..." : "Type a product name or barcode..."} value={selectedProduct?.name || productSearch}
                      onFocus={() => setShowProductResults(true)}
                      onChange={(event) => { setProductSearch(event.target.value); setProductId(""); setUnitCost(""); setActiveProductIndex(0); setShowProductResults(true); }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setShowProductResults(false);
                        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setShowProductResults(true); setActiveProductIndex((index) => Math.max(0, Math.min(matchingProducts.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); }
                        if (event.key === "Enter") {
                          event.preventDefault();
                          if (selectedProduct && !productSearch.trim()) { quantityInputRef.current?.focus(); setShowProductResults(false); return; }
                          const exactBarcode = productSearch.trim() ? products.find((product) => product.barcode?.trim() === productSearch.trim()) : undefined;
                          const match = exactBarcode || (showProductResults ? matchingProducts[activeProductIndex] : undefined);
                          if (match) { selectProduct(match.id); window.setTimeout(() => quantityInputRef.current?.focus(), 0); }
                        }
                      }} />
                    {showProductResults && <ul id="purchase-product-results" role="listbox" aria-label={isAr ? "نتائج البحث عن الأصناف" : "Product search results"} className={`absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border shadow-xl ${dark ? "border-white/10 bg-[#171A20]" : "border-slate-200 bg-white"}`}>
                      {matchingProducts.map((product, index) => <li id={`purchase-product-${product.id}`} key={product.id} role="option" aria-selected={index === activeProductIndex} onMouseDown={(event) => event.preventDefault()} onClick={() => { selectProduct(product.id); quantityInputRef.current?.focus(); }} className={`cursor-pointer px-3 py-3 text-sm hover:bg-cyan-500/10 ${index === activeProductIndex ? "bg-cyan-500/10" : ""}`}><span className="block font-bold">{product.name}</span><span className="mt-1 block text-xs text-slate-500">{product.barcode ? `${product.barcode} · ` : ""}{isAr ? "المتاح حاليًا" : "Currently in stock"}: {product.quantity} {product.unit || "piece"}</span></li>)}
                      {!matchingProducts.length && <li className="px-3 py-4 text-sm text-slate-500">{isAr ? "لا توجد أصناف مطابقة. يمكنك إنشاء منتج جديد." : "No matching products. You can create a new product."}</li>}
                    </ul>}
                  </div>
                  <button type="button" onClick={() => setShowProductForm((value) => !value)} className="shrink-0 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-bold text-white">+ {isAr ? "إنشاء منتج" : "New product"}</button>
                </div>
              </div>
              <label className="block"><span className="mb-2 block text-xs font-bold text-slate-500">{isAr ? "الكمية" : "Quantity"}</span><input ref={quantityInputRef} type="number" min="0.001" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} /></label>
              <label className="block"><span className="mb-2 block text-xs font-bold text-slate-500">{isAr ? "سعر الشراء" : "Unit cost"}</span><input type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className={inputClass} /></label>
              <button type="button" onClick={addLine} className="rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold text-white">{isAr ? "إضافة" : "Add"}</button>
            </div>
            {selectedProduct && <div role="status" className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-500">{selectedProduct.name} — {isAr ? "الكمية المتاحة حاليًا في المخزون قبل الإضافة" : "Current stock before this purchase"}: <span className="text-lg">{selectedProduct.quantity}</span> {selectedProduct.unit || "piece"}</div>}
            {showProductForm && <div className={`mt-5 rounded-2xl border p-5 ${dark ? "border-cyan-500/30 bg-[#13161B]" : "border-cyan-200 bg-white"}`}><div className="mb-4"><h3 className="text-lg font-black">{isAr ? "إنشاء منتج جديد في الكتالوج" : "Create a new catalog product"}</h3><p className="mt-1 text-xs text-slate-500">{isAr ? "سيتم حفظ المنتج ببياناته الكاملة ثم اختياره تلقائيًا في فاتورة الشراء." : "The product will be saved with its full details and selected in this purchase bill."}</p></div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"><label><span className="mb-1 block text-xs font-bold text-slate-500">{isAr ? "اسم المنتج *" : "Product name *"}</span><input value={newProductName} onChange={(e) => setNewProductName(e.target.value)} className={inputClass} placeholder={isAr ? "مثال: طعام قطط" : "e.g. Cat food"} /></label><label><span className="mb-1 block text-xs font-bold text-slate-500">{isAr ? "الباركود" : "Barcode"}</span><input value={newProductBarcode} onChange={(e) => setNewProductBarcode(e.target.value)} className={inputClass} placeholder={isAr ? "امسح أو اكتب الباركود" : "Scan or type barcode"} inputMode="numeric" /></label><label><span className="mb-1 block text-xs font-bold text-slate-500">{isAr ? "الوحدة" : "Unit"}</span><input value={newProductUnit} onChange={(e) => setNewProductUnit(e.target.value)} className={inputClass} placeholder={isAr ? "قطعة / علبة" : "piece / box"} /></label><label><span className="mb-1 block text-xs font-bold text-slate-500">{isAr ? "سعر الشراء" : "Purchase price"}</span><input type="number" min="0" step="0.01" value={newProductWholesalePrice} onChange={(e) => setNewProductWholesalePrice(e.target.value)} className={inputClass} placeholder="0.00" /></label><label><span className="mb-1 block text-xs font-bold text-slate-500">{isAr ? "سعر البيع" : "Retail price"}</span><input type="number" min="0" step="0.01" value={newProductRetailPrice} onChange={(e) => setNewProductRetailPrice(e.target.value)} className={inputClass} placeholder="0.00" /></label><label><span className="mb-1 block text-xs font-bold text-slate-500">{isAr ? "تاريخ الانتهاء" : "Expiry date"}</span><input type="date" value={newProductExpiryDate} onChange={(e) => setNewProductExpiryDate(e.target.value)} className={inputClass} /></label><label><span className="mb-1 block text-xs font-bold text-slate-500">{isAr ? "حد إعادة الطلب" : "Reorder level"}</span><input type="number" min="0" step="1" value={newProductReorderLevel} onChange={(e) => setNewProductReorderLevel(e.target.value)} className={inputClass} /></label></div><button type="button" onClick={() => void saveProduct()} disabled={savingProduct} className="mt-5 rounded-xl bg-cyan-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{savingProduct ? (isAr ? "جارٍ الحفظ..." : "Saving...") : (isAr ? "حفظ المنتج وإضافته" : "Save product and add")}</button></div>}
          </div>

          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead><tr className="border-b border-white/[0.06] text-right text-xs text-slate-500"><th className="px-3 py-3">{isAr ? "الصنف" : "Product"}</th><th className="px-3 py-3">{isAr ? "الكمية" : "Quantity"}</th><th className="px-3 py-3">{isAr ? "سعر الوحدة" : "Unit cost"}</th><th className="px-3 py-3">{isAr ? "الإجمالي" : "Line total"}</th><th /></tr></thead><tbody>{lines.map((line) => { const product = products.find((item) => item.id === line.product_id); return <tr key={line.key} className="border-b border-white/[0.06]"><td className="px-3 py-3 font-semibold">{product?.name || "—"}</td><td className="px-3 py-3">{line.quantity} {product?.unit || ""}</td><td className="px-3 py-3">{money(Number(line.unit_cost))}</td><td className="px-3 py-3 font-black">{money(Number(line.quantity) * Number(line.unit_cost))}</td><td className="px-3 py-3 text-left"><button type="button" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} className="text-rose-400" aria-label={isAr ? "حذف الصنف" : "Remove item"}>×</button></td></tr>; })}{!lines.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">{isAr ? "لم تتم إضافة أصناف بعد." : "No items added yet."}</td></tr>}</tbody></table></div>

          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"><label className="block"><span className="mb-2 block text-sm font-bold">{isAr ? "ملاحظات" : "Notes"}</span><input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} placeholder={isAr ? "اختياري" : "Optional"} /></label><div className="flex items-center justify-between gap-5 sm:min-w-[300px] sm:justify-end"><div><p className="text-xs text-slate-500">{isAr ? "إجمالي الفاتورة" : "Bill total"}</p><p className="mt-1 text-2xl font-black text-cyan-500">{money(total)}</p></div><button type="button" onClick={() => void savePurchase()} disabled={saving || !lines.length} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? (isAr ? "جارٍ الحفظ..." : "Saving...") : (isAr ? "حفظ فاتورة الشراء" : "Save purchase invoice")}</button></div></div>
          {showProductForm && <div className={`mb-5 rounded-2xl border p-4 ${dark ? "border-cyan-500/30 bg-[#13161B]" : "border-cyan-200 bg-white"}`}><label className="block"><span className="mb-2 block text-sm font-bold">{isAr ? "تصنيف المنتج الجديد" : "New product category"}</span><select required value={newProductCategoryId} onChange={(e) => setNewProductCategoryId(e.target.value)} className={inputClass}><option value="">{isAr ? "اختار تصنيفًا" : "Select a category"}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className={inputClass} placeholder={isAr ? "إضافة تصنيف جديد..." : "Add a new category..."} /><button type="button" onClick={() => void saveCategory()} disabled={savingCategory} className="shrink-0 rounded-xl border border-cyan-500/40 px-4 py-2 text-sm font-bold text-cyan-500 disabled:opacity-50">{savingCategory ? (isAr ? "جارٍ الحفظ..." : "Saving...") : (isAr ? "حفظ التصنيف" : "Save category")}</button></div></div>}
        </section>
      </div>
      {showScanner && <BarcodeScanner onScan={(value) => { setShowScanner(false); scanBarcode(value); }} onClose={() => setShowScanner(false)} darkMode={dark} language={language} />}
    </main>
  );
}

function BarcodeScanner({ onScan, onClose, darkMode, language }: { onScan: (barcode: string) => void; onClose: () => void; darkMode: boolean; language: "ar" | "en" }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraError, setCameraError] = useState("");

  useEffect(() => {
    let stopped = false;
    let controls: { stop: () => void } | null = null;
    const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 40, delayBetweenScanSuccess: 200, tryPlayVideoTimeout: 5000 });

    async function start() {
      if (!videoRef.current) return;
      try {
        controls = await reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } }, videoRef.current, (result) => {
          if (!result || stopped) return;
          const value = result.getText().trim();
          if (!value) return;
          stopped = true;
          controls?.stop();
          onScan(value);
        });
        if (stopped) controls.stop();
      } catch (error) {
        console.error("PURCHASE BARCODE SCANNER ERROR:", error);
        if (!stopped) setCameraError(language === "ar" ? "تعذر فتح الكاميرا. تأكد من السماح باستخدامها، أو أغلق النافذة واستخدم قارئ الباركود في الصفحة." : "Could not open the camera. Check camera permission, or close this window and use the barcode reader on the page.");
      }
    }

    void start();
    return () => {
      stopped = true;
      try { controls?.stop(); } catch {}
    };
  }, [onScan, onClose, language]);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"><div dir={language === "ar" ? "rtl" : "ltr"} className={`w-full max-w-2xl overflow-hidden rounded-3xl ${darkMode ? "bg-[#13161B] text-white" : "bg-white text-slate-800"}`}><div className="flex items-center justify-between px-5 py-4"><div><h3 className="font-bold">{language === "ar" ? "مسح باركود المنتج" : "Scan product barcode"}</h3><p className="mt-1 text-xs text-slate-500">{language === "ar" ? "وجّه الكاميرا ناحية الباركود" : "Point the camera at the barcode"}</p></div><button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xl text-slate-500 hover:bg-white/5">✕</button></div>{cameraError && <p role="alert" className="mx-5 mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-500">{cameraError}</p>}<div className="relative aspect-video bg-black"><video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover" /><div className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]" /></div><div className="px-5 py-4 text-center text-xs text-slate-500">{language === "ar" ? "يدعم EAN-13 و EAN-8 و UPC و Code 128 وغيرها." : "Supports EAN-13, EAN-8, UPC, Code 128 and more."}</div></div></div>;
}
