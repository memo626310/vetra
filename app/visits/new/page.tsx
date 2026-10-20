"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getClinicDb, getClinicContext } from "@/lib/clinic-db";
import { vetraCore } from "@/lib/vetra-core";
import type { FormularyVisitDraft } from "@/components/BSAVAFormularyPicker";
import type {
  Language, Client, Pet, Visit, Medication, MedicationDraft, ExternalMedicationDraft,
  VaccinationDraft, PetDetails,
} from "@/components/visits/new-visit-types";
import { translations } from "@/components/visits/new-visit-types";
import {
  formatLocalDateTime,
  calculateNextVaccinationDose,
  getDefaultVaccinationStage,
  getVaccinationStageLabel,
} from "@/components/visits/new-visit-utils";
import NewVisitPatientSelector from "@/components/visits/NewVisitPatientSelector";
import NewVisitPatientOverview from "@/components/visits/NewVisitPatientOverview";
import NewVisitClinicalFields from "@/components/visits/NewVisitClinicalFields";
import NewVisitTreatmentFields from "@/components/visits/NewVisitTreatmentFields";
import NewVisitEditorSection from "@/components/visits/NewVisitEditorSection";
import NewVisitHistory from "@/components/visits/NewVisitHistory";
import NewVisitDetailsModal from "@/components/visits/NewVisitDetailsModal";
import NewVisitMedicalRecordsFields, { emptyMedicalRecordDraft, type MedicalRecordDraft } from "@/components/visits/NewVisitMedicalRecordsFields";

type SymptomDraft = { id: string; name: string; days: string };
type VisitServiceDraft = { id: string; name: string; quantity: number; price: number };
type VisitAttachmentDraft = { id: string; file: File; category: "analysis" | "xray" };

