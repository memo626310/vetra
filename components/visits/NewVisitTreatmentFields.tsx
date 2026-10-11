import { BSAVAFormularyPicker, type FormularyVisitDraft } from "@/components/BSAVAFormularyPicker";
import type { Language, Medication, MedicationDraft, PetDetails, VaccinationDraft, VisitTranslations } from "./new-visit-types";
import { getVaccinationStageOptions, calculateNextVaccinationDose } from "./new-visit-utils";

type Props = {
  language: Language;
  darkMode: boolean;
  t: VisitTranslations;
  petDetails: PetDetails;
  weight: string;
  formularyDrafts: FormularyVisitDraft[];
  setFormularyDrafts: (value: FormularyVisitDraft[]) => void;
  medicationSearch: string;
  setMedicationSearch: (value: string) => void;
  selectedMedicationId: string;
  setSelectedMedicationId: (value: string) => void;
  filteredMedications: Medication[];
  addMedication: () => void;
  medications: Medication[];
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
  language, darkMode, t, petDetails, weight, formularyDrafts, setFormularyDrafts,
  medicationSearch, setMedicationSearch, selectedMedicationId, setSelectedMedicationId,
  filteredMedications, addMedication, medications, medicationDrafts, removeMedication,
  treatment, setTreatment, vaccinations, addVaccination, updateVaccination, removeVaccination,
  resetVaccinationNextDoseToAutomatic, visitNotes, setVisitNotes, followUp, setFollowUp,
  followUpDetails, setFollowUpDetails,
}: Props) {
  return (<>
                <div className="lg:col-span-2">
                  <BSAVAFormularyPicker
                    language={language}
                    darkMode={darkMode}
                    petSpecies={petDetails?.species}
                    weightKg={weight ? Number(weight) : null}
                    drafts={formularyDrafts}
                    onChange={setFormularyDrafts}
                  />
                </div>
                <div className="lg:col-span-2">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <label className={`block text-sm font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{t.treatment}</label>
                    <span className="rounded-full bg-blue-500/10 px-3 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-300">Medication Library + dose calculator</span>
                  </div>

                  <div className={`rounded-2xl border p-4 ${darkMode ? "border-slate-700 bg-slate-950/60" : "border-slate-200 bg-slate-50"}`}>
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <div>
                        <input value={medicationSearch} onChange={(e) => setMedicationSearch(e.target.value)} placeholder={language === "ar" ? "ابحث عن دواء..." : "Search medication..."} className={`mb-2 w-full rounded-xl border px-3 py-2 text-sm outline-none ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`} />
                        <select value={selectedMedicationId} onChange={(e) => setSelectedMedicationId(e.target.value)} className={`w-full rounded-xl border px-3 py-3 text-sm outline-none ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`}>
                          <option value="">{language === "ar" ? "اختار دواء من المكتبة" : "Select medication from library"}</option>
                          {filteredMedications.map((med) => (
                            <option key={med.id} value={med.id}>{med.name}{med.active_ingredient ? ` — ${med.active_ingredient}` : ""}</option>
                          ))}
                        </select>
                      </div>
                      <button type="button" onClick={addMedication} className="self-end rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700">+ {language === "ar" ? "إضافة دواء" : "Add medication"}</button>
                    </div>

                    {medicationDrafts.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {medicationDrafts.map((draft) => {
                          const med = medications.find((item) => item.id === draft.medication_id);
                          const outside = (med?.dose_min != null && draft.dose_per_kg != null && draft.dose_per_kg < Number(med.dose_min)) || (med?.dose_max != null && draft.dose_per_kg != null && draft.dose_per_kg > Number(med.dose_max));
                          return (
                            <div key={draft.id} className={`rounded-xl border p-3 ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-bold">{med?.name || "Medication"}</div>
                                  <div className="mt-1 text-xs text-slate-500">Dose: {draft.calculated_dose} {draft.calculated_dose_unit}{draft.calculated_volume != null ? ` • ${draft.calculated_volume} ${draft.volume_unit}` : ""} {draft.route ? ` • ${draft.route}` : ""} {draft.frequency ? ` • ${draft.frequency}` : ""} {draft.duration_days ? ` • ${draft.duration_days} days` : ""}</div>
                                  {outside && <div className="mt-1 text-xs font-bold text-amber-600">⚠ Dose is outside the configured protocol range.</div>}
                                </div>
                                <button type="button" onClick={() => removeMedication(draft.id)} className="rounded-lg px-2 py-1 text-rose-500 hover:bg-rose-50">✕</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <textarea rows={4} value={treatment} onChange={(e) => setTreatment(e.target.value)} placeholder={t.treatmentPlaceholder} className={`mt-4 w-full resize-none rounded-xl border px-4 py-3 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${darkMode ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"}`} />
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
