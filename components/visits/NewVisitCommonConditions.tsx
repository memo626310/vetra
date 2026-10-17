"use client";

import { useEffect, useMemo, useState } from "react";
import { getClinicDb } from "@/lib/clinic-db";
import type { Language, Medication, MedicationDraft } from "./new-visit-types";
import type { FormularyVisitDraft } from "@/components/BSAVAFormularyPicker";

type ConditionProtocol = {
  id: string;
  species: string;
  name_ar: string;
  name_en: string;
  medication_ids: string[];
};

type Props = {
  clinicId: string;
  petSpecies: string;
  language: Language;
  darkMode: boolean;
  medications: Medication[];
  medicationDrafts: MedicationDraft[];
  formularyDrafts: FormularyVisitDraft[];
  onApply: (medicationIds: string[]) => void | Promise<void>;
};

function normalizeSpecies(value: string): string {
  const species = value.trim().toLowerCase();
  if (["cat", "feline", "قط", "قطة"].some((part) => species.includes(part))) return "cat";
  if (["dog", "canine", "كلب", "كلاب"].some((part) => species.includes(part))) return "dog";
  if (["all", "any", "كل الأنواع", "جميع الأنواع"].some((part) => species === part)) return "all";
  return species;
}

function databaseErrorDetails(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    return [value.message, value.code ? `code: ${String(value.code)}` : null, value.details, value.hint ? `hint: ${String(value.hint)}` : null]
      .filter((part) => typeof part === "string" && part.trim())
      .join(" — ");
  }
  return String(error || "Unknown database error");
}

function medicationSupportsSpecies(medication: Medication, species: string): boolean {
  if (!medication.species?.length) return true;
  const target = normalizeSpecies(species);
  return medication.species.some((value) => {
    const candidate = normalizeSpecies(String(value));
    return candidate === target || candidate === "all" || candidate === "any";
  });
}

