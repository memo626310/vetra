"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";
import { clearClinicCache, readClinicCache, writeClinicCache } from "@/lib/clinic-cache";
import ClinicCacheRefreshButton from "@/components/ClinicCacheRefreshButton";

type Visit = {
  id: string;
  client_id: string | null;
  pet_id: string | null;
  visit_date: string;
  reason: string | null;
  examination: string | null;
  diagnosis: string | null;
  treatment: string | null;
  weight: number | null;
  temperature: number | null;
  heart_rate: number | null;
  respiratory_rate: number | null;
  notes: string | null;
};
type Pet = { id: string; name: string; client_id: string | null };
type Client = { id: string; name: string; client_code: string | null; phone: string | null };
type Vaccination = { id: string; visit_id: string; vaccine_name: string | null; administered_at: string | null; next_dose_at: string | null };
type VisitDraft = {
  visit_date: string; reason: string; examination: string; diagnosis: string; treatment: string;
  weight: string; temperature: string; heart_rate: string; respiratory_rate: string; notes: string;
};
const COLUMNS = "id,client_id,pet_id,visit_date,reason,examination,diagnosis,treatment,weight,temperature,heart_rate,respiratory_rate,notes";

type VisitsCache = {
  visits: Visit[];
  petsById: Record<string, Pet>;
  clientsById: Record<string, Client>;
  vaccinationsByVisit: Record<string, Vaccination[]>;
};

function localDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}
function textOrNull(value: string) {
  const result = value.trim();
  return result || null;
}
function numberOrNull(value: string, label: string): number | null {
  if (!value.trim()) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(label + ": اكتب رقمًا صحيحًا أو اترك الحقل فارغًا.");
  return result;
}
function makeDraft(visit: Visit): VisitDraft {
  return {
    visit_date: localDateTime(visit.visit_date), reason: visit.reason || "", examination: visit.examination || "",
    diagnosis: visit.diagnosis || "", treatment: visit.treatment || "", weight: visit.weight == null ? "" : String(visit.weight),
    temperature: visit.temperature == null ? "" : String(visit.temperature), heart_rate: visit.heart_rate == null ? "" : String(visit.heart_rate),
    respiratory_rate: visit.respiratory_rate == null ? "" : String(visit.respiratory_rate), notes: visit.notes || "",
  };
}
function visitHandler(notes: string | null) {
  const line = notes?.split(/\r?\n/).find((entry) => /performing doctor|الطبيب المعالج/i.test(entry));
  return line?.split(":").slice(1).join(":").trim() || "—";
}