export default function NewVisitPage() {
  const router = useRouter();

  const [language, setLanguage] = useState<Language>("en");
  const [darkMode, setDarkMode] = useState(false);

  const [petFromUrl, setPetFromUrl] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [clinicId, setClinicId] = useState("");

  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedPetId, setSelectedPetId] = useState("");

  const [clientSearch, setClientSearch] = useState("");
  const [petSearch, setPetSearch] = useState("");

  const [petDetails, setPetDetails] = useState<PetDetails | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);

  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingPets, setLoadingPets] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [started, setStarted] = useState(false);
  const [showVisitStartModal, setShowVisitStartModal] = useState(false);
  const [visitSource, setVisitSource] = useState<"appointment" | "new_visit">("appointment");
  const [appointmentId, setAppointmentId] = useState("");
  const [appointmentOptions, setAppointmentOptions] = useState<Array<{ id: string; appointment_date: string; start_time: string; reason: string | null }>>([]);
  const [performingDoctor, setPerformingDoctor] = useState("");
  const [groomingType, setGroomingType] = useState("");
  const [consultationFee, setConsultationFee] = useState(0);
  const [symptoms, setSymptoms] = useState<SymptomDraft[]>([]);
  const [visitServices, setVisitServices] = useState<VisitServiceDraft[]>([]);
  const [attachments, setAttachments] = useState<VisitAttachmentDraft[]>([]);

  const [reason, setReason] = useState("");
  const [examStatus, setExamStatus] = useState<"normal" | "abnormal" | "">("");
  const [examination, setExamination] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [followUpDetails, setFollowUpDetails] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [treatment, setTreatment] = useState("");
  const [visitNotes, setVisitNotes] = useState("");

  const [weight, setWeight] = useState("");
  const [temperature, setTemperature] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [respiratoryRate, setRespiratoryRate] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [selectedOldVisit, setSelectedOldVisit] =
    useState<Visit | null>(null);

  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationSearch, setMedicationSearch] = useState("");
  const [selectedMedicationId, setSelectedMedicationId] = useState("");
  const [medicationDrafts, setMedicationDrafts] = useState<MedicationDraft[]>([]);
  const [formularyDrafts, setFormularyDrafts] = useState<FormularyVisitDraft[]>([]);
  const [externalMedicationDrafts, setExternalMedicationDrafts] = useState<ExternalMedicationDraft[]>([]);
  const [vaccinations, setVaccinations] = useState<VaccinationDraft[]>([]);
  const [medicalRecordDraft, setMedicalRecordDraft] = useState<MedicalRecordDraft>(emptyMedicalRecordDraft);

  const t = translations[language];

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem(
      "vetra-language"
    ) as Language | null;

    const savedDarkMode =
      window.localStorage.getItem("vetra-dark-mode") === "true";

    if (savedLanguage === "en" || savedLanguage === "ar") {
      setLanguage(savedLanguage);
    }

    setDarkMode(savedDarkMode);

    const params = new URLSearchParams(window.location.search);
    setPetFromUrl(params.get("pet"));
    const appointmentParam = params.get("appointment");
    if (appointmentParam) {
      setAppointmentId(appointmentParam);
      setVisitSource("appointment");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("vetra-language", language);

    document.documentElement.lang = language;
    document.documentElement.dir =
      language === "ar" ? "rtl" : "ltr";
  }, [language]);

  useEffect(() => {
    window.localStorage.setItem(
      "vetra-dark-mode",
      darkMode ? "true" : "false"
    );

    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    loadClients();
    loadMedications();
  }, []);

  useEffect(() => {
    if (!selectedClientId) {
      setPets([]);
      setSelectedPetId("");
      return;
    }

    loadPets(selectedClientId);
  }, [selectedClientId]);

  useEffect(() => {
    if (!petFromUrl) return;

    loadPetFromUrl(petFromUrl);
  }, [petFromUrl]);

  async function loadClients() {
    setLoadingClients(true);

    try {
      const context = await getClinicContext();
      setClinicId(context.clinic_id || "");
      setPerformingDoctor(context.doctor_name || "");
      const db = await getClinicDb();
      const { data: billingSettings } = await db.from("billing_settings")
        .select("consultation_fee").eq("clinic_id", context.clinic_id).limit(1).maybeSingle();
      setConsultationFee(Number(billingSettings?.consultation_fee || 0));

      const { data, error } = await db
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("LOAD CLIENTS ERROR:", error);
        setMessage(error.message);
      } else {
        setClients(data || []);
      }
    } catch (error) {
      console.error("LOAD CLIENTS ERROR:", error);
      setMessage(error instanceof Error ? error.message : t.loadError);
    } finally {
      setLoadingClients(false);
    }
  }

  async function loadPets(clientId: string) {
    setLoadingPets(true);

    try {
      const db = await getClinicDb();

      const { data, error } = await db
        .from("pets")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("LOAD PETS ERROR:", error);
        setMessage(error.message);
      } else {
        setPets(data || []);
      }
    } catch (error) {
      console.error("LOAD PETS ERROR:", error);
      setMessage(error instanceof Error ? error.message : t.loadError);
    } finally {
      setLoadingPets(false);
    }
  }

  async function loadPetFromUrl(petId: string) {
    setLoadingDetails(true);

    try {
      const db = await getClinicDb();

      const { data, error } = await db
        .from("pets")
        .select(`
          *,
          client:clients (
            id,
            name,
            phone,
            email
          )
        `)
        .eq("id", petId)
        .single();

      if (error || !data) {
        setMessage(t.loadError);
        return;
      }

      if (data.is_deceased) {
        setPetDetails(data as PetDetails);
        setSelectedPetId(data.id);
        setSelectedClientId(data.client_id);
        await loadVisits(data.id);
        setMessage(t.deceasedPet);
        setStarted(false);
        return;
      }

      setPetDetails(data as PetDetails);
      setSelectedPetId(data.id);
      setSelectedClientId(data.client_id);

      await loadVisits(data.id);
      await loadAppointments(data.client_id, data.id);
      setShowVisitStartModal(true);
    } catch (error) {
      console.error("LOAD PET FROM URL ERROR:", error);
      setMessage(error instanceof Error ? error.message : t.loadError);
    } finally {
      setLoadingDetails(false);
    }
  }

  async function loadVisits(petId: string) {
    try {
      const db = await getClinicDb();

      const { data, error } = await db
        .from("visits")
        .select("*")
        .eq("pet_id", petId)
        .order("visit_date", { ascending: false });

      if (error) {
        console.error("LOAD VISITS ERROR:", error);
        setMessage(error.message);
        return;
      }

      setVisits(data || []);
    } catch (error) {
      console.error("LOAD VISITS ERROR:", error);
    }
  }

  async function startExamination() {
    setMessage("");

    if (!selectedClientId || !selectedPetId) {
      setMessage(t.requiredFields);
      return;
    }

    setLoadingDetails(true);

    try {
      const db = await getClinicDb();

      const {
        data: selectedPet,
        error: selectedPetError,
      } = await db
        .from("pets")
        .select("*")
        .eq("id", selectedPetId)
        .single();

      if (selectedPetError || !selectedPet) {
        setMessage(t.loadError);
        return;
      }

      if (selectedPet.is_deceased) {
        setMessage(t.deceasedPet);
        setPetDetails(selectedPet as PetDetails);
        setStarted(false);
        return;
      }

      const { data, error } = await db
        .from("pets")
        .select(`
          *,
          client:clients (
            id,
            name,
            phone,
            email
          )
        `)
        .eq("id", selectedPetId)
        .single();

      if (error || !data) {
        setMessage(t.loadError);
        return;
      }

      setPetDetails(data as PetDetails);

      await loadVisits(selectedPetId);
      await loadAppointments(selectedClientId, selectedPetId);
      setShowVisitStartModal(true);
    } catch (error) {
      console.error("START EXAMINATION ERROR:", error);
      setMessage(error instanceof Error ? error.message : t.loadError);
    } finally {
      setLoadingDetails(false);
    }
  }

  async function loadAppointments(clientId: string, petId: string) {
    try {
      const db = await getClinicDb();
      const { data, error } = await db.from("appointments")
        .select("id, appointment_date, start_time, reason")
        .eq("client_id", clientId).eq("pet_id", petId)
        .in("status", ["pending", "confirmed", "arrived"])
        .gte("appointment_date", new Date().toISOString().slice(0, 10))
        .order("appointment_date", { ascending: true });
      if (error) throw error;
      setAppointmentOptions(data || []);
    } catch (error) {
      console.error("LOAD VISIT APPOINTMENTS ERROR:", error);
      setAppointmentOptions([]);
    }
  }

  function beginVisit(source: "appointment" | "new_visit") {
    if (source === "appointment" && !appointmentId) {
      setMessage(language === "ar" ? "اختر الموعد أولاً" : "Select an appointment first");
      return;
    }
    setVisitSource(source);
    setShowVisitStartModal(false);
    setStarted(true);
  }

  async function loadMedications() {
    try {
      const db = await getClinicDb();
      const { data, error } = await db
        .from("medications")
        .select(`
          id, name, active_ingredient, species, concentration, concentration_unit,
          dose_type, dose_value, dose_min, dose_max, dose_unit, route, frequency,
          duration_days, instructions
        `)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      setMedications((data || []) as Medication[]);
    } catch (error) {
      console.error("LOAD MEDICATIONS ERROR:", error);
    }
  }

  const filteredMedications = useMemo(() => {
    const species = (petDetails?.species || "").toLowerCase();
    const q = medicationSearch.trim().toLowerCase();
    return medications.filter((med) => {
      const speciesOk = !med.species?.length || med.species.some((x) => String(x).toLowerCase() === species);
      const searchOk = !q || med.name.toLowerCase().includes(q) || (med.active_ingredient || "").toLowerCase().includes(q);
      return speciesOk && searchOk;
    });
  }, [medications, medicationSearch, petDetails?.species]);

  function calculateMedicationDraft(
    med: Medication,
    weightOverride?: number
  ): MedicationDraft | null {
    const w = weightOverride ?? Number(weight);
    if (!Number.isFinite(w) || w <= 0 || med.dose_value == null) return null;

    const doseType = (med.dose_type || "mg_kg").toLowerCase();
    let dose = Number(med.dose_value);
    let unit = med.dose_unit || "mg";
    let dosePerKg: number | null = null;

    if (doseType === "mg_kg" || doseType === "mg/kg") {
      dosePerKg = dose;
      dose = dose * w;
      unit = med.dose_unit || "mg";
    } else if (doseType === "ml_kg" || doseType === "ml/kg") {
      dosePerKg = dose;
      dose = dose * w;
      unit = med.dose_unit || "mL";
    }

    let volume: number | null = null;
    let volumeUnit: string | null = null;
    const concentration = med.concentration != null ? Number(med.concentration) : null;
    const concentrationUnit = med.concentration_unit || null;
    if (concentration && concentration > 0 && /mg/i.test(unit) && /mg\s*\/?\s*ml|mg\/ml/i.test(concentrationUnit || "")) {
      volume = dose / concentration;
      volumeUnit = "mL";
    } else if (concentration && concentration > 0 && /mcg/i.test(unit) && /mg\s*\/?\s*ml|mg\/ml/i.test(concentrationUnit || "")) {
      volume = (dose / 1000) / concentration;
      volumeUnit = "mL";
    }

    return {
      id: crypto.randomUUID(),
      medication_id: med.id,
      weight_kg: w,
      calculated_dose: Number(dose.toFixed(3)),
      calculated_dose_unit: unit,
      dose_per_kg: dosePerKg,
      concentration,
      concentration_unit: concentrationUnit,
      calculated_volume: volume == null ? null : Number(volume.toFixed(3)),
      volume_unit: volumeUnit,
      route: med.route,
      frequency: med.frequency,
      duration_days: med.duration_days,
      instructions: med.instructions,
    };
  }
  function handleWeightChange(nextWeight: string) {
    setWeight(nextWeight);

    const nextNumericWeight = Number(nextWeight);
    if (!Number.isFinite(nextNumericWeight) || nextNumericWeight <= 0) {
      return;
    }

    setMedicationDrafts((current) =>
      current.map((draft) => {
        const med = medications.find((item) => item.id === draft.medication_id);
        if (!med) return draft;

        const recalculated = calculateMedicationDraft(
          med,
          nextNumericWeight
        );

        return recalculated ? { ...recalculated, id: draft.id } : draft;
      })
    );
  }

  function addMedication(medicationId?: string) {
    const targetMedicationId = medicationId || selectedMedicationId;
    const med = medications.find((item) => item.id === targetMedicationId);
    if (!med) return;
    const draft = calculateMedicationDraft(med);
    if (!draft) {
      setMessage(language === "ar" ? "أدخل وزن الحيوان أولًا وتأكد أن الدواء له جرعة مسجلة." : "Enter the pet weight and make sure the medication has a configured dose.");
      return;
    }
    setMedicationDrafts((current) => [...current, draft]);
    setSelectedMedicationId("");
    setMedicationSearch("");
  }

  function removeMedication(id: string) {
    setMedicationDrafts((current) => current.filter((item) => item.id !== id));
  }

  function addVaccination() {
    setVaccinations((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        vaccine_name: "",
        vaccine_type: "",
        dose_stage: "manual",
        administered_at: formatLocalDateTime(new Date()),
        next_dose_at: "",
        next_dose_manual: false,
        dose: "",
        route: "",
        batch_number: "",
        manufacturer: "",
        notes: "",
      },
    ]);
  }

  function updateVaccination(id: string, patch: Partial<VaccinationDraft>) {
    setVaccinations((current) => current.map((item) => {
      if (item.id !== id) return item;

      const typeChanged = patch.vaccine_type !== undefined;
      const nextType = patch.vaccine_type ?? item.vaccine_type;
      const nextAdministeredAt = patch.administered_at ?? item.administered_at;
      const stage = patch.dose_stage ?? (typeChanged ? getDefaultVaccinationStage(nextType) : item.dose_stage);
      const dateManuallyChanged = patch.next_dose_at !== undefined;
      const nextDoseManual = dateManuallyChanged ? true : typeChanged ? false : item.next_dose_manual;
      const nextDoseAt = dateManuallyChanged
        ? (patch.next_dose_at ?? item.next_dose_at)
        : nextDoseManual
          ? item.next_dose_at
          : calculateNextVaccinationDose(nextType, stage, nextAdministeredAt);

      return {
        ...item,
        ...patch,
        dose_stage: stage,
        next_dose_manual: nextDoseManual,
        next_dose_at: nextDoseAt,
      };
    }));
  }

  function resetVaccinationNextDoseToAutomatic(id: string) {
    setVaccinations((current) => current.map((item) => item.id === id
      ? {
          ...item,
          next_dose_manual: false,
          next_dose_at: calculateNextVaccinationDose(item.vaccine_type, item.dose_stage, item.administered_at),
        }
      : item
    ));
  }

  function removeVaccination(id: string) {
    setVaccinations((current) => current.filter((item) => item.id !== id));
  }

  const selectedFollowUpLabel = useMemo(() => {
    const labels: Record<string, string> = language === "ar"
      ? { none: t.followUpNone, "3d": t.followUp3Days, "1w": t.followUp1Week, "2w": t.followUp2Weeks, "1m": t.followUp1Month, custom: t.followUpCustom }
      : { none: t.followUpNone, "3d": t.followUp3Days, "1w": t.followUp1Week, "2w": t.followUp2Weeks, "1m": t.followUp1Month, custom: t.followUpCustom };
    return labels[followUp] || "";
  }, [followUp, language, t]);

  async function saveVisit(createBill = false) {
    setMessage("");

    if (!selectedPetId || !selectedClientId) {
      setMessage(t.requiredFields);
      return;
    }

    if (petDetails?.is_deceased) {
      setMessage(t.deceasedPet);
      return;
    }
    if (!["examination", "vaccination", "surgery", "grooming", "followup"].includes(reason)) {
      setMessage(language === "ar" ? "اختر سبب الزيارة" : "Select a visit reason");
      return;
    }
    if (!performingDoctor.trim()) {
      setMessage(language === "ar" ? "حدد الطبيب الذي سيجري الزيارة" : "Enter the performing doctor");
      return;
    }
    if (reason === "surgery" && !medicalRecordDraft.surgeryTitle.trim()) {
      setMessage(language === "ar" ? "أدخل عنوان الجراحة" : "Enter a surgery title");
      return;
    }
    if (reason === "grooming" && !groomingType.trim()) {
      setMessage(language === "ar" ? "حدد نوع التجميل" : "Enter a grooming type");
      return;
    }
    if (createBill && consultationFee <= 0 && !visitServices.some((line) => line.name.trim() && line.price >= 0 && line.quantity > 0)) {
      setMessage(language === "ar" ? "أضف خدمة واحدة على الأقل للفاتورة" : "Add at least one service to the bill");
      return;
    }

    setSaving(true);

    try {
      const db = await getClinicDb();
      const clinicContext = await getClinicContext();
      const { data: currentPet, error: currentPetError } = await db
        .from("pets")
        .select("is_deceased")
        .eq("id", selectedPetId)
        .single();

      if (currentPetError || !currentPet) throw currentPetError || new Error(t.loadError);
      if (currentPet.is_deceased) {
        setMessage(t.deceasedPet);
        setStarted(false);
        return;
      }

      const medicationText = medicationDrafts.map((draft) => {
        const med = medications.find((item) => item.id === draft.medication_id);
        const dose = `${draft.calculated_dose} ${draft.calculated_dose_unit}`;
        const volume = draft.calculated_volume != null ? ` (${draft.calculated_volume} ${draft.volume_unit})` : "";
        return `${med?.name || "Medication"}: ${dose}${volume}${draft.route ? `, ${draft.route}` : ""}${draft.frequency ? `, ${draft.frequency}` : ""}${draft.duration_days ? ` for ${draft.duration_days} days` : ""}`;
      }).join("\n");
      const formularyText = formularyDrafts.map((draft) => {
        const dose = draft.appliedDose.trim()
          ? `${draft.appliedDose.trim()} ${draft.adminDoseUnit || draft.doseUnit}`.trim()
          : draft.doseExpression;
        return [draft.drugName, dose, draft.frequency, draft.route]
          .filter(Boolean)
          .join(" - ");
      }).join("\n");
      const externalMedicationText = externalMedicationDrafts.map((draft) => {
        const details = [draft.doseText, draft.route, draft.frequency, draft.duration, draft.instructions]
          .map((value) => String(value || "").trim())
          .filter(Boolean);
        const metadata = [draft.activeIngredient, draft.manufacturer, draft.bsavaDrugName ? `BSAVA reference: ${draft.bsavaDrugName}` : null, draft.weightKg != null ? `weight snapshot ${draft.weightKg} kg` : null]
          .filter(Boolean)
          .join("; ");
        return `[DrugEye / manual dose — clinician entered] ${draft.productName}${metadata ? ` (${metadata})` : ""}: ${details.join(" - ")}`;
      }).join("\n");
      const serviceText = visitServices.filter((service) => service.name.trim()).map((service) => `${service.name.trim()} × ${service.quantity} (${(service.quantity * service.price).toFixed(2)} EGP)`).join("\n");
      const finalTreatment = [treatment.trim(), serviceText, medicationText, formularyText, externalMedicationText].filter(Boolean).join("\n\n");
      const finalExamination =
        examStatus === "normal"
          ? "Normal"
          : examStatus === "abnormal"
          ? examination.trim()
            ? `Abnormal: ${examination.trim()}`
            : "Abnormal"
          : examination.trim();
      const symptomText = symptoms.filter((item) => item.name.trim()).map((item) => `${item.name.trim()}${item.days ? ` (${item.days} ${language === "ar" ? "يوم" : "days"})` : ""}`).join("\n");
      const examinationWithSymptoms = [symptomText, finalExamination].filter(Boolean).join("\n\n");
      const followUpText = followUp && followUp !== "none"
        ? `Follow-up: ${selectedFollowUpLabel}${followUp === "custom" && followUpDetails.trim() ? ` — ${followUpDetails.trim()}` : ""}`
        : "";
      const sourceLabel = visitSource === "appointment" ? `Appointment: ${appointmentId}` : "Visit type: New walk-in visit";
      const metadata = [
        sourceLabel,
        performingDoctor.trim() ? `${language === "ar" ? "الطبيب المعالج" : "Performing doctor"}: ${performingDoctor.trim()}` : "",
        reason === "grooming" && groomingType.trim() ? `${language === "ar" ? "نوع التجميل" : "Grooming type"}: ${groomingType.trim()}` : "",
        reason === "surgery" && medicalRecordDraft.surgeryBeforeStatus.trim() ? `${language === "ar" ? "الحالة قبل الجراحة" : "Pre-surgery status"}: ${medicalRecordDraft.surgeryBeforeStatus.trim()}` : "",
        reason === "surgery" && medicalRecordDraft.surgeryAfterStatus.trim() ? `${language === "ar" ? "الحالة بعد الجراحة" : "Post-surgery status"}: ${medicalRecordDraft.surgeryAfterStatus.trim()}` : "",
      ].filter(Boolean).join("\n");
      const finalVisitNotes = [visitNotes.trim(), followUpText, metadata].filter(Boolean).join("\n\n");

      const { data: visit, error: visitError } = await db
        .from("visits")
        .insert({
          client_id: selectedClientId,
          pet_id: selectedPetId,
          reason: reason.trim() || null,
          examination: examinationWithSymptoms || null,
          diagnosis: diagnosis.trim() || null,
          treatment: finalTreatment || null,
          weight: weight ? Number(weight) : null,
          temperature: temperature ? Number(temperature) : null,
          heart_rate: heartRate ? Number(heartRate) : null,
          respiratory_rate: respiratoryRate ? Number(respiratoryRate) : null,
          notes: finalVisitNotes || null,
        })
        .select("id")
        .single();

      if (visitError || !visit) throw visitError || new Error(t.saveError);
      const uploadedAttachmentPaths: string[] = [];
      let createdInvoiceId = "";
      try {
        for (const item of attachments) {
          const fileName = item.file.name.replace(/[^\w.-]+/g, "_");
          const path = `${clinicContext.clinic_id}/${selectedPetId}/${visit.id}/${crypto.randomUUID()}-${fileName}`;
          const { error: uploadError } = await db.storage.from("visit-attachments").upload(path, item.file, { contentType: item.file.type, upsert: false });
          if (uploadError) throw uploadError;
          uploadedAttachmentPaths.push(path);
          const { error: metadataError } = await db.from("visit_attachments").insert({
            clinic_id: clinicContext.clinic_id, visit_id: visit.id, client_id: selectedClientId, pet_id: selectedPetId,
            file_name: item.file.name, storage_path: path, mime_type: item.file.type, size_bytes: item.file.size, category: item.category,
          });
          if (metadataError) throw metadataError;
        }

        const medicalRows = [
          ...medicalRecordDraft.labTests.split(/\r?\n/).map((name) => name.trim()).filter(Boolean).map((title) => ({
            clinic_id: clinicContext.clinic_id, pet_id: selectedPetId, client_id: selectedClientId,
            visit_id: visit.id, record_type: "lab", title, status: "ordered", notes: medicalRecordDraft.labNotes.trim() || null,
          })),
          ...(reason === "surgery" && medicalRecordDraft.surgeryTitle.trim() ? [{
            clinic_id: clinicContext.clinic_id, pet_id: selectedPetId, client_id: selectedClientId,
            visit_id: visit.id, record_type: "surgery", title: medicalRecordDraft.surgeryTitle.trim(),
            status: medicalRecordDraft.surgeryStatus, notes: [medicalRecordDraft.surgeryNotes.trim(), medicalRecordDraft.surgeryBeforeStatus.trim() ? `Before: ${medicalRecordDraft.surgeryBeforeStatus.trim()}` : "", medicalRecordDraft.surgeryAfterStatus.trim() ? `After: ${medicalRecordDraft.surgeryAfterStatus.trim()}` : ""].filter(Boolean).join("\n") || null,
            performed_at: medicalRecordDraft.surgeryDate ? new Date(`${medicalRecordDraft.surgeryDate}T12:00:00`).toISOString() : null,
          }] : []),
        ];
        if (medicalRows.length) {
          const { error: recordsError } = await db.from("pet_medical_records").insert(medicalRows);
          if (recordsError) throw recordsError;
        }

        if (medicationDrafts.length) {
          const medicationRows = medicationDrafts.map((draft) => ({
            clinic_id: clinicContext.clinic_id,
            visit_id: visit.id,
            medication_id: draft.medication_id,
            weight_kg: draft.weight_kg,
            calculated_dose: draft.calculated_dose,
            calculated_dose_unit: draft.calculated_dose_unit,
            dose_per_kg: draft.dose_per_kg,
            concentration: draft.concentration,
            concentration_unit: draft.concentration_unit,
            calculated_volume: draft.calculated_volume,
            volume_unit: draft.volume_unit,
            route: draft.route,
            frequency: draft.frequency,
            duration_days: draft.duration_days,
            instructions: draft.instructions,
          }));
          const { error: medError } = await db.from("visit_medications").insert(medicationRows);
          if (medError) throw medError;
        }

        const validVaccinations = vaccinations.filter((v) => v.vaccine_name.trim());
        if (validVaccinations.length) {
          const vaccineRows = validVaccinations.map((v) => ({
            clinic_id: clinicContext.clinic_id,
            visit_id: visit.id,
            pet_id: selectedPetId,
            client_id: selectedClientId,
            vaccine_name: v.vaccine_name.trim(),
            vaccine_type: v.vaccine_type.trim() || null,
            administered_at: v.administered_at ? new Date(v.administered_at).toISOString() : new Date().toISOString(),
            next_dose_at: v.next_dose_at ? new Date(v.next_dose_at).toISOString() : null,
            dose: v.dose.trim() || null,
            route: v.route.trim() || null,
            batch_number: v.batch_number.trim() || null,
            manufacturer: v.manufacturer.trim() || null,
            notes: [
              v.dose_stage && v.dose_stage !== "manual"
                ? `${language === "ar" ? "مرحلة الجرعة" : "Dose stage"}: ${getVaccinationStageLabel(v.vaccine_type, v.dose_stage, language)}`
                : "",
              v.notes.trim(),
            ].filter(Boolean).join("\n") || null,
          }));
          const { error: vaccineError } = await db.from("vaccinations").insert(vaccineRows);
          if (vaccineError) throw vaccineError;
        }

        if (createBill) {
          const { data: { user } } = await vetraCore.auth.getUser();
          if (!user) throw new Error(language === "ar" ? "انتهت جلسة الدخول" : "Your session has expired");
          const invoiceLines = [
            ...(consultationFee > 0 ? [{ name: "Consultation", quantity: 1, unit_price: consultationFee }] : []),
            ...visitServices.filter((line) => line.name.trim()).map((line) => ({ name: line.name.trim(), quantity: line.quantity, unit_price: line.price })),
          ];
          if (!invoiceLines.length) throw new Error(language === "ar" ? "أضف خدمة واحدة على الأقل للفاتورة" : "Add at least one service to the bill");
          const subtotal = invoiceLines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
          const { data: invoice, error: invoiceError } = await db.from("invoices").insert({
            clinic_id: clinicContext.clinic_id, client_id: selectedClientId, pet_id: selectedPetId, visit_id: visit.id,
            status: "draft", payment_method: null, subtotal, discount: 0, total: subtotal, paid_amount: 0,
            notes: language === "ar" ? "مسودة فاتورة أُنشئت من الزيارة" : "Draft bill created from visit", issued_at: null, paid_at: null,
            created_by: user.id, updated_by: user.id,
          }).select("id").single();
          if (invoiceError || !invoice) throw invoiceError || new Error(t.saveError);
          createdInvoiceId = invoice.id;
          const { error: itemError } = await db.from("invoice_items").insert(invoiceLines.map((line) => ({
            clinic_id: clinicContext.clinic_id, invoice_id: invoice.id, item_type: "service", product_id: null,
            service_name: line.name, description: line.name, quantity: line.quantity, unit_price: line.unit_price,
            discount: 0, total: line.quantity * line.unit_price,
          })));
          if (itemError) throw itemError;
        }
        if (createBill && createdInvoiceId) {
          window.localStorage.setItem("vetra-data-version", String(Date.now()));
          router.push(`/invoices/${createdInvoiceId}`);
          return;
        }

      } catch (relatedSaveError) {
        await db.from("visit_medications").delete().eq("visit_id", visit.id);
        await db.from("vaccinations").delete().eq("visit_id", visit.id);
        await db.from("pet_medical_records").delete().eq("visit_id", visit.id);
        await db.from("visit_attachments").delete().eq("visit_id", visit.id);
        if (uploadedAttachmentPaths.length) await db.storage.from("visit-attachments").remove(uploadedAttachmentPaths);
        if (createdInvoiceId) await db.from("invoices").delete().eq("id", createdInvoiceId).eq("clinic_id", clinicContext.clinic_id);
        await db.from("visits").delete().eq("id", visit.id);
        throw relatedSaveError;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem("vetra-data-version", String(Date.now()));
      }

      setMessage(t.visitSaved);

      setReason("");
      setPerformingDoctor("");
      setGroomingType("");
      setAppointmentId("");
      setExamStatus("");
      setExamination("");
      setFollowUp("");
      setFollowUpDetails("");
      setDiagnosis("");
      setTreatment("");
      setVisitNotes("");
      setWeight("");
      setTemperature("");
      setHeartRate("");
      setRespiratoryRate("");
      setMedicationDrafts([]);
      setFormularyDrafts([]);
      setVaccinations([]);
      setMedicalRecordDraft(emptyMedicalRecordDraft);

      await loadVisits(selectedPetId);

      router.push(`/visits/${encodeURIComponent(visit.id)}`);
    } catch (error) {
      console.error("SAVE VISIT ERROR:", error);
      setMessage(error instanceof Error ? error.message : t.saveError);
    } finally {
      setSaving(false);
    }
  }

  function resetSelection() {
    setStarted(false);
    setPetDetails(null);
    setVisits([]);
    setSelectedPetId("");
    setMessage("");
  }

  const filteredClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();

    if (!query) return clients;

    return clients.filter(
      (client) =>
        client.name?.toLowerCase().includes(query) ||
        client.phone?.toLowerCase().includes(query) ||
        client.email?.toLowerCase().includes(query)
    );
  }, [clients, clientSearch]);

  const filteredPets = useMemo(() => {
    const query = petSearch.trim().toLowerCase();

    if (!query) return pets;

    return pets.filter(
      (pet) =>
        pet.name?.toLowerCase().includes(query) ||
        pet.species?.toLowerCase().includes(query) ||
        pet.breed?.toLowerCase().includes(query) ||
        pet.microchip?.toLowerCase().includes(query)
    );
  }, [pets, petSearch]);

  const visitServiceTotal = visitServices.reduce((sum, service) => sum + Math.max(0, service.quantity) * Math.max(0, service.price), 0);
  const visitBillTotal = consultationFee + visitServiceTotal;

  const pageClasses = darkMode
    ? "min-h-screen bg-[#0F1115] text-slate-100"
    : "min-h-screen bg-[#F7F8FA] text-slate-900";

  return (
    <main
      dir={language === "ar" ? "rtl" : "ltr"}
      data-vetra-visit-theme={darkMode ? "dark" : "light"}
      className={pageClasses}
    >
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* HEADER */}
        <header
          className={`mb-6 flex flex-col gap-4 rounded-2xl border p-4 shadow-sm transition-colors duration-200 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${
            darkMode
              ? "border-white/[0.07] bg-[#181B21]"
              : "border-slate-200 bg-white"
          }`}
        >
          <div>
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-600 text-sm font-bold text-white">
                V
              </div>

              <div>
                <h1
                  className={`text-2xl font-bold tracking-tight ${
                    darkMode ? "text-white" : "text-slate-900"
                  }`}
                >
                  {t.title}
                </h1>

                <p
                  className={`text-sm ${
                    darkMode ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  {t.subtitle}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                darkMode
                  ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.dashboard}
            </Link>

            <button
              type="button"
              onClick={() =>
                setLanguage(language === "en" ? "ar" : "en")
              }
              className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                darkMode
                  ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.language}
            </button>

            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              aria-label={darkMode ? t.light : t.dark}
              className={`flex h-11 w-11 items-center justify-center rounded-xl border text-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                darkMode
                  ? "border-slate-700 bg-slate-800 hover:bg-slate-700"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <span aria-hidden="true" className={`relative block h-5 w-5 rounded-full border-2 ${darkMode ? "border-amber-400" : "border-slate-500"}`}><span className={`absolute inset-0.5 rounded-full ${darkMode ? "bg-amber-400" : "bg-transparent"}`} /></span>
            </button>
          </div>
        </header>

        {/* MESSAGE */}
        {message && (
          <div
            className={`mb-6 rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-300 ${
              message.includes("success") || message.includes("تم")
                ? darkMode
                  ? "border-emerald-900 bg-emerald-950/50 text-emerald-300"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
                : darkMode
                ? "border-rose-900 bg-rose-950/50 text-rose-300"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {message}
          </div>
        )}

        <NewVisitPatientSelector
          started={started}
          darkMode={darkMode}
          t={t}
          clientSearch={clientSearch}
          setClientSearch={setClientSearch}
          loadingClients={loadingClients}
          filteredClients={filteredClients}
          selectedClientId={selectedClientId}
          setSelectedClientId={setSelectedClientId}
          setSelectedPetId={setSelectedPetId}
          setPetSearch={setPetSearch}
          selectedPetId={selectedPetId}
          petSearch={petSearch}
          loadingPets={loadingPets}
          filteredPets={filteredPets}
          startExamination={startExamination}
          loadingDetails={loadingDetails}
        />

        {showVisitStartModal && petDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="visit-start-title">
            <div className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`}>
              <h2 id="visit-start-title" className="text-xl font-bold">{language === "ar" ? "بدء زيارة" : "Start visit"}</h2>
              <p className="mt-1 text-sm text-slate-500">{petDetails.client?.name} · {petDetails.name}</p>
              <div className="mt-5 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {([["appointment", language === "ar" ? "موعد" : "Appointment"], ["new_visit", language === "ar" ? "بدء زيارة جديدة" : "Start a new visit"]] as const).map(([source, label]) => <button key={source} type="button" onClick={() => setVisitSource(source)} className={`rounded-lg border px-3 py-3 text-sm font-semibold ${visitSource === source ? "border-blue-500 bg-blue-600 text-white" : darkMode ? "border-slate-700" : "border-slate-200"}`}>{label}</button>)}
                </div>
                {visitSource === "appointment" ? <label className="block text-sm font-semibold">{language === "ar" ? "الموعد المسجل" : "Scheduled appointment"}
                  <select className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-3" value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)}>
                    <option value="">{language === "ar" ? "اختر موعدًا" : "Select an appointment"}</option>
                    {appointmentOptions.map((item) => <option key={item.id} value={item.id}>{item.appointment_date} {item.start_time?.slice(0, 5)}{item.reason ? ` · ${item.reason}` : ""}</option>)}
                  </select>
                </label> : <p className="rounded-lg border border-slate-300 p-3 text-sm text-slate-500">{language === "ar" ? "سيبدأ سجل زيارة جديد لهذا الحيوان." : "A new visit record will be started for this pet."}</p>}
                <button type="button" disabled={visitSource === "appointment" && !appointmentId} onClick={() => beginVisit(visitSource)} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-40">{language === "ar" ? "متابعة" : "Continue"}</button>
              </div>
            </div>
          </div>
        )}

        {/* EXAMINATION */}
        {started && petDetails && (
          <div className="space-y-6">
            <NewVisitPatientOverview
              petDetails={petDetails}
              visits={visits}
              language={language}
              darkMode={darkMode}
              t={t}
              resetSelection={resetSelection}
              onOldVisitSelect={setSelectedOldVisit}
            />

            <NewVisitEditorSection darkMode={darkMode} t={t} saving={saving} onSave={() => saveVisit(false)} onSaveWithBill={() => saveVisit(true)} billLabel={language === "ar" ? "حفظ الزيارة وإنشاء فاتورة" : "Save visit & create bill"}>
              <section className={`grid gap-4 rounded-2xl border p-4 sm:grid-cols-2 ${darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
                <label className="text-sm font-semibold">{language === "ar" ? "سبب الزيارة" : "Visit reason"}
                  <select required className="mt-2 w-full rounded-xl border border-slate-300 bg-transparent p-3" value={reason} onChange={(event) => setReason(event.target.value)}>
                    <option value="">{language === "ar" ? "اختر السبب" : "Select reason"}</option>
                    {[["examination", "Examination", "كشف"], ["vaccination", "Vaccination", "تطعيم"], ["surgery", "Surgery", "جراحة"], ["grooming", "Grooming", "تجميل"], ["followup", "Follow-up", "متابعة"]].map(([value, en, ar]) => <option key={value} value={value}>{language === "ar" ? ar : en}</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold">{language === "ar" ? "الطبيب الذي سيجري الزيارة" : "Performing doctor"}
                  <input className="mt-2 w-full rounded-xl border border-slate-300 bg-transparent p-3" value={performingDoctor} onChange={(event) => setPerformingDoctor(event.target.value)} placeholder={language === "ar" ? "اسم الطبيب" : "Doctor name"} />
                </label>
                {reason === "grooming" && <label className="text-sm font-semibold sm:col-span-2">{language === "ar" ? "نوع التجميل" : "Grooming type"}
                  <input className="mt-2 w-full rounded-xl border border-slate-300 bg-transparent p-3" value={groomingType} onChange={(event) => setGroomingType(event.target.value)} placeholder={language === "ar" ? "مثال: استحمام، قص شعر، قص أظافر" : "e.g. bath, haircut, nail trim"} />
                </label>}
              </section>
              <section className={`space-y-4 rounded-2xl border p-4 lg:col-span-2 ${darkMode ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold">{language === "ar" ? "الأعراض" : "Symptoms"}</h3>
                  <button type="button" onClick={() => setSymptoms((current) => [...current, { id: crypto.randomUUID(), name: "", days: "" }])} className="rounded-lg border border-cyan-500/30 px-3 py-2 text-sm font-semibold text-cyan-700 dark:text-cyan-300">{language === "ar" ? "+ إضافة عرض" : "+ Add symptom"}</button>
                </div>
                {symptoms.map((symptom) => <div key={symptom.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_40px]">
                  <input className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700" value={symptom.name} onChange={(event) => setSymptoms((current) => current.map((item) => item.id === symptom.id ? { ...item, name: event.target.value } : item))} placeholder={language === "ar" ? "العرض" : "Symptom"} />
                  <label className="text-xs text-slate-500">{language === "ar" ? "استمر منذ (أيام)" : "Persisted (days)"}<input type="number" min="0" step="1" className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700" value={symptom.days} onChange={(event) => setSymptoms((current) => current.map((item) => item.id === symptom.id ? { ...item, days: event.target.value } : item))} /></label>
                  <button type="button" onClick={() => setSymptoms((current) => current.filter((item) => item.id !== symptom.id))} aria-label={language === "ar" ? "حذف العرض" : "Remove symptom"} className="self-end rounded-lg border border-rose-400/30 px-2 py-2 text-rose-500">×</button>
                </div>)}
              </section>
              <NewVisitClinicalFields
                darkMode={darkMode}
                t={t}
                examStatus={examStatus}
                setExamStatus={setExamStatus}
                examination={examination}
                setExamination={setExamination}
                weight={weight}
                handleWeightChange={handleWeightChange}
                temperature={temperature}
                setTemperature={setTemperature}
                heartRate={heartRate}
                setHeartRate={setHeartRate}
                respiratoryRate={respiratoryRate}
                setRespiratoryRate={setRespiratoryRate}
                diagnosis={diagnosis}
                setDiagnosis={setDiagnosis}
              />
              <NewVisitTreatmentFields
                clinicId={clinicId}
                language={language}
                darkMode={darkMode}
                t={t}
                petDetails={petDetails}
                weight={weight}
                formularyDrafts={formularyDrafts}
                setFormularyDrafts={setFormularyDrafts}
                externalMedicationDrafts={externalMedicationDrafts}
                onAddManualExternalMedication={(draft) => setExternalMedicationDrafts((current) => [...current, draft])}
                onRemoveManualExternalMedication={(id) => setExternalMedicationDrafts((current) => current.filter((draft) => draft.id !== id))}
                medicationSearch={medicationSearch}
                setMedicationSearch={setMedicationSearch}
                filteredMedications={filteredMedications}
                addMedication={addMedication}
                medications={medications}
                setMessage={setMessage}
                medicationDrafts={medicationDrafts}
                removeMedication={removeMedication}
                treatment={treatment}
                setTreatment={setTreatment}
                vaccinations={vaccinations}
                addVaccination={addVaccination}
                updateVaccination={updateVaccination}
                removeVaccination={removeVaccination}
                resetVaccinationNextDoseToAutomatic={resetVaccinationNextDoseToAutomatic}
                visitNotes={visitNotes}
                setVisitNotes={setVisitNotes}
                followUp={followUp}
                setFollowUp={setFollowUp}
                followUpDetails={followUpDetails}
                setFollowUpDetails={setFollowUpDetails}
              />
              <section className={`space-y-4 rounded-2xl border p-4 lg:col-span-2 ${darkMode ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-slate-50"}`}>
                <div>
                  <h3 className="font-bold">{language === "ar" ? "خدمات الزيارة" : "Visit services"}</h3>
                  <p className="mt-1 text-xs text-slate-500">{language === "ar" ? "أضف الخدمات المنفذة مع الكمية والسعر." : "Add performed services with quantity and price."}</p>
                </div>
                <div className="space-y-2">
                  {visitServices.map((service) => <div key={service.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_100px_130px_40px]">
                    <input className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700" value={service.name} onChange={(event) => setVisitServices((current) => current.map((item) => item.id === service.id ? { ...item, name: event.target.value } : item))} placeholder={language === "ar" ? "اسم الخدمة، مثل قص الشعر" : "Service, e.g. hair trimming"} />
                    <input type="number" min="1" step="1" className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700" value={service.quantity} onChange={(event) => setVisitServices((current) => current.map((item) => item.id === service.id ? { ...item, quantity: Number(event.target.value) || 1 } : item))} aria-label={language === "ar" ? "الكمية" : "Quantity"} />
                    <input type="number" min="0" step="0.01" className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700" value={service.price} onChange={(event) => setVisitServices((current) => current.map((item) => item.id === service.id ? { ...item, price: Number(event.target.value) || 0 } : item))} aria-label={language === "ar" ? "السعر" : "Price"} />
                    <button type="button" onClick={() => setVisitServices((current) => current.filter((item) => item.id !== service.id))} aria-label={language === "ar" ? "حذف الخدمة" : "Remove service"} className="rounded-lg border border-rose-400/30 px-2 py-2 text-rose-500">×</button>
                  </div>)}
                </div>
                <button type="button" onClick={() => setVisitServices((current) => [...current, { id: crypto.randomUUID(), name: "", quantity: 1, price: 0 }])} className="w-full rounded-lg border border-dashed border-cyan-500/40 px-4 py-3 text-sm font-semibold text-cyan-700 dark:text-cyan-300">{language === "ar" ? "+ إضافة خدمة" : "+ Add service"}</button>
                <div className={`ml-auto max-w-sm space-y-2 border-t pt-3 text-sm ${darkMode ? "border-slate-700" : "border-slate-200"}`}>
                  {consultationFee > 0 && <div className="flex justify-between"><span>{language === "ar" ? "الكشف" : "Consultation"}</span><span>{consultationFee.toFixed(2)} EGP</span></div>}
                  <div className="flex justify-between"><span>{language === "ar" ? "الخدمات" : "Services"}</span><span>{visitServiceTotal.toFixed(2)} EGP</span></div>
                  <div className="flex justify-between border-t pt-2 text-base font-bold text-cyan-700 dark:border-slate-700 dark:text-cyan-300"><span>{language === "ar" ? "الإجمالي" : "Total"}</span><span>{visitBillTotal.toFixed(2)} EGP</span></div>
                </div>
              </section>
              <section className={`space-y-3 rounded-2xl border p-4 lg:col-span-2 ${darkMode ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-slate-50"}`}>
                <div><h3 className="font-bold">{language === "ar" ? "التحاليل والأشعة المرفقة" : "Analysis and X-ray attachments"}</h3><p className="mt-1 text-xs text-slate-500">{language === "ar" ? "PDF أو صور، بحد أقصى 10 ميجابايت لكل ملف." : "PDF or images, up to 10 MB per file."}</p></div>
                <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => {
                  const selected = Array.from(event.target.files || []);
                  const oversized = selected.some((file) => file.size > 10 * 1024 * 1024);
                  if (oversized) { setMessage(language === "ar" ? "حجم الملف يجب ألا يتجاوز 10 ميجابايت" : "Each file must be 10 MB or smaller"); event.target.value = ""; return; }
                  setAttachments((current) => [...current, ...selected.map((file) => ({ id: crypto.randomUUID(), file, category: /x.?ray|radiograph/i.test(file.name) ? "xray" as const : "analysis" as const }))]);
                  event.target.value = "";
                }} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-4 file:py-2 file:font-semibold file:text-white" />
                {attachments.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
                  <select value={item.category} onChange={(event) => setAttachments((current) => current.map((row) => row.id === item.id ? { ...row, category: event.target.value as VisitAttachmentDraft["category"] } : row))} className="rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"><option value="analysis">{language === "ar" ? "تحليل" : "Analysis"}</option><option value="xray">{language === "ar" ? "أشعة" : "X-ray"}</option></select>
                  <button type="button" onClick={() => setAttachments((current) => current.filter((row) => row.id !== item.id))} className="px-2 py-1 text-rose-500" aria-label={language === "ar" ? "إزالة المرفق" : "Remove attachment"}>×</button>
                </div>)}
              </section>
              <NewVisitMedicalRecordsFields
                value={medicalRecordDraft}
                onChange={setMedicalRecordDraft}
                language={language}
                darkMode={darkMode}
                visitReason={reason}
              />
            </NewVisitEditorSection>

            <NewVisitHistory
              visits={visits}
              darkMode={darkMode}
              language={language}
              t={t}
              onSelect={setSelectedOldVisit}
            />
          </div>
        )}

        <NewVisitDetailsModal
          selectedOldVisit={selectedOldVisit}
          onClose={() => setSelectedOldVisit(null)}
          darkMode={darkMode}
          language={language}
          t={t}
        />
      </div>
    </main>
  );
}
