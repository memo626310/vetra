"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getClinicDb, getClinicContext } from "@/lib/clinic-db";
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
      const db = await getClinicDb();

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
      setStarted(true);
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
      setStarted(true);
    } catch (error) {
      console.error("START EXAMINATION ERROR:", error);
      setMessage(error instanceof Error ? error.message : t.loadError);
    } finally {
      setLoadingDetails(false);
    }
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

  async function saveVisit() {
    setMessage("");

    if (!selectedPetId || !selectedClientId) {
      setMessage(t.requiredFields);
      return;
    }

    if (petDetails?.is_deceased) {
      setMessage(t.deceasedPet);
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
      const finalTreatment = [treatment.trim(), medicationText, formularyText, externalMedicationText].filter(Boolean).join("\n\n");
      const finalExamination =
        examStatus === "normal"
          ? "Normal"
          : examStatus === "abnormal"
          ? examination.trim()
            ? `Abnormal: ${examination.trim()}`
            : "Abnormal"
          : examination.trim();
      const followUpText = followUp && followUp !== "none"
        ? `Follow-up: ${selectedFollowUpLabel}${followUp === "custom" && followUpDetails.trim() ? ` — ${followUpDetails.trim()}` : ""}`
        : "";
      const finalVisitNotes = [visitNotes.trim(), followUpText].filter(Boolean).join("\n\n");

      const { data: visit, error: visitError } = await db
        .from("visits")
        .insert({
          client_id: selectedClientId,
          pet_id: selectedPetId,
          reason: reason.trim() || null,
          examination: finalExamination || null,
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
      try {

        const medicalRows = [
          ...medicalRecordDraft.labTests.split(/\r?\n/).map((name) => name.trim()).filter(Boolean).map((title) => ({
            clinic_id: clinicContext.clinic_id, pet_id: selectedPetId, client_id: selectedClientId,
            visit_id: visit.id, record_type: "lab", title, status: "ordered", notes: medicalRecordDraft.labNotes.trim() || null,
          })),
          ...(medicalRecordDraft.surgeryTitle.trim() ? [{
            clinic_id: clinicContext.clinic_id, pet_id: selectedPetId, client_id: selectedClientId,
            visit_id: visit.id, record_type: "surgery", title: medicalRecordDraft.surgeryTitle.trim(),
            status: medicalRecordDraft.surgeryStatus, notes: medicalRecordDraft.surgeryNotes.trim() || null,
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

      } catch (relatedSaveError) {
        await db.from("visit_medications").delete().eq("visit_id", visit.id);
        await db.from("vaccinations").delete().eq("visit_id", visit.id);
        await db.from("pet_medical_records").delete().eq("visit_id", visit.id);
        await db.from("visits").delete().eq("id", visit.id);
        throw relatedSaveError;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem("vetra-data-version", String(Date.now()));
      }

      setMessage(t.visitSaved);

      setReason("");
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

      router.push(
        `/prescriptions/${encodeURIComponent(visit.id)}`
      );
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

  const pageClasses = darkMode
    ? "min-h-screen bg-slate-950 text-slate-100"
    : "min-h-screen bg-slate-50 text-slate-900";

  return (
    <main
      dir={language === "ar" ? "rtl" : "ltr"}
      className={pageClasses}
    >
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* HEADER */}
        <header
          className={`mb-8 flex flex-col gap-4 rounded-3xl border p-5 shadow-sm transition-colors duration-300 sm:flex-row sm:items-center sm:justify-between ${
            darkMode
              ? "border-slate-800 bg-slate-900"
              : "border-slate-200 bg-white"
          }`}
        >
          <div>
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-xl text-white shadow-lg shadow-blue-600/20">
                🩺
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
              🏠 {t.dashboard}
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
              🌐 {t.language}
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
              {darkMode ? "☀️" : "🌙"}
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

            <NewVisitEditorSection darkMode={darkMode} t={t} saving={saving} onSave={saveVisit}>
              <NewVisitClinicalFields
                darkMode={darkMode}
                t={t}
                reason={reason}
                setReason={setReason}
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
              <NewVisitMedicalRecordsFields
                value={medicalRecordDraft}
                onChange={setMedicalRecordDraft}
                language={language}
                darkMode={darkMode}
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
