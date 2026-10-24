"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getClinicDb } from "@/lib/clinic-db";
import { vetraCore } from "@/lib/vetra-core";
import { clearClinicCache, readClinicCache, writeClinicCache } from "@/lib/clinic-cache";
import ClinicCacheRefreshButton from "@/components/ClinicCacheRefreshButton";

type Client = {
  id: string;
  client_code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
};

type PetSummary = { id: string; client_id: string; name: string };
type VisitSummary = { client_id: string; visit_date: string };
type InvoiceSummary = { client_id: string; status: string; total: number | null; paid_amount: number | null };
type AppointmentSummary = { client_id: string; appointment_date: string; start_time: string; status: string };
type ClientSummary = {
  pets: PetSummary[];
  lastVisit: string | null;
  dueBalance: number;
  visits: number;
  upcomingVisit: AppointmentSummary | null;
};

type ClientsCache = {
  clients: Client[];
  summaries: Record<string, ClientSummary>;
};

type ClinicContext = {
  clinic_id: string;
  clinic_name: string;
  clinic_status: string;
  doctor_id: string;
  doctor_name: string;
  role: string;
  member_status: string;
  database_provider: string | null;
  project_ref: string | null;
  database_region: string | null;
  database_status: string | null;
  subscription_status: string | null;
  plan_code: string | null;
  plan_name: string | null;
  trial_ends_at: string | null;
};

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [summaries, setSummaries] = useState<Record<string, ClientSummary>>({});
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [clinicLoading, setClinicLoading] = useState(true);

  const [clinicContext, setClinicContext] =
    useState<ClinicContext | null>(null);

  const [errorMessage, setErrorMessage] = useState("");
  const [refreshingCache, setRefreshingCache] = useState(false);

  const loadClinicContext = useCallback(async () => {
    setClinicLoading(true);
    setErrorMessage("");

    const {
      data: { session },
      error: sessionError,
    } = await vetraCore.auth.getSession();

    if (sessionError || !session) {
      setErrorMessage("جلسة VETRA Core غير صالحة.");
      setClinicLoading(false);
      setLoading(false);
      return null;
    }

    const { data, error } = await vetraCore.rpc(
      "get_my_clinic_context"
    );

    if (error) {
      console.error(
        "VETRA CORE CONTEXT ERROR:",
        error
      );

      setErrorMessage(
        "تعذر تحميل بيانات العيادة من VETRA Core."
      );

      setClinicContext(null);
      setClinicLoading(false);
      setLoading(false);

      return null;
    }

    const context = Array.isArray(data)
      ? data[0] ?? null
      : null;

    if (!context) {
      setErrorMessage(
        "لا توجد عيادة نشطة مرتبطة بهذا الحساب."
      );

      setClinicContext(null);
      setClinicLoading(false);
      setLoading(false);

      return null;
    }

    setClinicContext(context as ClinicContext);
    setClinicLoading(false);

    return context as ClinicContext;
  }, []);

  const loadClients = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setErrorMessage("");

    const context =
      await loadClinicContext();

    if (!context) {
      return;
    }

    const cached = forceRefresh ? null : readClinicCache<ClientsCache>(context.clinic_id, "clients");
    if (cached) {
      setClients(cached.clients);
      setSummaries(cached.summaries);
    }

    const db = await getClinicDb();

    const { data, error } = await db
      .from("clients")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "CLIENTS LOAD ERROR:",
        error
      );

      setErrorMessage(
        "تعذر تحميل العملاء: " +
          error.message
      );

      if (!cached) setClients([]);
      setLoading(false);

      return;
    }

    const loadedClients = (data || []) as Client[];
    setClients(loadedClients);

    const clientIds = loadedClients.map((client) => client.id);
    if (clientIds.length) {
      const [petsResult, visitsResult, invoicesResult, appointmentsResult] = await Promise.all([
        db.from("pets").select("id,client_id,name").in("client_id", clientIds).order("created_at", { ascending: false }),
        db.from("visits").select("client_id,visit_date").in("client_id", clientIds).order("visit_date", { ascending: false }),
        db.from("invoices").select("client_id,status,total,paid_amount").in("client_id", clientIds),
        db.from("appointments").select("client_id,appointment_date,start_time,status").in("client_id", clientIds)
          .in("status", ["pending", "confirmed", "arrived", "in_progress"]),
      ]);

      const pets = (petsResult.data || []) as PetSummary[];
      const visits = (visitsResult.data || []) as VisitSummary[];
      const invoices = (invoicesResult.data || []) as InvoiceSummary[];
      const appointments = (appointmentsResult.data || []) as AppointmentSummary[];
      const now = new Date();
      const nextAppointments = appointments.filter((appointment) =>
        new Date(`${appointment.appointment_date}T${appointment.start_time || "00:00"}`).getTime() >= now.getTime()
      );

      const nextSummaries = Object.fromEntries(clientIds.map((clientId) => {
        const clientVisits = visits.filter((visit) => visit.client_id === clientId);
        const clientAppointments = nextAppointments
          .filter((appointment) => appointment.client_id === clientId)
          .sort((a, b) => `${a.appointment_date}T${a.start_time}`.localeCompare(`${b.appointment_date}T${b.start_time}`));
        const dueBalance = invoices
          .filter((invoice) => invoice.client_id === clientId && !["draft", "cancelled", "returned"].includes(invoice.status))
          .reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total || 0) - Number(invoice.paid_amount || 0)), 0);

        return [clientId, {
          pets: pets.filter((pet) => pet.client_id === clientId),
          lastVisit: clientVisits[0]?.visit_date || null,
          dueBalance,
          visits: clientVisits.length,
          upcomingVisit: clientAppointments[0] || null,
        } satisfies ClientSummary];
      }));
      setSummaries(nextSummaries);
      writeClinicCache(context.clinic_id, "clients", { clients: loadedClients, summaries: nextSummaries } satisfies ClientsCache);
    } else {
      setSummaries({});
      writeClinicCache(context.clinic_id, "clients", { clients: loadedClients, summaries: {} } satisfies ClientsCache);
    }
    setLoading(false);
  }, [loadClinicContext]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadClients();
  }, [loadClients]);

  const refreshCache = async () => {
    if (!clinicContext?.clinic_id) return;
    setRefreshingCache(true);
    clearClinicCache(clinicContext.clinic_id);
    try {
      await loadClients(true);
    } finally {
      setRefreshingCache(false);
    }
  };

  const filteredClients = clients.filter(
    (client) => {
      const text =
        search.trim().toLowerCase();

      if (!text) {
        return true;
      }

      return (
        client.client_code
          .toLowerCase()
          .includes(text) ||
        client.name
          .toLowerCase()
          .includes(text) ||
        (client.phone || "")
          .toLowerCase()
          .includes(text) ||
        (client.email || "")
          .toLowerCase()
          .includes(text)
      );
    }
  );

  function openClient(id: string) {
    router.push(`/clients/${id}`);
  }

  function formatDate(value: string | null) {
    if (!value) return "—";
    return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatUpcoming(appointment: AppointmentSummary | null) {
    if (!appointment) return "—";
    const date = formatDate(appointment.appointment_date);
    const time = appointment.start_time?.slice(0, 5);
    return time ? `${date} · ${time}` : date;
  }

  const formatMoney = (amount: number) => new Intl.NumberFormat("en-EG", {
    style: "currency", currency: "EGP", maximumFractionDigits: 0,
  }).format(amount);

  if (
    loading ||
    clinicLoading
  ) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#f7f9fc] px-5 py-8 text-slate-900"
      >
        <div className="mx-auto max-w-6xl">
          <div className="rounded-3xl bg-white p-12 text-center shadow-sm">
            <div className="mb-4 text-5xl">
              🐾
            </div>

            <p className="text-slate-500">
              جاري تحميل بيانات العيادة والعملاء...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#f7f9fc] px-5 py-8 text-slate-900"
      >
        <div className="mx-auto max-w-6xl">
          <button
            onClick={() => router.push("/dashboard")}
            className="mb-6 text-sm text-slate-500 transition hover:text-slate-900"
          >
            ← الرئيسية
          </button>

          <div className="rounded-3xl border border-red-100 bg-white p-12 text-center shadow-sm">
            <div className="mb-4 text-5xl">
              ⚠️
            </div>

            <h1 className="text-2xl font-bold">
              تعذر فتح صفحة العملاء
            </h1>

            <p className="mx-auto mt-3 max-w-xl text-slate-500">
              {errorMessage}
            </p>

            <button
              onClick={() =>
                window.location.reload()
              }
              className="mt-6 rounded-2xl bg-slate-900 px-6 py-3 font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#f7f9fc] px-5 py-8 text-slate-900"
    >
      <div className="mx-auto max-w-6xl">

        {/* Header */}

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button
              onClick={() => router.push("/dashboard")}
              className="mb-3 text-sm text-slate-500 transition hover:text-slate-900"
            >
              ← الرئيسية
            </button>

            <h1 className="text-3xl font-bold">
              العملاء
            </h1>

            <p className="mt-2 text-slate-500">
              أصحاب الحيوانات المسجلين في العيادة
            </p>

            {/* Active Clinic */}

            {clinicContext && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm">
                  🏥 {clinicContext.clinic_name}
                </span>

                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                  👤 {clinicContext.doctor_name}
                </span>

                <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                  🗄️ {clinicContext.database_status}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => router.push("/clients/new")}
            className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            + عميل جديد
          </button>
          <ClinicCacheRefreshButton ar darkMode={false} loading={refreshingCache} onRefresh={() => void refreshCache()} />
        </div>

        {/* Search */}

        <div className="mb-6">
          <input
            type="text"
            placeholder="ابحث باسم العميل أو رقم الهاتف أو Client ID..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
          />
        </div>

        {/* Empty */}

        {filteredClients.length === 0 && (
          <div className="rounded-3xl bg-white p-12 text-center shadow-sm">
            <div className="mb-4 text-5xl">
              👤
            </div>

            <h2 className="text-xl font-bold">
              {search
                ? "مفيش نتائج"
                : "مفيش عملاء لسه"}
            </h2>

            <p className="mt-2 text-slate-500">
              {search
                ? "جرب البحث باسم مختلف أو رقم الهاتف أو Client ID."
                : "ابدأ بإضافة أول عميل للعيادة."}
            </p>
          </div>
        )}

        {/* Clients */}

        {filteredClients.length > 0 && (
          <div className="space-y-3">
            {filteredClients.map(
              (client) => {
                const summary = summaries[client.id] || { pets: [], lastVisit: null, dueBalance: 0, visits: 0, upcomingVisit: null };
                const metrics: [string, string][] = [
                  ["Last visit", formatDate(summary.lastVisit)],
                  ["Due balance", formatMoney(summary.dueBalance)],
                  ["Visits", String(summary.visits)],
                  ["Upcoming visit", formatUpcoming(summary.upcomingVisit)],
                ];

                return (
                <button
                  key={client.id}
                  onClick={() => openClient(client.id)}
                  className="group w-full rounded-xl border border-slate-200 bg-white p-4 text-right shadow-sm transition hover:border-cyan-300 hover:shadow-md sm:p-5"
                >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-bold text-slate-900">{client.name}</h2>
                          <p dir="ltr" className="mt-1 text-start text-sm text-slate-600">{client.phone || "—"}</p>
                        </div>
                        <div className="text-start">
                          <span className="block text-[11px] font-medium text-slate-500">Client ID</span>
                          <span dir="ltr" className="text-sm font-bold text-slate-700">#{client.client_code}</span>
                        </div>
                        <p dir="ltr" className="min-w-0 basis-full truncate text-start text-sm text-slate-500">{client.email || "—"}</p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                        {summary.pets.length ? <>
                          {summary.pets.slice(0, 3).map((pet, index) => <span key={pet.id} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">PET {index + 1} · {pet.name}</span>)}
                          {summary.pets.length > 3 && <span className="rounded-md bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">+{summary.pets.length - 3} ETC</span>}
                        </> : <span className="text-xs text-slate-400">No pets</span>}
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-4">
                        {metrics.map(([label, value]) => <div key={label} className="min-w-0 rounded-lg bg-slate-50 px-3 py-2 text-start">
                          <span className="block text-[10px] font-semibold uppercase text-slate-500">{label}</span>
                          <span className={`mt-1 block truncate text-sm font-bold ${label === "Due balance" && summary.dueBalance > 0 ? "text-rose-700" : "text-slate-800"}`}>{value}</span>
                        </div>)}
                      </div>
                </button>
                );
              }
            )}
          </div>
        )}
      </div>
    </main>
  );
}
