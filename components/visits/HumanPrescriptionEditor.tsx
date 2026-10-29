"use client";

import { useEffect, useId, useState } from "react";
import { humanPrescriptionDetails, humanPrescriptionFromDraft, serializeHumanPrescription, validHumanSchedule } from "@/lib/human-prescriptions";
import { humanMedicationDefaultsForVisit, humanMedicationNameKey, loadHumanMedicationLibrary, mergeHumanMedicationLibrary, readSavedHumanMedications, saveHumanMedicationDefaults, type HumanMedicationLibraryEntry } from "@/lib/human-medication-library";
import type { ExternalMedicationDraft, Language } from "./new-visit-types";

type Props = {
  clinicId: string;
  language: Language;
  darkMode: boolean;
  drafts: ExternalMedicationDraft[];
  onAdd: (draft: ExternalMedicationDraft) => void;
  onUpdate: (id: string, patch: Partial<ExternalMedicationDraft>) => void;
  onSave: (draft: ExternalMedicationDraft) => string;
  onRemove: (id: string) => void;
};

function ScheduleChoice({ id, label, value, choices, onChange, field, unit, integer = false }: {
  id: string; label: string; value: string; choices: { value: string; label: string }[];
  onChange: (value: string) => void; field: string; unit: string; integer?: boolean;
}) {
  const [custom, setCustom] = useState(false);
  const isCustom = custom || Boolean(value && !choices.some((choice) => choice.value === value));
  return <div>
    <label htmlFor={id} className="mb-1 block text-xs font-semibold">{label}</label>
    <select id={id} value={isCustom ? "custom" : value} onChange={(event) => {
      setCustom(event.target.value === "custom");
      onChange(event.target.value === "custom" ? "" : event.target.value);
    }} className={field}>
      <option value="">{unit === "ساعة" || unit === "يوم" ? "اختر" : "Select"}</option>
      {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      <option value="custom">{unit === "ساعة" || unit === "يوم" ? "مخصص" : "Custom"}</option>
    </select>
    {isCustom && <input type="number" min={integer ? "1" : "0.1"} step={integer ? "1" : "any"} value={value}
      aria-label={`${label} (${unit})`} placeholder={unit} onChange={(event) => onChange(event.target.value)} className={`mt-2 ${field}`} />}
  </div>;
}

export default function HumanPrescriptionEditor({ clinicId, language, darkMode, drafts, onAdd, onUpdate, onSave, onRemove }: Props) {
  const ar = language === "ar";
  const id = useId();
  const [query, setQuery] = useState("");
  const [library, setLibrary] = useState<HumanMedicationLibraryEntry[]>([]);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveFeedback, setSaveFeedback] = useState<Record<string, { fingerprint: string; message: string; error: boolean }>>({});
  const [savingMedications, setSavingMedications] = useState<Record<string, boolean>>({});
  const [collapsedDefaults, setCollapsedDefaults] = useState<Record<string, boolean>>({});
  const search = query.trim().replace(/\s+/g, " ");
  const field = `w-full min-w-0 rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`;

  useEffect(() => {
    if (!focused || !clinicId) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const entries = await loadHumanMedicationLibrary(clinicId, search);
        if (!cancelled) setLibrary(entries);
      } catch (cause) {
        if (!cancelled) { setLibrary(readSavedHumanMedications(clinicId)); setError(ar ? "تعذر تحميل مكتبة العيادة. الأدوية المحفوظة على هذا الجهاز متاحة، ويمكنك إضافة دواء بالاسم." : "Could not load the clinic library. Medications saved on this device remain available, and you can add one by name."); }
        console.error("HUMAN MEDICATION SEARCH:", cause);
      } finally { if (!cancelled) setLoading(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [clinicId, search, focused, ar]);

  const selected = drafts.filter((draft) => draft.category === "human");
  const matches = mergeHumanMedicationLibrary(library, selected.map((draft) => ({
    medicationName: draft.productName, prescription: null, updatedAt: "",
  }))).map((entry) => entry.medicationName)
    .filter((name) => !search || name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).slice(0, 12);

  function add(name: string) {
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean || selected.some((draft) => humanMedicationNameKey(draft.productName) === humanMedicationNameKey(clean))) return;
    const saved = library.find((entry) => humanMedicationNameKey(entry.medicationName) === humanMedicationNameKey(clean));
    const defaults = humanMedicationDefaultsForVisit(saved);
    const draftId = crypto.randomUUID();
    onAdd({ id: draftId, category: "human", product_id: null, productName: saved?.medicationName || clean,
      activeIngredient: null, manufacturer: null, price: null, ...defaults,
      frequency: defaults.intervalHours ? `Every ${defaults.intervalHours} hours` : "",
      duration: defaults.durationDays ? `For ${defaults.durationDays} days` : "",
      weightKg: null, source: "manual", bsavaDrugName: null });
    if (validHumanSchedule(defaults)) setCollapsedDefaults((current) => ({ ...current, [draftId]: true }));
    setQuery(""); setFocused(false);
  }

  async function saveMedication(draft: ExternalMedicationDraft) {
    if (savingMedications[draft.id]) return;
    const prescription = humanPrescriptionFromDraft(draft);
    const fingerprint = serializeHumanPrescription(prescription);
    try {
      if (!draft.productName.trim() || !validHumanSchedule(prescription)) {
        throw new Error(ar ? "حدد تكرارًا صحيحًا بالساعات ومدة صحيحة بالأيام قبل الحفظ." : "Choose a valid interval in hours and duration in days before saving.");
      }
      setSavingMedications((current) => ({ ...current, [draft.id]: true }));
      onSave(draft);
      const result = await saveHumanMedicationDefaults(clinicId, draft.productName, prescription);
      setLibrary((current) => mergeHumanMedicationLibrary([result.entry], current));
      setCollapsedDefaults((current) => ({ ...current, [draft.id]: true }));
      const message = result.storage === "clinic"
        ? (ar ? "تم حفظ الدواء وإعداداته في مكتبة العيادة. عند اختياره لاحقًا أدخل الجرعة فقط. احفظ الزيارة لإتمام الروشتة." : "Medication and defaults saved to the clinic library. Next time, enter only this patient's dose. Save Visit to finalize the prescription.")
        : (ar ? "تم حفظ الدواء وإعداداته على هذا الجهاز فقط؛ مزامنة مكتبة العيادة غير متاحة حاليًا. عند اختياره لاحقًا أدخل الجرعة فقط، ثم احفظ الزيارة لإتمام الروشتة." : "Medication and defaults saved on this device only; clinic-library sync is currently unavailable. Next time, enter only this patient's dose, then Save Visit to finalize the prescription.");
      setSaveFeedback((current) => ({ ...current, [draft.id]: { fingerprint, message, error: false } }));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : (ar ? "تعذر حفظ الدواء. حاول مرة أخرى." : "Could not save medication. Please try again.");
      setSaveFeedback((current) => ({ ...current, [draft.id]: { fingerprint, message, error: true } }));
    } finally {
      setSavingMedications((current) => ({ ...current, [draft.id]: false }));
    }
  }

  return <section aria-label={ar ? "الأدوية البشرية" : "Human medications"} className="space-y-3">
    <p className="text-sm font-semibold">{ar ? "اكتب هنا الجزء البشري من الأدوية" : "Enter the human medications here"}</p>
    <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <label className="sr-only" htmlFor={`${id}-search`}>{ar ? "البحث في الأدوية السابقة" : "Search previously entered medications"}</label>
      <input id={`${id}-search`} type="search" role="combobox" aria-autocomplete="list" value={query} onFocus={() => setFocused(true)} autoComplete="off"
        placeholder={ar ? "ابحث عن دواء سبق إدخاله..." : "Search previously entered medications..."}
        onChange={(event) => { setQuery(event.target.value); setLibrary([]); setLoading(true); setFocused(true); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setFocused(false); return; }
          if (event.key !== "Enter") return;
          event.preventDefault();
          if (!loading && search) add(matches[0] || search);
        }}
        aria-expanded={focused} aria-controls={`${id}-results`} className={field} />
      {focused && <div id={`${id}-results`} role="listbox" aria-label={ar ? "نتائج البحث عن دواء" : "Medication search results"} className={`absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border p-2 shadow-xl ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
        {loading && <p role="status" className="p-2 text-xs text-slate-500">{ar ? "جارٍ البحث..." : "Searching..."}</p>}
        {matches.map((name) => <button key={name} type="button" role="option" aria-selected={selected.some((draft) => draft.productName.toLocaleLowerCase() === name.toLocaleLowerCase())} disabled={selected.some((draft) => draft.productName.toLocaleLowerCase() === name.toLocaleLowerCase())}
          onClick={() => add(name)} className="block w-full rounded-lg px-3 py-2.5 text-start text-sm hover:bg-cyan-500/10 disabled:opacity-40">{name}</button>)}
        {!loading && !matches.length && <p className="p-2 text-xs text-slate-500">{ar ? "لا توجد نتيجة مطابقة." : "No matching medication."}</p>}
        {!loading && search && !matches.length && <button type="button" role="option" aria-selected={false} onClick={() => add(search)} className="w-full rounded-lg bg-cyan-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-cyan-700">{ar ? "+ أضف دواء جديد" : "+ Add new medication"}: {search}</button>}
      </div>}
    </div>
    {error && <p role="status" className="text-xs text-amber-600">{error}</p>}
    {selected.map((draft) => <article key={draft.id} className={`space-y-3 rounded-xl border p-3 ${darkMode ? "border-slate-700 bg-slate-950/50" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex items-start justify-between gap-3"><h3 className="font-bold">{draft.productName}</h3><button type="button" onClick={() => onRemove(draft.id)} aria-label={ar ? `حذف ${draft.productName}` : `Remove ${draft.productName}`} className="rounded-lg px-2 text-lg text-rose-500">×</button></div>
      <label className="block text-xs font-semibold">{ar ? "الجرعة والوحدة" : "Dose and unit"}<input value={draft.doseText} onChange={(event) => onUpdate(draft.id, { doseText: event.target.value })} className={`mt-1 ${field}`} /></label>
      <details open={!collapsedDefaults[draft.id]} onToggle={(event) => {
        const collapsed = !event.currentTarget.open;
        setCollapsedDefaults((current) => current[draft.id] === collapsed ? current : { ...current, [draft.id]: collapsed });
      }} className={`rounded-lg border p-3 ${darkMode ? "border-slate-800" : "border-slate-200"}`}>
        <summary className="cursor-pointer text-xs font-semibold">
          {ar ? "التكرار والمدة والتعليمات — تعديل" : "Schedule and instructions — edit"}
          {collapsedDefaults[draft.id] && <span className="mt-2 block font-normal text-slate-500">{humanPrescriptionDetails({ ...humanPrescriptionFromDraft(draft), doseText: "" }, ar)}</span>}
        </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ScheduleChoice id={`${id}-${draft.id}-hours`} label={ar ? "التكرار كل كام ساعة؟" : "Repeat every how many hours?"} value={draft.intervalHours || ""} field={field} unit={ar ? "ساعة" : "hours"}
          choices={[8, 12, 24].map((hours) => ({ value: String(hours), label: ar ? `كل ${hours} ساعة` : `Every ${hours} hours` }))}
          onChange={(value) => onUpdate(draft.id, { intervalHours: value, frequency: value ? `Every ${value} hours` : "" })} />
        <ScheduleChoice id={`${id}-${draft.id}-days`} label={ar ? "لمدة كام يوم؟" : "For how many days?"} value={draft.durationDays || ""} field={field} unit={ar ? "يوم" : "days"} integer
          choices={[1, 2, 3, 5].map((days) => ({ value: String(days), label: ar ? days === 1 ? "يوم واحد" : days === 2 ? "يومين" : `${days} أيام` : days === 1 ? "1 day" : `${days} days` }))}
          onChange={(value) => onUpdate(draft.id, { durationDays: value, duration: value ? `For ${value} days` : "" })} />
      </div>
      <label className="mt-3 block text-xs font-semibold">{ar ? "تعليمات إضافية (اختياري)" : "Additional instructions (optional)"}<input value={draft.instructions} onChange={(event) => onUpdate(draft.id, { instructions: event.target.value })} className={`mt-1 ${field}`} /></label>
      </details>
      <div className={`flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between ${darkMode ? "border-slate-800" : "border-slate-200"}`}>
        <p className="text-xs leading-5 text-slate-500">{ar ? "احفظ إعدادات الدواء لاستخدامها تلقائيًا لاحقًا، وأدخل الجرعة لكل حالة. احفظ الزيارة لإتمام الروشتة." : "Save medication defaults for reuse, and enter the dose for each patient. Save Visit to finalize the prescription."}</p>
        <button type="button" disabled={savingMedications[draft.id]} onClick={() => void saveMedication(draft)} aria-label={ar ? `حفظ دواء ${draft.productName}` : `Save medication ${draft.productName}`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8" /></svg>
          {savingMedications[draft.id] ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "حفظ الدواء" : "Save medication")}
        </button>
      </div>
      {saveFeedback[draft.id]?.fingerprint === serializeHumanPrescription(humanPrescriptionFromDraft(draft)) && <p role={saveFeedback[draft.id].error ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-xs leading-6 ${saveFeedback[draft.id].error ? "bg-rose-500/10 text-rose-500" : darkMode ? "bg-emerald-500/10 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}>
        {saveFeedback[draft.id].error ? "" : "✓ "}{saveFeedback[draft.id].message}
      </p>}
    </article>)}
    <p className="text-xs text-slate-500">{ar ? "يظهر الدواء في البحث مباشرة بعد حفظه مع التكرار والمدة والتعليمات. أدخل الجرعة عند استخدامه لحالة جديدة. الأدوية البشرية للروشتة فقط: بدون سعر ولا تُضاف إلى إجمالي الفاتورة." : "Saved medications are searchable immediately with their schedule and instructions. Enter the dose for each new patient. Human medications are prescription-only: no charge and excluded from the invoice total."}</p>
  </section>;
}
