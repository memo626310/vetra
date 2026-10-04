// app/invoices/[id]/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";
import { getClinicDb, getClinicContext } from "@/lib/clinic-db";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
};

type Pet = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  gender: string | null;
};

type Invoice = {
  id: string;
  invoice_number: number;
  client_id: string;
  pet_id: string | null;
  visit_id: string | null;
  status: string;
  payment_method: string | null;
  subtotal: number;
  discount: number;
  total: number;
  paid_amount: number;
  notes: string | null;
  issued_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  client?: Client | null;
  pet?: Pet | null;
};

type InvoiceItem = {
  id: string;
  invoice_id: string;
  item_type: "product" | "service";
  product_id: string | null;
  service_name: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
  product?: {
    id: string;
    name: string;
    barcode: string | null;
    unit: string | null;
  } | null;
};

type ProductReturn = {
  invoiceItemId: string;
  productId: string;
  name: string;
  soldQuantity: number;
  alreadyReturned: number;
  available: number;
  unitPrice: number;
  quantity: string;
};

const statusLabel: Record<string, { en: string; ar: string }> = {
  draft: { en: "Draft", ar: "مسودة" },
  issued: { en: "Issued", ar: "صادرة" },
  paid: { en: "Paid", ar: "مدفوعة" },
  partially_paid: { en: "Partially Paid", ar: "مدفوعة جزئيًا" },
  unpaid: { en: "Unpaid", ar: "غير مدفوعة" },
  partially_returned: { en: "Partially Returned", ar: "مرتجع جزئي" },
  returned: { en: "Returned", ar: "مرتجعة" },
  cancelled: { en: "Cancelled", ar: "ملغاة" },
};

const paymentLabel: Record<string, { en: string; ar: string }> = {
  cash: { en: "Cash", ar: "نقدي" },
  card: { en: "Card", ar: "بطاقة" },
  wallet: { en: "Wallet", ar: "محفظة" },
  bank_transfer: { en: "Bank Transfer", ar: "تحويل بنكي" },
  other: { en: "Other", ar: "أخرى" },
};

function money(value: number | null | undefined) {
  return `${Number(value || 0).toFixed(2)} EGP`;
}

