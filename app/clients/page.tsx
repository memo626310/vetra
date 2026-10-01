"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { vetraCore } from "@/lib/vetra-core";

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
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [clinicLoading, setClinicLoading] = useState(true);

  const [clinicContext, setClinicContext] =
    useState<ClinicContext | null>(null);

  const [errorMessage, setErrorMessage] =
    useState("");

  async function loadClinicContext() {
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
      return false;
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

      return false;
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

      return false;
    }

    setClinicContext(context as ClinicContext);
    setClinicLoading(false);

    return true;
  }

  async function loadClients() {
    setLoading(true);
    setErrorMessage("");

    const contextReady =
      await loadClinicContext();

    if (!contextReady) {
      return;
    }

    const { data, error } = await supabase
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

      setClients([]);
      setLoading(false);

      return;
    }

    setClients((data || []) as Client[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadClients();
  }, []);

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
    window.location.href =
      `/clients/${id}`;
  }

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
            onClick={() =>
              (window.location.href =
                "/dashboard")
            }
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
              onClick={() =>
                (window.location.href =
                  "/dashboard")
              }
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
            onClick={() =>
              (window.location.href =
                "/clients/new")
            }
            className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            + عميل جديد
          </button>
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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClients.map(
              (client) => (
                <button
                  key={client.id}
                  onClick={() =>
                    openClient(client.id)
                  }
                  className="group rounded-3xl border border-slate-100 bg-white p-6 text-right shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="mb-5 flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl transition group-hover:scale-105">
                      👤
                    </div>

                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-lg font-bold">
                        {client.name}
                      </h2>

                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-400">
                          Client ID
                        </span>

                        <span
                          dir="ltr"
                          className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-bold tracking-wider text-slate-700"
                        >
                          {client.client_code}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-slate-600">
                    {client.phone && (
                      <div className="flex items-center gap-2">
                        <span>📞</span>
                        <span dir="ltr">
                          {client.phone}
                        </span>
                      </div>
                    )}

                    {client.email && (
                      <div className="flex items-center gap-2">
                        <span>✉️</span>
                        <span className="truncate">
                          {client.email}
                        </span>
                      </div>
                    )}

                    {client.address && (
                      <div className="flex items-center gap-2">
                        <span>📍</span>
                        <span className="truncate">
                          {client.address}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 border-t border-slate-100 pt-4 text-sm font-semibold text-slate-500 transition group-hover:text-slate-900">
                    فتح ملف العميل ←
                  </div>
                </button>
              )
            )}
          </div>
        )}
      </div>
    </main>
  );
}