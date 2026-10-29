"use client";

import { useEffect, useState } from "react";
import { BSAVAFormularyPicker, createBsavaVisitDraft, type FormularyVisitDraft } from "@/components/BSAVAFormularyPicker";
import type { ExternalMedicationDraft, Language, Medication, MedicationDraft, PetDetails } from "./new-visit-types";
import NewVisitCommonConditions from "./NewVisitCommonConditions";
import DrugEyeProductLinks from "./DrugEyeProductLinks";
import VetToolsDrawer from "./VetToolsDrawer";

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
  petDetails: PetDetails;
  weight: string;
  medications: Medication[];
  medicationDrafts: MedicationDraft[];
  formularyDrafts: FormularyVisitDraft[];
  setFormularyDrafts: (value: FormularyVisitDraft[] | ((current: FormularyVisitDraft[]) => FormularyVisitDraft[])) => void;
  externalMedicationDrafts: ExternalMedicationDraft[];
  onAddManualExternalMedication: (draft: ExternalMedicationDraft) => void;
  addMedication: (medicationId?: string) => boolean;
  message: string;
  setMessage: (message: string) => void;
};

export default function NewVisitVetTools({ clinicId, language, darkMode, petDetails, weight, medications, medicationDrafts, formularyDrafts, setFormularyDrafts, externalMedicationDrafts, onAddManualExternalMedication, addMedication, message, setMessage }: Props) {
  const [drugEyeResults, setDrugEyeResults] = useState<DrugEyeResult[]>([]);
  const [drugEyeLoading, setDrugEyeLoading] = useState(false);
  const [drugEyeError, setDrugEyeError] = useState("");
  const [drugEyeResultQuery, setDrugEyeResultQuery] = useState("");
  const [vetToolsOpen, setVetToolsOpen] = useState(false);
  const [vetToolsSearch, setVetToolsSearch] = useState("");
  const toolsQuery = vetToolsSearch.trim().replace(/\s+/g, " ");

  function resetDrugEyeResults() {
    setDrugEyeError("");
    setDrugEyeResults([]);
    setDrugEyeResultQuery("");
    setDrugEyeLoading(false);
  }

  function updateVetToolsSearch(value: string) {
    setVetToolsSearch(value);
    resetDrugEyeResults();
  }

  function handleVetToolsOpenChange(open: boolean) {
    setVetToolsOpen(open);
    if (!open) resetDrugEyeResults();
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

  useEffect(() => {
    const normalizedQuery = vetToolsSearch.trim().replace(/\s+/g, " ");
    const controller = new AbortController();

    if (!vetToolsOpen || normalizedQuery.length < 2) {
      return () => controller.abort();
    }

    const timer = setTimeout(async () => {
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
      clearTimeout(timer);
      controller.abort();
    };
  }, [vetToolsSearch, vetToolsOpen]);

  return (
                <VetToolsDrawer language={language} darkMode={darkMode} onOpenChange={handleVetToolsOpenChange}>{(activeTool) => <>
                  {message && <p role="status" className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-white/10 text-slate-300" : "border-slate-200 text-slate-700"}`}>{message}</p>}
                  <p role="status" className="text-xs text-slate-500">{language === "ar" ? "الأدوية المضافة للزيارة:" : "Medications added to visit:"} {medicationDrafts.length + formularyDrafts.length + externalMedicationDrafts.length}</p>
                  <section hidden={activeTool !== "common"} aria-label="Common Conditions">
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
                  </section>
                  <div hidden={activeTool === "common"}>
                    <label htmlFor="vet-tools-search" className="mb-2 block text-sm font-bold">{language === "ar" ? "البحث في BSAVA وDrugEye" : "Search BSAVA and DrugEye"}</label>
                    <input id="vet-tools-search" type="search" value={vetToolsSearch} onChange={(event) => updateVetToolsSearch(event.target.value)} placeholder={language === "ar" ? "اكتب اسم الدواء أو المادة الفعالة..." : "Medication name or active ingredient..."} autoComplete="off" className={`w-full min-w-0 rounded-xl border px-3 py-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 ${darkMode ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500" : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"}`} />
                    {!toolsQuery && <p className="mt-2 text-xs text-slate-500">{language === "ar" ? "اكتب اسم الدواء للبحث. تُحسب جرعات BSAVA حسب وزن الحيوان وطريق الإعطاء." : "Enter a medication to search. BSAVA doses use the pet's weight and administration route."}</p>}
                  </div>
                  <div hidden={activeTool === "common"} className={`overflow-hidden rounded-2xl border ${darkMode ? "border-slate-700" : "border-slate-200"}`}>
                          <section hidden={activeTool !== "bsava"} className={`border-b px-3 py-3 ${darkMode ? "border-slate-800" : "border-slate-100"}`}>
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
                              searchQuery={vetToolsSearch}
                              onSearchQueryChange={updateVetToolsSearch}
                              hideSearchInput
                              hideDrafts
                            />
                          </section>

                          <section hidden={activeTool !== "drugeye"} aria-label="DrugEye">
                          <div className={`flex items-center justify-between gap-3 border-y px-3 py-2 text-[11px] font-bold uppercase tracking-wide ${darkMode ? "border-slate-800 bg-slate-900 text-sky-300" : "border-slate-100 bg-sky-50 text-sky-800"}`}>
                            <span>DrugEye</span>
                            <span className="font-medium normal-case tracking-normal">
                              {toolsQuery.length < 2
                                ? (language === "ar" ? "اكتب حرفين على الأقل" : "Type at least 2 characters")
                                : drugEyeLoading
                                  ? (language === "ar" ? "جاري البحث…" : "Searching…")
                                  : drugEyeResultQuery === toolsQuery && !drugEyeError
                                    ? `${drugEyeResults.length} ${language === "ar" ? "نتيجة" : "results"}`
                                    : ""}
                            </span>
                          </div>

                          {toolsQuery.length >= 2 && drugEyeLoading && drugEyeResultQuery !== toolsQuery && (
                            <div className={`px-3 py-3 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                              {language === "ar" ? "بنبحث في DrugEye…" : "Searching DrugEye…"}
                            </div>
                          )}

                          {drugEyeResultQuery === toolsQuery && Boolean(drugEyeError) && (
                            <div className="px-3 py-3 text-sm text-rose-600">
                              {language === "ar" ? "تعذر البحث في DrugEye: " : "DrugEye search failed: "}{drugEyeError}
                            </div>
                          )}

                          {toolsQuery.length >= 2 && drugEyeResultQuery === toolsQuery && !drugEyeLoading && !drugEyeError && drugEyeResults.length === 0 && (
                            <div className={`px-3 py-3 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                              {language === "ar" ? "لا توجد نتائج من DrugEye لهذا البحث." : "No DrugEye results for this search."}
                            </div>
                          )}

                          <DrugEyeProductLinks
                            results={drugEyeResultQuery === toolsQuery ? drugEyeResults : []}
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
                            onAddManualDraft={(draft) => onAddManualExternalMedication({ ...draft, category: "human" })}
                          />

                          <div className={`border-t px-3 py-2 text-[11px] leading-5 ${darkMode ? "border-slate-800 text-slate-400" : "border-slate-100 text-slate-500"}`}>
                            {language === "ar"
                              ? "لو فيه بروتوكول BSAVA مناسب، احسب الجرعة بوزن الحيوان؛ ولو مفيش، سجّل جرعة يدوية يحددها الطبيب."
                              : "Use a compatible BSAVA protocol for weight-based calculation; otherwise record a clinician-entered manual dose."}
                          </div>

                          </section>
                  </div>
                </>}</VetToolsDrawer>
  );
}
