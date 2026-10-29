import { useState } from "react";
import HumanPrescriptionEditor from "./HumanPrescriptionEditor";
import type { FormularyVisitDraft } from "@/components/BSAVAFormularyPicker";
import type { ExternalMedicationDraft, Language, Medication, MedicationDraft, VaccinationDraft, VisitTranslations } from "./new-visit-types";
import { getVaccinationStageOptions, calculateNextVaccinationDose } from "./new-visit-utils";
type VaccineStockProduct = { id: string; name: string; quantity: number; unit: string | null; retail_price: number };
type ClinicStockProduct = VaccineStockProduct & { active_ingredient: string | null; barcode?: string | null };
type DrawerMedication = { id: string; product_id: string; quantity: number };

type Props = {
  clinicId: string;
  onUpdateExternalMedication: (id: string, patch: Partial<ExternalMedicationDraft>) => void;
  onSaveExternalMedication: (draft: ExternalMedicationDraft) => string;
  language: Language;
  darkMode: boolean;
  t: VisitTranslations;
  weight: string;
  formularyDrafts: FormularyVisitDraft[];
  setFormularyDrafts: (value: FormularyVisitDraft[] | ((current: FormularyVisitDraft[]) => FormularyVisitDraft[])) => void;
  externalMedicationDrafts: ExternalMedicationDraft[];
  onAddManualExternalMedication: (draft: ExternalMedicationDraft) => void;
  onRemoveManualExternalMedication: (id: string) => void;
  medications: Medication[];
  setMessage: (value: string) => void;
  medicationDrafts: MedicationDraft[];
  removeMedication: (id: string) => void;
  treatment: string;
  setTreatment: (value: string) => void;
  vaccinations: VaccinationDraft[];
  vaccineStockProducts: VaccineStockProduct[];
  vaccineProductMappings: Record<string, string[]>;
  clinicStockProducts: ClinicStockProduct[];
  drawerMedications: DrawerMedication[];
  setDrawerMedications: (value: DrawerMedication[] | ((current: DrawerMedication[]) => DrawerMedication[])) => void;
  addVaccination: () => void;
  updateVaccination: (id: string, patch: Partial<VaccinationDraft>) => void;
  removeVaccination: (id: string) => void;
  resetVaccinationNextDoseToAutomatic: (id: string) => void;
  vaccinationIsSaved?: (id: string) => boolean;
  canViewVaccination?: boolean;
  canAddVaccination?: boolean;
  canEditVaccination?: boolean;
  canDeleteVaccination?: boolean;
  visitNotes: string;
  setVisitNotes: (value: string) => void;
  followUp: string;
  setFollowUp: (value: string) => void;
  followUpDetails: string;
  setFollowUpDetails: (value: string) => void;
};