export default function VisitHistoryDashboardPage() {
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [petsById, setPetsById] = useState<Record<string, Pet>>({});
  const [clientsById, setClientsById] = useState<Record<string, Client>>({});
  const [vaccinationsByVisit, setVaccinationsByVisit] = useState<Record<string, Vaccination[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [deleting, setDeleting] = useState<Visit | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Visit | null>(null);
  const [draft, setDraft] = useState<VisitDraft | null>(null);
  const [clinicId, setClinicId] = useState("");
  const [refreshingCache, setRefreshingCache] = useState(false);
  const ar = language === "ar";

  const loadVisits = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError("");
    try {
      const context = await getClinicContext();
      setClinicId(context.clinic_id);
      const cached = forceRefresh ? null : readClinicCache<VisitsCache>(context.clinic_id, "visit-history");
      if (cached) {
        setVisits(cached.visits);
        setPetsById(cached.petsById);
        setClientsById(cached.clientsById);
        setVaccinationsByVisit(cached.vaccinationsByVisit);
      }
      const db = await getClinicDb();
      const { data, error: visitsError } = await db.from("visits").select(COLUMNS).order("visit_date", { ascending: false }).limit(500);
      if (visitsError) throw visitsError;
      const loaded = (data || []) as Visit[];
      const visitIds = loaded.map((visit) => visit.id);
      let vaccinations: Vaccination[] = [];
      if (visitIds.length) {
        const vaccinationResult = await db.from("vaccinations")
          .select("id,visit_id,vaccine_name,administered_at,next_dose_at")
          .in("visit_id", visitIds);
        if (vaccinationResult.error) {
          console.error("DASHBOARD VISIT VACCINATIONS LOAD ERROR:", vaccinationResult.error);
        } else {
          vaccinations = (vaccinationResult.data || []) as Vaccination[];
        }
      }
      const petIds = [...new Set(loaded.map((v) => v.pet_id).filter((id): id is string => Boolean(id)))];
      let pets: Pet[] = [];
      if (petIds.length) {
        const result = await db.from("pets").select("id,name,client_id").in("id", petIds);
        if (result.error) throw result.error;
        pets = (result.data || []) as Pet[];
      }
      const clientIds = [...new Set([...loaded.map((v) => v.client_id), ...pets.map((p) => p.client_id)].filter((id): id is string => Boolean(id)))];
      let clients: Client[] = [];
      if (clientIds.length) {
        const result = await db.from("clients").select("id,name,client_code,phone").in("id", clientIds);
        if (result.error) throw result.error;
        clients = (result.data || []) as Client[];
      }
      const nextVaccinations = vaccinations.reduce<Record<string, Vaccination[]>>((grouped, vaccination) => {
        (grouped[vaccination.visit_id] ||= []).push(vaccination);
        return grouped;
      }, {});
      const nextPetsById = Object.fromEntries(pets.map((item) => [item.id, item]));
      const nextClientsById = Object.fromEntries(clients.map((item) => [item.id, item]));
      setVisits(loaded);
      setVaccinationsByVisit(nextVaccinations);
      setPetsById(nextPetsById);
      setClientsById(nextClientsById);
      writeClinicCache(context.clinic_id, "visit-history", { visits: loaded, petsById: nextPetsById, clientsById: nextClientsById, vaccinationsByVisit: nextVaccinations } satisfies VisitsCache);
    } catch (err) {
      console.error("DASHBOARD VISITS LOAD ERROR:", err);
      setError(err instanceof Error ? err.message : "تعذر تحميل سجل الزيارات.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function refreshCache() {
    if (!clinicId) return;
    setRefreshingCache(true);
    clearClinicCache(clinicId);
    try {
      await loadVisits(true);
    } finally {
      setRefreshingCache(false);
    }
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void loadVisits(); });
    return () => window.cancelAnimationFrame(frame);
  }, [loadVisits]);

  const filteredVisits = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return visits.filter((visit) => {
      const pet = visit.pet_id ? petsById[visit.pet_id] : undefined;
      const ownerId = visit.client_id || pet?.client_id || "";
      const owner = ownerId ? clientsById[ownerId] : undefined;
      const matchesSearch = !q || [visit.reason, visit.diagnosis, visit.examination, visit.treatment, visit.notes, pet?.name, owner?.name, owner?.client_code, owner?.phone]
        .some((value) => (value || "").toLocaleLowerCase().includes(q));
      const matchesDate = !dateFilter || visit.visit_date.slice(0, 10) === dateFilter;
      return matchesSearch && matchesDate;
    });
  }, [query, dateFilter, visits, petsById, clientsById]);
  const pageCount = Math.max(1, Math.ceil(filteredVisits.length / pageSize));
  const visibleVisits = filteredVisits.slice(page * pageSize, (page + 1) * pageSize);

  function startEdit(visit: Visit) {
    setError(""); setMessage(""); setEditing(visit); setDraft(makeDraft(visit));
  }
  function closeEdit() {
    if (saving) return;
    setEditing(null); setDraft(null);
  }
  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !draft) return;
    setSaving(true); setError(""); setMessage("");
    try {
      if (!draft.visit_date || Number.isNaN(new Date(draft.visit_date).getTime())) throw new Error(ar ? "حدد تاريخ ووقت الزيارة." : "Choose a valid visit date and time.");
      const payload = {
        visit_date: new Date(draft.visit_date).toISOString(),
        reason: textOrNull(draft.reason), examination: textOrNull(draft.examination),
        diagnosis: textOrNull(draft.diagnosis), treatment: textOrNull(draft.treatment),
        weight: numberOrNull(draft.weight, ar ? "الوزن" : "Weight"),
        temperature: numberOrNull(draft.temperature, ar ? "الحرارة" : "Temperature"),
        heart_rate: numberOrNull(draft.heart_rate, ar ? "النبض" : "Heart rate"),
        respiratory_rate: numberOrNull(draft.respiratory_rate, ar ? "التنفس" : "Respiratory rate"),
        notes: textOrNull(draft.notes),
      };
      const db = await getClinicDb();
      const { data, error: updateError } = await db.from("visits").update(payload).eq("id", editing.id).select(COLUMNS).single();
      if (updateError) throw updateError;
      if (!data) throw new Error(ar ? "لم يتم تأكيد حفظ الزيارة." : "The saved visit was not returned.");
      setVisits((current) => current.map((visit) => visit.id === editing.id ? data as Visit : visit));
      setEditing(null); setDraft(null);
      setMessage(ar ? "تم حفظ تعديلات الزيارة بنجاح." : "Visit changes saved.");
      if (clinicId) clearClinicCache(clinicId);
    } catch (err) {
      console.error("DASHBOARD VISIT EDIT ERROR:", err);
      setError(err instanceof Error ? err.message : (ar ? "تعذر حفظ تعديلات الزيارة." : "Could not save visit changes."));
    } finally {
      setSaving(false);
    }
  }

  async function deleteVisit() {
    if (!deleting) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const db = await getClinicDb();
      const { data: invoices, error: invoiceLookupError } = await db.from("invoices").select("id").eq("visit_id", deleting.id);
      if (invoiceLookupError) throw invoiceLookupError;
      const invoiceIds = (invoices || []).map((row) => String(row.id));

      const { error: detachInvoiceError } = await db.from("invoices").update({ visit_id: null }).eq("visit_id", deleting.id);
      if (detachInvoiceError) throw detachInvoiceError;

      const relatedDeletes = await Promise.all([
        db.from("visit_medications").delete().eq("visit_id", deleting.id),
        db.from("vaccinations").delete().eq("visit_id", deleting.id),
        db.from("pet_medical_records").delete().eq("visit_id", deleting.id),
      ]);
      const relatedError = relatedDeletes.find((result) => result.error)?.error;
      if (relatedError) throw relatedError;

      const { data: files, error: filesError } = await db.from("visit_attachments").select("storage_path").eq("visit_id", deleting.id);
      if (filesError) throw filesError;
      const { error: attachmentRowsError } = await db.from("visit_attachments").delete().eq("visit_id", deleting.id);
      if (attachmentRowsError) throw attachmentRowsError;
      const storagePaths = (files || []).map((file) => String(file.storage_path)).filter(Boolean);
      if (storagePaths.length) {
        const { error: storageError } = await db.storage.from("visit-attachments").remove(storagePaths);
        if (storageError) throw storageError;
      }

      const { error: deleteError } = await db.from("visits").delete().eq("id", deleting.id);
      if (deleteError) throw deleteError;
      setVisits((current) => current.filter((visit) => visit.id !== deleting.id));
      setDeleting(null); setExpandedId(null);
      setMessage(ar ? "تم حذف الزيارة. الفواتير محفوظة كسجلات مالية منفصلة." : "Visit deleted. Bills remain as separate financial records.");
      if (clinicId) clearClinicCache(clinicId);
    } catch (err) {
      console.error("DASHBOARD VISIT DELETE ERROR:", err);
      setError(err instanceof Error ? err.message : (ar ? "تعذر حذف الزيارة." : "Could not delete visit."));
    } finally {
      setSaving(false);
    }
  }

  const text = {
    title: ar ? "سجل الزيارات السابقة" : "Previous Visit History",
    subtitle: ar ? "سجل الزيارات الطبية" : "Clinical visit history",
    back: ar ? "العودة للداشبورد" : "Back to dashboard",
    search: ar ? "ابحث باسم العميل أو الحيوان أو التشخيص..." : "Search client, pet, or diagnosis...",
    count: ar ? "زيارة" : "visits", date: ar ? "التاريخ والوقت" : "Date and time",
    client: ar ? "العميل" : "Client", pet: ar ? "الحيوان" : "Pet", reason: ar ? "سبب الزيارة" : "Reason",
    exam: ar ? "الفحص" : "Examination", diagnosis: ar ? "التشخيص" : "Diagnosis", treatment: ar ? "العلاج" : "Treatment",
    weight: ar ? "الوزن (كجم)" : "Weight (kg)", temp: ar ? "الحرارة (°C)" : "Temperature (°C)",
    heart: ar ? "نبض القلب" : "Heart rate", respiration: ar ? "معدل التنفس" : "Respiratory rate", notes: ar ? "ملاحظات" : "Notes",
    edit: ar ? "تعديل الزيارة" : "Edit visit", save: ar ? "حفظ التعديلات" : "Save changes",
    cancel: ar ? "إلغاء" : "Cancel", loading: ar ? "جاري تحميل سجل الزيارات..." : "Loading visits...",
    noResults: ar ? "لا توجد زيارات مطابقة للبحث." : "No matching visits found.",
    vaccines: ar ? "التطعيمات" : "Vaccinations",
    unavailable: ar ? "بيانات الربط غير متاحة" : "Linked record unavailable",
    handler: ar ? "الطبيب" : "Handler", status: ar ? "الحالة" : "Status",
    completed: ar ? "مكتملة" : "Completed", delete: ar ? "حذف الزيارة" : "Delete visit",
    deleteConfirm: ar ? "سيتم حذف تفاصيل الزيارة الطبية ومرفقاتها. ستبقى الفاتورة وسجلها المالي محفوظين دون ربط بالزيارة. لا يمكن التراجع عن الحذف." : "This removes the clinical visit details and attachments. Any bill and its financial history will be retained but unlinked. This cannot be undone.",
    dateFilter: ar ? "تصفية حسب التاريخ" : "Filter by date", rows: ar ? "صفوف لكل صفحة" : "Rows per page",
    previous: ar ? "السابق" : "Previous", next: ar ? "التالي" : "Next", details: ar ? "التفاصيل" : "Details",
    limit: ar ? "يعرض السجل آخر 500 زيارة. استخدم البحث لتصفية النتائج." : "Showing the latest 500 visits. Use search to filter results.",
  };
  const inputClass = "w-full min-w-0 rounded-lg border border-[#444b4d] bg-[#303536] px-3 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15";
  const labelClass = "mb-1.5 block text-sm font-semibold text-slate-300";

  return (
    <main dir={ar ? "rtl" : "ltr"} className="min-h-screen overflow-x-hidden bg-[#181c1d] px-3 py-4 text-slate-100 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-7xl min-w-0">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0"><h1 className="text-2xl font-black sm:text-3xl">{text.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{text.subtitle}</p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setLanguage(ar ? "en" : "ar")} className="rounded-lg border border-[#414849] bg-[#292e2f] px-3 py-2 text-sm font-bold">{ar ? "English" : "العربية"}</button>
            <ClinicCacheRefreshButton ar={ar} darkMode loading={refreshingCache} onRefresh={() => void refreshCache()} />
            <Link href="/visits/new" className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950">{ar ? "بدء زيارة" : "Start visit"}</Link>
            <Link href="/dashboard" className="rounded-xl bg-[#0B2540] px-4 py-2.5 text-sm font-bold text-white">{text.back}</Link>
          </div>
        </header>
        {error && <div role="alert" className="mb-4 break-words rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm font-semibold text-rose-200">{error}</div>}
        {message && <div role="status" className="mb-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm font-semibold text-emerald-200">{message}</div>}
        <section className="mb-4 rounded-xl border border-[#343a3b] bg-[#2b3031] p-3 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row">
            <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder={text.search} className={inputClass} aria-label={text.search} />
            <input type="date" value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setPage(0); }} aria-label={text.dateFilter} className={`${inputClass} lg:max-w-56`} />
            <button type="button" onClick={() => { setDateFilter(""); setPage(0); }} className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">{ar ? "مسح التاريخ" : "Clear date"}</button>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm font-semibold text-slate-400"><span>{filteredVisits.length} {text.count}</span><span>{ar ? "كل السجلات" : "All records"}</span></div>
        </section>
        <section className="overflow-hidden rounded-xl border border-[#343a3b] bg-[#2b3031] shadow-sm">
          {loading ? <div className="py-12 text-center text-sm font-semibold text-slate-400">{text.loading}</div> : filteredVisits.length === 0 ? <div className="py-12 text-center text-sm text-slate-400">{text.noResults}</div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-start">
                <thead className="border-b border-[#3c4344] bg-[#303637] text-xs uppercase tracking-wider text-slate-400"><tr>
                  {[text.date, ar ? "الوقت" : "Time", text.pet, text.client, text.handler, text.status, ""].map((heading, index) => <th key={index} className="px-4 py-4 font-bold">{heading}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-[#3c4344]">
              {visibleVisits.map((visit) => {
                const pet = visit.pet_id ? petsById[visit.pet_id] : undefined;
                const ownerId = visit.client_id || pet?.client_id || "";
                const owner = ownerId ? clientsById[ownerId] : undefined;
                return (
                  <Fragment key={visit.id}>
                    <tr onClick={() => setExpandedId(expandedId === visit.id ? null : visit.id)} className="cursor-pointer transition hover:bg-white/[0.03]">
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold">{new Date(visit.visit_date).toLocaleDateString(ar ? "ar-EG" : "en-GB", { day: "2-digit", month: "short" })}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{new Date(visit.visit_date).toLocaleTimeString(ar ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-4 py-4"><span className="font-bold">{pet?.name || text.unavailable}</span></td>
                      <td className="px-4 py-4"><span className="block font-semibold">{owner?.name || text.unavailable}</span><span className="text-xs text-slate-400">{owner?.phone || owner?.client_code || ""}</span></td>
                      <td className="px-4 py-4 text-sm text-slate-300">{visitHandler(visit.notes)}</td>
                      <td className="px-4 py-4"><span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">{text.completed}</span></td>
                      <td className="px-4 py-4 text-end"><button type="button" onClick={(event) => { event.stopPropagation(); startEdit(visit); }} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">{text.edit}</button></td>
                    </tr>
                    {expandedId === visit.id && <tr><td colSpan={7} className="bg-[#24292a] px-4 py-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {([[text.reason, visit.reason], [text.exam, visit.examination], [text.diagnosis, visit.diagnosis], [text.treatment, visit.treatment], [text.weight, visit.weight == null ? null : String(visit.weight)], [text.temp, visit.temperature == null ? null : String(visit.temperature)], [text.heart, visit.heart_rate == null ? null : String(visit.heart_rate)], [text.respiration, visit.respiratory_rate == null ? null : String(visit.respiratory_rate)], [text.notes, visit.notes]] as Array<[string, string | null]>).map(([label, value]) => <div key={label} className="min-w-0"><div className="text-xs font-bold text-slate-400">{label}</div><div className="mt-1 whitespace-pre-wrap break-words text-sm">{value || "—"}</div></div>)}
                      {(vaccinationsByVisit[visit.id] || []).length > 0 && <div className="min-w-0 sm:col-span-2 lg:col-span-4"><div className="text-xs font-bold text-slate-400">{text.vaccines}</div><div className="mt-1 flex flex-wrap gap-2">{vaccinationsByVisit[visit.id].map((vaccination) => <span key={vaccination.id} className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1.5 text-sm text-cyan-100">{vaccination.vaccine_name || "—"}{vaccination.administered_at ? ` · ${new Date(vaccination.administered_at).toLocaleDateString(ar ? "ar-EG" : "en-GB")}` : ""}</span>)}</div></div>}
                    </div><div className="mt-4 flex justify-end"><button type="button" onClick={() => setDeleting(visit)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700">{text.delete}</button></div></td></tr>}
                  </Fragment>
                );
              })}
                </tbody>
              </table>
            </div>
          )}
          {!loading && visits.length === 500 && <p className="mt-4 text-xs text-slate-400">{text.limit}</p>}
        </section>
        {!loading && filteredVisits.length > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <label className="flex items-center gap-2">{text.rows}<select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} className="rounded-lg border border-[#414849] bg-[#292e2f] px-3 py-2 text-slate-100"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label>
          <div className="flex items-center gap-2"><button type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-[#414849] px-3 py-2 disabled:opacity-40">{text.previous}</button><span>{page + 1} / {pageCount}</span><button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-[#414849] px-3 py-2 disabled:opacity-40">{text.next}</button></div>
        </div>}
      </div>
      {editing && draft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="edit-visit-title" className="max-h-[95dvh] w-full min-w-0 max-w-3xl overflow-y-auto rounded-t-3xl border border-[#414849] bg-[#252a2b] p-4 text-slate-100 shadow-2xl sm:max-h-[90vh] sm:rounded-xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="min-w-0"><h2 id="edit-visit-title" className="text-xl font-black">{text.edit}</h2><p className="mt-1 break-words text-xs text-slate-500">{editing.pet_id ? petsById[editing.pet_id]?.name || "" : ""} · {editing.client_id ? clientsById[editing.client_id]?.name || "" : ""}</p><p className="mt-1 text-xs text-slate-400">{ar ? "ستظل روابط العميل والحيوان والأدوية والتطعيمات كما هي." : "Client, pet, medication, and vaccination links will stay unchanged."}</p></div>
              <button type="button" onClick={closeEdit} disabled={saving} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#343b3c] text-slate-200 disabled:opacity-50" aria-label={text.cancel}>×</button>
            </div>
            {error && <div role="alert" className="mb-4 break-words rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm font-semibold text-rose-200">{error}</div>}
            <form onSubmit={saveEdit} className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 sm:col-span-2"><label className={labelClass}>{text.date}</label><input type="datetime-local" required value={draft.visit_date} onChange={(e) => setDraft({ ...draft, visit_date: e.target.value })} className={inputClass} /></div>
              {([
                ["reason", text.reason, "text"], ["examination", text.exam, "textarea"], ["diagnosis", text.diagnosis, "textarea"],
                ["treatment", text.treatment, "textarea"], ["weight", text.weight, "number"], ["temperature", text.temp, "number"],
                ["heart_rate", text.heart, "number"], ["respiratory_rate", text.respiration, "number"], ["notes", text.notes, "textarea"],
              ] as const).map(([key, label, kind]) => (
                <div key={key} className={kind === "textarea" || key === "reason" ? "min-w-0 sm:col-span-2" : "min-w-0"}>
                  <label className={labelClass} htmlFor={"visit-" + key}>{label}</label>
                  {kind === "textarea" ? <textarea id={"visit-" + key} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} rows={key === "notes" ? 4 : 3} className={inputClass} /> : <input id={"visit-" + key} type={kind === "number" ? "number" : "text"} min={kind === "number" ? 0 : undefined} step={kind === "number" ? "any" : undefined} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} className={inputClass} />}
                </div>
              ))}
              <div className="flex flex-col-reverse gap-2 pb-[env(safe-area-inset-bottom)] sm:col-span-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeEdit} disabled={saving} className="rounded-lg border border-[#414849] px-5 py-3 text-sm font-bold text-slate-200 disabled:opacity-50">{text.cancel}</button>
                <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">{saving ? (ar ? "جاري الحفظ..." : "Saving...") : text.save}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {deleting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDeleting(null); }}>
        <section role="alertdialog" aria-modal="true" aria-labelledby="delete-visit-title" className="w-full max-w-md rounded-xl border border-[#414849] bg-[#252a2b] p-5 text-slate-100 shadow-2xl">
          <h2 id="delete-visit-title" className="text-lg font-black">{text.delete}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">{text.deleteConfirm}</p>
          {error && <p role="alert" className="mt-3 break-words text-sm font-semibold text-rose-300">{error}</p>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={saving} onClick={() => setDeleting(null)} className="rounded-lg border border-[#414849] px-4 py-2.5 text-sm font-bold">{text.cancel}</button><button type="button" disabled={saving} onClick={() => void deleteVisit()} className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? (ar ? "جاري الحذف..." : "Deleting...") : text.delete}</button></div>
        </section>
      </div>}
    </main>
  );
}
