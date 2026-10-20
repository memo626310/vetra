import { useEffect, useState } from "react";
import { BSAVAFormularyPicker, createBsavaVisitDraft, type FormularyVisitDraft } from "@/components/BSAVAFormularyPicker";
import type { ExternalMedicationDraft, Language, Medication, MedicationDraft, PetDetails, VaccinationDraft, VisitTranslations } from "./new-visit-types";
import { getVaccinationStageOptions, calculateNextVaccinationDose } from "./new-visit-utils";
import DrugEyeProductLinks from "./DrugEyeProductLinks";
import NewVisitCommonConditions from "./NewVisitCommonConditions";

type DrugEyeResult = {
  id: string;
  name: string;
  price: string | null;
  activeIngredient: string | null;
  category: string | null;
  manufacturer: string | null;
};

type Props = {
  clinicId: string;
  language: Language;
  darkMode: boolean;
  t: VisitTranslations;
  petDetails: PetDetails;
  weight: string;
  formularyDrafts: FormularyVisitDraft[];
  setFormularyDrafts: (value: FormularyVisitDraft[] | ((current: FormularyVisitDraft[]) => FormularyVisitDraft[])) => void;
  externalMedicationDrafts: ExternalMedicationDraft[];
  onAddManualExternalMedication: (draft: ExternalMedicationDraft) => void;
  onRemoveManualExternalMedication: (id: string) => void;
  medicationSearch: string;
  setMedicationSearch: (value: string) => void;
  filteredMedications: Medication[];
  addMedication: (medicationId?: string) => boolean;
  medications: Medication[];
  setMessage: (value: string) => void;
  medicationDrafts: MedicationDraft[];
  removeMedication: (id: string) => void;
  treatment: string;
  setTreatment: (value: string) => void;
  vaccinations: VaccinationDraft[];
  addVaccination: () => void;
  updateVaccination: (id: string, patch: Partial<VaccinationDraft>) => void;
  removeVaccination: (id: string) => void;
  resetVaccinationNextDoseToAutomatic: (id: string) => void;
  visitNotes: string;
  setVisitNotes: (value: string) => void;
  followUp: string;
  setFollowUp: (value: string) => void;
  followUpDetails: string;
  setFollowUpDetails: (value: string) => void;
};