function dateTime(value: string | null | undefined, language: "en" | "ar") {
  if (!value) return "—";

  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function InvoiceDetailsPage() {
  const params = useParams();
  const router = useRouter();

  const invoiceId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [darkMode, setDarkMode] = useState(false);

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [showReturn, setShowReturn] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnItems, setReturnItems] = useState<ProductReturn[]>([]);

  const isAr = language === "ar";

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("vetra-language");
    const savedTheme = window.localStorage.getItem("vetra-theme");

    if (savedLanguage === "ar" || savedLanguage === "en") {
      setLanguage(savedLanguage);
    }

    if (savedTheme === "dark") {
      setDarkMode(true);
    }
  }, []);

  useEffect(() => {
    if (!invoiceId) return;
    loadInvoice();
  }, [invoiceId]);

  useEffect(() => {
    document.documentElement.dir = isAr ? "rtl" : "ltr";
    document.documentElement.lang = isAr ? "ar" : "en";
    document.documentElement.classList.toggle("dark", darkMode);

    window.localStorage.setItem("vetra-language", language);
    window.localStorage.setItem("vetra-theme", darkMode ? "dark" : "light");
  }, [isAr, language, darkMode]);

  async function loadInvoice() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
      } = await vetraCore.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const context = await getClinicContext();

      if (!["owner", "admin"].includes(context.role)) {
        router.replace("/dashboard");
        return;
      }

      const db = await getClinicDb();

      const { data, error: invoiceError } = await db
        .from("invoices")
        .select(
          `
          *,
          client:clients (
            id,
            name,
            phone,
            email,
            address
          ),
          pet:pets (
            id,
            name,
            species,
            breed,
            gender
          )
        `
        )
        .eq("id", invoiceId)
        .eq("clinic_id", context.clinic_id)
        .single();

      if (invoiceError) throw invoiceError;

      const { data: itemData, error: itemError } = await db
        .from("invoice_items")
        .select(
          `
          *,
          product:products (
            id,
            name,
            barcode,
            unit
          )
        `
        )
        .eq("invoice_id", invoiceId)
        .eq("clinic_id", context.clinic_id)
        .order("created_at", { ascending: true });

      if (itemError) throw itemError;

      setInvoice(data as Invoice);
      setItems((itemData || []) as InvoiceItem[]);
    } catch (err: any) {
      setError(err?.message || (isAr ? "حدث خطأ أثناء تحميل الفاتورة." : "Failed to load invoice."));
    } finally {
      setLoading(false);
    }
  }

  const remaining = useMemo(() => {
    if (!invoice) return 0;
    return Math.max(Number(invoice.total || 0) - Number(invoice.paid_amount || 0), 0);
  }, [invoice]);

  const productReturns = useMemo<ProductReturn[]>(() => {
    return items
      .filter((item) => item.item_type === "product" && item.product_id && item.product)
      .map((item) => ({
        invoiceItemId: item.id,
        productId: item.product_id as string,
        name: item.product?.name || item.description || "Product",
        soldQuantity: Number(item.quantity || 0),
        alreadyReturned: 0,
        available: Number(item.quantity || 0),
        unitPrice: Number(item.unit_price || 0),
        quantity: "",
      }));
  }, [items]);

  async function openReturnDialog() {
    if (!invoice) return;

    setReturnReason("");
    setError("");

    try {
      const context = await getClinicContext();
      const db = await getClinicDb();

      const { data, error: returnsError } = await db
        .from("invoice_return_items")
        .select(
          `
          invoice_item_id,
          quantity,
          invoice_return:invoice_returns!inner (
            invoice_id
          )
        `
        )
        .eq("invoice_return.invoice_id", invoice.id)
        .eq("clinic_id", context.clinic_id);

      if (returnsError) throw returnsError;

      const returnedByItem = new Map<string, number>();

      for (const row of data || []) {
        const current = returnedByItem.get(row.invoice_item_id) || 0;
        returnedByItem.set(row.invoice_item_id, current + Number(row.quantity || 0));
      }

      const prepared = items
        .filter(
          (item) =>
            item.item_type === "product" &&
            item.product_id &&
            item.product
        )
        .map((item) => {
          const alreadyReturned = returnedByItem.get(item.id) || 0;
          const soldQuantity = Number(item.quantity || 0);
          const available = Math.max(soldQuantity - alreadyReturned, 0);

          return {
            invoiceItemId: item.id,
            productId: item.product_id as string,
            name: item.product?.name || item.description || "Product",
            soldQuantity,
            alreadyReturned,
            available,
            unitPrice: Number(item.unit_price || 0),
            quantity: "",
          };
        });

      setReturnItems(prepared);
      setShowReturn(true);
    } catch (err: any) {
      setError(
        err?.message ||
          (isAr
            ? "تعذر تحميل بيانات المرتجعات."
            : "Could not load return data.")
      );
    }
  }

  function updateReturnQuantity(invoiceItemId: string, value: string) {
    setReturnItems((current) =>
      current.map((item) =>
        item.invoiceItemId === invoiceItemId
          ? { ...item, quantity: value }
          : item
      )
    );
  }

  async function createReturn() {
    if (!invoice) return;

    if (invoice.status === "cancelled" || invoice.status === "returned") {
      setError(isAr ? "لا يمكن عمل مرتجع لهذه الفاتورة." : "This invoice cannot be returned.");
      return;
    }

    const selected = returnItems
      .map((item) => ({
        ...item,
        quantityNumber: Number(item.quantity || 0),
      }))
      .filter((item) => item.quantityNumber > 0);

    if (!selected.length) {
      setError(isAr ? "اختر كمية مرتجعة واحدة على الأقل." : "Enter at least one return quantity.");
      return;
    }

    for (const item of selected) {
      if (item.quantityNumber > item.available) {
        setError(
          isAr
            ? `الكمية المرتجعة لـ ${item.name} أكبر من الكمية المتاحة للمرتجع.`
            : `Return quantity for ${item.name} exceeds the available return quantity.`
        );
        return;
      }
    }

    if (!returnReason.trim()) {
      setError(isAr ? "سبب المرتجع مطلوب." : "Return reason is required.");
      return;
    }

    setActionLoading(true);
    setError("");

    try {
      const {
        data: { user },
      } = await vetraCore.auth.getUser();

      if (!user) throw new Error("Authentication required.");

      const context = await getClinicContext();
      const db = await getClinicDb();

      const refundAmount = selected.reduce(
        (sum, item) => sum + item.quantityNumber * item.unitPrice,
        0
      );

      const { data: returnData, error: returnError } = await db
        .from("invoice_returns")
        .insert({
          clinic_id: context.clinic_id,
          invoice_id: invoice.id,
          reason: returnReason.trim(),
          refund_amount: refundAmount,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (returnError) throw returnError;

      const rows = selected.map((item) => ({
        clinic_id: context.clinic_id,
        return_id: returnData.id,
        invoice_item_id: item.invoiceItemId,
        product_id: item.productId,
        quantity: item.quantityNumber,
        unit_price: item.unitPrice,
        refund_amount: item.quantityNumber * item.unitPrice,
      }));

      const { error: returnItemsError } = await db
        .from("invoice_return_items")
        .insert(rows);

      if (returnItemsError) throw returnItemsError;

      // Inventory return movement is created here.
      const movementRows = selected.map((item) => ({
        clinic_id: context.clinic_id,
        product_id: item.productId,
        movement_type: "return",
        quantity: item.quantityNumber,
        reference_type: "invoice_return",
        reference_id: returnData.id,
        notes: `Return for invoice #${invoice.invoice_number}`,
        created_by: user.id,
      }));

      const { error: movementError } = await db
        .from("inventory_movements")
        .insert(movementRows);

      if (movementError) throw movementError;

      // Add returned quantity back to stock.
      for (const item of selected) {
        const { data: product, error: productError } = await db
          .from("products")
          .select("quantity")
          .eq("id", item.productId)
          .eq("clinic_id", context.clinic_id)
          .single();

        if (productError) throw productError;

        const { error: updateProductError } = await db
          .from("products")
          .update({
            quantity: Number(product.quantity || 0) + item.quantityNumber,
          })
          .eq("id", item.productId)
          .eq("clinic_id", context.clinic_id);

        if (updateProductError) throw updateProductError;
      }

      // Recalculate the return status from all returns.
      const { data: allReturnItems, error: allReturnsError } = await db
        .from("invoice_return_items")
        .select(
          `
          invoice_item_id,
          quantity,
          invoice_return:invoice_returns!inner (
            invoice_id
          )
        `
        )
        .eq("invoice_return.invoice_id", invoice.id)
        .eq("clinic_id", context.clinic_id);

      if (allReturnsError) throw allReturnsError;

      let allReturnedValue = 0;

      for (const row of allReturnItems || []) {
        const sourceItem = items.find((item) => item.id === row.invoice_item_id);
        if (sourceItem) {
          allReturnedValue +=
            Number(row.quantity || 0) * Number(sourceItem.unit_price || 0);
        }
      }

      const productSoldValue = items
        .filter((item) => item.item_type === "product")
        .reduce(
          (sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0),
          0
        );

      let newStatus = invoice.status;

      if (productSoldValue > 0 && allReturnedValue >= productSoldValue) {
        newStatus = "returned";
      } else if (allReturnedValue > 0) {
        newStatus = "partially_returned";
      }

      const { error: invoiceUpdateError } = await db
        .from("invoices")
        .update({
          status: newStatus,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id)
        .eq("clinic_id", context.clinic_id);

      if (invoiceUpdateError) throw invoiceUpdateError;

      setShowReturn(false);
      await loadInvoice();
    } catch (err: any) {
      setError(
        err?.message ||
          (isAr ? "تعذر تنفيذ المرتجع." : "Could not process the return.")
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function cancelInvoice() {
    if (!invoice) return;

    if (invoice.status === "cancelled") {
      setShowCancel(false);
      return;
    }

    if (!cancelReason.trim()) {
      setError(isAr ? "سبب الإلغاء مطلوب." : "Cancellation reason is required.");
      return;
    }

    setActionLoading(true);
    setError("");

    try {
      const {
        data: { user },
      } = await vetraCore.auth.getUser();

      if (!user) throw new Error("Authentication required.");

      const context = await getClinicContext();
      const db = await getClinicDb();

      const { error: cancelError } = await db
        .from("invoices")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: user.id,
          cancellation_reason: cancelReason.trim(),
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id)
        .eq("clinic_id", context.clinic_id)
        .neq("status", "cancelled");

      if (cancelError) throw cancelError;

      // Reverse inventory for issued product lines.
      if (invoice.status !== "draft") {
        const productItems = items.filter(
          (item) => item.item_type === "product" && item.product_id
        );

        for (const item of productItems) {
          const { data: product, error: productError } = await db
            .from("products")
            .select("quantity")
            .eq("id", item.product_id)
            .eq("clinic_id", context.clinic_id)
            .single();

          if (productError) throw productError;

          const { error: productUpdateError } = await db
            .from("products")
            .update({
              quantity: Number(product.quantity || 0) + Number(item.quantity || 0),
            })
            .eq("id", item.product_id)
            .eq("clinic_id", context.clinic_id);

          if (productUpdateError) throw productUpdateError;

          const { error: movementError } = await db
            .from("inventory_movements")
            .insert({
              clinic_id: context.clinic_id,
              product_id: item.product_id,
              movement_type: "cancelled_sale",
              quantity: Number(item.quantity || 0),
              reference_type: "invoice",
              reference_id: invoice.id,
              notes: `Cancelled invoice #${invoice.invoice_number}`,
              created_by: user.id,
            });

          if (movementError) throw movementError;
        }
      }

      setShowCancel(false);
      setCancelReason("");
      await loadInvoice();
    } catch (err: any) {
      setError(
        err?.message ||
          (isAr ? "تعذر إلغاء الفاتورة." : "Could not cancel invoice.")
      );
    } finally {
      setActionLoading(false);
    }
  }

  function printInvoice() {
    window.print();
  }

  function sendWhatsApp() {
    if (!invoice?.client?.phone) {
      setError(
        isAr
          ? "لا يوجد رقم هاتف محفوظ للعميل."
          : "No phone number is saved for this client."
      );
      return;
    }

    const phone = invoice.client.phone.replace(/\D/g, "");

    const message = isAr
      ? `مرحبًا ${invoice.client.name}،\nفاتورة VETRA رقم #${invoice.invoice_number}\nالإجمالي: ${money(invoice.total)}\nالمدفوع: ${money(invoice.paid_amount)}\nالمتبقي: ${money(remaining)}`
      : `Hello ${invoice.client.name},\nVETRA invoice #${invoice.invoice_number}\nTotal: ${money(invoice.total)}\nPaid: ${money(invoice.paid_amount)}\nRemaining: ${money(remaining)}`;

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 text-4xl">🧾</div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isAr ? "جاري تحميل الفاتورة..." : "Loading invoice..."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!invoice) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl border border-red-200 bg-white p-10 text-center shadow-sm dark:border-red-900/50 dark:bg-slate-900">
            <div className="mb-3 text-4xl">⚠️</div>
            <h1 className="text-xl font-bold">
              {isAr ? "الفاتورة غير موجودة" : "Invoice not found"}
            </h1>
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            <button
              onClick={() => router.push("/invoices")}
              className="mt-6 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white dark:bg-white dark:text-slate-900"
            >
              {isAr ? "العودة للفواتير" : "Back to invoices"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  const status = statusLabel[invoice.status] || {
    en: invoice.status,
    ar: invoice.status,
  };

  const isDraft = invoice.status === "draft";
  const canCancel = invoice.status !== "cancelled";
  const canReturn =
    !isDraft &&
    invoice.status !== "cancelled" &&
    invoice.status !== "returned" &&
    items.some((item) => item.item_type === "product");

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-white md:px-8 print:bg-white print:p-0 print:text-black">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <button
            onClick={() => router.push("/invoices")}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            ← {isAr ? "الفواتير" : "Invoices"}
          </button>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setLanguage(language === "en" ? "ar" : "en")}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold dark:border-slate-800 dark:bg-slate-900"
            >
              {language === "en" ? "العربية" : "English"}
            </button>

            <button
              onClick={() => setDarkMode((v) => !v)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold dark:border-slate-800 dark:bg-slate-900"
            >
              {darkMode ? "☀️" : "🌙"}
            </button>

            <button
              onClick={printInvoice}
              className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
            >
              🖨️ {isAr ? "طباعة" : "Print"}
            </button>

            <button
              onClick={sendWhatsApp}
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
            >
              WhatsApp
            </button>

            {canReturn && (
              <button
                onClick={openReturnDialog}
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
              >
                ↩ {isAr ? "مرتجع" : "Return"}
              </button>
            )}

            {canCancel && (
              <button
                onClick={() => {
                  setCancelReason("");
                  setShowCancel(true);
                }}
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
              >
                ✕ {isAr ? "إلغاء الفاتورة" : "Cancel Invoice"}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 print:hidden">
            {error}
          </div>
        )}

        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 print:rounded-none print:border-0 print:shadow-none">
          <div className="border-b border-slate-200 p-6 dark:border-slate-800 md:p-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
              <div>
                <div className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                  VETRA
                </div>
                <h1 className="text-3xl font-black tracking-tight md:text-4xl">
                  {isAr ? "فاتورة" : "Invoice"} #{invoice.invoice_number}
                </h1>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {dateTime(invoice.created_at, language)}
                </p>
              </div>

              <div
                className={`inline-flex w-fit rounded-full px-4 py-2 text-sm font-bold ${
                  invoice.status === "paid"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : invoice.status === "cancelled"
                    ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                    : invoice.status === "returned" ||
                      invoice.status === "partially_returned"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                }`}
              >
                {isAr ? status.ar : status.en}
              </div>
            </div>
          </div>

          <div className="grid gap-4 border-b border-slate-200 p-6 dark:border-slate-800 md:grid-cols-2 md:p-8">
            <div className="rounded-2xl bg-slate-50 p-5 dark:bg-slate-950/50">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {isAr ? "العميل" : "Client"}
              </p>
              <p className="mt-2 text-lg font-bold">{invoice.client?.name || "—"}</p>
              {invoice.client?.phone && (
                <p className="mt-1 text-sm text-slate-500">{invoice.client.phone}</p>
              )}
              {invoice.client?.email && (
                <p className="mt-1 text-sm text-slate-500">{invoice.client.email}</p>
              )}
              {invoice.client?.address && (
                <p className="mt-1 text-sm text-slate-500">{invoice.client.address}</p>
              )}
            </div>

            <div className="rounded-2xl bg-slate-50 p-5 dark:bg-slate-950/50">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {isAr ? "الحيوان" : "Pet"}
              </p>
              <p className="mt-2 text-lg font-bold">{invoice.pet?.name || "—"}</p>
              {invoice.pet && (
                <p className="mt-1 text-sm text-slate-500">
                  {invoice.pet.species}
                  {invoice.pet.breed ? ` • ${invoice.pet.breed}` : ""}
                  {invoice.pet.gender ? ` • ${invoice.pet.gender}` : ""}
                </p>
              )}
              {invoice.visit_id && (
                <p className="mt-2 text-xs text-slate-400">
                  {isAr ? "مرتبطة بزيارة" : "Linked to visit"} #{invoice.visit_id.slice(0, 8)}
                </p>
              )}
            </div>
          </div>

          <div className="p-6 md:p-8">
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-4 text-start font-bold">#</th>
                    <th className="px-4 py-4 text-start font-bold">
                      {isAr ? "البند" : "Item"}
                    </th>
                    <th className="px-4 py-4 text-end font-bold">
                      {isAr ? "الكمية" : "Qty"}
                    </th>
                    <th className="px-4 py-4 text-end font-bold">
                      {isAr ? "سعر الوحدة" : "Unit Price"}
                    </th>
                    <th className="px-4 py-4 text-end font-bold">
                      {isAr ? "الخصم" : "Discount"}
                    </th>
                    <th className="px-4 py-4 text-end font-bold">
                      {isAr ? "الإجمالي" : "Total"}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((item, index) => {
                    const itemName =
                      item.item_type === "product"
                        ? item.product?.name || item.description || "Product"
                        : item.service_name || item.description || "Service";

                    return (
                      <tr
                        key={item.id}
                        className="border-t border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-4 py-4 text-slate-400">{index + 1}</td>
                        <td className="px-4 py-4">
                          <div className="font-semibold">{itemName}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {item.item_type === "product"
                              ? isAr
                                ? "منتج"
                                : "Product"
                              : isAr
                              ? "خدمة"
                              : "Service"}
                            {item.product?.barcode
                              ? ` • ${item.product.barcode}`
                              : ""}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-end">
                          {Number(item.quantity).toFixed(3).replace(/\.?0+$/, "")}
                        </td>
                        <td className="px-4 py-4 text-end">
                          {money(item.unit_price)}
                        </td>
                        <td className="px-4 py-4 text-end">
                          {money(item.discount)}
                        </td>
                        <td className="px-4 py-4 text-end font-bold">
                          {money(item.total)}
                        </td>
                      </tr>
                    );
                  })}

                  {!items.length && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-slate-400"
                      >
                        {isAr ? "لا توجد بنود." : "No invoice items."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-end">
              <div className="w-full max-w-md space-y-3">
                <div className="flex justify-between text-sm text-slate-500">
                  <span>{isAr ? "الإجمالي قبل الخصم" : "Subtotal"}</span>
                  <span>{money(invoice.subtotal)}</span>
                </div>

                <div className="flex justify-between text-sm text-slate-500">
                  <span>{isAr ? "الخصم" : "Discount"}</span>
                  <span>- {money(invoice.discount)}</span>
                </div>

                <div className="flex justify-between border-t border-slate-200 pt-4 text-xl font-black dark:border-slate-800">
                  <span>{isAr ? "الإجمالي" : "Total"}</span>
                  <span>{money(invoice.total)}</span>
                </div>

                <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                  <span>{isAr ? "المدفوع" : "Paid"}</span>
                  <span>{money(invoice.paid_amount)}</span>
                </div>

                <div className="flex justify-between text-sm font-bold text-amber-600 dark:text-amber-400">
                  <span>{isAr ? "المتبقي" : "Remaining"}</span>
                  <span>{money(remaining)}</span>
                </div>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-5 dark:bg-slate-950/50">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {isAr ? "طريقة الدفع" : "Payment Method"}
                </p>
                <p className="mt-2 font-bold">
                  {invoice.payment_method
                    ? isAr
                      ? paymentLabel[invoice.payment_method]?.ar || invoice.payment_method
                      : paymentLabel[invoice.payment_method]?.en || invoice.payment_method
                    : "—"}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-5 dark:bg-slate-950/50">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {isAr ? "تاريخ الإصدار" : "Issued At"}
                </p>
                <p className="mt-2 font-bold">
                  {dateTime(invoice.issued_at, language)}
                </p>
              </div>
            </div>

            {invoice.notes && (
              <div className="mt-4 rounded-2xl bg-slate-50 p-5 dark:bg-slate-950/50">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {isAr ? "ملاحظات" : "Notes"}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                  {invoice.notes}
                </p>
              </div>
            )}

            {invoice.status === "cancelled" && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900/50 dark:bg-red-950/30">
                <p className="font-bold text-red-700 dark:text-red-300">
                  {isAr ? "الفاتورة ملغاة" : "Invoice cancelled"}
                </p>
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {invoice.cancellation_reason || (isAr ? "بدون سبب." : "No reason provided.")}
                </p>
                {invoice.cancelled_at && (
                  <p className="mt-2 text-xs text-red-500">
                    {dateTime(invoice.cancelled_at, language)}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h2 className="text-xl font-black">
              {isAr ? "إلغاء الفاتورة" : "Cancel Invoice"}
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              {isAr
                ? "الفاتورة لن يتم حذفها. سيتم تسجيلها كملغاة."
                : "The invoice will not be deleted. It will be recorded as cancelled."}
            </p>

            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={isAr ? "سبب الإلغاء..." : "Cancellation reason..."}
              className="mt-5 min-h-28 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowCancel(false)}
                disabled={actionLoading}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold dark:border-slate-700"
              >
                {isAr ? "إلغاء" : "Close"}
              </button>

              <button
                onClick={cancelInvoice}
                disabled={actionLoading}
                className="rounded-2xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {actionLoading
                  ? isAr
                    ? "جاري..."
                    : "Processing..."
                  : isAr
                  ? "تأكيد الإلغاء"
                  : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h2 className="text-xl font-black">
              {isAr ? "مرتجع فاتورة" : "Invoice Return"}
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              {isAr
                ? "أدخل الكمية التي تريد إرجاعها لكل منتج."
                : "Enter the quantity to return for each product."}
            </p>

            <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[650px] text-sm">
                <thead className="bg-slate-50 dark:bg-slate-950/50">
                  <tr>
                    <th className="px-4 py-3 text-start">{isAr ? "المنتج" : "Product"}</th>
                    <th className="px-4 py-3 text-end">{isAr ? "المباع" : "Sold"}</th>
                    <th className="px-4 py-3 text-end">{isAr ? "مرتجع سابقًا" : "Returned"}</th>
                    <th className="px-4 py-3 text-end">{isAr ? "متاح للمرتجع" : "Available"}</th>
                    <th className="px-4 py-3 text-end">{isAr ? "الكمية" : "Return Qty"}</th>
                  </tr>
                </thead>
                <tbody>
                  {returnItems.map((item) => (
                    <tr
                      key={item.invoiceItemId}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-4 py-4 font-semibold">{item.name}</td>
                      <td className="px-4 py-4 text-end">{item.soldQuantity}</td>
                      <td className="px-4 py-4 text-end">{item.alreadyReturned}</td>
                      <td className="px-4 py-4 text-end font-bold">{item.available}</td>
                      <td className="px-4 py-4 text-end">
                        <input
                          type="number"
                          min="0"
                          max={item.available}
                          step="0.001"
                          value={item.quantity}
                          onChange={(e) =>
                            updateReturnQuantity(item.invoiceItemId, e.target.value)
                          }
                          className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-end outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950"
                        />
                      </td>
                    </tr>
                  ))}

                  {!returnItems.length && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        {isAr
                          ? "لا توجد منتجات متاحة للمرتجع."
                          : "No products are available for return."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder={isAr ? "سبب المرتجع..." : "Return reason..."}
              className="mt-5 min-h-24 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowReturn(false)}
                disabled={actionLoading}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold dark:border-slate-700"
              >
                {isAr ? "إلغاء" : "Close"}
              </button>

              <button
                onClick={createReturn}
                disabled={actionLoading}
                className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {actionLoading
                  ? isAr
                    ? "جاري التنفيذ..."
                    : "Processing..."
                  : isAr
                  ? "تأكيد المرتجع"
                  : "Confirm Return"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }

          button,
          textarea,
          input {
            display: none !important;
          }
        }
      `}</style>
    </main>
  );
}
