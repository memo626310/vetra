"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";

type VisitRow = {
  id: string;
  client_id: string;
  pet_id: string;
  visit_date: string;
  reason: string | null;
  diagnosis: string | null;
  created_at: string;
  invoice_id?: string | null;
  invoice_status?: string | null;
  client: { name: string; phone: string | null } | null;
  pet: { name: string; species: string } | null;
};

function isMissingTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "PGRST205"
    || /relation .* does not exist|table .* not found|could not find the table/i.test(error.message || "");
}

export default function ReceptionPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [dark, setDark] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isAr = language === "ar";

  const loadQueue = useCallback(async () => {
    try {
      const context = await getClinicContext();
      if (context.role !== "reception") {
        setAuthorized(false);
        setLoading(false);
        return;
      }
      setAuthorized(true);

      const db = await getClinicDb();
      const [visitsResult, invoicesResult, dismissalsResult, queueResult] = await Promise.all([
        db.from("visits")
          .select("id,client_id,pet_id,visit_date,reason,diagnosis,created_at,client:clients(name,phone),pet:pets(name,species)")
          .eq("clinic_id", context.clinic_id)
          .order("created_at", { ascending: false })
          .limit(250),
        db.from("invoices")
          .select("id,visit_id,status")
          .eq("clinic_id", context.clinic_id)
          .not("visit_id", "is", null),
        db.from("clinic_checkout_dismissals")
          .select("visit_id")
          .eq("clinic_id", context.clinic_id),
        db.from("clinic_reception_queue")
          .select("visit_id")
          .eq("clinic_id", context.clinic_id),
      ]);

      if (visitsResult.error) throw visitsResult.error;
      if (invoicesResult.error) throw invoicesResult.error;
      if (dismissalsResult.error && !isMissingTable(dismissalsResult.error)) throw dismissalsResult.error;
      if (queueResult.error) throw queueResult.error;

      const invoiceByVisit = new Map<string, { id: string; status: string }>();
      for (const invoice of invoicesResult.data || []) {
        if (invoice.visit_id) invoiceByVisit.set(String(invoice.visit_id), { id: String(invoice.id), status: String(invoice.status) });
      }
      const dismissedVisits = new Set((dismissalsResult.data || []).map((row) => String(row.visit_id)));
      const sentVisits = new Set((queueResult.data || []).map((row) => String(row.visit_id)));
      setVisits(((visitsResult.data || []) as unknown as VisitRow[])
        .filter((visit) => {
          const invoice = invoiceByVisit.get(visit.id);
          return sentVisits.has(visit.id)
            && (!invoice || ["draft", "issued", "unpaid", "partially_paid"].includes(invoice.status))
            && !dismissedVisits.has(visit.id);
        })
        .map((visit) => ({
          ...visit,
          invoice_id: invoiceByVisit.get(visit.id)?.id || null,
          invoice_status: invoiceByVisit.get(visit.id)?.status || null,
        })));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : (isAr ? "تعذر تحميل الزيارات." : "Could not load visits."));
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedLanguage = localStorage.getItem("vetra-language");
      setLanguage(savedLanguage === "en" ? "en" : "ar");
      setDark(localStorage.getItem("vetra-theme") !== "light");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadQueue(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadQueue();
    }, 10000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [loadQueue]);

  const filteredVisits = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return visits;
    return visits.filter((visit) => [
      visit.client?.name,
      visit.client?.phone,
      visit.pet?.name,
      visit.reason,
      visit.diagnosis,
    ].some((value) => String(value || "").toLocaleLowerCase().includes(query)));
  }, [search, visits]);

  const surface = dark ? "border-white/10 bg-[#181B21]" : "border-slate-200 bg-white";
  const input = dark ? "border-white/10 bg-[#111419] text-white placeholder:text-slate-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400";

  if (authorized === false) {
    return (
      <main dir={isAr ? "rtl" : "ltr"} className={`flex min-h-screen items-center justify-center px-5 ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-900"}`}>
        <section className={`w-full max-w-md border p-6 text-center ${surface}`}>
          <h1 className="text-xl font-bold">{isAr ? "هذه الصفحة للاستقبال فقط" : "Reception access only"}</h1>
          <button type="button" onClick={() => router.replace("/dashboard")} className="mt-5 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-bold text-slate-950">
            {isAr ? "العودة للوحة الرئيسية" : "Back to dashboard"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main dir={isAr ? "rtl" : "ltr"} className={`min-h-screen ${dark ? "bg-[#0F1115] text-slate-100" : "bg-[#F7F8FA] text-slate-900"}`}>
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <header className={`mb-5 flex flex-wrap items-center justify-between gap-4 border p-4 sm:p-5 ${surface}`}>
          <div>
            <p className="text-xs font-bold text-teal-500">VETRA / RECEPTION</p>
            <h1 className="mt-1 text-2xl font-black">{isAr ? "استقبال وتحصيل" : "Reception & checkout"}</h1>
            <p className="mt-1 text-sm text-slate-500">{isAr ? "الزيارات المحفوظة التي تحتاج إلى فاتورة وتحصيل" : "Saved visits waiting for an invoice and checkout"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => router.push("/dashboard")} className="min-h-10 rounded-lg bg-teal-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-teal-400">
              {isAr ? "الداشبورد" : "Dashboard"}
            </button>
            <button type="button" onClick={() => void loadQueue()} className={`min-h-10 rounded-lg border px-3 text-sm font-semibold ${input}`}>
              {isAr ? "تحديث القائمة" : "Refresh"}
            </button>
          </div>
        </header>

        <section className={`mb-4 grid grid-cols-2 gap-3 border p-4 sm:grid-cols-3 ${surface}`}>
          <div>
            <p className="text-xs text-slate-500">{isAr ? "بانتظار التحصيل" : "Awaiting checkout"}</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{visits.length}</p>
          </div>
          <label className="col-span-2 sm:col-span-2">
            <span className="sr-only">{isAr ? "بحث في الزيارات" : "Search visits"}</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isAr ? "ابحث باسم العميل أو الحيوان أو الهاتف" : "Search client, pet, or phone"} className={`min-h-11 w-full rounded-lg border px-3 text-sm ${input}`} />
          </label>
        </section>

        {error && <p role="alert" className="mb-4 border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{error}</p>}

        <section className={`overflow-hidden border ${surface}`}>
          <div className="flex items-center justify-between border-b border-slate-200/10 px-4 py-3">
            <h2 className="text-sm font-bold">{isAr ? "فواتير الزيارات" : "Visit invoices"}</h2>
            <span className="text-xs text-slate-500">{filteredVisits.length}</span>
          </div>
          {loading ? (
            <p className="p-10 text-center text-sm text-slate-500">{isAr ? "جارٍ تحميل القائمة..." : "Loading queue..."}</p>
          ) : filteredVisits.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-500">{isAr ? "لا توجد زيارات جديدة للتحصيل." : "No visits are waiting for checkout."}</p>
          ) : (
            <ul className="divide-y divide-slate-200/10">
              {filteredVisits.map((visit) => (
                <li key={visit.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="font-bold">{visit.client?.name || (isAr ? "عميل" : "Client")}</h3>
                      <span className="text-slate-500">·</span>
                      <span className="font-semibold">{visit.pet?.name || (isAr ? "حيوان" : "Pet")}</span>
                      {visit.client?.phone && <span className="text-sm text-slate-500">{visit.client.phone}</span>}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {[visit.reason, visit.diagnosis].filter(Boolean).join(" · ") || (isAr ? "زيارة مكتملة" : "Visit completed")}
                      {" · "}
                      {new Date(visit.visit_date || visit.created_at).toLocaleString(isAr ? "ar-EG" : "en-EG", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                  <button type="button" onClick={() => router.push(visit.invoice_id ? `/invoices/${encodeURIComponent(visit.invoice_id)}` : `/invoices/new?visit=${encodeURIComponent(visit.id)}&client=${encodeURIComponent(visit.client_id)}&pet=${encodeURIComponent(visit.pet_id)}`)} className="min-h-11 shrink-0 rounded-lg bg-teal-500 px-4 text-sm font-bold text-slate-950 hover:bg-teal-400">
                    {visit.invoice_id ? (isAr ? "فتح الفاتورة والتحصيل" : "Open invoice & collect") : (isAr ? "إنشاء فاتورة وتحصيل" : "Create invoice & collect")}
                  </button>
                  {visit.invoice_id && ["issued", "unpaid"].includes(visit.invoice_status || "") && <button type="button" onClick={() => router.push(`/invoices/new?draft=${encodeURIComponent(visit.invoice_id as string)}`)} className="min-h-11 shrink-0 rounded-lg border border-cyan-400/30 px-4 text-sm font-bold text-cyan-600 dark:text-cyan-300">
                    {isAr ? "تعديل الفاتورة" : "Edit invoice"}
                  </button>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
