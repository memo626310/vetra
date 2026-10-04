"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";

type Movement = {
  id: string;
  clinic_id: string;
  product_id: string | null;
  movement_type: string;
  quantity: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  product?: {
    id: string;
    name: string;
    unit: string | null;
    barcode: string | null;
  } | null;
};

const movementLabels: Record<string, { ar: string; en: string }> = {
  sale: { ar: "بيع", en: "Sale" },
  purchase: { ar: "شراء", en: "Purchase" },
  return: { ar: "مرتجع", en: "Return" },
  cancelled_sale: { ar: "إلغاء بيع", en: "Cancelled sale" },
  adjustment: { ar: "تعديل مخزون", en: "Adjustment" },
};

function movementLabel(type: string, language: "ar" | "en") {
  return movementLabels[type]?.[language] || type;
}

function movementBadge(type: string) {
  switch (type) {
    case "return":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";
    case "cancelled_sale":
      return "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300";
    case "sale":
      return "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300";
    case "purchase":
      return "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

function formatDate(value: string, language: "ar" | "en") {
  try {
    return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-EG", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function InventoryMovementsPage() {
  const router = useRouter();

  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [darkMode, setDarkMode] = useState(true);

  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [movementFilter, setMovementFilter] = useState("all");

  const isAr = language === "ar";

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("vetra-language");
    const savedTheme = window.localStorage.getItem("vetra-theme");

    if (savedLanguage === "ar" || savedLanguage === "en") {
      setLanguage(savedLanguage);
    }

    setDarkMode(savedTheme !== "light");
  }, []);

  useEffect(() => {
    document.documentElement.dir = isAr ? "rtl" : "ltr";
    document.documentElement.lang = isAr ? "ar" : "en";
    document.documentElement.classList.toggle("dark", darkMode);

    window.localStorage.setItem("vetra-language", language);
    window.localStorage.setItem("vetra-theme", darkMode ? "dark" : "light");
  }, [isAr, language, darkMode]);

  async function loadMovements() {
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
        throw new Error(
          isAr ? "ليس لديك صلاحية لعرض حركة المخزون." : "You are not allowed to view inventory movements."
        );
      }

      const db = await getClinicDb();

      const { data, error: movementsError } = await db
        .from("inventory_movements")
        .select(`
          id,
          clinic_id,
          product_id,
          movement_type,
          quantity,
          reference_type,
          reference_id,
          notes,
          created_by,
          created_at,
          product:products (
            id,
            name,
            unit,
            barcode
          )
        `)
        .eq("clinic_id", context.clinic_id)
        .order("created_at", { ascending: false });

      if (movementsError) throw movementsError;

      setMovements((data || []) as unknown as Movement[]);
    } catch (err: any) {
      setError(
        err?.message ||
          (isAr
            ? "حدث خطأ أثناء تحميل حركة المخزون."
            : "Failed to load inventory movements.")
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMovements();
  }, []);

  const filteredMovements = useMemo(() => {
    const q = search.trim().toLowerCase();

    return movements.filter((movement) => {
      const matchesType =
        movementFilter === "all" ||
        movement.movement_type === movementFilter;

      if (!matchesType) return false;
      if (!q) return true;

      const haystack = [
        movement.product?.name || "",
        movement.product?.barcode || "",
        movement.movement_type || "",
        movement.reference_type || "",
        movement.reference_id || "",
        movement.notes || "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [movements, movementFilter, search]);

  return (
    <main
      dir={isAr ? "rtl" : "ltr"}
      className={`min-h-screen ${
        darkMode
          ? "bg-[#0F1115] text-white"
          : "bg-[#F7F8FA] text-slate-900"
      }`}
    >
      <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <button
              onClick={() => router.push("/inventory/products")}
              className="mb-3 text-sm text-slate-500 transition hover:text-blue-600"
            >
              ← {isAr ? "المنتجات" : "Products"}
            </button>

            <h1 className="text-3xl font-black">
              {isAr ? "حركة المخزون" : "Inventory Movements"}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              {isAr
                ? "سجل دخول وخروج وحركة المنتجات داخل العيادة"
                : "History of stock movements inside the clinic"}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setDarkMode((value) => !value)}
              className={`rounded-2xl border px-4 py-3 ${
                darkMode
                  ? "border-white/10 bg-[#171A20]"
                  : "border-slate-200 bg-white"
              }`}
              title={darkMode ? "Light mode" : "Dark mode"}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>

            <button
              onClick={() =>
                setLanguage((value) => (value === "ar" ? "en" : "ar"))
              }
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                darkMode
                  ? "border-white/10 bg-[#171A20]"
                  : "border-slate-200 bg-white"
              }`}
            >
              {isAr ? "English" : "عربي"}
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        <section
          className={`mb-5 rounded-3xl border p-4 ${
            darkMode
              ? "border-white/[0.06] bg-[#13161B]"
              : "border-slate-100 bg-white"
          }`}
        >
          <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                isAr
                  ? "🔎 ابحث باسم المنتج أو الباركود أو رقم المرجع..."
                  : "🔎 Search product, barcode, or reference..."
              }
              className={`rounded-2xl border px-4 py-3.5 outline-none focus:border-blue-500 ${
                darkMode
                  ? "border-white/[0.07] bg-[#0F1115]"
                  : "border-slate-200 bg-slate-50"
              }`}
            />

            <select
              value={movementFilter}
              onChange={(event) => setMovementFilter(event.target.value)}
              className={`rounded-2xl border px-4 py-3.5 outline-none ${
                darkMode
                  ? "border-white/[0.07] bg-[#0F1115]"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <option value="all">{isAr ? "كل الحركات" : "All movements"}</option>
              <option value="sale">{isAr ? "بيع" : "Sale"}</option>
              <option value="purchase">{isAr ? "شراء" : "Purchase"}</option>
              <option value="return">{isAr ? "مرتجع" : "Return"}</option>
              <option value="cancelled_sale">
                {isAr ? "إلغاء بيع" : "Cancelled sale"}
              </option>
              <option value="adjustment">
                {isAr ? "تعديل مخزون" : "Adjustment"}
              </option>
            </select>

            <button
              onClick={loadMovements}
              disabled={loading}
              className="rounded-2xl bg-blue-600 px-5 py-3.5 font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "…" : isAr ? "تحديث" : "Refresh"}
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
          <div className="border-b border-slate-100 px-5 py-4 dark:border-white/[0.06]">
            <div className="text-sm font-bold">
              {isAr ? "عدد الحركات" : "Movements"}: {filteredMovements.length}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead
                className={
                  darkMode
                    ? "bg-[#0F1115] text-slate-400"
                    : "bg-slate-50 text-slate-500"
                }
              >
                <tr className="text-right">
                  <th className="px-5 py-4">
                    {isAr ? "التاريخ" : "Date"}
                  </th>
                  <th className="px-5 py-4">
                    {isAr ? "المنتج" : "Product"}
                  </th>
                  <th className="px-5 py-4">
                    {isAr ? "نوع الحركة" : "Movement"}
                  </th>
                  <th className="px-5 py-4">
                    {isAr ? "الكمية" : "Quantity"}
                  </th>
                  <th className="px-5 py-4">
                    {isAr ? "المرجع" : "Reference"}
                  </th>
                  <th className="px-5 py-4">
                    {isAr ? "ملاحظات" : "Notes"}
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-16 text-center text-slate-500"
                    >
                      {isAr
                        ? "جاري تحميل حركة المخزون..."
                        : "Loading inventory movements..."}
                    </td>
                  </tr>
                ) : filteredMovements.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-16 text-center text-slate-500"
                    >
                      <div className="mb-3 text-4xl">📦</div>
                      <p className="font-semibold">
                        {isAr
                          ? "لا توجد حركات مخزون مطابقة"
                          : "No matching inventory movements"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map((movement) => (
                    <tr
                      key={movement.id}
                      className={`border-t transition ${
                        darkMode
                          ? "border-white/[0.04] hover:bg-white/[0.02]"
                          : "border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-5 py-4 whitespace-nowrap text-slate-500">
                        {formatDate(movement.created_at, language)}
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-bold">
                          {movement.product?.name || "—"}
                        </div>
                        {movement.product?.barcode && (
                          <div className="mt-1 font-mono text-xs text-slate-500">
                            {movement.product.barcode}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${movementBadge(
                            movement.movement_type
                          )}`}
                        >
                          {movementLabel(movement.movement_type, language)}
                        </span>
                      </td>

                      <td className="px-5 py-4 font-black">
                        {Number(movement.quantity || 0)}{" "}
                        {movement.product?.unit || ""}
                      </td>

                      <td className="px-5 py-4 text-slate-500">
                        {movement.reference_type
                          ? `${movement.reference_type}${
                              movement.reference_id
                                ? ` • ${movement.reference_id.slice(0, 8)}`
                                : ""
                            }`
                          : "—"}
                      </td>

                      <td className="max-w-[360px] px-5 py-4 text-slate-500">
                        {movement.notes || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