export default function NewVisitTreatmentFields({
  clinicId, language, darkMode, t, formularyDrafts, setFormularyDrafts,
  externalMedicationDrafts, onAddManualExternalMedication, onRemoveManualExternalMedication, onUpdateExternalMedication, onSaveExternalMedication,
  medications, medicationDrafts, removeMedication,
  treatment, setTreatment, vaccinations, addVaccination, updateVaccination, removeVaccination,
  vaccineStockProducts, vaccineProductMappings,
  clinicStockProducts,
  drawerMedications, setDrawerMedications,
  resetVaccinationNextDoseToAutomatic, visitNotes, setVisitNotes, followUp, setFollowUp,
  followUpDetails, setFollowUpDetails, canViewVaccination = false, canAddVaccination = false, canEditVaccination = false, canDeleteVaccination = false, vaccinationIsSaved = () => true,
}: Props) {
  const [showTreatmentNotes, setShowTreatmentNotes] = useState(Boolean(treatment));
  const [drawerSearch, setDrawerSearch] = useState("");
  const matchingDrawerProducts = clinicStockProducts.filter((product) => {
    const search = drawerSearch.trim().toLocaleLowerCase();
    return !search || product.name.toLocaleLowerCase().includes(search) || (product.active_ingredient || "").toLocaleLowerCase().includes(search) || (product.barcode || "").toLocaleLowerCase().includes(search);
  }).slice(0, 20);

  return (<>
                <details className={`group rounded-2xl border lg:col-span-2 ${darkMode ? "border-slate-700 bg-slate-950/60" : "border-slate-200 bg-white"}`}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 text-lg font-bold focus-visible:outline-2 focus-visible:outline-cyan-500 [&::-webkit-details-marker]:hidden">
                    <span>{language === "ar" ? "الروشتة — Prescription" : "Prescription"}</span>
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0 text-cyan-600 transition-transform group-open:rotate-180"><path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /></svg>
                  </summary>
                  <div className="space-y-4 px-3 pb-4 sm:px-4">
                  <HumanPrescriptionEditor clinicId={clinicId} language={language} darkMode={darkMode} drafts={externalMedicationDrafts} onAdd={onAddManualExternalMedication} onUpdate={onUpdateExternalMedication} onSave={onSaveExternalMedication} onRemove={onRemoveManualExternalMedication} />
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
                </details>

                <div className="lg:col-span-2">
                  <section className={`mb-4 rounded-xl border p-3 ${darkMode ? "border-cyan-900/60 bg-slate-950/60" : "border-cyan-200 bg-cyan-50/40"}`}>
                    <div className="mb-2 text-sm font-bold">{language === "ar" ? "درج الأدوية" : "Medication drawer"}</div>
                    <input value={drawerSearch} onChange={(event) => setDrawerSearch(event.target.value)} placeholder={language === "ar" ? "ابحث بالاسم أو المادة الفعالة أو الباركود" : "Search name, active ingredient, or barcode"} className={`mb-2 w-full rounded-lg border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                    <div className="flex gap-2"><select value="" onChange={(event) => {
                      const product = clinicStockProducts.find((item) => item.id === event.target.value);
                      if (!product || drawerMedications.some((item) => item.product_id === product.id)) return;
                      setDrawerMedications((current) => [...current, { id: crypto.randomUUID(), product_id: product.id, quantity: 1 }]);
                      setDrawerSearch("");
                    }} className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>
                      <option value="">{language === "ar" ? "اختار دواء من العيادة" : "Select a clinic medication"}</option>
                      {matchingDrawerProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.quantity} {product.unit || ""}</option>)}
                    </select></div>
                    {drawerMedications.length > 0 && <div className="mt-2 space-y-2">{drawerMedications.map((item) => {
                      const product = clinicStockProducts.find((candidate) => candidate.id === item.product_id);
                      if (!product) return null;
                      return <div key={item.id} className={`grid grid-cols-[minmax(0,1fr)_100px_36px] items-center gap-2 rounded-lg border p-2 ${darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
                        <div className="min-w-0"><div className="truncate text-sm font-semibold">{product.name}</div><div className="text-xs text-slate-500">{language === "ar" ? "المتاح" : "Available"}: {product.quantity} {product.unit || ""}</div></div>
                        <input type="number" min="1" max={product.quantity} step="1" value={item.quantity} aria-label={language === "ar" ? `كمية صرف ${product.name}` : `Quantity for ${product.name}`} onChange={(event) => setDrawerMedications((current) => current.map((row) => row.id === item.id ? { ...row, quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) } : row))} className={`w-full rounded-lg border px-2 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white"}`} />
                        <button type="button" aria-label={language === "ar" ? "إزالة الدواء" : "Remove medication"} onClick={() => setDrawerMedications((current) => current.filter((row) => row.id !== item.id))} className="text-lg text-rose-500">×</button>
                      </div>;
                    })}</div>}
                  </section>

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
                            <div className="min-w-0 flex-1">
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

                    {externalMedicationDrafts.some((draft) => draft.category !== "human") && (
                      <div className="mt-3 space-y-2">
                        <div className={`text-[11px] font-bold uppercase tracking-wide ${darkMode ? "text-amber-300" : "text-amber-700"}`}>
                          {language === "ar" ? "أدوية DrugEye وأدوية العيادة اليدوية" : "DrugEye and manually entered clinic medications"}
                        </div>
                        {externalMedicationDrafts.filter((draft) => draft.category !== "human").map((draft) => (
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

                  {(canViewVaccination || canAddVaccination) && <>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label className={`block text-sm font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{language === "ar" ? "التطعيمات" : "Vaccinations"}</label>
                    {canAddVaccination && <button type="button" onClick={addVaccination} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">+ {language === "ar" ? "إضافة تطعيم" : "Add vaccine"}</button>}
                  </div>
                  {vaccinations.length === 0 ? (
                    <div className={`rounded-2xl border border-dashed p-4 text-xs text-slate-500 ${darkMode ? "border-slate-700" : "border-slate-200"}`}>{language === "ar" ? "لا يوجد تطعيم مضاف لهذه الزيارة." : "No vaccination added to this visit."}</div>
                  ) : (
                    <div className="space-y-3">
                      {vaccinations.filter(v => canViewVaccination || !vaccinationIsSaved(v.id)).map((v) => (
                        <div key={v.id} className={`rounded-2xl border p-4 ${darkMode ? "border-slate-700 bg-slate-950/60" : "border-slate-200 bg-slate-50"}`}>
                          <div className="grid gap-3 md:grid-cols-2">
                            <input disabled={vaccinationIsSaved(v.id) ? !canEditVaccination : !canAddVaccination} value={v.vaccine_name} onChange={(e) => updateVaccination(v.id,{vaccine_name:e.target.value, product_id:null})} placeholder={language === "ar" ? "اسم المستحضر / التطعيم" : "Vaccine / product name"} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <select disabled={vaccinationIsSaved(v.id) ? !canEditVaccination : !canAddVaccination} value={v.vaccine_type} onChange={(e) => updateVaccination(v.id,{vaccine_type:e.target.value})} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>
                              <option value="">{language === "ar" ? "اختار نوع البروتوكول" : "Select protocol type"}</option>
                              <option value="Viral">{language === "ar" ? "التطعيم الفيروسي (ثلاثي / رباعي)" : "Viral (trivalent / quadrivalent)"}</option>
                              <option value="Rabies">{language === "ar" ? "السعار" : "Rabies"}</option>
                              <option value="Deworming">{language === "ar" ? "مضاد الديدان" : "Deworming"}</option>
                              <option value="External parasites">{language === "ar" ? "البراغيث والقراد / الطفيليات الخارجية" : "Fleas / ticks / external parasites"}</option>
                              <option value="Other">{language === "ar" ? "نوع آخر (يدوي)" : "Other (manual)"}</option>
                            </select>
                            {(() => {
                              const typeKey = v.vaccine_type.toLowerCase();
                              const protocolKey = typeKey.includes("deworm") ? "deworm"
                                : typeKey.includes("external") || typeKey.includes("parasite") ? "parasite"
                                : typeKey.includes("rabies") ? "rabies"
                                : typeKey.includes("viral") ? "viral" : "";
                              const allowedProductIds = vaccineProductMappings[protocolKey] || [];
                              const options = vaccineStockProducts.filter((product) => allowedProductIds.includes(product.id));
                              if (!protocolKey || options.length === 0) return null;
                              return <label className="block md:col-span-2"><span className="mb-1 block text-xs font-semibold text-slate-500">{language === "ar" ? "منتج المخزون المستخدم" : "Inventory product used"}</span><select disabled={vaccinationIsSaved(v.id) ? !canEditVaccination : !canAddVaccination} value={v.product_id || ""} onChange={(event) => {
                                const product = options.find((item) => item.id === event.target.value);
                                updateVaccination(v.id, { product_id: product?.id || null, vaccine_name: product?.name || v.vaccine_name });
                              }} className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}><option value="">{language === "ar" ? "اختار المنتج" : "Select product"}</option>{options.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.quantity} {product.unit || ""} · {Number(product.retail_price || 0).toFixed(2)} EGP</option>)}</select></label>;
                            })()}
                            {v.product_id && vaccineStockProducts.find((product) => product.id === v.product_id) && (
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 md:col-span-2">
                                {language === "ar" ? "مرتبط بالمخزون:" : "Linked inventory product:"} {vaccineStockProducts.find((product) => product.id === v.product_id)?.name}
                                {" · "}{language === "ar" ? "الرصيد" : "Stock"}: {vaccineStockProducts.find((product) => product.id === v.product_id)?.quantity}
                              </p>
                            )}
                            <select disabled={vaccinationIsSaved(v.id) ? !canEditVaccination : !canAddVaccination} value={v.dose_stage} onChange={(e) => updateVaccination(v.id,{dose_stage:e.target.value})} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>
                              {getVaccinationStageOptions(v.vaccine_type).map((stage) => (
                                <option key={stage.value} value={stage.value}>{language === "ar" ? stage.ar : stage.en}</option>
                              ))}
                            </select>
                            <input disabled={vaccinationIsSaved(v.id) ? !canEditVaccination : !canAddVaccination} type="datetime-local" value={v.administered_at} onChange={(e) => updateVaccination(v.id,{administered_at:e.target.value})} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <div>
                              <input disabled={vaccinationIsSaved(v.id) ? !canEditVaccination : !canAddVaccination} type="datetime-local" value={v.next_dose_at} onChange={(e) => updateVaccination(v.id,{next_dose_at:e.target.value})} className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                              <div className={`mt-1 flex items-center justify-between gap-2 text-[11px] ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                                <span>{v.next_dose_manual
                                  ? (language === "ar" ? "موعد مخصص — تم تعديله يدويًا" : "Custom date — manually edited")
                                  : calculateNextVaccinationDose(v.vaccine_type, v.dose_stage, v.administered_at)
                                    ? (language === "ar" ? "موعد مقترح حسب البروتوكول، ويمكن تعديله" : "Suggested by protocol; editable")
                                    : (language === "ar" ? "لا يوجد موعد تلقائي ثابت — أدخله عند الحاجة" : "No fixed automatic date — enter one when needed")}</span>
                                {v.next_dose_manual && v.vaccine_type && v.dose_stage !== "manual" && (
                                  <button type="button" disabled={vaccinationIsSaved(v.id) ? !canEditVaccination : !canAddVaccination} onClick={() => resetVaccinationNextDoseToAutomatic(v.id)} className="shrink-0 font-bold text-blue-500 hover:text-blue-600">
                                    {language === "ar" ? "إعادة الحساب" : "Reset auto date"}
                                  </button>
                                )}
                              </div>
                            </div>
                            <input disabled={vaccinationIsSaved(v.id) ? !canEditVaccination : !canAddVaccination} value={v.dose} onChange={(e) => updateVaccination(v.id,{dose:e.target.value})} placeholder={language === "ar" ? "الجرعة" : "Dose"} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <input disabled={vaccinationIsSaved(v.id) ? !canEditVaccination : !canAddVaccination} value={v.route} onChange={(e) => updateVaccination(v.id,{route:e.target.value})} placeholder={language === "ar" ? "طريقة الإعطاء" : "Route"} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <input disabled={vaccinationIsSaved(v.id) ? !canEditVaccination : !canAddVaccination} value={v.batch_number} onChange={(e) => updateVaccination(v.id,{batch_number:e.target.value})} placeholder={language === "ar" ? "رقم التشغيلة" : "Batch number"} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <input disabled={vaccinationIsSaved(v.id) ? !canEditVaccination : !canAddVaccination} value={v.manufacturer} onChange={(e) => updateVaccination(v.id,{manufacturer:e.target.value})} placeholder={language === "ar" ? "الشركة المصنعة" : "Manufacturer"} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <textarea disabled={vaccinationIsSaved(v.id) ? !canEditVaccination : !canAddVaccination} value={v.notes} onChange={(e) => updateVaccination(v.id,{notes:e.target.value})} placeholder={language === "ar" ? "ملاحظات التطعيم" : "Vaccination notes"} className={`md:col-span-2 rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                          </div>
                          {(vaccinationIsSaved(v.id) ? canDeleteVaccination : canAddVaccination) && <button type="button" onClick={() => removeVaccination(v.id)} className="mt-3 text-xs font-bold text-rose-500">{language === "ar" ? "حذف التطعيم" : "Remove vaccine"}</button>}
                        </div>
                      ))}
                    </div>
                  )}
                  </>}
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
                </div>

  </>);
}
