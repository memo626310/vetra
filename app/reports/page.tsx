"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";

type Language = "ar" | "en";
type RangeKey = "7" | "30" | "90" | "365" | "all";

type Visit = {
  id: string;
  pet_id: string;
  visit_date: string;
  reason: string | null;
  diagnosis: string | null;
};

type Invoice = {
  id: string;
  status: string;
  total: number | null;
  paid_amount: number | null;
  payment_method: string | null;
  created_at: string;
};

type Pet = {
  id: string;
  species: string | null;
  name: string | null;
};

type ReportData = {
  visits: Visit[];
  invoices: Invoice[];
  pets: Pet[];
  clientsCount: number;
  vaccinationsCount: number;
};

type ClinicContext = {
  clinic_id: string;
  clinic_name: string;
  clinic_status: string;
  role: string;
  database_status: string | null;
};

type Bucket = {
  label: string;
  visits: number;
  revenue: number;
};

const translations = {
  ar: {
    title: "التقارير",
    subtitle: "صورة شاملة عن أداء العيادة والنشاط الطبي والمالي",
    dashboard: "الرئيسية",
    refresh: "تحديث",
    refreshing: "جاري التحديث...",
    language: "English",
    clinic: "العيادة",
    database: "قاعدة البيانات",
    ready: "جاهزة",
    failed: "غير متاحة",
    range: "الفترة",
    last7: "آخر 7 أيام",
    last30: "آخر 30 يوم",
    last90: "آخر 90 يوم",
    last365: "آخر سنة",
    all: "كل البيانات المتاحة",
    visits: "الزيارات",
    activePatients: "الحيوانات التي تمت خدمتها",
    revenue: "قيمة الفواتير",
    collected: "المتحصل",
    outstanding: "المتبقي",
    invoices: "الفواتير",
    averageInvoice: "متوسط الفاتورة",
    newClients: "إجمالي العملاء",
    vaccinations: "التطعيمات المسجلة",
    activityTrend: "النشاط والإيراد",
    topReasons: "أكثر أسباب الزيارة",
    diagnoses: "أكثر التشخيصات تكرارًا",
    species: "توزيع الأنواع",
    payments: "طرق الدفع",
    recentActivity: "آخر النشاطات",
    noData: "لا توجد بيانات كافية لهذه الفترة",
    visitCount: "زيارة",
    invoiceCount: "فاتورة",
    petCount: "حيوان",
    count: "العدد",
    share: "النسبة",
    status: "الحالة",
    active: "نشطة",
    returned: "مرتجعة",
    cancelled: "ملغاة",
    draft: "مسودة",
    collectedLabel: "متحصل",
    unpaid: "غير متحصل",
    noClinic: "لم يتم العثور على عيادة فعالة.",
    loadError: "تعذر تحميل بيانات التقارير.",
    noDiagnosis: "بدون تشخيص مسجل",
    noReason: "بدون سبب مسجل",
    noPayment: "غير محدد",
    cash: "نقدي",
    card: "بطاقة",
    bank: "تحويل بنكي",
    vodafone: "فودافون كاش",
    wallet: "محفظة إلكترونية",
    other: "أخرى",
    medical: "النشاط الطبي",
    finance: "الملخص المالي",
    total: "الإجمالي",
    invoiceAmount: "قيمة الفاتورة",
    paid: "المدفوع",
    recentVisits: "أحدث الزيارات",
    revenueInfo: "القيمة محسوبة من الفواتير غير الملغاة وغير المسودة.",
  },
  en: {
    title: "Reports",
    subtitle: "A complete view of clinic medical activity and financial performance",
    dashboard: "Dashboard",
    refresh: "Refresh",
    refreshing: "Refreshing...",
    language: "عربي",
    clinic: "Clinic",
    database: "Database",
    ready: "Ready",
    failed: "Unavailable",
    range: "Period",
    last7: "Last 7 days",
    last30: "Last 30 days",
    last90: "Last 90 days",
    last365: "Last year",
    all: "All available data",
    visits: "Visits",
    activePatients: "Pets served",
    revenue: "Invoice value",
    collected: "Collected",
    outstanding: "Outstanding",
    invoices: "Invoices",
    averageInvoice: "Average invoice",
    newClients: "Total clients",
    vaccinations: "Recorded vaccinations",
    activityTrend: "Activity & revenue",
    topReasons: "Top visit reasons",
    diagnoses: "Top diagnoses",
    species: "Species mix",
    payments: "Payment methods",
    recentActivity: "Recent activity",
    noData: "Not enough data for this period",
    visitCount: "visits",
    invoiceCount: "invoices",
    petCount: "pets",
    count: "Count",
    share: "Share",
    status: "Status",
    active: "Active",
    returned: "Returned",
    cancelled: "Cancelled",
    draft: "Draft",
    collectedLabel: "Collected",
    unpaid: "Uncollected",
    noClinic: "No active clinic was found.",
    loadError: "Could not load report data.",
    noDiagnosis: "No diagnosis recorded",
    noReason: "No visit reason recorded",
    noPayment: "Not specified",
    cash: "Cash",
    card: "Card",
    bank: "Bank transfer",
    vodafone: "Vodafone Cash",
    wallet: "E-wallet",
    other: "Other",
    medical: "Medical activity",
    finance: "Financial summary",
    total: "Total",
    invoiceAmount: "Invoice amount",
    paid: "Paid",
    recentVisits: "Recent visits",
    revenueInfo: "Value is calculated from non-draft, non-cancelled invoices.",
  },
} as const;

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatMoney(value: number, language: Language) {
  return new Intl.NumberFormat(language === "ar" ? "ar-EG" : "en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string, language: Language) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

type Translation = (typeof translations)[keyof typeof translations];

function paymentLabel(
  value: string | null,
  t: Translation
): string {
  const normalized = (value || "").toLowerCase();

  if (normalized.includes("cash")) {
    return t.cash;
  }

  if (normalized.includes("card")) {
    return t.card;
  }

  if (
    normalized.includes("bank") ||
    normalized.includes("transfer")
  ) {
    return t.bank;
  }

  if (normalized.includes("vodafone")) {
    return t.vodafone;
  }

  if (normalized.includes("wallet")) {
    return t.wallet;
  }

  return value || t.noPayment;
}

function isFinancialInvoice(invoice: Invoice) {
  return !["draft", "cancelled"].includes(invoice.status);
}

function buildBuckets(
  visits: Visit[],
  invoices: Invoice[],
  start: Date,
  end: Date,
  language: Language,
): Bucket[] {
  const dayCount = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  const bucketCount = dayCount <= 14 ? dayCount : 12;
  const bucketMs = (end.getTime() - start.getTime()) / bucketCount || 86400000;

  const buckets: Bucket[] = Array.from({ length: bucketCount }, (_, index) => ({
    label: "",
    visits: 0,
    revenue: 0,
  }));

  for (let index = 0; index < bucketCount; index += 1) {
    const bucketStart = new Date(start.getTime() + bucketMs * index);
    buckets[index].label =
      dayCount <= 14
        ? new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
            day: "numeric",
            month: "short",
          }).format(bucketStart)
        : new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
            month: "short",
            day: "numeric",
          }).format(bucketStart);
  }

  for (const visit of visits) {
    const time = new Date(visit.visit_date).getTime();
    const index = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((time - start.getTime()) / bucketMs)),
    );
    buckets[index].visits += 1;
  }

  for (const invoice of invoices) {
    if (!isFinancialInvoice(invoice)) continue;
    const time = new Date(invoice.created_at).getTime();
    const index = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((time - start.getTime()) / bucketMs)),
    );
    buckets[index].revenue += Number(invoice.total || 0);
  }

  return buckets;
}

