"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { supabase } from "@/lib/supabase";

type Client = {
  id: string;
  name: string;
  phone: string | null;
};

type Pet = {
  id: string;
  client_id: string;
  name: string;
  species: string;
};

type Product = {
  id: string;
  name: string;
  barcode: string | null;
  unit: string;
  quantity: number;
  retail_price: number;
  category?: { name: string } | null;
};

type InvoiceLine = {
  key: string;
  item_type: "product" | "service";
  product_id: string | null;
  service_name: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  available_quantity: number | null;
};

const emptyLine = (): InvoiceLine => ({
  key: crypto.randomUUID(),
  item_type: "service",
  product_id: null,
  service_name: "",
  description: "",
  quantity: 1,
  unit_price: 0,
  discount: 0,
  available_quantity: null,
});

const money = (value: number) =>
  new Intl.NumberFormat("en-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export default function NewInvoicePage() {
  const router = useRouter();

  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [darkMode, setDarkMode] = useState(true);
  const [ready, setReady] = useState(false);

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [clients, setClients] = useState<Client[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [clientId, setClientId] = useState("");
  const [petId, setPetId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([]);

  const [discount, setDiscount] = useState("0");
  const [paidAmount, setPaidAmount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");

  const [showScanner, setShowScanner] = useState(false);
  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [consultationFee, setConsultationFee] = useState(100);

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

  async function loadPage() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      setAuthorized(false);
      setLoading(false);
      return;
    }

    setAuthorized(true);

    const [clientsResult, productsResult, settingsResult] =
      await Promise.all([
        supabase
          .from("clients")
          .select("id, name, phone")
          .order("name"),
        supabase
          .from("products")
          .select(`
            id,
            name,
            barcode,
            unit,
            quantity,
            retail_price,
            category:product_categories(name)
          `)
          .order("name"),
        supabase
          .from("billing_settings")
          .select("consultation_fee")
          .limit(1)
          .maybeSingle(),
      ]);

    if (clientsResult.error) {
      setMessage(clientsResult.error.message);
    } else {
      setClients((clientsResult.data || []) as Client[]);
    }

    if (productsResult.error) {
      setMessage(productsResult.error.message);
    } else {
      setProducts((productsResult.data || []) as unknown as Product[]);
    }

    if (settingsResult.data?.consultation_fee != null) {
      setConsultationFee(Number(settingsResult.data.consultation_fee));
    }

    setLoading(false);
  }

  useEffect(() => {
    if (ready) loadPage();
  }, [ready]);

  useEffect(() => {
    if (!clientId) {
      setPets([]);
      setPetId("");
      return;
    }

    async function loadPets() {
      const { data, error } = await supabase
        .from("pets")
        .select("id, client_id, name, species")
        .eq("client_id", clientId)
        .eq("is_deceased", false)
        .order("name");

      if (!error) {
        setPets((data || []) as Pet[]);
      }
    }

    loadPets();
  }, [clientId]);

  const selectedClient = clients.find((client) => client.id === clientId);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products.slice(0, 12);

    return products
      .filter(
        (product) =>
          product.name.toLowerCase().includes(query) ||
          (product.barcode || "").toLowerCase().includes(query)
      )
      .slice(0, 12);
  }, [products, productSearch]);

  const subtotal = useMemo(
    () =>
      lines.reduce(
        (sum, line) =>
          sum +
          Math.max(
            0,
            Number(line.quantity) * Number(line.unit_price) -
              Number(line.discount)
          ),
        0
      ),
    [lines]
  );

  const invoiceDiscount = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal - invoiceDiscount);
  const paid = Math.max(0, Number(paidAmount) || 0);
  const remaining = Math.max(0, total - paid);

  function addProduct(product: Product) {
    setMessage("");
    setSuccess("");

    if (Number(product.quantity) <= 0) {
      setMessage(
        language === "ar"
          ? "المنتج ده رصيده الحالي صفر."
          : "This product is currently out of stock."
      );
      return;
    }

    const existing = lines.find(
      (line) =>
        line.item_type === "product" && line.product_id === product.id
    );

    if (existing) {
      setLines((current) =>
        current.map((line) =>
          line.key === existing.key
            ? {
                ...line,
                quantity: Math.min(
                  Number(product.quantity),
                  Number(line.quantity) + 1
                ),
                available_quantity: Number(product.quantity),
              }
            : line
        )
      );
    } else {
      setLines((current) => [
        ...current,
        {
          key: crypto.randomUUID(),
          item_type: "product",
          product_id: product.id,
          service_name: "",
          description: product.name,
          quantity: 1,
          unit_price: Number(product.retail_price) || 0,
          discount: 0,
          available_quantity: Number(product.quantity),
        },
      ]);
    }

    setProductSearch("");
  }

  function addService() {
    const name = serviceName.trim();
    const price = Number(servicePrice);

    if (!name) {
      setMessage(language === "ar" ? "اكتب اسم الخدمة." : "Enter the service name.");
      return;
    }

    if (price < 0 || Number.isNaN(price)) {
      setMessage(language === "ar" ? "اكتب سعرًا صحيحًا." : "Enter a valid price.");
      return;
    }

    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        item_type: "service",
        product_id: null,
        service_name: name,
        description: name,
        quantity: 1,
        unit_price: price,
        discount: 0,
        available_quantity: null,
      },
    ]);

    setServiceName("");
    setServicePrice("");
  }

  function addConsultation() {
    const alreadyAdded = lines.some(
      (line) =>
        line.item_type === "service" &&
        line.service_name.trim().toLowerCase() === "consultation"
    );

    if (alreadyAdded) {
      setMessage(
        language === "ar"
          ? "رسوم الكشف مضافة بالفعل."
          : "Consultation fee is already added."
      );
      return;
    }

    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        item_type: "service",
        product_id: null,
        service_name: "Consultation",
        description:
          language === "ar" ? "كشف / استشارة بيطرية" : "Veterinary consultation",
        quantity: 1,
        unit_price: consultationFee,
        discount: 0,
        available_quantity: null,
      },
    ]);
  }

  async function findProductByBarcode(barcode: string) {
    const clean = barcode.trim();
    if (!clean) return;

    setShowScanner(false);
    setProductSearch(clean);
    setMessage("");
    setSuccess("");

    const localProduct = products.find(
      (product) => product.barcode?.trim() === clean
    );

    if (localProduct) {
      addProduct(localProduct);
      return;
    }

    const { data, error } = await supabase
      .from("products")
      .select(`
        id,
        name,
        barcode,
        unit,
        quantity,
        retail_price,
        category:product_categories(name)
      `)
      .eq("barcode", clean)
      .maybeSingle();

    if (error) {
      setMessage(error.message);
      return;
    }

    if (!data) {
      setMessage(
        language === "ar"
          ? `الباركود ${clean} مش موجود في المخزون.`
          : `Barcode ${clean} was not found in inventory.`
      );
      return;
    }

    const product = data as unknown as Product;
    setProducts((current) => {
      const exists = current.some((item) => item.id === product.id);
      return exists ? current : [...current, product];
    });
    addProduct(product);
  }

  function updateLine(key: string, patch: Partial<InvoiceLine>) {
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, ...patch } : line
      )
    );
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  async function saveInvoice(issueAfterSave = false) {
    setMessage("");
    setSuccess("");

    if (!clientId) {
      setMessage(language === "ar" ? "اختار العميل أولًا." : "Select a client first.");
      return;
    }

    if (!lines.length) {
      setMessage(
        language === "ar"
          ? "أضف منتج أو خدمة واحدة على الأقل."
          : "Add at least one product or service."
      );
      return;
    }

    for (const line of lines) {
      if (line.quantity <= 0) {
        setMessage(
          language === "ar"
            ? "الكمية لازم تكون أكبر من صفر."
            : "Quantity must be greater than zero."
        );
        return;
      }

      if (
        line.item_type === "product" &&
        line.available_quantity != null &&
        line.quantity > line.available_quantity
      ) {
        setMessage(
          language === "ar"
            ? `الكمية المطلوبة من ${line.description} أكبر من الرصيد الحالي.`
            : `Requested quantity for ${line.description} exceeds current stock.`
        );
        return;
      }
    }

    if (paid > total) {
      setMessage(
        language === "ar"
          ? "المبلغ المدفوع لا يمكن أن يكون أكبر من الإجمالي."
          : "Paid amount cannot exceed the invoice total."
      );
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const calculatedStatus =
      paid <= 0
        ? "unpaid"
        : paid >= total
          ? "paid"
          : "partially_paid";

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        client_id: clientId,
        pet_id: petId || null,
        status: "draft",
        payment_method: paymentMethod || null,
        subtotal,
        discount: invoiceDiscount,
        total,
        paid_amount: paid,
        notes: notes.trim() || null,
        issued_at: issueAfterSave ? new Date().toISOString() : null,
        paid_at:
          issueAfterSave && paid >= total && total > 0
            ? new Date().toISOString()
            : null,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();

    if (invoiceError || !invoice) {
      setMessage(invoiceError?.message || "Could not create invoice.");
      setSaving(false);
      return;
    }

    const itemRows = lines.map((line) => ({
      invoice_id: invoice.id,
      item_type: line.item_type,
      product_id: line.product_id,
      service_name:
        line.item_type === "service" ? line.service_name.trim() : null,
      description: line.description.trim() || null,
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price),
      discount: Number(line.discount) || 0,
      total: Math.max(
        0,
        Number(line.quantity) * Number(line.unit_price) -
          Number(line.discount || 0)
      ),
    }));

    const { error: itemsError } = await supabase
      .from("invoice_items")
      .insert(itemRows);

    if (itemsError) {
      await supabase.from("invoices").delete().eq("id", invoice.id);
      setMessage(itemsError.message);
      setSaving(false);
      return;
    }

    if (issueAfterSave) {
      const { error: issueError } = await supabase.rpc("issue_invoice", {
        p_invoice_id: invoice.id,
      });

      if (issueError) {
        setMessage(
          issueError.message ||
            (language === "ar"
              ? "تعذر إصدار الفاتورة."
              : "Could not issue invoice.")
        );
        setSaving(false);
        return;
      }
    }

    setSuccess(
      language === "ar"
        ? issueAfterSave
          ? "تم إصدار الفاتورة بنجاح."
          : "تم حفظ الفاتورة كمسودة."
        : issueAfterSave
          ? "Invoice issued successfully."
          : "Invoice saved as draft."
    );

    setSaving(false);

    setTimeout(() => {
      router.push(`/invoices/${invoice.id}`);
    }, 400);
  }

  if (!ready || loading) {
    return (
      <main
        className={`flex min-h-screen items-center justify-center ${
          darkMode ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"
        }`}
      >
        <div className="text-center">
          <div className="mb-3 text-4xl">🧾</div>
          <p className="text-sm text-slate-500">Loading...</p>
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
          className={`w-full max-w-md rounded-3xl border p-8 text-center ${
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
              ? "إنشاء الفواتير متاح للـ Admin فقط."
              : "Invoice creation is available to Admin users only."}
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 rounded-2xl bg-blue-600 px-6 py-3 font-semibold text-white"
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
      className={`min-h-screen ${
        darkMode ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"
      }`}
    >
      <div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8 lg:px-10">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <button
              onClick={() => router.push("/invoices")}
              className="mb-3 text-sm text-slate-500 hover:text-blue-600"
            >
              ← {language === "ar" ? "الفواتير" : "Invoices"}
            </button>
            <h1 className="text-3xl font-black">
              {language === "ar" ? "فاتورة جديدة" : "New Invoice"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {language === "ar"
                ? "منتجات + خدمات في فاتورة واحدة"
                : "Products + services in one invoice"}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setDarkMode((v) => !v)}
              className={`rounded-2xl border px-4 py-3 ${
                darkMode
                  ? "border-white/10 bg-[#171A20]"
                  : "border-slate-200 bg-white"
              }`}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>
            <button
              onClick={() => setLanguage((v) => (v === "ar" ? "en" : "ar"))}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                darkMode
                  ? "border-white/10 bg-[#171A20]"
                  : "border-slate-200 bg-white"
              }`}
            >
              {language === "ar" ? "English" : "عربي"}
            </button>
          </div>
        </header>

        {(message || success) && (
          <div
            className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${
              message
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
            }`}
          >
            {message || success}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <section
              className={`rounded-3xl border p-5 ${
                darkMode
                  ? "border-white/[0.06] bg-[#13161B]"
                  : "border-slate-100 bg-white"
              }`}
            >
              <h2 className="mb-4 text-lg font-bold">
                {language === "ar" ? "بيانات العميل" : "Customer"}
              </h2>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-500">
                    {language === "ar" ? "العميل *" : "Client *"}
                  </label>
                  <select
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className={`w-full rounded-2xl border px-4 py-3.5 outline-none focus:border-blue-500 ${
                      darkMode
                        ? "border-white/[0.07] bg-[#0F1115]"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <option value="">
                      {language === "ar" ? "اختار العميل" : "Select client"}
                    </option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                        {client.phone ? ` — ${client.phone}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-500">
                    {language === "ar" ? "الحيوان — اختياري" : "Pet — optional"}
                  </label>
                  <select
                    value={petId}
                    onChange={(e) => setPetId(e.target.value)}
                    disabled={!clientId}
                    className={`w-full rounded-2xl border px-4 py-3.5 outline-none focus:border-blue-500 disabled:opacity-50 ${
                      darkMode
                        ? "border-white/[0.07] bg-[#0F1115]"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <option value="">
                      {language === "ar" ? "بدون حيوان" : "No pet"}
                    </option>
                    {pets.map((pet) => (
                      <option key={pet.id} value={pet.id}>
                        {pet.name} — {pet.species}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedClient && (
                <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:bg-blue-500/10 dark:text-blue-200">
                  👤 {selectedClient.name}
                  {selectedClient.phone ? ` — ${selectedClient.phone}` : ""}
                </div>
              )}
            </section>

            <section
              className={`rounded-3xl border p-5 ${
                darkMode
                  ? "border-white/[0.06] bg-[#13161B]"
                  : "border-slate-100 bg-white"
              }`}
            >
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold">
                    {language === "ar" ? "المنتجات" : "Products"}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {language === "ar"
                      ? "ابحث بالاسم أو الباركود أو استخدم الكاميرا"
                      : "Search by name/barcode or use the camera"}
                  </p>
                </div>

                <button
                  onClick={() => setShowScanner(true)}
                  className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
                >
                  📷 {language === "ar" ? "مسح باركود" : "Scan barcode"}
                </button>
              </div>

              <div className="relative mb-4">
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center">
                  🔎
                </span>
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder={
                    language === "ar"
                      ? "اسم المنتج أو الباركود..."
                      : "Product name or barcode..."
                  }
                  className={`w-full rounded-2xl border px-12 py-3.5 outline-none focus:border-blue-500 ${
                    darkMode
                      ? "border-white/[0.07] bg-[#0F1115]"
                      : "border-slate-200 bg-slate-50"
                  }`}
                />
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addProduct(product)}
                    className={`flex items-center justify-between rounded-2xl border p-4 text-right transition hover:-translate-y-0.5 ${
                      darkMode
                        ? "border-white/[0.06] bg-[#0F1115] hover:bg-[#171A20]"
                        : "border-slate-100 bg-slate-50 hover:bg-white hover:shadow-sm"
                    }`}
                  >
                    <div>
                      <p className="font-bold">{product.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {product.barcode || "No barcode"} · {product.unit} ·{" "}
                        {product.quantity} available
                      </p>
                    </div>
                    <span className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white">
                      + {money(Number(product.retail_price))}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section
              className={`rounded-3xl border p-5 ${
                darkMode
                  ? "border-white/[0.06] bg-[#13161B]"
                  : "border-slate-100 bg-white"
              }`}
            >
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold">
                    {language === "ar" ? "الخدمات" : "Services"}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {language === "ar"
                      ? "أضف الكشف أو أي خدمة أخرى"
                      : "Add consultation or another service"}
                  </p>
                </div>

                <button
                  onClick={addConsultation}
                  className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300"
                >
                  + {language === "ar" ? "رسوم الكشف" : "Consultation"} (
                  {money(consultationFee)} EGP)
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                <input
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder={language === "ar" ? "اسم الخدمة" : "Service name"}
                  className={`rounded-2xl border px-4 py-3.5 outline-none focus:border-blue-500 ${
                    darkMode
                      ? "border-white/[0.07] bg-[#0F1115]"
                      : "border-slate-200 bg-slate-50"
                  }`}
                />
                <input
                  value={servicePrice}
                  onChange={(e) => setServicePrice(e.target.value)}
                  type="number"
                  min="0"
                  placeholder={language === "ar" ? "السعر" : "Price"}
                  className={`rounded-2xl border px-4 py-3.5 outline-none focus:border-blue-500 ${
                    darkMode
                      ? "border-white/[0.07] bg-[#0F1115]"
                      : "border-slate-200 bg-slate-50"
                  }`}
                />
                <button
                  onClick={addService}
                  className="rounded-2xl bg-slate-900 px-5 py-3.5 font-bold text-white dark:bg-white dark:text-slate-900"
                >
                  + {language === "ar" ? "إضافة" : "Add"}
                </button>
              </div>
            </section>

            <section
              className={`overflow-hidden rounded-3xl border ${
                darkMode
                  ? "border-white/[0.06] bg-[#13161B]"
                  : "border-slate-100 bg-white"
              }`}
            >
              <div className="border-b px-5 py-4 text-lg font-bold">
                {language === "ar" ? "بنود الفاتورة" : "Invoice items"}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-sm">
                  <thead>
                    <tr className="border-b text-right text-xs text-slate-500">
                      <th className="px-5 py-4">
                        {language === "ar" ? "البند" : "Item"}
                      </th>
                      <th className="px-5 py-4">
                        {language === "ar" ? "الكمية" : "Qty"}
                      </th>
                      <th className="px-5 py-4">
                        {language === "ar" ? "السعر" : "Price"}
                      </th>
                      <th className="px-5 py-4">
                        {language === "ar" ? "خصم" : "Discount"}
                      </th>
                      <th className="px-5 py-4">
                        {language === "ar" ? "الإجمالي" : "Total"}
                      </th>
                      <th />
                    </tr>
                  </thead>

                  <tbody>
                    {lines.map((line) => {
                      const lineTotal = Math.max(
                        0,
                        line.quantity * line.unit_price - line.discount
                      );

                      return (
                        <tr key={line.key} className="border-b last:border-b-0">
                          <td className="px-5 py-4">
                            <p className="font-bold">{line.description || line.service_name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {line.item_type === "product"
                                ? "📦 Product"
                                : "🩺 Service"}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            <input
                              type="number"
                              min="0.001"
                              max={
                                line.item_type === "product"
                                  ? line.available_quantity ?? undefined
                                  : undefined
                              }
                              step="1"
                              value={line.quantity}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  quantity: Number(e.target.value) || 0,
                                })
                              }
                              className={`w-24 rounded-xl border px-3 py-2 outline-none focus:border-blue-500 ${
                                darkMode
                                  ? "border-white/[0.07] bg-[#0F1115]"
                                  : "border-slate-200 bg-slate-50"
                              }`}
                            />
                            {line.available_quantity != null && (
                              <p className="mt-1 text-[11px] text-slate-500">
                                Stock: {line.available_quantity}
                              </p>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.unit_price}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  unit_price: Number(e.target.value) || 0,
                                })
                              }
                              className={`w-32 rounded-xl border px-3 py-2 outline-none focus:border-blue-500 ${
                                darkMode
                                  ? "border-white/[0.07] bg-[#0F1115]"
                                  : "border-slate-200 bg-slate-50"
                              }`}
                            />
                          </td>

                          <td className="px-5 py-4">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.discount}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  discount: Number(e.target.value) || 0,
                                })
                              }
                              className={`w-28 rounded-xl border px-3 py-2 outline-none focus:border-blue-500 ${
                                darkMode
                                  ? "border-white/[0.07] bg-[#0F1115]"
                                  : "border-slate-200 bg-slate-50"
                              }`}
                            />
                          </td>

                          <td className="px-5 py-4 font-bold">
                            {money(lineTotal)} EGP
                          </td>

                          <td className="px-5 py-4">
                            <button
                              onClick={() => removeLine(line.key)}
                              className="rounded-xl px-3 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {!lines.length && (
                      <tr>
                        <td colSpan={6} className="px-5 py-14 text-center text-slate-500">
                          🧾
                          <p className="mt-2 font-semibold">
                            {language === "ar"
                              ? "لسه مفيش بنود في الفاتورة"
                              : "No invoice items yet"}
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section
              className={`sticky top-5 rounded-3xl border p-5 ${
                darkMode
                  ? "border-white/[0.06] bg-[#13161B]"
                  : "border-slate-100 bg-white"
              }`}
            >
              <h2 className="mb-5 text-lg font-bold">
                {language === "ar" ? "ملخص الفاتورة" : "Invoice summary"}
              </h2>

              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <strong>{money(subtotal)} EGP</strong>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-500">
                    {language === "ar" ? "خصم الفاتورة" : "Invoice discount"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className={`w-full rounded-2xl border px-4 py-3 outline-none focus:border-blue-500 ${
                      darkMode
                        ? "border-white/[0.07] bg-[#0F1115]"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  />
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between">
                    <span className="font-bold">
                      {language === "ar" ? "الإجمالي" : "Total"}
                    </span>
                    <strong className="text-2xl">{money(total)} EGP</strong>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-500">
                    {language === "ar" ? "طريقة الدفع" : "Payment method"}
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className={`w-full rounded-2xl border px-4 py-3 outline-none ${
                      darkMode
                        ? "border-white/[0.07] bg-[#0F1115]"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <option value="">
                      {language === "ar" ? "لم يتم تحديدها" : "Not specified"}
                    </option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="wallet">Wallet</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-500">
                    {language === "ar" ? "المدفوع" : "Paid amount"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className={`w-full rounded-2xl border px-4 py-3 outline-none focus:border-blue-500 ${
                      darkMode
                        ? "border-white/[0.07] bg-[#0F1115]"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  />
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-[#0F1115]">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">
                      {language === "ar" ? "المتبقي" : "Remaining"}
                    </span>
                    <strong>{money(remaining)} EGP</strong>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-500">
                    {language === "ar" ? "ملاحظات" : "Notes"}
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className={`w-full rounded-2xl border px-4 py-3 outline-none focus:border-blue-500 ${
                      darkMode
                        ? "border-white/[0.07] bg-[#0F1115]"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  />
                </div>

                <button
                  disabled={saving}
                  onClick={() => saveInvoice(false)}
                  className="w-full rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300"
                >
                  {saving
                    ? "Saving..."
                    : language === "ar"
                      ? "حفظ كمسودة"
                      : "Save as draft"}
                </button>

                <button
                  disabled={saving}
                  onClick={() => saveInvoice(true)}
                  className="w-full rounded-2xl bg-blue-600 px-5 py-4 font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : language === "ar"
                      ? "إصدار الفاتورة"
                      : "Issue invoice"}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {showScanner && (
        <BarcodeScanner
          onScan={findProductByBarcode}
          onClose={() => setShowScanner(false)}
          darkMode={darkMode}
          language={language}
        />
      )}
    </main>
  );
}

function BarcodeScanner({
  onScan,
  onClose,
  darkMode,
  language,
}: {
  onScan: (barcode: string) => void;
  onClose: () => void;
  darkMode: boolean;
  language: "ar" | "en";
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    let stopped = false;
    let animationFrame = 0;
    let lastDetect = 0;
    let stream: MediaStream | null = null;
    let controls: { stop: () => void } | null = null;
    let zxingStarted = false;

    const sourceCanvas = document.createElement("canvas");

    const stop = () => {
      stopped = true;

      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }

      try {
        controls?.stop();
      } catch {}

      controls = null;

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }

      if (videoRef.current?.srcObject) {
        const current = videoRef.current.srcObject as MediaStream;
        current.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }

    };

    const enhanceCamera = async (currentStream: MediaStream) => {
      const track = currentStream.getVideoTracks()[0];
      if (!track) return;

      try {
        const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
          focusMode?: string[];
          zoom?: { min: number; max: number; step?: number };
        };

        const advanced: MediaTrackConstraintSet[] = [];

        if (capabilities.focusMode?.includes("continuous")) {
          advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
        }

        if (capabilities.zoom) {
          const target = Math.min(
            capabilities.zoom.max,
            capabilities.zoom.min + Math.max(capabilities.zoom.step || 0.1, 0.5)
          );
          if (target > capabilities.zoom.min) {
            advanced.push({ zoom: target } as MediaTrackConstraintSet);
          }
        }

        if (advanced.length) {
          await track.applyConstraints({ advanced });
        }
      } catch {}
    };

    const nativeDetector = () => {
      const browserWindow = window as unknown as {
        BarcodeDetector?: new (options?: {
          formats?: string[];
        }) => {
          detect: (
            source: CanvasImageSource
          ) => Promise<Array<{ rawValue?: string }>>;
        };
      };

      if (!browserWindow.BarcodeDetector) return null;

      try {
        return new browserWindow.BarcodeDetector({
          formats: [
            "ean_13",
            "ean_8",
            "upc_a",
            "upc_e",
            "code_128",
            "code_39",
            "itf",
            "codabar",
          ],
        });
      } catch {
        return null;
      }
    };

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
          throw new Error("Camera is not supported.");
        }

        const detector = nativeDetector();

        if (detector) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30, max: 60 },
            },
          });

          if (stopped || !videoRef.current) {
            stop();
            return;
          }

          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          await enhanceCamera(stream);

          const detectLoop = async (timestamp: number) => {
            if (stopped || !videoRef.current) return;

            animationFrame = requestAnimationFrame(detectLoop);

            if (timestamp - lastDetect < 50) return;
            lastDetect = timestamp;

            if (videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
              return;
            }

            try {
              const width = videoRef.current.videoWidth || 1920;
              const height = videoRef.current.videoHeight || 1080;

              const cropWidth = Math.floor(width * 0.86);
              const cropHeight = Math.floor(height * 0.62);
              const sx = Math.floor((width - cropWidth) / 2);
              const sy = Math.floor((height - cropHeight) / 2);

              sourceCanvas.width = Math.min(1800, cropWidth * 2);
              sourceCanvas.height = Math.min(1200, cropHeight * 2);

              const context = sourceCanvas.getContext("2d");
              if (!context) return;

              context.drawImage(
                videoRef.current,
                sx,
                sy,
                cropWidth,
                cropHeight,
                0,
                0,
                sourceCanvas.width,
                sourceCanvas.height
              );

              const result = await detector.detect(sourceCanvas);
              const value = result
                .map((item) => item.rawValue?.trim() || "")
                .find(Boolean);

              if (value && !stopped) {
                stop();
                onScan(value);
              }
            } catch {}
          };

          animationFrame = requestAnimationFrame(detectLoop);
          return;
        }

        await startZXing();
      } catch (error) {
        console.error(error);
        await startZXing();
      }
    };

    const startZXing = async () => {
      if (zxingStarted || stopped || !videoRef.current) return;
      zxingStarted = true;

      try {
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 40,
          delayBetweenScanSuccess: 200,
          tryPlayVideoTimeout: 5000,
        });

        readerRef.current = reader;

        const resultControls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30, max: 60 },
            },
          },
          videoRef.current,
          (result) => {
            if (!result || stopped) return;

            const value = result.getText().trim();
            if (!value) return;

            stop();
            onScan(value);
          }
        );

        controls = resultControls;
      } catch (error) {
        console.error(error);
        onClose();
      }
    };

    start();

    return stop;
  }, [onScan, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div
        dir={language === "ar" ? "rtl" : "ltr"}
        className={`w-full max-w-2xl overflow-hidden rounded-3xl ${
          darkMode ? "bg-[#13161B] text-white" : "bg-white text-slate-800"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h3 className="font-bold">
              {language === "ar" ? "مسح باركود المنتج" : "Scan product barcode"}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {language === "ar"
                ? "وجّه الكاميرا ناحية الباركود"
                : "Point the camera at the barcode"}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            ✕
          </button>
        </div>

        <div className="relative aspect-video bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="h-full w-full object-cover"
          />

          <div className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]" />
        </div>

        <div className="px-5 py-4 text-center text-xs text-slate-500">
          {language === "ar"
            ? "يدعم EAN-13 و EAN-8 و UPC و Code 128 وغيرها."
            : "Supports EAN-13, EAN-8, UPC, Code 128 and more."}
        </div>
      </div>
    </div>
  );
}
