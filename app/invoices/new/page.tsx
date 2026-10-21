"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { vetraCore } from "@/lib/vetra-core";
import { getClinicDb, getClinicContext } from "@/lib/clinic-db";
import { writeVetraThemeMode } from "@/lib/theme";

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

type ProductCategory = { id: string; name: string };

type Product = {
  id: string;
  name: string;
  barcode: string | null;
  unit: string;
  quantity: number;
  retail_price: number;
  category?: { name: string } | null;
};

type FinancialAccount = {
  id: string;
  name: string;
  account_type: "cash" | "bank" | "wallet" | "card" | "other";
  requires_session: boolean;
  is_default: boolean;
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
  autoMedication?: boolean;
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

const normalizeProductName = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "").trim();

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
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  const [financialAccountId, setFinancialAccountId] = useState("");

  const [clientId, setClientId] = useState("");
  const [petId, setPetId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([]);

  const [discount, setDiscount] = useState("0");
  const [discountMode, setDiscountMode] = useState<"amount" | "percentage">("amount");
  const [paidAmount, setPaidAmount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");

  const [showScanner, setShowScanner] = useState(false);
  const [quickSaleMode, setQuickSaleMode] = useState(false);
  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [consultationFee, setConsultationFee] = useState(100);
  const [visitId, setVisitId] = useState("");
  const [invoiceMedicationNotice, setInvoiceMedicationNotice] = useState("");
  const [requestedPetId, setRequestedPetId] = useState("");
  const visitPrefilledRef = useRef(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("vetra-theme");
    const savedLanguage = localStorage.getItem("vetra-language");
    const params = new URLSearchParams(window.location.search);

    setDarkMode(savedTheme !== "light");
    setLanguage(savedLanguage === "en" ? "en" : "ar");
    setClientId(params.get("client") || "");
    const requestedPet = params.get("pet") || "";
    setPetId(requestedPet);
    setRequestedPetId(requestedPet);
    setVisitId(params.get("visit") || "");
    setQuickSaleMode(params.get("mode") === "quick-sale");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    writeVetraThemeMode(darkMode);
    localStorage.setItem("vetra-language", language);
  }, [darkMode, language, ready]);

  async function loadPage() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await vetraCore.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const context = await getClinicContext();
    const db = await getClinicDb();

    if (!["owner", "admin"].includes(context.role)) {
      setAuthorized(false);
      setLoading(false);
      return;
    }

    setAuthorized(true);

    const [clientsResult, productsResult, categoriesResult, settingsResult, accountsResult] =
      await Promise.all([
        db
          .from("clients")
          .select("id, name, phone")
          .eq("clinic_id", context.clinic_id)
          .order("name"),
        db
          .from("products")
          .select(`
            id,
            name,
            barcode,
            unit,
            quantity,
            retail_price,
            category_id,
            category:product_categories(name)
          `)
          .eq("clinic_id", context.clinic_id)
          .order("name"),
        db
          .from("product_categories")
          .select("id, name")
          .eq("clinic_id", context.clinic_id)
          .order("name"),
        db
          .from("billing_settings")
          .select("consultation_fee")
          .eq("clinic_id", context.clinic_id)
          .limit(1)
          .maybeSingle(),
        db
          .from("financial_accounts")
          .select("id,name,account_type,requires_session,is_default")
          .eq("clinic_id", context.clinic_id)
          .eq("is_active", true)
          .order("name"),
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
    if (categoriesResult.error) {
      console.error("LOAD PRODUCT CATEGORIES ERROR:", categoriesResult.error);
    } else {
      setProductCategories((categoriesResult.data || []) as ProductCategory[]);
    }

    if (settingsResult.data?.consultation_fee != null) {
      setConsultationFee(Number(settingsResult.data.consultation_fee));
    }
    const visitFromUrl = new URLSearchParams(window.location.search).get("visit");
    if (visitFromUrl && !visitPrefilledRef.current) {
      visitPrefilledRef.current = true;
      const consultationLine: InvoiceLine = {
        key: crypto.randomUUID(),
        item_type: "service",
        product_id: null,
        service_name: "Consultation",
        description: language === "ar" ? "كشف / استشارة بيطرية" : "Veterinary consultation",
        quantity: 1,
        unit_price: Number(settingsResult.data?.consultation_fee ?? consultationFee),
        discount: 0,
        available_quantity: null,
      };
      void (async () => {
        const db = await getClinicDb();
        const { data: visitMedicationRows, error: visitMedicationError } = await db
          .from("visit_medications")
          .select("medication_id, calculated_dose, calculated_dose_unit, calculated_volume, volume_unit, route, frequency, duration_days")
          .eq("visit_id", visitFromUrl);
        if (visitMedicationError) {
          setInvoiceMedicationNotice(language === "ar" ? `تعذر تحميل أدوية الزيارة: ${visitMedicationError.message}` : `Could not load visit medications: ${visitMedicationError.message}`);
          setLines([consultationLine]);
          return;
        }
        const { data: visitBillingData, error: visitBillingError } = await db.from("visits").select("treatment").eq("id", visitFromUrl).maybeSingle();
        if (visitBillingError) setInvoiceMedicationNotice(language === "ar" ? `تعذر قراءة علاج الزيارة: ${visitBillingError.message}` : `Could not read visit treatment: ${visitBillingError.message}`);
        const medicationIds = [...new Set((visitMedicationRows || []).map((row) => row.medication_id).filter(Boolean))];
        const { data: medicationData, error: medicationsError } = medicationIds.length
          ? await db.from("medications").select("id,name,active_ingredient").in("id", medicationIds)
          : { data: [], error: null };
        if (medicationsError) {
          setInvoiceMedicationNotice(language === "ar" ? `تعذر قراءة أسماء الأدوية: ${medicationsError.message}` : `Could not read medication names: ${medicationsError.message}`);
          setLines([consultationLine]);
          return;
        }
        const medNames = new Map((medicationData || []).map((row) => [String(row.id), { name: String(row.name || "Medication"), activeIngredient: String(row.active_ingredient || "") }]));
        const products = (productsResult.data || []) as unknown as Product[];
        const missing: string[] = [];
        const visitMedicationDrafts = (visitMedicationRows || []).map((row) => ({
          name: medNames.get(String(row.medication_id))?.name || "Medication",
          activeIngredient: medNames.get(String(row.medication_id))?.activeIngredient || "",
          details: [row.calculated_dose != null ? `${row.calculated_dose} ${row.calculated_dose_unit || ""}` : "", row.calculated_volume != null ? `${row.calculated_volume} ${row.volume_unit || "mL"}` : "", row.route, row.frequency, row.duration_days ? `${row.duration_days} days` : ""].filter(Boolean).join(" · "),
        }));
        const selectedNames = new Set(visitMedicationDrafts.map((draft) => normalizeProductName(draft.name)));
        const structuredTreatmentDrafts = String(visitBillingData?.treatment || "").split(/\r?\n/).map((rawLine) => {
          const line = rawLine.trim();
          const externalMatch = line.match(/^\[DrugEye\s*\/[^\]]*\]\s*(.+?)(?:\s+\([^)]*\))?:\s*(.*)$/i);
          if (externalMatch) return { name: externalMatch[1].trim(), details: externalMatch[2].trim() };
          if (line.includes(" - ") && /\b(?:IV|IM|SC|PO|oral|intravenous|intramuscular|subcutaneous)\b/i.test(line)) {
            const [name, ...details] = line.split(" - ");
            return { name: name.trim(), details: details.join(" · ").trim() };
          }
          return null;
        }).filter((draft): draft is { name: string; details: string } => draft !== null && Boolean(draft.name) && !selectedNames.has(normalizeProductName(draft.name)));
        const allMedicationDrafts = [...visitMedicationDrafts, ...structuredTreatmentDrafts.map((draft) => ({ ...draft, activeIngredient: "" }))];
        const medicationLines: InvoiceLine[] = allMedicationDrafts.map((draft) => {
          const medName = draft.name;
          const exactMatch = products.find((product) => normalizeProductName(product.name) === normalizeProductName(medName));
          const ingredient = "activeIngredient" in draft ? normalizeProductName(draft.activeIngredient) : "";
          const ingredientMatches = ingredient ? products.filter((product) => normalizeProductName(product.name) === ingredient) : [];
          const matchedProduct = exactMatch || (ingredientMatches.length === 1 ? ingredientMatches[0] : null);
          const doseLabel = draft.details;
          if (matchedProduct && Number(matchedProduct.quantity) > 0) {
            return { key: crypto.randomUUID(), item_type: "product", product_id: matchedProduct.id, service_name: "", description: `${matchedProduct.name}${doseLabel ? ` — ${doseLabel}` : ""}`, quantity: 1, unit_price: Number(matchedProduct.retail_price) || 0, discount: 0, available_quantity: Number(matchedProduct.quantity), autoMedication: true };
          }
          missing.push(medName);
          return { key: crypto.randomUUID(), item_type: "service", product_id: null, service_name: medName, description: `${medName}${doseLabel ? ` — ${doseLabel}` : ""}`, quantity: 1, unit_price: 0, discount: 0, available_quantity: null, autoMedication: true };
        });
        setLines([consultationLine, ...medicationLines]);
        if (missing.length) setInvoiceMedicationNotice(language === "ar"
          ? `أُضيفت الأدوية غير المطابقة كبنود بدون سعر/مخزون: ${[...new Set(missing)].join("، ")}. اربط اسم الدواء بمنتج مخزون مطابق أو حدّد سعره قبل الإصدار.`
          : `Medications without a matching inventory product were added without price/stock: ${[...new Set(missing)].join(", ")}. Match them to an inventory product or enter their price before issuing.`);
      })();
    }
    if (!accountsResult.error) {
      setFinancialAccounts((accountsResult.data || []) as FinancialAccount[]);
    } else {
      setMessage(accountsResult.error.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (ready) loadPage();
  }, [ready]);
  useEffect(() => {
    if (!financialAccounts.length) {
      setFinancialAccountId("");
      return;
    }
    const preferredType = paymentMethod === "cash" ? "cash"
      : paymentMethod === "card" ? "card"
      : paymentMethod === "wallet" ? "wallet"
      : paymentMethod === "bank_transfer" ? "bank"
      : paymentMethod === "other" ? null : "cash";
    const candidates = preferredType
      ? financialAccounts.filter((account) => account.account_type === preferredType)
      : financialAccounts;
    const preferred = candidates.find((account) => account.is_default) || candidates[0];
    setFinancialAccountId((current) =>
      current && candidates.some((account) => account.id === current)
        ? current
        : preferred?.id || ""
    );
  }, [paymentMethod, financialAccounts]);

  useEffect(() => {
    if (!clientId) {
      setPets([]);
      setPetId("");
      return;
    }

    async function loadPets() {
      const db = await getClinicDb();
      const context = await getClinicContext();

      const { data, error } = await db
        .from("pets")
        .select("id, client_id, name, species")
        .eq("clinic_id", context.clinic_id)
        .eq("client_id", clientId)
        .eq("is_deceased", false)
        .order("name");

      if (!error) {
        setPets((data || []) as Pet[]);
        if (requestedPetId && (data || []).some((pet) => pet.id === requestedPetId)) {
          setPetId(requestedPetId);
        }
      }
    }

    loadPets();
  }, [clientId]);

  const selectedClient = clients.find((client) => client.id === clientId);
  const filteredClients = useMemo(() => {
    const query = clientSearch.trim().toLocaleLowerCase();
    if (!query) return clients.slice(0, 8);
    return clients.filter((client) => `${client.name} ${client.phone || ""}`.toLocaleLowerCase().includes(query)).slice(0, 8);
  }, [clients, clientSearch]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    const categoryProducts = selectedCategoryId
      ? products.filter((product) => (product as Product & { category_id?: string | null }).category_id === selectedCategoryId)
      : products;
    if (!query) return categoryProducts.slice(0, 12);

    return categoryProducts
      .filter(
        (product) =>
          product.name.toLowerCase().includes(query) ||
          (product.barcode || "").toLowerCase().includes(query)
      )
      .slice(0, 12);
  }, [products, productSearch, selectedCategoryId]);

  async function createQuickSaleClient() {
    if (!newClientName.trim()) {
      setMessage(language === "ar" ? "اكتب اسم العميل." : "Enter the client's name.");
      return;
    }
    try {
      const db = await getClinicDb();
      const { data, error } = await db.from("clients").insert({
        name: newClientName.trim(),
        phone: newClientPhone.trim() || null,
      }).select("id, name, phone").single();
      if (error) throw error;
      const client = data as Client;
      setClients((current) => [...current, client].sort((a, b) => a.name.localeCompare(b.name)));
      setClientId(client.id);
      setClientSearch(client.name);
      setPetId("");
      setShowNewClient(false);
      setNewClientName("");
      setNewClientPhone("");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (language === "ar" ? "تعذر إضافة العميل." : "Could not add client."));
    }
  }

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

  const discountInput = Math.max(0, Number(discount) || 0);
  const invoiceDiscount = discountMode === "percentage"
    ? Math.min(subtotal, subtotal * Math.min(discountInput, 100) / 100)
    : Math.min(subtotal, discountInput);
  const total = Math.max(0, subtotal - invoiceDiscount);
  const paid = Math.max(0, Number(paidAmount) || 0);
  const remaining = Math.max(0, total - paid);

  function addProduct(product: Product) {
    setMessage("");
    setSuccess("");

    if (Number(product.quantity) <= 0) {
      const notice = language === "ar"
        ? `المنتج «${product.name}» خلصان ومش متاح للبيع.`
        : `${product.name} is out of stock and cannot be sold.`;
      setMessage(notice);
      window.alert(notice);
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

    const db = await getClinicDb();
    const context = await getClinicContext();

    const { data, error } = await db
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
      .eq("clinic_id", context.clinic_id)
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

    if (lines.some((line) => line.autoMedication && line.item_type === "service" && line.unit_price <= 0)) {
      setMessage(language === "ar"
        ? "يوجد دواء من الزيارة بلا منتج مخزون مطابق أو سعر. أضف منتج المخزون المطابق واحذف بند الخدمة غير المسعّر قبل إصدار الفاتورة."
        : "A visit medication has no matching inventory product or price. Add the matching inventory product and remove the unpriced service line before issuing the invoice.");
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
    if (!issueAfterSave && paid > 0) {
      setMessage(
        language === "ar"
          ? "التحصيل يتسجل مع إصدار الفاتورة فقط. صفّر المدفوع لحفظ مسودة، أو أصدر الفاتورة لتسجيله في الخزنة."
          : "A receipt is posted only when the invoice is issued. Set paid amount to zero to save a draft, or issue the invoice to record the receipt."
      );
      return;
    }

    if (paid > 0 && (!paymentMethod || !financialAccountId)) {
      setMessage(
        language === "ar"
          ? "اختار طريقة الدفع والحساب المالي قبل تسجيل التحصيل."
          : "Choose a payment method and financial account before recording a receipt."
      );
      return;
    }

    const selectedFinancialAccount = financialAccounts.find((account) => account.id === financialAccountId);
setSaving(true);

    const {
      data: { user },
    } = await vetraCore.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const context = await getClinicContext();
    const db = await getClinicDb();

    if (!["owner", "admin"].includes(context.role)) {
      setAuthorized(false);
      setSaving(false);
      return;
    }

    const { data: invoice, error: invoiceError } = await db
      .from("invoices")
      .insert({
        clinic_id: context.clinic_id,
        client_id: clientId,
        pet_id: petId || null,
        visit_id: visitId || null,
        status: "draft",
        payment_method: null,
        subtotal,
        discount: invoiceDiscount,
        total,
        paid_amount: 0,
        notes: notes.trim() || null,
        issued_at: issueAfterSave ? new Date().toISOString() : null,
        paid_at: null,
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

    const tenantItemRows = itemRows.map((row) => ({
      ...row,
      clinic_id: context.clinic_id,
    }));

    const { error: itemsError } = await db
      .from("invoice_items")
      .insert(tenantItemRows);

    if (itemsError) {
      await db.from("invoices").delete().eq("id", invoice.id).eq("clinic_id", context.clinic_id);
      setMessage(itemsError.message);
      setSaving(false);
      return;
    }

    if (issueAfterSave && selectedFinancialAccount?.requires_session) {
      const { error: sessionError } = await db.rpc("vetra_ensure_cash_register_open", {
        p_account_id: selectedFinancialAccount.id,
      });

      if (sessionError) {
        setMessage(language === "ar"
          ? `تعذر فتح وردية الخزنة تلقائيًا، ولم يتم إصدار الفاتورة: ${sessionError.message}`
          : `Could not open the cash register automatically; the invoice was not issued: ${sessionError.message}`);
        setSaving(false);
        return;
      }
    }

    if (issueAfterSave) {
      const { error: issueError } = await db.rpc("issue_invoice", {
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
    }    if (issueAfterSave && paid > 0) {
      const { error: receiptError } = await db.rpc("vetra_record_invoice_payment", {
        p_invoice_id: invoice.id,
        p_account_id: financialAccountId,
        p_amount: paid,
        p_payment_method: paymentMethod,
        p_reference: null,
        p_notes: notes.trim() || null,
        p_session_id: null,
        p_idempotency_key: `initial-invoice-payment:${invoice.id}`,
      });

      if (receiptError) {
        setMessage(
          language === "ar"
            ? `تم إصدار الفاتورة، لكن التحصيل لم يُسجل في الخزنة: ${receiptError.message}. سجّل التحصيل من صفحة المالية.`
            : `The invoice was issued, but the receipt was not posted: ${receiptError.message}. Record it from the Finance page.`
        );
        setSaving(false);
        setTimeout(() => router.push(`/invoices/${invoice.id}`), 1200);
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
              ? "إنشاء الفواتير متاح للـ Owner و Admin فقط."
              : "Invoice creation is available to Owner and Admin users only."}
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
      className={`min-h-screen w-full min-w-0 overflow-x-clip ${
        darkMode ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"
      }`}
    >
      <div className="mx-auto w-full min-w-0 max-w-[1500px] px-3 py-4 sm:px-6 sm:py-6 lg:px-10">
        <header className="mb-5 flex min-w-0 flex-col gap-3 sm:mb-6 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <button
              onClick={() => router.push("/invoices")}
              className="mb-3 text-sm text-slate-500 hover:text-blue-600"
            >
              ← {language === "ar" ? "الفواتير" : "Invoices"}
            </button>
            <h1 className="break-words text-2xl font-black leading-tight sm:text-3xl">
              {quickSaleMode
                ? (language === "ar" ? "بيع سريع" : "Quick Sale")
                : (language === "ar" ? "فاتورة جديدة" : "New Invoice")}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {language === "ar"
                ? "منتجات + خدمات في فاتورة واحدة"
                : "Products + services in one invoice"}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 self-start">
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

        <div className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-4 sm:space-y-6">
            <section
              className={`min-w-0 rounded-2xl border p-3 sm:rounded-3xl sm:p-5 ${
                darkMode
                  ? "border-white/[0.06] bg-[#13161B]"
                  : "border-slate-100 bg-white"
              }`}
            >
              <h2 className="mb-4 text-lg font-bold">
                {language === "ar" ? "بيانات العميل" : "Customer"}
              </h2>

              <div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-500">
                    {language === "ar" ? "بحث عن المالك *" : "Search owner *"}
                  </label>
                  <div className="relative">
                    <input
                      value={clientSearch}
                      onChange={(event) => { setClientSearch(event.target.value); if (!event.target.value) { setClientId(""); setPetId(""); } }}
                      placeholder={language === "ar" ? "ابحث بالاسم أو رقم الهاتف..." : "Search name or phone..."}
                      className={`w-full rounded-2xl border px-4 py-3.5 outline-none focus:border-blue-500 ${darkMode ? "border-white/[0.07] bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`}
                    />
                    {clientSearch && !selectedClient && (
                      <div className={`absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border shadow-xl ${darkMode ? "border-white/10 bg-[#171A20]" : "border-slate-200 bg-white"}`}>
                        {filteredClients.map((client) => <button key={client.id} type="button" onClick={() => { setClientId(client.id); setClientSearch(client.name); setPetId(""); }} className={`block w-full border-b px-4 py-3 text-start last:border-0 ${darkMode ? "border-white/5 hover:bg-white/5" : "border-slate-100 hover:bg-slate-50"}`}>
                          <span className="block text-sm font-semibold">{client.name}</span><span className="text-xs text-slate-500">{client.phone || (language === "ar" ? "بدون رقم هاتف" : "No phone")}</span>
                        </button>)}
                        {filteredClients.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">{language === "ar" ? "لا يوجد عميل مطابق." : "No matching owner."}</p>}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => { setNewClientName(clientSearch); setShowNewClient(true); }} className="mt-2 text-xs font-bold text-blue-500 hover:text-blue-600">+ {language === "ar" ? "إضافة عميل جديد" : "Add new client"}</button>
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
              {showNewClient && <div className={`mt-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-2 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`}>
                <h3 className="font-bold sm:col-span-2">{language === "ar" ? "عميل جديد" : "New owner"}</h3>
                <input autoFocus value={newClientName} onChange={(event) => setNewClientName(event.target.value)} placeholder={language === "ar" ? "اسم العميل *" : "Owner name *"} className={`rounded-xl border px-3 py-2.5 text-sm ${darkMode ? "border-white/10 bg-[#171A20]" : "border-slate-200 bg-white"}`} />
                <input value={newClientPhone} onChange={(event) => setNewClientPhone(event.target.value)} placeholder={language === "ar" ? "رقم الهاتف" : "Phone number"} dir="ltr" className={`rounded-xl border px-3 py-2.5 text-sm ${darkMode ? "border-white/10 bg-[#171A20]" : "border-slate-200 bg-white"}`} />
                <div className="flex gap-2 sm:col-span-2"><button type="button" onClick={() => void createQuickSaleClient()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">{language === "ar" ? "حفظ واختيار العميل" : "Save and select"}</button><button type="button" onClick={() => setShowNewClient(false)} className={`rounded-lg border px-4 py-2 text-sm ${darkMode ? "border-white/10" : "border-slate-200"}`}>{language === "ar" ? "إلغاء" : "Cancel"}</button></div>
              </div>}
            </section>

            <section
              className={`min-w-0 rounded-2xl border p-3 sm:rounded-3xl sm:p-5 ${
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
                  className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 sm:w-auto sm:px-5"
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
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    const query = productSearch.trim();
                    if (!query) return;
                    const exactBarcode = products.find(
                      (product) => product.barcode?.trim().toLowerCase() === query.toLowerCase()
                    );
                    if (exactBarcode) {
                      addProduct(exactBarcode);
                      return;
                    }
                    if (filteredProducts.length === 1) {
                      addProduct(filteredProducts[0]);
                      return;
                    }
                    if (filteredProducts.length === 0) {
                      void findProductByBarcode(query);
                    }
                  }}
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

              <div className="mb-4 flex flex-wrap gap-2" aria-label={language === "ar" ? "تصنيفات المنتجات" : "Product categories"}>
                <button type="button" onClick={() => setSelectedCategoryId("")} aria-pressed={!selectedCategoryId} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${!selectedCategoryId ? "border-blue-500 bg-blue-600 text-white" : darkMode ? "border-white/10 text-slate-300" : "border-slate-200 text-slate-600"}`}>{language === "ar" ? "الكل" : "All"}</button>
                {productCategories.map((category) => <button key={category.id} type="button" onClick={() => setSelectedCategoryId((current) => current === category.id ? "" : category.id)} aria-pressed={selectedCategoryId === category.id} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selectedCategoryId === category.id ? "border-blue-500 bg-blue-600 text-white" : darkMode ? "border-white/10 text-slate-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{category.name}</button>)}
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProduct(product)}
                    aria-label={Number(product.quantity) <= 0
                      ? `${product.name}: ${language === "ar" ? "نفد المخزون" : "Out of stock"}`
                      : `${product.name}: ${money(Number(product.retail_price))} EGP`}
                    className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-3 text-right transition sm:p-4 ${Number(product.quantity) <= 0 ? "cursor-not-allowed opacity-70" : "sm:hover:-translate-y-0.5"} ${
                      darkMode
                        ? "border-white/[0.06] bg-[#0F1115] hover:bg-[#171A20]"
                        : "border-slate-100 bg-slate-50 hover:bg-white hover:shadow-sm"
                    }`}
                  >
                    <div>
                      <p className="font-bold">{product.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {product.barcode || "No barcode"} · {product.unit} ·{" "}
                        {Number(product.quantity) <= 0
                          ? (language === "ar" ? "نفد المخزون" : "Out of stock")
                          : `${product.quantity} ${language === "ar" ? "متاح" : "available"}`}
                      </p>
                    </div>
                    <span className={`rounded-xl px-3 py-2 text-xs font-bold ${Number(product.quantity) <= 0 ? "bg-rose-500/10 text-rose-600 dark:text-rose-300" : "bg-blue-600 text-white"}`}>
                      {Number(product.quantity) <= 0
                        ? (language === "ar" ? "خلصان" : "Out of stock")
                        : `+ ${money(Number(product.retail_price))}`}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section
              className={`min-w-0 rounded-2xl border p-3 sm:rounded-3xl sm:p-5 ${
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

              <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
                <input
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder={language === "ar" ? "اسم الخدمة" : "Service name"}
                  className={`min-w-0 w-full rounded-2xl border px-4 py-3.5 outline-none focus:border-blue-500 ${
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
                  className={`min-w-0 w-full rounded-2xl border px-4 py-3.5 outline-none focus:border-blue-500 ${
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

              {invoiceMedicationNotice && <p className="mx-3 mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-700 dark:text-amber-200 sm:mx-5">{invoiceMedicationNotice}</p>}

              <div className="space-y-3 p-3 sm:hidden">
                {lines.map((line) => {
                  const lineTotal = Math.max(0, line.quantity * line.unit_price - line.discount);
                  const field = `w-full min-w-0 rounded-xl border px-2.5 py-2 text-sm ${darkMode ? "border-white/[0.07] bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`;
                  return <article key={line.key} className={`rounded-2xl border p-3 ${darkMode ? "border-white/[0.07] bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`}>
                    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-bold">{line.description || line.service_name}</p><p className="mt-1 text-[10px] text-slate-500">{line.item_type === "product" ? (language === "ar" ? "دواء من المخزون" : "Inventory product") : (language === "ar" ? "خدمة / دواء يحتاج تسعير" : "Service / medication needs pricing")}{line.available_quantity != null ? ` · ${language === "ar" ? "المتاح" : "Stock"}: ${line.available_quantity}` : ""}</p></div><button type="button" onClick={() => removeLine(line.key)} className="shrink-0 rounded-lg px-2 py-1 text-rose-500" aria-label={language === "ar" ? "حذف البند" : "Remove item"}>×</button></div>
                    <div className="mt-3 grid grid-cols-3 gap-2"><label className="text-[10px] text-slate-500">{language === "ar" ? "الكمية" : "Qty"}<input type="number" min="0.001" max={line.item_type === "product" ? line.available_quantity ?? undefined : undefined} step="1" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: Number(event.target.value) || 0 })} className={field} /></label><label className="text-[10px] text-slate-500">{language === "ar" ? "سعر الوحدة" : "Price"}<input type="number" min="0" step="0.01" value={line.unit_price} onChange={(event) => updateLine(line.key, { unit_price: Number(event.target.value) || 0 })} className={field} /></label><label className="text-[10px] text-slate-500">{language === "ar" ? "الخصم" : "Discount"}<input type="number" min="0" step="0.01" value={line.discount} onChange={(event) => updateLine(line.key, { discount: Number(event.target.value) || 0 })} className={field} /></label></div>
                    <div className="mt-2 flex justify-between border-t border-slate-200/50 pt-2 text-sm"><span className="text-slate-500">{language === "ar" ? "الإجمالي" : "Total"}</span><strong>{money(lineTotal)} EGP</strong></div>
                  </article>;
                })}
                {!lines.length && <p className="py-8 text-center text-sm text-slate-500">{language === "ar" ? "لسه مفيش بنود في الفاتورة" : "No invoice items yet"}</p>}
              </div>

              <div className="hidden max-w-full overflow-x-auto overscroll-x-contain sm:block">
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

          <aside className="min-w-0 space-y-4 sm:space-y-6">
            <section
              className={`min-w-0 rounded-2xl border p-3 sm:rounded-3xl sm:p-5 xl:sticky xl:top-5 ${
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
                  <div className={`mb-2 grid grid-cols-2 gap-1 rounded-xl p-1 ${darkMode ? "bg-[#0F1115]" : "bg-slate-100"}`}>
                    <button
                      type="button"
                      onClick={() => { setDiscountMode("amount"); setDiscount("0"); }}
                      className={`rounded-lg px-3 py-2 text-xs font-bold transition ${discountMode === "amount" ? (darkMode ? "bg-white/10 text-white" : "bg-white text-slate-900 shadow-sm") : "text-slate-500"}`}
                    >
                      {language === "ar" ? "مبلغ" : "Money"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDiscountMode("percentage"); setDiscount("0"); }}
                      className={`rounded-lg px-3 py-2 text-xs font-bold transition ${discountMode === "percentage" ? (darkMode ? "bg-white/10 text-white" : "bg-white text-slate-900 shadow-sm") : "text-slate-500"}`}
                    >
                      {language === "ar" ? "نسبة مئوية" : "Percentage"}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max={discountMode === "percentage" ? 100 : subtotal}
                      step={discountMode === "percentage" ? "1" : "0.01"}
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className={`w-full rounded-2xl border px-4 py-3 outline-none focus:border-blue-500 ${
                        darkMode
                          ? "border-white/[0.07] bg-[#0F1115]"
                          : "border-slate-200 bg-slate-50"
                      }`}
                    />
                    <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-sm text-slate-500">
                      {discountMode === "percentage" ? "%" : "EGP"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {language === "ar" ? "الخصم المحسوب" : "Applied discount"}: {money(invoiceDiscount)} EGP
                  </p>
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
                    {language === "ar" ? "الحساب المستلم للمبلغ" : "Account receiving payment"}
                  </label>
                  <select
                    value={financialAccountId}
                    onChange={(e) => setFinancialAccountId(e.target.value)}
                    className={`w-full rounded-2xl border px-4 py-3 outline-none ${
                      darkMode
                        ? "border-white/[0.07] bg-[#0F1115]"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <option value="">
                      {language === "ar" ? "اختار الخزنة أو الحساب" : "Select a receiving account"}
                    </option>
                    {financialAccounts
                      .filter((account) => {
                        if (paymentMethod === "cash") return account.account_type === "cash";
                        if (paymentMethod === "card") return account.account_type === "card";
                        if (paymentMethod === "wallet") return account.account_type === "wallet";
                        if (paymentMethod === "bank_transfer") return account.account_type === "bank";
                        return true;
                      })
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}{account.requires_session ? (language === "ar" ? " · وردية خزنة" : " · Register session") : ""}
                        </option>
                      ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500">
                    {language === "ar"
                      ? "سيتم فتح وردية الخزنة تلقائيًا عند إصدار الفاتورة أو تحصيل دفعة."
                      : "Cash register sessions open automatically when a sales invoice is issued or a customer payment is collected."}
                  </p>
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

      // Camera tracks and ZXing controls are stopped above.
      // BrowserMultiFormatReader in the installed @zxing/browser version
      // does not expose reset() in its TypeScript API.
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