export default function NewVisitCommonConditions({
  clinicId,
  petSpecies,
  language,
  darkMode,
  medications,
  medicationDrafts,
  formularyDrafts,
  onApply,
}: Props) {
  const [protocols, setProtocols] = useState<ConditionProtocol[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [selectedMedicationIds, setSelectedMedicationIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [savingProtocol, setSavingProtocol] = useState(false);

  const speciesKey = normalizeSpecies(petSpecies);
  const speciesLabel = speciesKey === "cat"
    ? (language === "ar" ? "قطط" : "Cats")
    : speciesKey === "dog"
      ? (language === "ar" ? "كلاب" : "Dogs")
      : petSpecies || (language === "ar" ? "الحيوان الحالي" : "Current pet");

  useEffect(() => {
    if (!clinicId) {
      setProtocols([]);
      setLoaded(false);
      return;
    }

    let cancelled = false;
    setLoaded(false);
    setError("");
    (async () => {
      try {
        const db = await getClinicDb();
        const { data, error: loadError } = await db
          .from("clinic_condition_protocols")
          .select("id, clinic_id, species, name_ar, name_en, medication_ids")
          .eq("clinic_id", clinicId)
          .order("name_en", { ascending: true });
        if (loadError) throw loadError;
        if (!cancelled) {
          setProtocols(Array.isArray(data) ? data.map((row: any) => ({
            id: String(row.id),
            species: String(row.species || ""),
            name_ar: String(row.name_ar || ""),
            name_en: String(row.name_en || ""),
            medication_ids: Array.isArray(row.medication_ids) ? row.medication_ids.map(String) : [],
          })) : []);
        }
      } catch (loadError) {
        console.error("LOAD CONDITION PROTOCOLS ERROR:", loadError);
        if (!cancelled) {
          setProtocols([]);
          setError(language === "ar"
            ? "تعذر تحميل بروتوكولات الأمراض. تأكد من تنفيذ ملف SQL المرفق ومن صلاحيات قاعدة البيانات."
            : "Could not load condition protocols. Confirm the supplied SQL migration was run and database access is configured.");
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [clinicId, language]);

  const speciesProtocols = useMemo(
    () => protocols.filter((protocol) => normalizeSpecies(protocol.species) === speciesKey),
    [protocols, speciesKey],
  );
  const availableMedications = useMemo(
    () => medications
      .filter((medication) => medicationSupportsSpecies(medication, petSpecies))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [medications, petSpecies],
  );
  const existingMedicationIds = useMemo(
    () => new Set(medicationDrafts.map((draft) => draft.medication_id)),
    [medicationDrafts],
  );

  function resetForm() {
    setEditingId(null);
    setNameAr("");
    setNameEn("");
    setSelectedMedicationIds([]);
    setError("");
  }

  function beginNewProtocol() {
    resetForm();
    setManagerOpen(true);
  }

  function beginEdit(protocol: ConditionProtocol) {
    setEditingId(protocol.id);
    setNameAr(protocol.name_ar);
    setNameEn(protocol.name_en);
    setSelectedMedicationIds(protocol.medication_ids);
    setError("");
    setManagerOpen(true);
  }

  async function saveProtocol() {
    if (!clinicId) {
      setError(language === "ar" ? "تعذر تحديد العيادة الحالية." : "Could not identify the current clinic.");
      return;
    }
    if (!speciesKey) {
      setError(language === "ar" ? "نوع الحيوان غير معروف في بيانات الزيارة." : "The pet species is not available for this visit.");
      return;
    }
    if (!nameAr.trim() && !nameEn.trim()) {
      setError(language === "ar" ? "اكتب اسم المرض بالعربي أو الإنجليزي." : "Enter the condition name in Arabic or English.");
      return;
    }
    if (selectedMedicationIds.length === 0) {
      setError(language === "ar" ? "اختاري دواءً من مكتبة العيادة أو BSAVA أولًا." : "Select a clinic medication or a BSAVA drug first.");
      return;
    }

    const values = {
      clinic_id: clinicId,
      species: speciesKey,
      name_ar: nameAr.trim(),
      name_en: nameEn.trim(),
      medication_ids: Array.from(new Set(selectedMedicationIds)),
      updated_at: new Date().toISOString(),
    };

    setSavingProtocol(true);
    try {
      const db = await getClinicDb();
      const protocolId = editingId || globalThis.crypto.randomUUID();
      const saveResult = editingId
        ? await db.from("clinic_condition_protocols")
            .update(values)
            .eq("id", editingId)
            .eq("clinic_id", clinicId)
        : await db.from("clinic_condition_protocols")
            .insert({ id: protocolId, ...values, created_at: new Date().toISOString() });
      const { error: saveError } = saveResult;
      if (saveError) throw saveError;
      const protocol: ConditionProtocol = {
        id: protocolId,
        species: values.species,
        name_ar: values.name_ar,
        name_en: values.name_en,
        medication_ids: values.medication_ids,
      };
      setProtocols((current) => editingId
        ? current.map((item) => item.id === editingId ? protocol : item)
        : [...current, protocol]);
      resetForm();
      setManagerOpen(false);
      setError("");
    } catch (saveError) {
      console.error("SAVE CONDITION PROTOCOL ERROR:", saveError);
      const detail = databaseErrorDetails(saveError);
      setError(language === "ar"
        ? `تعذر حفظ البروتوكول. شغّلي ملف supabase/tenant-sql/vetra_clinic_condition_protocols.sql على قاعدة بيانات العيادة، وليس VETRA CORE. ${detail}`
        : `Could not save the protocol. Run supabase/tenant-sql/vetra_clinic_condition_protocols.sql on the clinic database, not VETRA CORE. ${detail}`);
    } finally {
      setSavingProtocol(false);
    }
  }

  async function deleteProtocol(id: string) {
    try {
      const db = await getClinicDb();
      const { error: deleteError } = await db
        .from("clinic_condition_protocols")
        .delete()
        .eq("id", id)
        .eq("clinic_id", clinicId);
      if (deleteError) throw deleteError;
      setProtocols((current) => current.filter((item) => item.id !== id));
      setConfirmDeleteId(null);
      setError("");
    } catch (deleteError) {
      console.error("DELETE CONDITION PROTOCOL ERROR:", deleteError);
      const detail = deleteError instanceof Error ? deleteError.message : "";
      setError(language === "ar"
        ? `تعذر حذف البروتوكول. ${detail}`
        : `Could not delete the protocol. ${detail}`);
    }
  }

  function applyProtocol(protocol: ConditionProtocol) {
    const validIds = protocol.medication_ids.filter((id) => medications.some(
      (item) => item.id === id && medicationSupportsSpecies(item, petSpecies),
    ));
    const bsavaIds = protocol.medication_ids.filter((id) => id.startsWith("bsava:"));
    if (validIds.length === 0 && bsavaIds.length === 0) {
      setError(language === "ar"
        ? "الأدوية المرتبطة بالبروتوكول غير موجودة في مكتبة الأدوية الحالية. عدّل البروتوكول أولًا."
        : "The linked medications are not in the current medication library. Edit this protocol first.");
      return;
    }
    setError("");
    onApply([...validIds, ...bsavaIds]);
  }

  function toggleMedication(id: string) {
    setSelectedMedicationIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  }

  const panel = darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white";
  const field = `w-full rounded-lg border px-2.5 py-2 text-sm outline-none ${darkMode ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`;
  return (
    <div className={`mb-3 rounded-xl border px-3 py-2.5 ${darkMode ? "border-slate-700 bg-slate-900/70" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`text-xs font-bold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
            {language === "ar" ? "الأمراض الشائعة" : "Common conditions"}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${darkMode ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}`}>
            {speciesLabel}
          </span>
        </div>
        <button type="button" onClick={beginNewProtocol} className="shrink-0 text-xs font-bold text-blue-500 hover:text-blue-600">
          {language === "ar" ? "+ إضافة بروتوكول" : "+ Add protocol"}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {speciesProtocols.map((protocol) => {
          const label = (language === "ar" ? protocol.name_ar : protocol.name_en).trim()
            || protocol.name_ar.trim()
            || protocol.name_en.trim();
          const availableCount = protocol.medication_ids.filter((id) => medications.some((item) => item.id === id)).length;
          return (
            <div key={protocol.id} className={`inline-flex max-w-full items-center overflow-hidden rounded-full border ${darkMode ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-slate-50"}`}>
              <button type="button" title={language === "ar" ? "إضافة أدوية البروتوكول" : "Add protocol medications"} onClick={() => applyProtocol(protocol)} className={`max-w-[180px] truncate px-3 py-1.5 text-xs font-semibold transition hover:bg-blue-500/10 ${darkMode ? "text-slate-100" : "text-slate-700"}`}>
                {label} <span className="ml-1 text-[10px] text-slate-500">{availableCount}</span>
              </button>
              <button type="button" title={language === "ar" ? "تعديل البروتوكول" : "Edit protocol"} onClick={() => beginEdit(protocol)} className="border-l border-slate-200/50 px-2 py-1.5 text-[10px] text-blue-500 hover:bg-blue-500/10">✎</button>
              <button type="button" title={language === "ar" ? "حذف البروتوكول" : "Delete protocol"} onClick={() => setConfirmDeleteId(protocol.id)} className="px-2 py-1.5 text-[10px] text-rose-500 hover:bg-rose-500/10">×</button>
            </div>
          );
        })}
        {speciesProtocols.length === 0 && (
          <span className={`py-1 text-[11px] ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
            {!loaded
              ? (language === "ar" ? "جاري تحميل البروتوكولات..." : "Loading protocols...")
              : (language === "ar" ? "لسه مفيش بروتوكولات للنوع ده. أضف البروتوكول مرة واحدة وهيظهر هنا بعد كده." : "No protocols for this species yet. Set one up once and it will appear here next time.")}
          </span>
        )}
      </div>

      {error && !managerOpen && <p className="mt-2 text-xs font-medium text-rose-500">{error}</p>}

      {confirmDeleteId && (
        <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 ${panel}`}>
          <span className="text-xs">{language === "ar" ? "متأكد إنك عاوز تحذف البروتوكول؟" : "Delete this protocol?"}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-md px-2 py-1 text-xs">{language === "ar" ? "إلغاء" : "Cancel"}</button>
            <button type="button" onClick={() => { void deleteProtocol(confirmDeleteId); }} className="rounded-md bg-rose-600 px-2 py-1 text-xs font-bold text-white">{language === "ar" ? "حذف" : "Delete"}</button>
          </div>
        </div>
      )}

      {managerOpen && (
        <div className={`mt-3 rounded-xl border p-3 ${panel}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold">{editingId ? (language === "ar" ? "تعديل البروتوكول" : "Edit protocol") : (language === "ar" ? "بروتوكول مرض جديد" : "New condition protocol")}</h4>
            <button type="button" onClick={() => { setManagerOpen(false); resetForm(); }} className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-500/10">×</button>
          </div>
          <p className="mb-2 text-[11px] text-slate-500">
            {language === "ar" ? `النوع مأخوذ تلقائيًا من الحيوان الحالي: ${speciesLabel}.` : `Species is taken from the selected pet: ${speciesLabel}.`}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={nameAr} onChange={(event) => setNameAr(event.target.value)} placeholder="اسم المرض بالعربي" className={field} dir="rtl" />
            <input value={nameEn} onChange={(event) => setNameEn(event.target.value)} placeholder="Condition name (English)" className={field} />
          </div>
          <div className="mt-3">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold">{language === "ar" ? "أدوية البروتوكول" : "Protocol medications"}</span>
              <span className="text-[10px] text-slate-500">{selectedMedicationIds.length} {language === "ar" ? "مختار" : "selected"}</span>
            </div>
            {availableMedications.length > 0 && (
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200/60 p-2">
                {availableMedications.map((medication) => (
                  <label key={medication.id} className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs ${darkMode ? "hover:bg-slate-800" : "hover:bg-slate-100"}`}>
                    <input type="checkbox" className="mt-0.5" checked={selectedMedicationIds.includes(medication.id)} onChange={() => toggleMedication(medication.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{medication.name}</span>
                      <span className="text-[10px] text-slate-500">{medication.active_ingredient || ""}{medication.dose_value == null ? (language === "ar" ? " · لا توجد جرعة محفوظة" : " · No dose configured") : ` · ${medication.dose_value} ${medication.dose_unit || ""}${medication.dose_type ? ` (${medication.dose_type})` : ""}`}</span>
                      {existingMedicationIds.has(medication.id) && <span className="ml-1 text-[10px] text-amber-600">{language === "ar" ? "مضاف بالفعل في الكشف الحالي" : "Already in this visit"}</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {formularyDrafts.length > 0 ? (
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-emerald-500/20 p-2">
                <p className="px-2 py-1 text-[10px] font-bold text-emerald-600">{language === "ar" ? "اختاري من أدوية BSAVA المضافة في البحث أعلاه" : "Select from BSAVA drugs added in the search above"}</p>
                {formularyDrafts.map((draft) => {
                  const reference = `bsava:${draft.drugId}:${draft.route}`;
                  return <label key={draft.id} className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs ${darkMode ? "hover:bg-slate-800" : "hover:bg-slate-100"}`}>
                    <input type="checkbox" className="mt-0.5" checked={selectedMedicationIds.includes(reference)} onChange={() => toggleMedication(reference)} />
                    <span className="min-w-0 flex-1"><span className="block font-semibold">{draft.drugName} · {draft.route}</span><span className="text-[10px] text-slate-500">{draft.appliedDose} {draft.adminDoseUnit}{draft.frequency ? ` · ${draft.frequency}` : ""}</span></span>
                  </label>;
                })}
              </div>
            ) : (
              <p className="mt-2 rounded-lg border border-dashed border-emerald-500/30 p-3 text-xs text-slate-500">{language === "ar" ? "ابحثي عن الدواء في BSAVA أو DrugEye من خانة البحث أعلى الصفحة، ثم أضيفيه للكشف ليظهر هنا للاختيار." : "Search BSAVA or DrugEye above and add a matched veterinary drug to the visit; it will appear here."}</p>
            )}
          </div>
          {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => { setManagerOpen(false); resetForm(); }} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${darkMode ? "border-slate-700" : "border-slate-200"}`}>{language === "ar" ? "إلغاء" : "Cancel"}</button>
            <button type="button" disabled={savingProtocol} onClick={() => { void saveProtocol(); }} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{savingProtocol ? (language === "ar" ? "جاري الحفظ..." : "Saving...") : (language === "ar" ? "حفظ البروتوكول" : "Save protocol")}</button>
          </div>
        </div>
      )}

      <p className="mt-2 text-[10px] leading-4 text-slate-500">
        {language === "ar" ? "البروتوكولات محفوظة في قاعدة بيانات العيادة وتظهر على أجهزتها. الأدوية والجرعات مأخوذة من مكتبتك؛ راجع العلاج قبل حفظ الكشف." : "Protocols are saved in the clinic database and shared across its devices. Medications and doses come from your library; review treatment before saving the visit."}
      </p>
    </div>
  );
}
