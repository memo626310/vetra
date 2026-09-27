"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadClients() {
    setLoading(true);

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setClients(data);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadClients();
  }, []);

  const filteredClients = clients.filter((client) => {
    const text = search.toLowerCase();

    return (
      client.name.toLowerCase().includes(text) ||
      (client.phone || "").toLowerCase().includes(text) ||
      (client.email || "").toLowerCase().includes(text)
    );
  });

  function openClient(id: string) {
    window.location.href = `/clients/${id}`;
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
              onClick={() => (window.location.href = "/")}
              className="mb-3 text-sm text-slate-500 transition hover:text-slate-900"
            >
              ← الرئيسية
            </button>

            <h1 className="text-3xl font-bold">العملاء</h1>

            <p className="mt-2 text-slate-500">
              أصحاب الحيوانات المسجلين في العيادة
            </p>
          </div>

          <button
  onClick={() => (window.location.href = "/clients/new")}
  className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg"
>
  + عميل جديد
</button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="ابحث باسم العميل أو رقم الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
          />
        </div>

        {/* Loading */}
        {loading && (
          <div className="rounded-3xl bg-white p-10 text-center text-slate-500 shadow-sm">
            جاري تحميل العملاء...
          </div>
        )}

        {/* Empty */}
        {!loading && filteredClients.length === 0 && (
          <div className="rounded-3xl bg-white p-12 text-center shadow-sm">
            <div className="mb-4 text-5xl">👤</div>

            <h2 className="text-xl font-bold">
              {search ? "مفيش نتائج" : "مفيش عملاء لسه"}
            </h2>

            <p className="mt-2 text-slate-500">
              {search
                ? "جرب البحث باسم مختلف أو رقم الهاتف."
                : "ابدأ بإضافة أول عميل للعيادة."}
            </p>
          </div>
        )}

        {/* Clients */}
        {!loading && filteredClients.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClients.map((client) => (
              <button
                key={client.id}
                onClick={() => openClient(client.id)}
                className="group rounded-3xl border border-slate-100 bg-white p-6 text-right shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl transition group-hover:scale-105">
                    👤
                  </div>

                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold">
                      {client.name}
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      عميل
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-slate-600">
                  {client.phone && (
                    <div className="flex items-center gap-2">
                      <span>📞</span>
                      <span dir="ltr">{client.phone}</span>
                    </div>
                  )}

                  {client.email && (
                    <div className="flex items-center gap-2">
                      <span>✉️</span>
                      <span className="truncate">{client.email}</span>
                    </div>
                  )}

                  {client.address && (
                    <div className="flex items-center gap-2">
                      <span>📍</span>
                      <span className="truncate">{client.address}</span>
                    </div>
                  )}
                </div>

                <div className="mt-5 border-t border-slate-100 pt-4 text-sm font-semibold text-slate-500 transition group-hover:text-slate-900">
                  فتح ملف العميل ←
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}