export default function NewVisitTreatmentFields({
  clinicId, language, darkMode, t, petDetails, weight, formularyDrafts, setFormularyDrafts,
  externalMedicationDrafts, onAddManualExternalMedication, onRemoveManualExternalMedication,
  medicationSearch, setMedicationSearch,
  filteredMedications, addMedication, medications, setMessage, medicationDrafts, removeMedication,
  treatment, setTreatment, vaccinations, addVaccination, updateVaccination, removeVaccination,
  resetVaccinationNextDoseToAutomatic, visitNotes, setVisitNotes, followUp, setFollowUp,
  followUpDetails, setFollowUpDetails,
}: Props) {
  const [showTreatmentNotes, setShowTreatmentNotes] = useState(Boolean(treatment));
  const [drugEyeResults, setDrugEyeResults] = useState<DrugEyeResult[]>([]);
  const [drugEyeLoading, setDrugEyeLoading] = useState(false);
  const [drugEyeError, setDrugEyeError] = useState("");
  const [drugEyeResultQuery, setDrugEyeResultQuery] = useState("");
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualDrugName, setManualDrugName] = useState("");
  const [manualDose, setManualDose] = useState("");
  const [manualRoute, setManualRoute] = useState("");
  const query = medicationSearch.trim().replace(/\s+/g, " ");
  const matchingMedications = query ? filteredMedications.slice(0, 8) : [];

  function addManualMedication() {
    if (!manualDrugName.trim() || !manualDose.trim()) {
      setMessage(language === "ar" ? "اكتب اسم الدواء والجرعة." : "Enter the medication name and dose.");
      return;
    }
    onAddManualExternalMedication({
      id: crypto.randomUUID(),
      productName: manualDrugName.trim(),
      activeIngredient: null,
      manufacturer: null,
      price: null,
      doseText: manualDose.trim(),
      route: manualRoute.trim(),
      frequency: "",
      duration: "",
      instructions: "",
      weightKg: weight.trim() && Number.isFinite(Number(weight)) ? Number(weight) : null,
      source: "manual",
      bsavaDrugName: null,
    });
    setManualDrugName("");
    setManualDose("");
    setManualRoute("");
    setManualEntryOpen(false);
    setMessage("");
  }

  async function applyCommonProtocol(ids: string[]) {
    const clinicMedicationIds = ids.filter((id) => !id.startsWith("bsava:"));
    const failedClinicMeds = clinicMedicationIds.filter((id) => !addMedication(id));
    if (failedClinicMeds.length) {
      setMessage(language === "ar"
        ? "بعض أدوية البروتوكول لم تُضف: تحقق من الوزن والجرعة المسجلة في مكتبة الأدوية."
        : "Some protocol medications could not be added. Check the pet weight and each library dose.");
    }
    const formularyReferences = ids.filter((id) => id.startsWith("bsava:"));
    if (!formularyReferences.length) return;
    try {
      const nextDrafts = await Promise.all(formularyReferences.map(async (reference) => {
        const [, id, route] = reference.split(":");
        return createBsavaVisitDraft(Number(id), petDetails?.species || "", route || "", weight ? Number(weight) : null);
      }));
      const usable = nextDrafts.filter((draft): draft is FormularyVisitDraft => Boolean(draft));
      if (!usable.length) {
        setMessage(language === "ar" ? "أدخل وزن الحيوان لاستخدام جرعة BSAVA المحسوبة." : "Enter the pet's weight to calculate the BSAVA dose.");
        return;
      }
      setFormularyDrafts((current) => {
        const added = usable.filter((draft) => !current.some((item) => item.drugId === draft.drugId && item.route === draft.route));
        return [...current, ...added];
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (language === "ar" ? "تعذر تحميل مرجع BSAVA." : "Could not load BSAVA reference."));
    }
  }

  // Query DrugEye from VETRA's own route after a short pause. Abort stale requests
  // so a slow response for an earlier query never replaces the latest results.
  useEffect(() => {
    const normalizedQuery = medicationSearch.trim().replace(/\s+/g, " ");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    setDrugEyeError("");
    setDrugEyeResults([]);
    setDrugEyeResultQuery("");
    setDrugEyeLoading(false);

    if (normalizedQuery.length < 2) {
      return () => controller.abort();
    }

    timer = setTimeout(async () => {
      setDrugEyeLoading(true);
      try {
        const response = await fetch(`/api/drug-eye/search?q=${encodeURIComponent(normalizedQuery)}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as { results?: DrugEyeResult[]; error?: string };
        if (!response.ok) throw new Error(payload.error || `DrugEye search failed (${response.status}).`);
        if (controller.signal.aborted) return;
        setDrugEyeResults(Array.isArray(payload.results) ? payload.results : []);
        setDrugEyeResultQuery(normalizedQuery);
      } catch (error) {
        if (controller.signal.aborted) return;
        setDrugEyeResults([]);
        setDrugEyeResultQuery(normalizedQuery);
        setDrugEyeError(error instanceof Error && error.message ? error.message : "DrugEye search is unavailable.");
      } finally {
        if (!controller.signal.aborted) setDrugEyeLoading(false);
      }
    }, 350);

    return () => {
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  }, [medicationSearch]);

  return (<>
                <div className="lg:col-span-2">
                  <NewVisitCommonConditions
                    clinicId={clinicId}
                    petSpecies={petDetails?.species || ""}
                    language={language}
                    darkMode={darkMode}
                    medications={medications}
                    medicationDrafts={medicationDrafts}
                    formularyDrafts={formularyDrafts}
                    onApply={applyCommonProtocol}
                  />
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <label className={`block text-sm font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{t.treatment}</label>
                      <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                        {language === "ar" ? "ابحث في خانة واحدة: أدوية العيادة أولًا، ثم BSAVA البيطري، ثم DrugEye. جرعات BSAVA تُحسب حسب الوزن والطريق." : "One search: clinic medications first, then BSAVA veterinary protocols, then DrugEye references. BSAVA doses use weight and route."}
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-500/10 px-3 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-300">Medication Library + dose calculator</span>
                  </div>

                  <div className={`rounded-2xl border p-3 sm:p-4 ${darkMode ? "border-slate-700 bg-slate-950/60" : "border-slate-200 bg-slate-50"}`}>
                    <div className="relative">
                      <input
                        value={medicationSearch}
                        onChange={(e) => setMedicationSearch(e.target.value)}
                        placeholder={language === "ar" ? "ابحث باسم الدواء أو المادة الفعالة..." : "Search by medication or active ingredient..."}
                        autoComplete="off"
                        className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 ${darkMode ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"}`}
                      />
                      {query && (
                        <div className={`absolute inset-x-0 top-full z-30 mt-1 max-h-[min(70vh,30rem)] overflow-y-auto rounded-xl border shadow-xl ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
                          {matchingMedications.length > 0 && (
                            <>
                              <div className={`sticky top-0 z-10 border-b px-3 py-2 text-[11px] font-bold uppercase tracking-wide ${darkMode ? "border-slate-800 bg-slate-900 text-slate-400" : "border-slate-100 bg-slate-50 text-slate-500"}`}>
                                {language === "ar" ? "مكتبة أدوية VETRA" : "VETRA medication library"}
                              </div>
                              {matchingMedications.map((med) => (
                                <button
                                  key={med.id}
                                  type="button"
                                  onClick={() => addMedication(med.id)}
                                  className={`flex w-full items-center justify-between gap-3 border-b px-3 py-3 text-left last:border-b-0 ${darkMode ? "border-slate-800 hover:bg-slate-800" : "border-slate-100 hover:bg-blue-50"}`}
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold">{med.name}</span>
                                    {med.active_ingredient && <span className="mt-0.5 block truncate text-xs text-slate-500">{med.active_ingredient}</span>}
                                  </span>
                                  <span className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white">{language === "ar" ? "+ إضافة" : "+ Add"}</span>
                                </button>
                              ))}
                            </>
                          )}

                          {matchingMedications.length === 0 && (
                            <div className={`px-3 py-2 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                              {language === "ar" ? "لا توجد نتيجة مطابقة في مكتبة VETRA." : "No matching result in VETRA's library."}
                            </div>
                          )}

                          <section className={`border-b px-3 py-3 ${darkMode ? "border-slate-800" : "border-slate-100"}`}>
                            <div className={`mb-2 text-[11px] font-bold uppercase tracking-wide ${darkMode ? "text-emerald-300" : "text-emerald-700"}`}>
                              {language === "ar" ? "مرجع بيطري — BSAVA" : "Veterinary reference — BSAVA"}
                            </div>
                            <BSAVAFormularyPicker
                              language={language}
                              darkMode={darkMode}
                              petSpecies={petDetails?.species}
                              weightKg={weight ? Number(weight) : null}
                              drafts={formularyDrafts}
                              onChange={setFormularyDrafts}
                              searchQuery={medicationSearch}
                              onSearchQueryChange={setMedicationSearch}
                              hideSearchInput
                              hideDrafts
                            />
                          </section>

                          <div className={`sticky top-0 z-10 flex items-center justify-between gap-3 border-y px-3 py-2 text-[11px] font-bold uppercase tracking-wide ${darkMode ? "border-slate-800 bg-slate-900 text-sky-300" : "border-slate-100 bg-sky-50 text-sky-800"}`}>
                            <span>DrugEye</span>
                            <span className="font-medium normal-case tracking-normal">
                              {query.length < 2
                                ? (language === "ar" ? "اكتب حرفين على الأقل" : "Type at least 2 characters")
                                : drugEyeLoading
                                  ? (language === "ar" ? "جاري البحث…" : "Searching…")
                                  : drugEyeResultQuery === query && !drugEyeError
                                    ? `${drugEyeResults.length} ${language === "ar" ? "نتيجة" : "results"}`
                                    : ""}
                            </span>
                          </div>

                          {query.length >= 2 && drugEyeLoading && drugEyeResultQuery !== query && (
                            <div className={`px-3 py-3 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                              {language === "ar" ? "بنبحث في DrugEye…" : "Searching DrugEye…"}
                            </div>
                          )}

                          {drugEyeResultQuery === query && Boolean(drugEyeError) && (
                            <div className="px-3 py-3 text-sm text-rose-600">
                              {language === "ar" ? "تعذر البحث في DrugEye: " : "DrugEye search failed: "}{drugEyeError}
                            </div>
                          )}

                          {query.length >= 2 && drugEyeResultQuery === query && !drugEyeLoading && !drugEyeError && drugEyeResults.length === 0 && (
                            <div className={`px-3 py-3 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                              {language === "ar" ? "لا توجد نتائج من DrugEye لهذا البحث." : "No DrugEye results for this search."}
                            </div>
                          )}

                          <DrugEyeProductLinks
                            results={drugEyeResultQuery === query ? drugEyeResults : []}
                            language={language}
                            darkMode={darkMode}
                            medications={medications}
                            petSpecies={petDetails?.species}
                            weightKg={weight.trim() ? Number(weight) : null}
                            onAddMedication={addMedication}
                            onAddBsavaDraft={(draft) => {
                              const duplicate = formularyDrafts.some((item) => item.drugId === draft.drugId && item.route === draft.route && item.doseExpression === draft.doseExpression);
                              if (duplicate) return false;
                              setFormularyDrafts([...formularyDrafts, draft]);
                              return true;
                            }}
                            onAddManualDraft={onAddManualExternalMedication}
                          />

                          <div className={`border-t px-3 py-2 text-[11px] leading-5 ${darkMode ? "border-slate-800 text-slate-400" : "border-slate-100 text-slate-500"}`}>
                            {language === "ar"
                              ? "لو فيه بروتوكول BSAVA مناسب، احسب الجرعة بوزن الحيوان؛ ولو مفيش، سجّل جرعة يدوية يحددها الطبيب."
                              : "Use a compatible BSAVA protocol for weight-based calculation; otherwise record a clinician-entered manual dose."}
                          </div>
                        </div>
                      )}
                    </div>

                    {medicationDrafts.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {medicationDrafts.map((draft) => {
                          const med = medications.find((item) => item.id === draft.medication_id);
                          const outside = (med?.dose_min != null && draft.dose_per_kg != null && draft.dose_per_kg < Number(med.dose_min)) || (med?.dose_max != null && draft.dose_per_kg != null && draft.dose_per_kg > Number(med.dose_max));
                          return (
                            <div key={draft.id} className={`rounded-xl border px-3 py-2.5 ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-bold">{med?.name || "Medication"}</div>
                                  <div className={`mt-1 text-xs leading-5 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                                    {language === "ar" ? "الجرعة:" : "Dose:"} {draft.calculated_dose} {draft.calculated_dose_unit}{draft.calculated_volume != null ? ` • ${draft.calculated_volume} ${draft.volume_unit}` : ""}{draft.route ? ` • ${draft.route}` : ""}{draft.frequency ? ` • ${draft.frequency}` : ""}{draft.duration_days ? ` • ${draft.duration_days} ${language === "ar" ? "يوم" : "days"}` : ""}
                                  </div>
                                  {outside && <div className="mt-1 text-xs font-bold text-amber-600">⚠ {language === "ar" ? "الجرعة خارج النطاق المسجل للدواء." : "Dose is outside the configured protocol range."}</div>}
                                </div>
                                <button type="button" aria-label={language === "ar" ? "حذف الدواء" : "Remove medication"} onClick={() => removeMedication(draft.id)} className="rounded-lg px-2 py-1 text-rose-500 hover:bg-rose-50">✕</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {formularyDrafts.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className={`text-[11px] font-bold uppercase tracking-wide ${darkMode ? "text-emerald-300" : "text-emerald-700"}`}>
                          {language === "ar" ? "أدوية البروتوكول البيطري (BSAVA)" : "Veterinary protocol medications (BSAVA)"}
                        </div>
                        {formularyDrafts.map((draft) => (
                          <div key={draft.id} className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 ${darkMode ? "border-emerald-900/60 bg-slate-900" : "border-emerald-200 bg-white"}`}>
                            <div className="min-w-0">
                              <div className="text-sm font-bold">{draft.drugName}</div>
                              {draft.activeIngredient && <div className="mt-0.5 text-xs text-slate-500">{draft.activeIngredient}</div>}
                              <div className="mt-1 text-xs leading-5 text-slate-500">
                                {language === "ar" ? "الجرعة:" : "Dose:"} {draft.appliedDose || "—"} {draft.adminDoseUnit || draft.doseUnit}
                                {draft.route ? ` · ${draft.route}` : ""}
                                {draft.frequency ? ` · ${draft.frequency}` : ""}
                              </div>
                            </div>
                            <button type="button" aria-label={language === "ar" ? "حذف دواء BSAVA" : "Remove BSAVA medication"} onClick={() => setFormularyDrafts((current) => current.filter((item) => item.id !== draft.id))} className="rounded-lg px-2 py-1 text-rose-500 hover:bg-rose-50">×</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {externalMedicationDrafts.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className={`text-[11px] font-bold uppercase tracking-wide ${darkMode ? "text-amber-300" : "text-amber-700"}`}>
                          {language === "ar" ? "أدوية DrugEye وأدوية العيادة اليدوية" : "DrugEye and manually entered clinic medications"}
                        </div>
                        {externalMedicationDrafts.map((draft) => (
                          <div key={draft.id} className={`rounded-xl border px-3 py-2.5 ${darkMode ? "border-amber-900/70 bg-slate-900" : "border-amber-200 bg-amber-50/50"}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-bold">{draft.productName}</div>
                                {draft.activeIngredient && <div className="mt-0.5 text-xs text-slate-500">{draft.activeIngredient}</div>}
                                <div className="mt-1 text-xs leading-5">{language === "ar" ? "الجرعة اليدوية:" : "Manual dose:"} {draft.doseText}{draft.route ? ` · ${draft.route}` : ""}{draft.frequency ? ` · ${draft.frequency}` : ""}{draft.duration ? ` · ${draft.duration}` : ""}</div>
                                {draft.instructions && <div className="mt-1 text-xs text-slate-500">{draft.instructions}</div>}
                                <div className="mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">{language === "ar" ? "راجع الوحدات والجرعة قبل حفظ الكشف — لا يوجد حساب تلقائي لهذا الإدخال." : "Verify dose and units before saving — no automatic calculation for this entry."}</div>
                              </div>
                              <button type="button" aria-label={language === "ar" ? "حذف العلاج الخارجي" : "Remove external medication"} onClick={() => onRemoveManualExternalMedication(draft.id)} className="rounded-lg px-2 py-1 text-rose-500 hover:bg-rose-50">✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 border-t pt-3" style={{ borderColor: darkMode ? "#334155" : "#e2e8f0" }}>
                      <button
                        type="button"
                        onClick={() => setShowTreatmentNotes((value) => !value)}
                        className={`text-xs font-semibold ${darkMode ? "text-blue-300 hover:text-blue-200" : "text-blue-700 hover:text-blue-800"}`}
                      >
                        {showTreatmentNotes
                          ? (language === "ar" ? "− إخفاء ملاحظات العلاج" : "− Hide treatment note")
                          : (language === "ar" ? "+ إضافة ملاحظات علاج اختيارية" : "+ Add optional treatment note")}
                      </button>
                      {showTreatmentNotes && (
                        <div className="mt-2">
                          <label className={`mb-1.5 block text-xs font-medium ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                            {language === "ar" ? "خطة علاج أو تعليمات إضافية (اختياري)" : "Additional treatment plan / instructions (optional)"}
                          </label>
                          <textarea
                            rows={2}
                            value={treatment}
                            onChange={(e) => setTreatment(e.target.value)}
                            placeholder={language === "ar" ? "اكتب أي تعليمات إضافية غير موجودة في الأدوية المضافة..." : "Add instructions not covered by the selected medications..."}
                            className={`w-full resize-y rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 ${darkMode ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"}`}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3">
                    <button type="button" onClick={() => { setManualEntryOpen((open) => !open); setManualDrugName(medicationSearch.trim()); }} className={`text-xs font-semibold ${darkMode ? "text-cyan-300" : "text-cyan-700"}`}>
                      {manualEntryOpen ? (language === "ar" ? "− إغلاق إدخال دواء يدوي" : "− Close manual medication") : (language === "ar" ? "+ إضافة دواء غير موجود في المكتبات" : "+ Add a medication not found in the libraries")}
                    </button>
                    {manualEntryOpen && (
                      <div className={`mt-2 grid gap-2 rounded-xl border p-3 sm:grid-cols-2 ${darkMode ? "border-slate-700 bg-slate-950/70" : "border-slate-200 bg-white"}`}>
                        <input value={manualDrugName} onChange={(event) => setManualDrugName(event.target.value)} placeholder={language === "ar" ? "اسم الدواء" : "Medication name"} className={`w-full rounded-lg border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`} />
                        <input value={manualDose} onChange={(event) => setManualDose(event.target.value)} placeholder={language === "ar" ? "الجرعة والوحدة" : "Dose and unit"} className={`w-full rounded-lg border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`} />
                        <input value={manualRoute} onChange={(event) => setManualRoute(event.target.value)} placeholder={language === "ar" ? "طريقة الإعطاء (اختياري)" : "Route (optional)"} className={`w-full rounded-lg border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`} />
                        <button type="button" onClick={addManualMedication} className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-bold text-white hover:bg-cyan-700">{language === "ar" ? "إضافة للكشف" : "Add to visit"}</button>
                        <p className="sm:col-span-2 text-[11px] text-slate-500">{language === "ar" ? "سيُضاف كدواء من العيادة ويُسعّر بسعر الحقنة الافتراضي، ويمكن تعديل سعره في بنود الفاتورة." : "Added as a clinic medication at the default injection fee; adjust its price in the bill items."}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label className={`block text-sm font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{language === "ar" ? "التطعيمات" : "Vaccinations"}</label>
                    <button type="button" onClick={addVaccination} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">+ {language === "ar" ? "إضافة تطعيم" : "Add vaccine"}</button>
                  </div>
                  {vaccinations.length === 0 ? (
                    <div className={`rounded-2xl border border-dashed p-4 text-xs text-slate-500 ${darkMode ? "border-slate-700" : "border-slate-200"}`}>{language === "ar" ? "لا يوجد تطعيم مضاف لهذه الزيارة." : "No vaccination added to this visit."}</div>
                  ) : (
                    <div className="space-y-3">
                      {vaccinations.map((v) => (
                        <div key={v.id} className={`rounded-2xl border p-4 ${darkMode ? "border-slate-700 bg-slate-950/60" : "border-slate-200 bg-slate-50"}`}>
                          <div className="grid gap-3 md:grid-cols-2">
                            <input value={v.vaccine_name} onChange={(e) => updateVaccination(v.id,{vaccine_name:e.target.value})} placeholder={language === "ar" ? "اسم المستحضر / التطعيم" : "Vaccine / product name"} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <select value={v.vaccine_type} onChange={(e) => updateVaccination(v.id,{vaccine_type:e.target.value})} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>
                              <option value="">{language === "ar" ? "اختار نوع البروتوكول" : "Select protocol type"}</option>
                              <option value="Viral">{language === "ar" ? "التطعيم الفيروسي (ثلاثي / رباعي)" : "Viral (trivalent / quadrivalent)"}</option>
                              <option value="Rabies">{language === "ar" ? "السعار" : "Rabies"}</option>
                              <option value="Deworming">{language === "ar" ? "مضاد الديدان" : "Deworming"}</option>
                              <option value="External parasites">{language === "ar" ? "البراغيث والقراد / الطفيليات الخارجية" : "Fleas / ticks / external parasites"}</option>
                              <option value="Other">{language === "ar" ? "نوع آخر (يدوي)" : "Other (manual)"}</option>
                            </select>
                            <select value={v.dose_stage} onChange={(e) => updateVaccination(v.id,{dose_stage:e.target.value})} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>
                              {getVaccinationStageOptions(v.vaccine_type).map((stage) => (
                                <option key={stage.value} value={stage.value}>{language === "ar" ? stage.ar : stage.en}</option>
                              ))}
                            </select>
                            <input type="datetime-local" value={v.administered_at} onChange={(e) => updateVaccination(v.id,{administered_at:e.target.value})} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <div>
                              <input type="datetime-local" value={v.next_dose_at} onChange={(e) => updateVaccination(v.id,{next_dose_at:e.target.value})} className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                              <div className={`mt-1 flex items-center justify-between gap-2 text-[11px] ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                                <span>{v.next_dose_manual
                                  ? (language === "ar" ? "موعد مخصص — تم تعديله يدويًا" : "Custom date — manually edited")
                                  : calculateNextVaccinationDose(v.vaccine_type, v.dose_stage, v.administered_at)
                                    ? (language === "ar" ? "موعد مقترح حسب البروتوكول، ويمكن تعديله" : "Suggested by protocol; editable")
                                    : (language === "ar" ? "لا يوجد موعد تلقائي ثابت — أدخله عند الحاجة" : "No fixed automatic date — enter one when needed")}</span>
                                {v.next_dose_manual && v.vaccine_type && v.dose_stage !== "manual" && (
                                  <button type="button" onClick={() => resetVaccinationNextDoseToAutomatic(v.id)} className="shrink-0 font-bold text-blue-500 hover:text-blue-600">
                                    {language === "ar" ? "إعادة الحساب" : "Reset auto date"}
                                  </button>
                                )}
                              </div>
                            </div>
                            <input value={v.dose} onChange={(e) => updateVaccination(v.id,{dose:e.target.value})} placeholder={language === "ar" ? "الجرعة" : "Dose"} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <input value={v.route} onChange={(e) => updateVaccination(v.id,{route:e.target.value})} placeholder={language === "ar" ? "طريقة الإعطاء" : "Route"} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <input value={v.batch_number} onChange={(e) => updateVaccination(v.id,{batch_number:e.target.value})} placeholder={language === "ar" ? "رقم التشغيلة" : "Batch number"} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <input value={v.manufacturer} onChange={(e) => updateVaccination(v.id,{manufacturer:e.target.value})} placeholder={language === "ar" ? "الشركة المصنعة" : "Manufacturer"} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <textarea value={v.notes} onChange={(e) => updateVaccination(v.id,{notes:e.target.value})} placeholder={language === "ar" ? "ملاحظات التطعيم" : "Vaccination notes"} className={`md:col-span-2 rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                          </div>
                          <button type="button" onClick={() => removeVaccination(v.id)} className="mt-3 text-xs font-bold text-rose-500">{language === "ar" ? "حذف التطعيم" : "Remove vaccine"}</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>


                <div className="lg:col-span-2">
                  <label
                    className={`mb-2 block text-sm font-semibold ${
                      darkMode
                        ? "text-slate-300"
                        : "text-slate-700"
                    }`}
                  >
                    {t.visitNotes}
                  </label>

                  <textarea
                    rows={3}
                    value={visitNotes}
                    onChange={(e) =>
                      setVisitNotes(e.target.value)
                    }
                    placeholder={t.visitNotesPlaceholder}
                    className={`w-full resize-none rounded-xl border px-4 py-3 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                      darkMode
                        ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                        : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                    }`}
                  />
                </div>

                <div className="lg:col-span-2">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label
                      className={`block text-sm font-semibold ${
                        darkMode ? "text-slate-300" : "text-slate-700"
                      }`}
                    >
                      {t.followUp}
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[
                      ["none", t.followUpNone],
                      ["3d", t.followUp3Days],
                      ["1w", t.followUp1Week],
                      ["2w", t.followUp2Weeks],
                      ["1m", t.followUp1Month],
                      ["custom", t.followUpCustom],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFollowUp(key)}
                        className={`rounded-full border px-4 py-2 text-xs font-bold transition-all ${
                          followUp === key
                            ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                            : darkMode
                            ? "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {followUp === "custom" && (
                    <input
                      value={followUpDetails}
                      onChange={(e) => setFollowUpDetails(e.target.value)}
                      placeholder={t.followUpPlaceholder}
                      className={`mt-3 w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                        darkMode
                          ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                          : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                      }`}
                    />
                  )}
                </div>  </>);
}
