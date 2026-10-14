"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getClinicDb } from "@/lib/clinic-db";

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
type VisitDraft = {
  visit_date: string; reason: string; examination: string; diagnosis: string; treatment: string;
  weight: string; temperature: string; heart_rate: string; respiratory_rate: string; notes: string;
};
const COLUMNS = "id,client_id,pet_id,visit_date,reason,examination,diagnosis,treatment,weight,temperature,heart_rate,respiratory_rate,notes";

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

export default function VisitHistoryDashboardPage() {
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [petsById, setPetsById] = useState<Record<string, Pet>>({});
  const [clientsById, setClientsById] = useState<Record<string, Client>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Visit | null>(null);
  const [draft, setDraft] = useState<VisitDraft | null>(null);
  const ar = language === "ar";

  const loadVisits = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const db = await getClinicDb();
      const { data, error: visitsError } = await db.from("visits").select(COLUMNS).order("visit_date", { ascending: false }).limit(500);
      if (visitsError) throw visitsError;
      const loaded = (data || []) as Visit[];
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
      setVisits(loaded);
      setPetsById(Object.fromEntries(pets.map((item) => [item.id, item])));
      setClientsById(Object.fromEntries(clients.map((item) => [item.id, item])));
    } catch (err) {
      console.error("DASHBOARD VISITS LOAD ERROR:", err);
      setError(err instanceof Error ? err.message : "تعذر تحميل سجل الزيارات.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void loadVisits(); });
    return () => window.cancelAnimationFrame(frame);
  }, [loadVisits]);

  const filteredVisits = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return visits;
    return visits.filter((visit) => {
      const pet = visit.pet_id ? petsById[visit.pet_id] : undefined;
      const ownerId = visit.client_id || pet?.client_id || "";
      const owner = ownerId ? clientsById[ownerId] : undefined;
      return [visit.reason, visit.diagnosis, visit.examination, visit.treatment, visit.notes, pet?.name, owner?.name, owner?.client_code, owner?.phone]
        .some((value) => (value || "").toLocaleLowerCase().includes(q));
    });
  }, [query, visits, petsById, clientsById]);

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
    } catch (err) {
      console.error("DASHBOARD VISIT EDIT ERROR:", err);
      setError(err instanceof Error ? err.message : (ar ? "تعذر حفظ تعديلات الزيارة." : "Could not save visit changes."));
    } finally {
      setSaving(false);
    }
  }

  const text = {
    title: ar ? "سجل الزيارات السابقة" : "Previous Visit History",
    subtitle: ar ? "راجع الكشوفات وعدّل بيانات الزيارة، مع الحفاظ على ربط العميل والحيوان." : "Review and edit visit details while preserving the linked client and pet.",
    back: ar ? "العودة للداشبورد" : "Back to dashboard",
    search: ar ? "ابحث باسم العميل أو الحيوان أو التشخيص..." : "Search client, pet, or diagnosis...",
    count: ar ? "زيارة ظاهرة" : "visits shown", date: ar ? "التاريخ والوقت" : "Date and time",
    client: ar ? "العميل" : "Client", pet: ar ? "الحيوان" : "Pet", reason: ar ? "سبب الزيارة" : "Reason",
    exam: ar ? "الفحص" : "Examination", diagnosis: ar ? "التشخيص" : "Diagnosis", treatment: ar ? "العلاج" : "Treatment",
    weight: ar ? "الوزن (كجم)" : "Weight (kg)", temp: ar ? "الحرارة (°C)" : "Temperature (°C)",
    heart: ar ? "نبض القلب" : "Heart rate", respiration: ar ? "معدل التنفس" : "Respiratory rate", notes: ar ? "ملاحظات" : "Notes",
    edit: ar ? "تعديل الزيارة" : "Edit visit", save: ar ? "حفظ التعديلات" : "Save changes",
    cancel: ar ? "إلغاء" : "Cancel", loading: ar ? "جاري تحميل سجل الزيارات..." : "Loading visits...",
    noResults: ar ? "لا توجد زيارات مطابقة للبحث." : "No matching visits found.",
    unavailable: ar ? "بيانات الربط غير متاحة" : "Linked record unavailable",
    limit: ar ? "يعرض السجل آخر 500 زيارة. استخدم البحث لتصفية النتائج." : "Showing the latest 500 visits. Use search to filter results.",
  };
  const inputClass = "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const labelClass = "mb-1.5 block text-sm font-semibold text-slate-600";

  return (
    <main dir={ar ? "rtl" : "ltr"} className="min-h-screen overflow-x-hidden bg-[#f7f8fa] px-3 py-4 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-7xl min-w-0">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0"><h1 className="text-2xl font-black sm:text-3xl">{text.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{text.subtitle}</p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setLanguage(ar ? "en" : "ar")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold">{ar ? "English" : "العربية"}</button>
            <Link href="/dashboard" className="rounded-xl bg-[#0B2540] px-4 py-2.5 text-sm font-bold text-white">{text.back}</Link>
          </div>
        </header>
        {error && <div role="alert" className="mb-4 break-words rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
        {message && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</div>}
        <section className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={text.search} className={inputClass} aria-label={text.search} />
            <div className="shrink-0 text-sm font-bold text-slate-500">{filteredVisits.length} {text.count}</div>
          </div>
          {loading ? <div className="py-12 text-center text-sm font-semibold text-slate-500">{text.loading}</div> : filteredVisits.length === 0 ? <div className="py-12 text-center text-sm text-slate-500">{text.noResults}</div> : (
            <div className="space-y-3">
              {filteredVisits.map((visit) => {
                const pet = visit.pet_id ? petsById[visit.pet_id] : undefined;
                const ownerId = visit.client_id || pet?.client_id || "";
                const owner = ownerId ? clientsById[ownerId] : undefined;
                return (
                  <article key={visit.id} className="min-w-0 rounded-2xl border border-slate-100 p-4 transition hover:border-slate-200 sm:p-5">
                    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-base font-black sm:text-lg">{pet?.name || text.unavailable}</h2><span className="max-w-full break-words rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{owner?.name || text.unavailable}</span></div>
                        <p className="mt-2 text-xs text-slate-500">{new Date(visit.visit_date).toLocaleString(ar ? "ar-EG" : "en-US", { dateStyle: "medium", timeStyle: "short" })}</p>
                        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {([[text.reason, visit.reason], [text.diagnosis, visit.diagnosis], [text.treatment, visit.treatment]] as Array<[string, string | null]>).filter((item) => item[1]).map(([label, value]) => (
                            <div key={label} className="min-w-0 rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">{label}</div><p className="mt-1 whitespace-pre-wrap break-words text-sm">{value}</p></div>
                          ))}
                        </div>
                      </div>
                      <button type="button" onClick={() => startEdit(visit)} className="w-full shrink-0 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 sm:w-auto">{text.edit}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {!loading && visits.length === 500 && <p className="mt-4 text-xs text-slate-400">{text.limit}</p>}
        </section>
      </div>
      {editing && draft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="edit-visit-title" className="max-h-[95dvh] w-full min-w-0 max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:max-h-[90vh] sm:rounded-3xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="min-w-0"><h2 id="edit-visit-title" className="text-xl font-black">{text.edit}</h2><p className="mt-1 break-words text-xs text-slate-500">{editing.pet_id ? petsById[editing.pet_id]?.name || "" : ""} · {editing.client_id ? clientsById[editing.client_id]?.name || "" : ""}</p><p className="mt-1 text-xs text-slate-400">{ar ? "ستظل روابط العميل والحيوان والأدوية والتطعيمات كما هي." : "Client, pet, medication, and vaccination links will stay unchanged."}</p></div>
              <button type="button" onClick={closeEdit} disabled={saving} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 disabled:opacity-50" aria-label={text.cancel}>×</button>
            </div>
            {error && <div role="alert" className="mb-4 break-words rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
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
                <button type="button" onClick={closeEdit} disabled={saving} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 disabled:opacity-50">{text.cancel}</button>
                <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">{saving ? (ar ? "جاري الحفظ..." : "Saving...") : text.save}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