function rankValues(values: string[], limit = 5) {
  const map = new Map<string, number>();
  for (const value of values) {
    const key = value.trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function BarChart({
  buckets,
  language,
}: {
  buckets: Bucket[];
  language: Language;
}) {
  const maxRevenue = Math.max(1, ...buckets.map((item) => item.revenue));
  const maxVisits = Math.max(1, ...buckets.map((item) => item.visits));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 items-end gap-2 rounded-2xl border border-white/[0.05] bg-black/10 px-3 py-4 dark:border-white/[0.05]">
        {buckets.map((bucket, index) => {
          const revenueHeight = Math.max(8, Math.round((bucket.revenue / maxRevenue) * 150));
          const visitHeight = Math.max(5, Math.round((bucket.visits / maxVisits) * 55));
          return (
            <div key={`${bucket.label}-${index}`} className="flex min-w-0 flex-col items-center justify-end gap-2">
              <div className="flex h-40 items-end gap-1">
                <div
                  title={`${formatMoney(bucket.revenue, language)} EGP`}
                  className="w-2.5 rounded-t-lg bg-blue-500/80 transition-all"
                  style={{ height: `${revenueHeight}px` }}
                />
                <div
                  title={`${bucket.visits} ${language === "ar" ? "زيارة" : "visits"}`}
                  className="w-2.5 rounded-t-lg bg-emerald-400/80 transition-all"
                  style={{ height: `${visitHeight}px` }}
                />
              </div>
              <span className="truncate text-[9px] text-slate-500">{bucket.label}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />{language === "ar" ? "الإيراد" : "Revenue"}</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />{language === "ar" ? "الزيارات" : "Visits"}</span>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  tone,
  darkMode,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: string;
  tone: string;
  darkMode: boolean;
}) {
  return (
    <div className={`rounded-3xl border p-5 transition ${darkMode ? "border-white/[0.06] bg-[#13161B]" : "border-slate-100 bg-white"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-black tracking-tight">{value}</p>
          {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-xl ${tone}`}>{icon}</div>
      </div>
    </div>
  );
}

function RankingCard({
  title,
  rows,
  darkMode,
}: {
  title: string;
  rows: Array<[string, number]>;
  darkMode: boolean;
}) {
  const max = Math.max(1, ...rows.map(([, count]) => count));
  return (
    <section className={`rounded-3xl border p-5 ${darkMode ? "border-white/[0.06] bg-[#13161B]" : "border-slate-100 bg-white"}`}>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-black">{title}</h2>
        <span className="text-xs text-slate-500">Top 5</span>
      </div>

      {rows.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center text-sm text-slate-500">—</div>
      ) : (
        <div className="space-y-4">
          {rows.map(([name, count], index) => (
            <div key={`${name}-${index}`}>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-semibold">{index + 1}. {name}</span>
                <span className="shrink-0 text-xs text-slate-500">{count}</span>
              </div>
              <div className={`h-2 overflow-hidden rounded-full ${darkMode ? "bg-white/[0.05]" : "bg-slate-100"}`}>
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(8, (count / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>("ar");
  const [darkMode, setDarkMode] = useState(true);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [range, setRange] = useState<RangeKey>("30");
  const [clinic, setClinic] = useState<ClinicContext | null>(null);
  const [data, setData] = useState<ReportData>({
    visits: [],
    invoices: [],
    pets: [],
    clientsCount: 0,
    vaccinationsCount: 0,
  });

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

  async function loadReports(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    setLoading(true);
    setMessage("");

    try {
      const context = await getClinicContext();
      if (!context?.clinic_id || context.clinic_status !== "active") {
        setClinic(null);
        router.replace("/clinic-setup");
        return;
      }

      setClinic({
        clinic_id: context.clinic_id,
        clinic_name: context.clinic_name,
        clinic_status: context.clinic_status,
        role: context.role,
        database_status: context.database_status,
      });

      const db = await getClinicDb();
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - 365);

      const [visitsResult, invoicesResult, petsResult, clientsResult, vaccinationsResult] = await Promise.all([
        db
          .from("visits")
          .select("id,pet_id,visit_date,reason,diagnosis")
          .eq("clinic_id", context.clinic_id)
          .gte("visit_date", windowStart.toISOString())
          .order("visit_date", { ascending: false }),
        db
          .from("invoices")
          .select("id,status,total,paid_amount,payment_method,created_at")
          .eq("clinic_id", context.clinic_id)
          .gte("created_at", windowStart.toISOString())
          .order("created_at", { ascending: false }),
        db
          .from("pets")
          .select("id,species,name")
          .eq("clinic_id", context.clinic_id),
        db
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", context.clinic_id),
        db
          .from("vaccinations")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", context.clinic_id),
      ]);

      const firstError =
        visitsResult.error ||
        invoicesResult.error ||
        petsResult.error ||
        clientsResult.error ||
        vaccinationsResult.error;

      if (firstError) {
        console.error("REPORTS LOAD ERROR:", firstError);
        setMessage(firstError.message || "Could not load report data.");
      }

      setData({
        visits: (visitsResult.data || []) as Visit[],
        invoices: (invoicesResult.data || []) as Invoice[],
        pets: (petsResult.data || []) as Pet[],
        clientsCount: clientsResult.count || 0,
        vaccinationsCount: vaccinationsResult.count || 0,
      });
    } catch (error) {
      console.error("REPORTS LOAD ERROR:", error);
      setMessage(error instanceof Error ? error.message : "Could not load report data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (ready) void loadReports(false);
  }, [ready]);

  const t = translations[language];
  const direction = language === "ar" ? "rtl" : "ltr";

  const activePeriod = useMemo(() => {
    const end = new Date();
    const start = startOfDay(new Date(end));
    if (range === "all") {
      start.setFullYear(start.getFullYear() - 365);
    } else {
      start.setDate(start.getDate() - Number(range));
    }
    return { start, end };
  }, [range]);

  const filtered = useMemo(() => {
    const startTime = activePeriod.start.getTime();
    const endTime = activePeriod.end.getTime();
    return {
      visits: data.visits.filter((item) => {
        const time = new Date(item.visit_date).getTime();
        return time >= startTime && time <= endTime;
      }),
      invoices: data.invoices.filter((item) => {
        const time = new Date(item.created_at).getTime();
        return time >= startTime && time <= endTime;
      }),
    };
  }, [activePeriod, data.invoices, data.visits]);

  const metrics = useMemo(() => {
    const invoiceRows = filtered.invoices.filter(isFinancialInvoice);
    const revenue = invoiceRows.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const collected = invoiceRows.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0);
    const outstanding = Math.max(0, revenue - collected);
    const activePetIds = new Set(filtered.visits.map((item) => item.pet_id));
    const averageInvoice = invoiceRows.length ? revenue / invoiceRows.length : 0;
    const returned = filtered.invoices.filter((item) => ["returned", "partially_returned"].includes(item.status)).length;
    const cancelled = filtered.invoices.filter((item) => item.status === "cancelled").length;

    return {
      visits: filtered.visits.length,
      activePets: activePetIds.size,
      invoices: invoiceRows.length,
      revenue,
      collected,
      outstanding,
      averageInvoice,
      returned,
      cancelled,
    };
  }, [filtered]);

  const buckets = useMemo(
    () => buildBuckets(filtered.visits, filtered.invoices, activePeriod.start, activePeriod.end, language),
    [activePeriod.end, activePeriod.start, filtered.invoices, filtered.visits, language],
  );

  const reasonRows = useMemo(
    () => rankValues(filtered.visits.map((item) => item.reason || t.noReason)),
    [filtered.visits, t.noReason],
  );

  const diagnosisRows = useMemo(
    () => rankValues(filtered.visits.map((item) => item.diagnosis || t.noDiagnosis)),
    [filtered.visits, t.noDiagnosis],
  );

  const speciesRows = useMemo(() => {
    const petMap = new Map(data.pets.map((pet) => [pet.id, pet]));
    return rankValues(
      filtered.visits.map((visit) => {
        const species = petMap.get(visit.pet_id)?.species?.trim();
        return species || t.other;
      }),
      6,
    );
  }, [data.pets, filtered.visits, t.other]);

  const paymentRows = useMemo(() => {
    return rankValues(
      filtered.invoices
        .filter(isFinancialInvoice)
        .map((invoice) => paymentLabel(invoice.payment_method, t)),
      6,
    );
  }, [filtered.invoices, language]);

  const recentVisits = filtered.visits.slice(0, 8);
  const recentInvoiceRows = filtered.invoices.filter(isFinancialInvoice).slice(0, 6);

  if (!ready || loading) {
    return (
      <main className={darkMode ? "flex min-h-screen items-center justify-center bg-[#0F1115] text-white" : "flex min-h-screen items-center justify-center bg-[#F7F8FA] text-slate-800"}>
        <div className="text-center">
          <div className="mb-3 text-4xl">📊</div>
          <p className="text-sm text-slate-500">{language === "ar" ? "جاري تحميل التقارير..." : "Loading reports..."}</p>
        </div>
      </main>
    );
  }

  return (
    <main dir={direction} className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}>
      <div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8 lg:px-10">
        <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <button onClick={() => router.push("/dashboard")} className="mb-3 text-sm font-medium text-slate-500 transition hover:text-blue-500">
              ← {t.dashboard}
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{t.title}</h1>
              {clinic && (
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400">
                  🏥 {clinic.clinic_name}
                </span>
              )}
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500 sm:text-base">{t.subtitle}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full px-3 py-1 font-bold ${darkMode ? "bg-white/[0.05] text-slate-300" : "bg-white text-slate-600 shadow-sm"}`}>
                🗄️ {t.database}: {clinic?.database_status === "ready" ? t.ready : t.failed}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={range}
              onChange={(event) => setRange(event.target.value as RangeKey)}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold outline-none ${darkMode ? "border-white/[0.07] bg-[#181B21] text-white" : "border-slate-200 bg-white text-slate-800"}`}
              aria-label={t.range}
            >
              <option value="7">{t.last7}</option>
              <option value="30">{t.last30}</option>
              <option value="90">{t.last90}</option>
              <option value="365">{t.last365}</option>
              <option value="all">{t.all}</option>
            </select>

            <button
              onClick={() => void loadReports(true)}
              disabled={refreshing}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${darkMode ? "border-white/[0.07] bg-[#181B21] hover:bg-[#1D2128]" : "border-slate-200 bg-white hover:bg-slate-50"}`}
            >
              {refreshing ? t.refreshing : `↻ ${t.refresh}`}
            </button>

            <button
              onClick={() => setDarkMode((value) => !value)}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${darkMode ? "border-white/[0.07] bg-[#181B21] hover:bg-[#1D2128]" : "border-slate-200 bg-white hover:bg-slate-50"}`}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>

            <button
              onClick={() => setLanguage((value) => (value === "ar" ? "en" : "ar"))}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${darkMode ? "border-white/[0.07] bg-[#181B21] hover:bg-[#1D2128]" : "border-slate-200 bg-white hover:bg-slate-50"}`}
            >
              🌐 {t.language}
            </button>
          </div>
        </header>

        {message && (
          <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            {message}
          </div>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label={t.visits} value={String(metrics.visits)} hint={`${metrics.activePets} ${t.petCount}`} icon="🩺" tone="bg-blue-500/10" darkMode={darkMode} />
          <MetricCard label={t.revenue} value={`${formatMoney(metrics.revenue, language)} EGP`} hint={`${metrics.invoices} ${t.invoiceCount}`} icon="💰" tone="bg-emerald-500/10" darkMode={darkMode} />
          <MetricCard label={t.collected} value={`${formatMoney(metrics.collected, language)} EGP`} hint={`${formatMoney(metrics.outstanding, language)} EGP ${t.outstanding}`} icon="💳" tone="bg-cyan-500/10" darkMode={darkMode} />
          <MetricCard label={t.averageInvoice} value={`${formatMoney(metrics.averageInvoice, language)} EGP`} hint={`${data.clientsCount} ${language === "ar" ? "عميل" : "clients"}`} icon="🧾" tone="bg-violet-500/10" darkMode={darkMode} />
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label={t.newClients} value={String(data.clientsCount)} icon="👥" tone="bg-blue-500/10" darkMode={darkMode} />
          <MetricCard label={t.vaccinations} value={String(data.vaccinationsCount)} icon="💉" tone="bg-pink-500/10" darkMode={darkMode} />
          <MetricCard label={t.returned} value={String(metrics.returned)} icon="↩️" tone="bg-amber-500/10" darkMode={darkMode} />
          <MetricCard label={t.cancelled} value={String(metrics.cancelled)} icon="✕" tone="bg-red-500/10" darkMode={darkMode} />
        </div>

        <section className={`mb-6 rounded-3xl border p-5 ${darkMode ? "border-white/[0.06] bg-[#13161B]" : "border-slate-100 bg-white"}`}>
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black">{t.activityTrend}</h2>
              <p className="mt-1 text-xs text-slate-500">{t.revenueInfo}</p>
            </div>
            <div className="text-xs text-slate-500">{t.range}: {range === "7" ? t.last7 : range === "30" ? t.last30 : range === "90" ? t.last90 : range === "365" ? t.last365 : t.all}</div>
          </div>
          {buckets.length ? <BarChart buckets={buckets} language={language} /> : <div className="flex min-h-40 items-center justify-center text-sm text-slate-500">{t.noData}</div>}
        </section>

        <div className="mb-6 grid gap-4 xl:grid-cols-2">
          <RankingCard title={t.topReasons} rows={reasonRows} darkMode={darkMode} />
          <RankingCard title={t.diagnoses} rows={diagnosisRows} darkMode={darkMode} />
          <RankingCard title={t.species} rows={speciesRows} darkMode={darkMode} />
          <RankingCard title={t.payments} rows={paymentRows} darkMode={darkMode} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className={`overflow-hidden rounded-3xl border ${darkMode ? "border-white/[0.06] bg-[#13161B]" : "border-slate-100 bg-white"}`}>
            <div className={`border-b px-5 py-4 ${darkMode ? "border-white/[0.06]" : "border-slate-100"}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black">{t.recentVisits}</h2>
                  <p className="mt-1 text-xs text-slate-500">{metrics.visits} {t.visitCount}</p>
                </div>
                <button onClick={() => router.push("/visits/new")} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700">+ {language === "ar" ? "زيارة" : "Visit"}</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className={`border-b text-xs text-slate-500 ${darkMode ? "border-white/[0.05]" : "border-slate-100"}`}>
                    <th className="px-5 py-3 text-right">{t.status}</th>
                    <th className="px-5 py-3 text-right">{language === "ar" ? "السبب" : "Reason"}</th>
                    <th className="px-5 py-3 text-right">{language === "ar" ? "التاريخ" : "Date"}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentVisits.map((visit) => (
                    <tr key={visit.id} className={`border-b last:border-b-0 ${darkMode ? "border-white/[0.04]" : "border-slate-100"}`}>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400">{t.active}</span>
                      </td>
                      <td className="px-5 py-4 font-semibold">{visit.reason || t.noReason}</td>
                      <td className="px-5 py-4 text-slate-500">{formatDate(visit.visit_date, language)}</td>
                    </tr>
                  ))}
                  {!recentVisits.length && (
                    <tr><td colSpan={3} className="px-5 py-14 text-center text-sm text-slate-500">{t.noData}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className={`overflow-hidden rounded-3xl border ${darkMode ? "border-white/[0.06] bg-[#13161B]" : "border-slate-100 bg-white"}`}>
            <div className={`border-b px-5 py-4 ${darkMode ? "border-white/[0.06]" : "border-slate-100"}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black">{t.finance}</h2>
                  <p className="mt-1 text-xs text-slate-500">{metrics.invoices} {t.invoiceCount}</p>
                </div>
                <button onClick={() => router.push("/invoices")} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.09]">{language === "ar" ? "الفواتير" : "Invoices"}</button>
              </div>
            </div>
            <div className="space-y-3 p-5">
              <div className={`rounded-2xl border p-4 ${darkMode ? "border-white/[0.05] bg-black/10" : "border-slate-100 bg-slate-50"}`}>
                <div className="flex items-center justify-between text-sm"><span className="text-slate-500">{t.total}</span><strong>{formatMoney(metrics.revenue, language)} EGP</strong></div>
              </div>
              <div className={`rounded-2xl border p-4 ${darkMode ? "border-white/[0.05] bg-black/10" : "border-slate-100 bg-slate-50"}`}>
                <div className="flex items-center justify-between text-sm"><span className="text-slate-500">{t.paid}</span><strong className="text-emerald-400">{formatMoney(metrics.collected, language)} EGP</strong></div>
              </div>
              <div className={`rounded-2xl border p-4 ${darkMode ? "border-white/[0.05] bg-black/10" : "border-slate-100 bg-slate-50"}`}>
                <div className="flex items-center justify-between text-sm"><span className="text-slate-500">{t.unpaid}</span><strong className="text-amber-400">{formatMoney(metrics.outstanding, language)} EGP</strong></div>
              </div>
              <div className={`rounded-2xl border p-4 ${darkMode ? "border-white/[0.05] bg-black/10" : "border-slate-50 bg-slate-50"}`}>
                <div className="flex items-center justify-between text-sm"><span className="text-slate-500">{t.activePatients}</span><strong>{metrics.activePets}</strong></div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
