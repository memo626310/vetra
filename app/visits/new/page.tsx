"use client";

import { useStaffPermissions } from "@/lib/use-staff-permissions";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getClinicDb, getClinicContext } from "@/lib/clinic-db";
import { vetraCore } from "@/lib/vetra-core";
import { readVetraTheme, writeVetraThemeMode } from "@/lib/theme";
import { clearClinicCache, readClinicCache, writeClinicCache } from "@/lib/clinic-cache";
import ClinicCacheRefreshButton from "@/components/ClinicCacheRefreshButton";
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
type AvailableDoctor = { id: string; full_name: string; specialty: string | null };
type VisitServiceDraft = { id: string; name: string; quantity: number; price: number };
type MedicationBillLine = { id: string; name: string };
type VisitAttachmentDraft = { id: string; file: File; category: "analysis" | "xray" };
type ExistingVisitAttachment = { id: string; file_name: string; storage_path: string; category: "analysis" | "xray"; url: string };
type VaccineStockProduct = { id: string; name: string; active_ingredient: string | null; quantity: number; unit: string | null; retail_price: number; barcode?: string | null; category_id?: string | null };
type DrawerMedication = { id: string; product_id: string; quantity: number };

export default function NewVisitPage() {
  const { loaded: permissionsLoaded, can } = useStaffPermissions();
  const [originalVaccinations, setOriginalVaccinations] = useState<VaccinationDraft[]>([]);
  const vaccinationIsSaved = (id: string) => originalVaccinations.some((v) => v.id === id);
  const canChangeVaccine = (id: string) => permissionsLoaded && can("vaccinations", vaccinationIsSaved(id) ? "edit" : "create");
  const router = useRouter();
  const routeParams = useParams<{ id?: string }>();
  const editVisitId = typeof routeParams?.id === "string" ? routeParams.id : null;

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
  const [refreshingCache, setRefreshingCache] = useState(false);

  const [started, setStarted] = useState(false);
  const [showVisitStartModal, setShowVisitStartModal] = useState(false);
  const [visitSource, setVisitSource] = useState<"appointment" | "new_visit">("appointment");
  const [appointmentId, setAppointmentId] = useState("");
  const [appointmentOptions, setAppointmentOptions] = useState<Array<{ id: string; appointment_date: string; start_time: string; reason: string | null }>>([]);
  const [performingDoctor, setPerformingDoctor] = useState("");
  const [availableDoctors, setAvailableDoctors] = useState<AvailableDoctor[]>([]);
  const [groomingType, setGroomingType] = useState("");
  const [consultationFee, setConsultationFee] = useState(0);
  const [followUpFee, setFollowUpFee] = useState(0);
  const [injectionFee, setInjectionFee] = useState(0);
  const [medicationChargePrices, setMedicationChargePrices] = useState<Record<string, number>>({});
  const [medicationChargeQuantities, setMedicationChargeQuantities] = useState<Record<string, number>>({});
  const [symptoms, setSymptoms] = useState<SymptomDraft[]>([]);
  const [visitServices, setVisitServices] = useState<VisitServiceDraft[]>([]);
  const [attachments, setAttachments] = useState<VisitAttachmentDraft[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<ExistingVisitAttachment[]>([]);
  const [removedAttachments, setRemovedAttachments] = useState<ExistingVisitAttachment[]>([]);
  const [visitDate, setVisitDate] = useState("");

  const [reason, setReason] = useState("examination");
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
  const [vaccineStockProducts, setVaccineStockProducts] = useState<VaccineStockProduct[]>([]);
  const [clinicStockProducts, setClinicStockProducts] = useState<VaccineStockProduct[]>([]);
  const [vaccineProductMappings, setVaccineProductMappings] = useState<Record<string, string[]>>({});
  const [drawerMedications, setDrawerMedications] = useState<DrawerMedication[]>([]);
  const [medicalRecordDraft, setMedicalRecordDraft] = useState<MedicalRecordDraft>(emptyMedicalRecordDraft);
  const [originalMedicalRecords, setOriginalMedicalRecords] = useState<Array<{ id: string; record_type: string; status: string | null }>>([]);

  const t = translations[language];

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem(
      "vetra-language"
    ) as Language | null;

    const savedDarkMode = readVetraTheme() !== "light";

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
    loadClients();
    loadMedications();
  }, []);

  useEffect(() => {
    if (editVisitId) return;
    if (!selectedClientId) {
      setPets([]);
      setSelectedPetId("");
      return;
    }

    loadPets(selectedClientId);
  }, [selectedClientId, editVisitId]);

  useEffect(() => {
    if (!petFromUrl) return;

    loadPetFromUrl(petFromUrl);
  }, [petFromUrl]);

  useEffect(() => {
    if (editVisitId) void loadVisitForEdit(editVisitId);
  }, [editVisitId]);

  async function loadClients(forceRefresh = false) {
    setLoadingClients(true);

    try {
      const context = await getClinicContext();
      setClinicId(context.clinic_id || "");
      setPerformingDoctor(context.doctor_name || "");
      const cachedClients = forceRefresh ? null : readClinicCache<Client[]>(context.clinic_id, "visit-clients");
      if (cachedClients) setClients(cachedClients);
      const db = await getClinicDb();
      const { data: doctorRows } = await db.from("clinic_staff")
        .select("id, full_name, specialty")
        .eq("clinic_id", context.clinic_id)
        .eq("staff_type", "doctor")
        .order("full_name", { ascending: true });
      const doctors = (doctorRows || []) as AvailableDoctor[];
      if (context.doctor_name && !doctors.some((doctor) => doctor.full_name === context.doctor_name)) {
        doctors.unshift({ id: "current-user", full_name: context.doctor_name, specialty: null });
      }
      setAvailableDoctors(doctors);
      const [vaccineProductsResult, vaccineMappingsResult, categoriesResult] = await Promise.all([
        db.from("products")
          .select("id,name,active_ingredient,barcode,quantity,unit,retail_price,category_id")
          .eq("clinic_id", context.clinic_id)
          .eq("is_active", true)
          .order("name", { ascending: true }),
        db.from("clinic_vaccination_products")
          .select("protocol_key,product_id")
          .eq("clinic_id", context.clinic_id),
        db.from("product_categories").select("id,name").eq("clinic_id", context.clinic_id),
      ]);
      if (vaccineProductsResult.error) {
        console.warn("LOAD VACCINE STOCK PRODUCTS ERROR:", vaccineProductsResult.error);
      } else {
        const stockProducts = (vaccineProductsResult.data || []) as VaccineStockProduct[];
        const categories = categoriesResult.data || [];
        const medicationCategory = categories.find((category) => ["الأدوية", "ادوية", "medications", "medicines"].includes(String(category.name).trim().toLocaleLowerCase()));
        const vaccineCategory = categories.find((category) => ["التطعيمات", "اللقاحات", "تطعيمات", "vaccines", "vaccinations"].includes(String(category.name).trim().toLocaleLowerCase()));
        setClinicStockProducts(medicationCategory ? stockProducts.filter((product) => product.category_id === medicationCategory.id) : []);
        setVaccineStockProducts(vaccineCategory ? stockProducts.filter((product) => product.category_id === vaccineCategory.id) : []);
      }
      if (vaccineMappingsResult.error) {
        console.warn("LOAD VACCINE PRODUCT MAPPINGS ERROR:", vaccineMappingsResult.error);
      } else {
        const groupedMappings: Record<string, string[]> = {};
        for (const row of vaccineMappingsResult.data || []) {
          const key = String(row.protocol_key);
          groupedMappings[key] = [...(groupedMappings[key] || []), String(row.product_id)];
        }
        setVaccineProductMappings(groupedMappings);
      }
      if (categoriesResult.error) console.warn("LOAD PRODUCT CATEGORIES ERROR:", categoriesResult.error);
      const { data: billingSettings, error: billingSettingsError } = await db.from("billing_settings")
        .select("consultation_fee, follow_up_fee, injection_fee").eq("clinic_id", context.clinic_id).limit(1).maybeSingle();
      if (billingSettingsError) {
        console.warn("LOAD INJECTION FEE SETTING ERROR; retrying legacy billing settings:", billingSettingsError);
        const { data: legacyBillingSettings, error: legacyBillingSettingsError } = await db.from("billing_settings")
          .select("consultation_fee").eq("clinic_id", context.clinic_id).limit(1).maybeSingle();
        if (legacyBillingSettingsError) throw legacyBillingSettingsError;
        setConsultationFee(Number(legacyBillingSettings?.consultation_fee || 0));
        setFollowUpFee(0);
        setInjectionFee(0);
      } else {
        setConsultationFee(Number(billingSettings?.consultation_fee || 0));
        setFollowUpFee(Number(billingSettings?.follow_up_fee || 0));
        setInjectionFee(Number(billingSettings?.injection_fee || 0));
      }

      const { data, error } = await db
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("LOAD CLIENTS ERROR:", error);
        setMessage(error.message);
      } else {
        const nextClients = data || [];
        setClients(nextClients);
        writeClinicCache(context.clinic_id, "visit-clients", nextClients);
      }
    } catch (error) {
      console.error("LOAD CLIENTS ERROR:", error);
      setMessage(error instanceof Error ? error.message : t.loadError);
    } finally {
      setLoadingClients(false);
    }
  }

  async function loadPets(clientId: string, forceRefresh = false) {
    setLoadingPets(true);

    try {
      const db = await getClinicDb();
      const cachedPets = forceRefresh ? null : readClinicCache<Pet[]>(clinicId, `visit-pets:${clientId}`);
      if (cachedPets) setPets(cachedPets);

      const { data, error } = await db
        .from("pets")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("LOAD PETS ERROR:", error);
        setMessage(error.message);
      } else {
        const nextPets = data || [];
        setPets(nextPets);
        writeClinicCache(clinicId, `visit-pets:${clientId}`, nextPets);
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

  async function loadVisitForEdit(visitId: string) {
    setLoadingDetails(true);
    setMessage("");
    try {
      const db = await getClinicDb();
      const { data: visit, error: visitError } = await db.from("visits").select("*").eq("id", visitId).single();
      if (visitError || !visit) throw visitError || new Error(t.loadError);

      const [petResult, medicationResult, prescriptionResult, vaccineResult, recordResult, attachmentResult] = await Promise.all([
        db.from("pets").select("*, client:clients (id, name, phone, email)").eq("id", visit.pet_id).single(),
        db.from("visit_medications").select("*").eq("visit_id", visitId),
        db.from("visit_prescriptions").select("*").eq("visit_id", visitId),
        db.from("vaccinations").select("*").eq("visit_id", visitId).order("administered_at", { ascending: true }),
        db.from("pet_medical_records").select("id,record_type,title,status,notes,performed_at").eq("visit_id", visitId),
        db.from("visit_attachments").select("id,file_name,storage_path,category").eq("visit_id", visitId).order("created_at", { ascending: true }),
      ]);
      if (petResult.error) throw petResult.error;
      if (medicationResult.error) throw medicationResult.error;
      if (prescriptionResult.error) throw prescriptionResult.error;
      if (vaccineResult.error) throw vaccineResult.error;
      if (recordResult.error) throw recordResult.error;
      if (attachmentResult.error) throw attachmentResult.error;

      const pet = petResult.data;
      if (!pet) throw new Error(t.loadError);
      const medicationRows = medicationResult.data || [];
      const prescriptionRows = prescriptionResult.data || [];
      const vaccineRows = vaccineResult.data || [];
      const medicalRows = recordResult.data || [];
      const attachmentRows = attachmentResult.data || [];
      const clinicContext = await getClinicContext();
      setClinicId(clinicContext.clinic_id || "");
      setPetDetails(pet as PetDetails);
      setSelectedPetId(visit.pet_id);
      setSelectedClientId(visit.client_id);
      setVisitDate(formatLocalDateTime(new Date(visit.visit_date)));
      setReason(visit.reason || "examination");
      setPerformingDoctor("__any__");
      setGroomingType("");
      setAppointmentId("");

      const noteLines = String(visit.notes || "").split(/\r?\n/);
      const getNoteValue = (pattern: RegExp) => noteLines.find((line) => pattern.test(line))?.split(":").slice(1).join(":").trim() || "";
      const doctorNote = getNoteValue(/^(?:Performing doctor|الطبيب المعالج):/i);
      if (doctorNote) setPerformingDoctor(doctorNote.includes("Any available") || doctorNote.includes("أي طبيب") ? "__any__" : doctorNote);
      const groomingNote = getNoteValue(/^(?:Grooming type|نوع التجميل):/i);
      setGroomingType(groomingNote);
      const appointmentNote = noteLines.find((line) => /^Appointment:/i.test(line));
      const appointment = appointmentNote?.split(":").slice(1).join(":").trim() || "";
      setAppointmentId(appointment);
      setVisitSource(appointment ? "appointment" : "new_visit");

      const examSections = String(visit.examination || "").split(/\n{2,}/);
      const firstExamSection = examSections[0] || "";
      const symptomLines = firstExamSection.split(/\r?\n/).filter(Boolean);
      const parsedSymptoms = symptomLines.map((line) => {
        const match = line.match(/^(.*?)\s*\((\d+)\s+(?:days|يوم)\)$/i);
        return match ? { id: crypto.randomUUID(), name: match[1].trim(), days: match[2] } : null;
      });
      const hasSymptomBlock = symptomLines.length > 0 && parsedSymptoms.every(Boolean);
      setSymptoms(hasSymptomBlock ? parsedSymptoms as SymptomDraft[] : []);
      const clinicalExam = (hasSymptomBlock ? examSections.slice(1).join("\n\n") : String(visit.examination || "")).trim();
      setExamStatus(clinicalExam.startsWith("Normal") ? "normal" : clinicalExam.startsWith("Abnormal") ? "abnormal" : "");
      setExamination(clinicalExam.replace(/^(?:Normal|Abnormal):?\s*/, ""));
      setDiagnosis(visit.diagnosis || "");
      setWeight(visit.weight == null ? "" : String(visit.weight));
      setTemperature(visit.temperature == null ? "" : String(visit.temperature));
      setHeartRate(visit.heart_rate == null ? "" : String(visit.heart_rate));
      setRespiratoryRate(visit.respiratory_rate == null ? "" : String(visit.respiratory_rate));

      const medicationIds = [...new Set(medicationRows.map((row) => row.medication_id).filter(Boolean))];
      const medicationNamesResult = medicationIds.length
        ? await db.from("medications").select(`
            id, name, active_ingredient, species, concentration, concentration_unit,
            dose_type, dose_value, dose_min, dose_max, dose_unit, route, frequency,
            duration_days, instructions
          `).in("id", medicationIds)
        : { data: [], error: null };
      if (medicationNamesResult.error) throw medicationNamesResult.error;
      const historicalMedications = (medicationNamesResult.data || []) as Medication[];
      const medicationNames = new Map(historicalMedications.map((row) => [row.id, row.name]));
      setMedications((current) => [...new Map([...current, ...historicalMedications].map((medication) => [medication.id, medication])).values()]);

      const serviceRows: VisitServiceDraft[] = [];
      const treatmentSections = String(visit.treatment || "").split(/\n{2,}/).filter(Boolean);
      const freeTreatmentSections = treatmentSections.filter((section) => {
        const lines = section.split(/\r?\n/).filter(Boolean);
        const parsedServiceLines = lines.map((line) => line.match(/^(.*?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*\((\d+(?:\.\d+)?)\s*EGP\)$/i));
        if (parsedServiceLines.length && parsedServiceLines.every(Boolean)) {
          for (const match of parsedServiceLines) {
            if (!match) continue;
            const quantity = Number(match[2]) || 1;
            serviceRows.push({ id: crypto.randomUUID(), name: match[1].trim(), quantity, price: Number(match[3]) / quantity });
          }
          return false;
        }
        const medicationText = lines.some((line) => [...medicationNames.values()].some((name) => line.startsWith(`${name}:`)));
        const prescriptionText = lines.some((line) => prescriptionRows.some((row) => line.startsWith(`${row.medication_name} -`) || line.startsWith(`[DrugEye`) || line.startsWith(`[Clinic medication`)));
        return !medicationText && !prescriptionText;
      });
      setVisitServices(serviceRows);
      setTreatment(freeTreatmentSections.join("\n\n"));

      const followUpNote = noteLines.find((line) => /^Follow-up:/i.test(line)) || "";
      const followUpValue = followUpNote.replace(/^Follow-up:\s*/i, "");
      const followUpDetail = followUpValue.split(" — ").slice(1).join(" — ").trim();
      const followUpLabel = followUpValue.split(" — ")[0].trim();
      const followUpCode = Object.entries({
        none: t.followUpNone, "3d": t.followUp3Days, "1w": t.followUp1Week, "2w": t.followUp2Weeks, "1m": t.followUp1Month, custom: t.followUpCustom,
      }).find(([, label]) => label === followUpLabel)?.[0] || "";
      setFollowUp(followUpCode);
      setFollowUpDetails(followUpDetail);

      const metadataPattern = /^(?:Appointment|Visit type|Performing doctor|الطبيب المعالج|Grooming type|نوع التجميل|Pre-surgery status|Post-surgery status|الحالة قبل الجراحة|الحالة بعد الجراحة|Follow-up):/i;
      setVisitNotes(noteLines.filter((line) => !metadataPattern.test(line)).join("\n").trim());

      setMedicationDrafts(medicationRows.map((row) => ({
        id: row.id, medication_id: row.medication_id, product_id: row.product_id || null,
        weight_kg: Number(row.weight_kg || visit.weight || 0), calculated_dose: Number(row.calculated_dose || 0),
        calculated_dose_unit: row.calculated_dose_unit || "", dose_per_kg: row.dose_per_kg == null ? null : Number(row.dose_per_kg),
        concentration: row.concentration == null ? null : Number(row.concentration), concentration_unit: row.concentration_unit,
        calculated_volume: row.calculated_volume == null ? null : Number(row.calculated_volume), volume_unit: row.volume_unit,
        route: row.route, frequency: row.frequency, duration_days: row.duration_days == null ? null : Number(row.duration_days), instructions: row.instructions,
      })));
      setFormularyDrafts(prescriptionRows.filter((row) => row.source === "bsava").map((row) => {
        const [appliedDose = "", frequency = "", route = ""] = String(row.prescription || "").split(" · ");
        return { id: row.id, product_id: row.product_id || null, drugId: 0, drugName: row.medication_name || "", activeIngredient: row.active_ingredient || "", species: pet.species || "", route, doseUnit: "", doseBasis: null, doseExpression: appliedDose, doseText: appliedDose, sourcePage: 0, sourceMin: 0, sourceMax: 0, calculatedMin: null, calculatedMax: null, appliedDose, adminDoseUnit: "", calculatedVolumeMin: null, calculatedVolumeMax: null, concentrationMgPerMl: null, clinicConcentrationMgPerMl: null, frequency, autoCalculated: false };
      }));
      setExternalMedicationDrafts(prescriptionRows.filter((row) => row.source !== "bsava").map((row) => {
        const [doseText = "", route = "", frequency = "", duration = "", instructions = ""] = String(row.prescription || "").split(" · ");
        return { id: row.id, product_id: row.product_id || null, productName: row.medication_name || "", activeIngredient: row.active_ingredient || null, manufacturer: null, price: null, doseText, route, frequency, duration, instructions, weightKg: null, source: row.source === "manual" ? "manual" as const : "DrugEye" as const, bsavaDrugName: null };
      }));
      const loadedVaccinations: VaccinationDraft[] = vaccineRows.map((row) => ({
        id: row.id, product_id: row.product_id || null, vaccine_name: row.vaccine_name || "", vaccine_type: row.vaccine_type || "", dose_stage: "manual",
        administered_at: row.administered_at ? formatLocalDateTime(new Date(row.administered_at)) : "", next_dose_at: row.next_dose_at ? formatLocalDateTime(new Date(row.next_dose_at)) : "",
        next_dose_manual: true, dose: row.dose || "", route: row.route || "", batch_number: row.batch_number || "", manufacturer: row.manufacturer || "", notes: row.notes || "",
      }));
      setVaccinations(loadedVaccinations);
      setOriginalVaccinations(loadedVaccinations);
      setOriginalMedicalRecords(medicalRows.map((row) => ({ id: row.id, record_type: row.record_type, status: row.status })));
      const labRows = medicalRows.filter((row) => row.record_type === "lab");
      const surgeryRow = medicalRows.find((row) => row.record_type === "surgery");
      setMedicalRecordDraft({
        labTests: labRows.map((row) => row.title).join("\n"), labNotes: labRows.map((row) => row.notes || "").filter(Boolean).join("\n"),
        labRecordIds: labRows.map((row) => row.id), surgeryRecordId: surgeryRow?.id || null,
        surgeryTitle: surgeryRow?.title || "", surgeryStatus: surgeryRow?.status === "completed" ? "completed" : "planned",
        surgeryBeforeStatus: String(surgeryRow?.notes || "").match(/Before:\s*(.*)/)?.[1] || getNoteValue(/^(?:Pre-surgery status|الحالة قبل الجراحة):/i),
        surgeryAfterStatus: String(surgeryRow?.notes || "").match(/After:\s*(.*)/)?.[1] || getNoteValue(/^(?:Post-surgery status|الحالة بعد الجراحة):/i),
        surgeryDate: surgeryRow?.performed_at ? String(surgeryRow.performed_at).slice(0, 10) : "", surgeryNotes: String(surgeryRow?.notes || "").split(/\r?\n/).filter((line) => !/^(Before|After):/.test(line)).join("\n"),
      });

      const session = await vetraCore.auth.getSession();
      const token = session.data.session?.access_token;
      const savedAttachments = await Promise.all(attachmentRows.map(async (row) => {
        let url = "";
        if (token) {
          const response = await fetch(`/api/visits/attachments?id=${encodeURIComponent(row.id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
          const result = await response.json().catch(() => null) as { url?: string } | null;
          if (response.ok) url = result?.url || "";
        }
        return { id: row.id, file_name: row.file_name, storage_path: row.storage_path, category: row.category as "analysis" | "xray", url };
      }));
      setExistingAttachments(savedAttachments);
      setRemovedAttachments([]);
      await loadVisits(visit.pet_id, true);
      setStarted(true);
    } catch (error) {
      console.error("LOAD VISIT FOR EDIT ERROR:", error);
      setMessage(error instanceof Error ? error.message : t.loadError);
    } finally {
      setLoadingDetails(false);
    }
  }

  async function loadVisits(petId: string, forceRefresh = false) {
    try {
      const db = await getClinicDb();
      const cachedVisits = forceRefresh ? null : readClinicCache<Visit[]>(clinicId, `visit-history:${petId}`);
      if (cachedVisits) setVisits(cachedVisits);

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

      const nextVisits = data || [];
      setVisits(nextVisits);
      writeClinicCache(clinicId, `visit-history:${petId}`, nextVisits);
    } catch (error) {
      console.error("LOAD VISITS ERROR:", error);
    }
  }

  async function refreshCache() {
    if (!clinicId) return;
    setRefreshingCache(true);
    clearClinicCache(clinicId);
    try {
      await loadClients(true);
      await loadMedications(true);
      if (selectedClientId) await loadPets(selectedClientId, true);
      if (selectedPetId) await loadVisits(selectedPetId, true);
    } finally {
      setRefreshingCache(false);
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

  async function loadMedications(forceRefresh = false) {
    try {
      const context = await getClinicContext();
      const cachedMedications = forceRefresh ? null : readClinicCache<Medication[]>(context.clinic_id, "medication-catalog");
      if (cachedMedications) setMedications(cachedMedications);
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
      const nextMedications = (data || []) as Medication[];
      setMedications((current) => [...new Map([...nextMedications, ...current].map((medication) => [medication.id, medication])).values()]);
      writeClinicCache(context.clinic_id, "medication-catalog", nextMedications);
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
      product_id: null,
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

  function addMedication(medicationId?: string): boolean {
    const targetMedicationId = medicationId || selectedMedicationId;
    const med = medications.find((item) => item.id === targetMedicationId);
    if (!med) return false;
    if (medicationDrafts.some((draft) => draft.medication_id === med.id)) return true;
    const draft = calculateMedicationDraft(med);
    if (!draft) {
      setMessage(language === "ar" ? "أدخل وزن الحيوان أولًا وتأكد أن الدواء له جرعة مسجلة." : "Enter the pet weight and make sure the medication has a configured dose.");
      return false;
    }
    setMedicationDrafts((current) => [...current, { ...draft, product_id: null }]);
    setSelectedMedicationId("");
    setMedicationSearch("");
    return true;
  }

  function removeMedication(id: string) {
    setMedicationDrafts((current) => current.filter((item) => item.id !== id));
  }

  function addVaccination() {
    if (!permissionsLoaded || !can("vaccinations", "create")) return;
    setVaccinations((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        product_id: null,
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
    if (!canChangeVaccine(id)) return;
    setVaccinations((current) => current.map((item) => {
      if (item.id !== id) return item;

      const typeChanged = patch.vaccine_type !== undefined;
      const nextType = patch.vaccine_type ?? item.vaccine_type;
      const nextAdministeredAt = patch.administered_at ?? item.administered_at;
      const typeKey = nextType.toLowerCase();
      const protocolKey = typeKey.includes("deworm") ? "deworm"
        : typeKey.includes("external") || typeKey.includes("parasite") ? "parasite"
        : typeKey.includes("rabies") ? "rabies"
        : typeKey.includes("viral") ? "viral" : "";
      const mappedProductIds = protocolKey ? vaccineProductMappings[protocolKey] || [] : [];
      const mappedProductId = typeChanged ? (mappedProductIds.length === 1 ? mappedProductIds[0] : null) : item.product_id;
      const mappedProduct = mappedProductId ? vaccineStockProducts.find((product) => product.id === mappedProductId) : null;
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
        product_id: patch.product_id !== undefined ? patch.product_id : mappedProductId,
        vaccine_name: patch.vaccine_name !== undefined ? patch.vaccine_name : mappedProduct?.name || (typeChanged ? "" : item.vaccine_name),
        dose_stage: stage,
        next_dose_manual: nextDoseManual,
        next_dose_at: nextDoseAt,
      };
    }));
  }

  function resetVaccinationNextDoseToAutomatic(id: string) {
    if (!canChangeVaccine(id)) return;
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
    if (!permissionsLoaded || !can("vaccinations", vaccinationIsSaved(id) ? "delete" : "create")) return;
    setVaccinations((current) => current.filter((item) => item.id !== id));
  }

  const selectedFollowUpLabel = useMemo(() => {
    const labels: Record<string, string> = language === "ar"
      ? { none: t.followUpNone, "3d": t.followUp3Days, "1w": t.followUp1Week, "2w": t.followUp2Weeks, "1m": t.followUp1Month, custom: t.followUpCustom }
      : { none: t.followUpNone, "3d": t.followUp3Days, "1w": t.followUp1Week, "2w": t.followUp2Weeks, "1m": t.followUp1Month, custom: t.followUpCustom };
    return labels[followUp] || "";
  }, [followUp, language, t]);

  async function saveVisit(createBill = false) {
    if (!permissionsLoaded || !can("medical_records", editVisitId ? "edit" : "create")) {
      setMessage(language === "ar" ? "لا تملك صلاحية حفظ هذه الزيارة." : "You do not have permission to save this visit.");
      return;
    }
    const changedVaccines = vaccinations.filter(v => JSON.stringify(v) !== JSON.stringify(originalVaccinations.find(o => o.id === v.id)));
    if (changedVaccines.some(v => !canChangeVaccine(v.id)) || (originalVaccinations.some(o => !vaccinations.some(v => v.id === o.id && v.vaccine_name.trim())) && !can("vaccinations", "delete"))) {
      setMessage(language === "ar" ? "لا تملك صلاحية تغيير التطعيمات المطلوبة." : "Missing permission for these vaccination changes."); return;
    }
    setMessage("");

    if (editVisitId && (!visitDate || Number.isNaN(new Date(visitDate).getTime()))) {
      setMessage(language === "ar" ? "حدد تاريخ ووقتًا صحيحين للزيارة." : "Choose a valid visit date and time.");
      return;
    }

    if (!selectedPetId || !selectedClientId) {
      setMessage(t.requiredFields);
      return;
    }

    if (petDetails?.is_deceased && !editVisitId) {
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
    const selectedVisitFee = reason === "followup" ? followUpFee : consultationFee;
    if (createBill && selectedVisitFee <= 0 && medicationBillLines.length === 0 && vaccinations.every((item) => !item.vaccine_name.trim()) && !visitServices.some((line) => line.name.trim() && line.price >= 0 && line.quantity > 0)) {
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
      if (currentPet.is_deceased && !editVisitId) {
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
        const source = draft.source === "manual" ? "Clinic medication / clinician entered" : "DrugEye / clinician-entered dose";
        return `[${source}] ${draft.productName}${metadata ? ` (${metadata})` : ""}: ${details.join(" - ")}`;
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
        performingDoctor.trim() ? `${language === "ar" ? "الطبيب المعالج" : "Performing doctor"}: ${performingDoctor === "__any__" ? (language === "ar" ? "أي طبيب متاح" : "Any available vet") : performingDoctor.trim()}` : "",
        reason === "grooming" && groomingType.trim() ? `${language === "ar" ? "نوع التجميل" : "Grooming type"}: ${groomingType.trim()}` : "",
        reason === "surgery" && medicalRecordDraft.surgeryBeforeStatus.trim() ? `${language === "ar" ? "الحالة قبل الجراحة" : "Pre-surgery status"}: ${medicalRecordDraft.surgeryBeforeStatus.trim()}` : "",
        reason === "surgery" && medicalRecordDraft.surgeryAfterStatus.trim() ? `${language === "ar" ? "الحالة بعد الجراحة" : "Post-surgery status"}: ${medicalRecordDraft.surgeryAfterStatus.trim()}` : "",
      ].filter(Boolean).join("\n");
      const finalVisitNotes = [visitNotes.trim(), followUpText, metadata].filter(Boolean).join("\n\n");

      const visitPayload = {
          client_id: selectedClientId,
          pet_id: selectedPetId,
          ...(editVisitId ? { visit_date: new Date(visitDate).toISOString() } : {}),
          reason: reason.trim() || null,
          examination: examinationWithSymptoms || null,
          diagnosis: diagnosis.trim() || null,
          treatment: finalTreatment || null,
          weight: weight ? Number(weight) : null,
          temperature: temperature ? Number(temperature) : null,
          heart_rate: heartRate ? Number(heartRate) : null,
          respiratory_rate: respiratoryRate ? Number(respiratoryRate) : null,
          notes: finalVisitNotes || null,
        };
      const { data: visit, error: visitError } = editVisitId
        ? await db.from("visits").update(visitPayload).eq("id", editVisitId).select("id").single()
        : await db.from("visits").insert(visitPayload).select("id").single();

      if (visitError || !visit) throw visitError || new Error(t.saveError);
      const uploadedAttachmentPaths: string[] = [];
      let createdInvoiceId = "";
      try {
        for (const item of attachments) {
          const { data: sessionData } = await vetraCore.auth.getSession();
          const token = sessionData.session?.access_token;
          if (!token) throw new Error(language === "ar" ? "انتهت جلسة الدخول. سجّل الدخول مرة أخرى." : "Your session expired. Sign in again.");
          const form = new FormData();
          form.append("file", item.file);
          form.append("visit_id", visit.id);
          form.append("client_id", selectedClientId);
          form.append("pet_id", selectedPetId);
          form.append("category", item.category);
          const response = await fetch("/api/visits/attachments", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
          const payload = await response.json().catch(() => null) as { attachment?: { id?: string; storage_path?: string }; error?: string } | null;
          if (!response.ok || !payload?.attachment?.storage_path) throw new Error(payload?.error || t.saveError);
          uploadedAttachmentPaths.push(payload.attachment.storage_path);
        }

        const medicalRows = [
          ...medicalRecordDraft.labTests.split(/\r?\n/).map((name) => name.trim()).filter(Boolean).map((title, index) => ({
            ...(editVisitId ? { id: medicalRecordDraft.labRecordIds[index] || crypto.randomUUID() } : {}),
            clinic_id: clinicContext.clinic_id, pet_id: selectedPetId, client_id: selectedClientId,
            visit_id: visit.id, record_type: "lab", title,
            status: originalMedicalRecords.find((row) => row.id === medicalRecordDraft.labRecordIds[index])?.status || "ordered",
            notes: medicalRecordDraft.labNotes.trim() || null,
          })),
          ...(reason === "surgery" && medicalRecordDraft.surgeryTitle.trim() ? [{
            ...(editVisitId ? { id: medicalRecordDraft.surgeryRecordId || crypto.randomUUID() } : {}),
            clinic_id: clinicContext.clinic_id, pet_id: selectedPetId, client_id: selectedClientId,
            visit_id: visit.id, record_type: "surgery", title: medicalRecordDraft.surgeryTitle.trim(),
            status: medicalRecordDraft.surgeryStatus, notes: [medicalRecordDraft.surgeryNotes.trim(), medicalRecordDraft.surgeryBeforeStatus.trim() ? `Before: ${medicalRecordDraft.surgeryBeforeStatus.trim()}` : "", medicalRecordDraft.surgeryAfterStatus.trim() ? `After: ${medicalRecordDraft.surgeryAfterStatus.trim()}` : ""].filter(Boolean).join("\n") || null,
            performed_at: medicalRecordDraft.surgeryDate ? new Date(`${medicalRecordDraft.surgeryDate}T12:00:00`).toISOString() : null,
          }] : []),
        ];
        if (medicalRows.length) {
          const { error: recordsError } = editVisitId
            ? await db.from("pet_medical_records").upsert(medicalRows)
            : await db.from("pet_medical_records").insert(medicalRows);
          if (recordsError) throw recordsError;
        }
        if (editVisitId) {
          const retainedIds = medicalRows.map((row) => "id" in row ? row.id : "");
          const removedIds = originalMedicalRecords.filter((row) => ["lab", "surgery"].includes(row.record_type) && !retainedIds.includes(row.id)).map((row) => row.id);
          if (removedIds.length) {
            const { error: removeRecordsError } = await db.from("pet_medical_records").delete().in("id", removedIds).eq("visit_id", visit.id);
            if (removeRecordsError) throw removeRecordsError;
          }
        }

        if (medicationDrafts.length) {
          const medicationRows = medicationDrafts.map((draft) => ({
            ...(editVisitId ? { id: draft.id } : {}),
            clinic_id: clinicContext.clinic_id,
            visit_id: visit.id,
            medication_id: draft.medication_id,
            product_id: draft.product_id || null,
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
          const { error: medError } = editVisitId
            ? await db.from("visit_medications").upsert(medicationRows)
            : await db.from("visit_medications").insert(medicationRows);
          if (medError) throw medError;
        }
        if (editVisitId) {
          const retainedIds = medicationDrafts.map((draft) => draft.id);
          const { data: existingRows, error: existingRowsError } = await db.from("visit_medications").select("id").eq("visit_id", visit.id);
          if (existingRowsError) throw existingRowsError;
          const removedIds = originalVaccinations.map(row => row.id).filter(id => !retainedIds.includes(id));
          if (removedIds.length) {
            const { error: removeError } = await db.from("visit_medications").delete().in("id", removedIds).eq("visit_id", visit.id);
            if (removeError) throw removeError;
          }
        }

        const prescriptionRows = [
          ...formularyDrafts.map((draft) => ({
            ...(editVisitId ? { id: draft.id } : {}),
            clinic_id: clinicContext.clinic_id,
            visit_id: visit.id,
            product_id: draft.product_id || null,
            medication_name: draft.drugName,
            active_ingredient: draft.activeIngredient || null,
            prescription: [draft.appliedDose || draft.doseExpression, draft.frequency, draft.route].filter(Boolean).join(" · "),
            source: "bsava" as const,
          })),
          ...externalMedicationDrafts.map((draft) => ({
            ...(editVisitId ? { id: draft.id } : {}),
            clinic_id: clinicContext.clinic_id,
            visit_id: visit.id,
            product_id: draft.product_id || null,
            medication_name: draft.productName,
            active_ingredient: draft.activeIngredient || null,
            prescription: [draft.doseText, draft.route, draft.frequency, draft.duration, draft.instructions].filter(Boolean).join(" · ") || null,
            source: draft.source === "manual" ? "manual" as const : "drug_eye" as const,
          })),
        ];
        if (prescriptionRows.length) {
          const { error: prescriptionError } = editVisitId
            ? await db.from("visit_prescriptions").upsert(prescriptionRows)
            : await db.from("visit_prescriptions").insert(prescriptionRows);
          if (prescriptionError) throw prescriptionError;
        }
        if (editVisitId) {
          const retainedIds = prescriptionRows.map((row) => row.id).filter((id): id is string => Boolean(id));
          const { data: existingRows, error: existingRowsError } = await db.from("visit_prescriptions").select("id").eq("visit_id", visit.id);
          if (existingRowsError) throw existingRowsError;
          const removedIds = (existingRows || []).map((row) => row.id).filter((id) => !retainedIds.includes(id));
          if (removedIds.length) {
            const { error: removeError } = await db.from("visit_prescriptions").delete().in("id", removedIds).eq("visit_id", visit.id);
            if (removeError) throw removeError;
          }
        }

        const validVaccinations = vaccinations.filter((v) => v.vaccine_name.trim());
        if (validVaccinations.length) {
          const vaccineRows = validVaccinations.filter(v => changedVaccines.some(c => c.id === v.id)).map((v) => ({
            ...(editVisitId ? { id: v.id } : {}),
            clinic_id: clinicContext.clinic_id,
            visit_id: visit.id,
            pet_id: selectedPetId,
            client_id: selectedClientId,
            vaccine_name: v.vaccine_name.trim(),
            vaccine_type: v.vaccine_type.trim() || null,
            product_id: v.product_id,
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
          for (const row of vaccineRows) {
            const result = row.id && vaccinationIsSaved(row.id)
              ? await db.from("vaccinations").update(row).eq("id", row.id).eq("visit_id", visit.id)
              : await db.from("vaccinations").insert(row);
            if (result.error) throw result.error;
          }
        }
        if (editVisitId) {
          const retainedIds = validVaccinations.map((v) => v.id);
          const { data: existingRows, error: existingRowsError } = await db.from("vaccinations").select("id").eq("visit_id", visit.id);
          if (existingRowsError) throw existingRowsError;
          const removedIds = (existingRows || []).map((row) => row.id).filter((id) => !retainedIds.includes(id));
          if (removedIds.length) {
            const { error: removeError } = await db.from("vaccinations").delete().in("id", removedIds).eq("visit_id", visit.id);
            if (removeError) throw removeError;
          }
        }

        if (createBill && !editVisitId) {
          const { data: { user } } = await vetraCore.auth.getUser();
          if (!user) throw new Error(language === "ar" ? "انتهت جلسة الدخول" : "Your session has expired");
          const invoiceLines = [
            ...((reason === "followup" ? followUpFee : consultationFee) > 0 ? [{ item_type: "service" as const, product_id: null, name: reason === "followup" ? "Follow-up" : "Consultation", quantity: 1, unit_price: reason === "followup" ? followUpFee : consultationFee }] : []),
            ...visitServices.filter((line) => line.name.trim()).map((line) => ({ item_type: "service" as const, product_id: null, name: line.name.trim(), quantity: line.quantity, unit_price: line.price })),
            ...medicationBillLines.map((line) => ({
              item_type: "service" as const,
              product_id: null,
              name: `${language === "ar" ? "حقنة دواء" : "Medication injection"}: ${line.name}`,
              quantity: medicationChargeQuantities[line.id] ?? 1,
              unit_price: medicationChargePrices[line.id] ?? injectionFee,
            })),
            ...validVaccinations.flatMap((v) => {
              const product = vaccineStockProducts.find((item) => item.id === v.product_id);
              return product ? [{ item_type: "service" as const, product_id: null, name: product.name, quantity: 1, unit_price: Number(product.retail_price) || 0 }] : [];
            }),
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
            clinic_id: clinicContext.clinic_id, invoice_id: invoice.id, item_type: line.item_type, product_id: line.product_id,
            service_name: line.item_type === "service" ? line.name : null, description: line.name, quantity: line.quantity, unit_price: line.unit_price,
            discount: 0, total: line.quantity * line.unit_price,
          })));
          if (itemError) throw itemError;
        }
        const dispenseItems = [
          ...drawerMedications.map((item) => ({ product_id: item.product_id, quantity: item.quantity, source_type: "medication" })),
          ...validVaccinations.filter((item) => item.product_id).map((item) => ({ product_id: item.product_id as string, quantity: 1, source_type: "vaccination" })),
        ];
        if (dispenseItems.length && !editVisitId) {
          const { error: dispenseError } = await db.rpc("vetra_dispense_visit_inventory", {
            p_visit_id: visit.id,
            p_items: dispenseItems,
          });
          if (dispenseError) throw dispenseError;
        }
        if (removedAttachments.length) {
          const { error: storageError } = await db.storage.from("visit-attachments").remove(removedAttachments.map((item) => item.storage_path));
          if (storageError) throw storageError;
          const { error: attachmentDeleteError } = await db.from("visit_attachments").delete().in("id", removedAttachments.map((item) => item.id)).eq("visit_id", visit.id);
          if (attachmentDeleteError) throw attachmentDeleteError;
        }
        if (editVisitId && existingAttachments.length) {
          for (const item of existingAttachments) {
            const { error: categoryError } = await db.from("visit_attachments").update({ category: item.category }).eq("id", item.id).eq("visit_id", visit.id);
            if (categoryError) throw categoryError;
          }
        }

        if (createBill && createdInvoiceId) {
          window.localStorage.setItem("vetra-data-version", String(Date.now()));
          router.push(`/invoices/${createdInvoiceId}`);
          return;
        }

      } catch (relatedSaveError) {
        if (!editVisitId) {
          await db.from("visit_medications").delete().eq("visit_id", visit.id);
          await db.from("visit_prescriptions").delete().eq("visit_id", visit.id);
          await db.from("vaccinations").delete().eq("visit_id", visit.id);
          await db.rpc("vetra_restore_visit_inventory", { p_visit_id: visit.id });
          await db.from("pet_medical_records").delete().eq("visit_id", visit.id);
          await db.from("visit_attachments").delete().eq("visit_id", visit.id);
          if (uploadedAttachmentPaths.length) await db.storage.from("visit-attachments").remove(uploadedAttachmentPaths);
          if (createdInvoiceId) await db.from("invoices").delete().eq("id", createdInvoiceId).eq("clinic_id", clinicContext.clinic_id);
          await db.from("visits").delete().eq("id", visit.id);
        } else if (uploadedAttachmentPaths.length) {
          await db.from("visit_attachments").delete().in("storage_path", uploadedAttachmentPaths).eq("visit_id", visit.id);
          await db.storage.from("visit-attachments").remove(uploadedAttachmentPaths);
        }
        throw relatedSaveError;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem("vetra-data-version", String(Date.now()));
      }

      setMessage(t.visitSaved);

      if (editVisitId) {
        clearClinicCache(clinicContext.clinic_id);
        await loadVisits(selectedPetId, true);
        router.push("/dashboard/visits");
        return;
      }

      setReason("examination");
      setPerformingDoctor(clinicContext.doctor_name || "__any__");
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
      setDrawerMedications([]);
      setMedicalRecordDraft(emptyMedicalRecordDraft);

      clearClinicCache(clinicContext.clinic_id);
      await loadVisits(selectedPetId, true);

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

  const medicationBillLines: MedicationBillLine[] = [
    ...medicationDrafts.map((draft) => ({ id: `clinic:${draft.id}`, name: medications.find((medication) => medication.id === draft.medication_id)?.name || "Medication" })),
    ...formularyDrafts.map((draft) => ({ id: `bsava:${draft.id}`, name: draft.drugName })),
    ...externalMedicationDrafts.map((draft) => ({ id: `external:${draft.id}`, name: draft.productName })),
    ...drawerMedications.map((item) => ({
      id: `drawer:${item.id}`,
      name: clinicStockProducts.find((product) => product.id === item.product_id)?.name || (language === "ar" ? "دواء من درج الأدوية" : "Medication drawer item"),
    })),
  ];
  const visitServiceTotal = visitServices.reduce((sum, service) => sum + Math.max(0, service.quantity) * Math.max(0, service.price), 0);
  const medicationChargeTotal = medicationBillLines.reduce((sum, line) => sum + Math.max(1, medicationChargeQuantities[line.id] ?? 1) * Math.max(0, medicationChargePrices[line.id] ?? injectionFee), 0);
  const vaccinationChargeTotal = vaccinations.reduce((sum, vaccination) => {
    const product = vaccineStockProducts.find((item) => item.id === vaccination.product_id);
    return sum + (vaccination.vaccine_name.trim() && product ? Math.max(0, Number(product.retail_price) || 0) : 0);
  }, 0);
  const baseVisitFee = reason === "followup" ? followUpFee : consultationFee;
  const visitBillTotal = baseVisitFee + visitServiceTotal + medicationChargeTotal + vaccinationChargeTotal;

  const pageClasses = darkMode
    ? "min-h-screen bg-[#0F1115] text-slate-100"
    : "min-h-screen bg-[#F7F8FA] text-slate-900";

  if (!permissionsLoaded || !can("medical_records", editVisitId ? "edit" : "create")) {
    return <main className="p-6" role="status">{!permissionsLoaded ? (language === "ar" ? "جارٍ تحميل الصلاحيات..." : "Loading permissions...") : (language === "ar" ? "لا تملك صلاحية إضافة أو تعديل هذه الزيارة." : "You do not have permission to add or edit this visit.")}</main>;
  }

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
                  {editVisitId ? (language === "ar" ? "تعديل الزيارة" : "Edit visit") : t.title}
                </h1>

                <p
                  className={`text-sm ${
                    darkMode ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  {editVisitId
                    ? (language === "ar" ? "عدّل بيانات الكشف والعلاج والأدوية والتطعيمات والمرفقات." : "Edit the visit examination, treatment, medications, vaccinations, and attachments.")
                    : t.subtitle}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={editVisitId ? "/dashboard/visits" : "/dashboard"}
              className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                darkMode
                  ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {editVisitId ? (language === "ar" ? "سجل الزيارات" : "Visit history") : t.dashboard}
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

            <ClinicCacheRefreshButton ar={language === "ar"} darkMode={darkMode} loading={refreshingCache} onRefresh={() => void refreshCache()} />

            <button
              type="button"
              onClick={() => { const next = !darkMode; setDarkMode(next); writeVetraThemeMode(next); }}
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

        {!editVisitId && <NewVisitPatientSelector
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
        />}

        {!editVisitId && showVisitStartModal && petDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="visit-start-title">
            <div className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`}>
              <h2 id="visit-start-title" className="text-xl font-bold">{language === "ar" ? "بدء زيارة" : "Start visit"}</h2>
              <p className="mt-1 text-sm text-slate-500">{petDetails.client?.name} · {petDetails.name}</p>
              <div className="mt-5 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {([["appointment", language === "ar" ? "موعد" : "Appointment"], ["new_visit", language === "ar" ? "بدء زيارة جديدة" : "Start a new visit"]] as const).map(([source, label]) => <button key={source} type="button" onClick={() => setVisitSource(source)} className={`rounded-lg border px-3 py-3 text-sm font-semibold ${visitSource === source ? "border-blue-500 bg-blue-600 text-white" : darkMode ? "border-slate-700" : "border-slate-200"}`}>{label}</button>)}
                </div>
                {visitSource === "appointment" ? <label className="block text-sm font-semibold">{language === "ar" ? "الموعد المسجل" : "Scheduled appointment"}
                  <select className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-3" value={appointmentId} onChange={(event) => {
                    const value = event.target.value;
                    if (value === "__add_new__") {
                      router.push(`/appointments?new=1&client=${encodeURIComponent(selectedClientId)}&pet=${encodeURIComponent(selectedPetId)}`);
                      return;
                    }
                    setAppointmentId(value);
                  }}>
                    <option value="">{language === "ar" ? "اختر موعدًا" : "Select an appointment"}</option>
                    {appointmentOptions.map((item) => <option key={item.id} value={item.id}>{item.appointment_date} {item.start_time?.slice(0, 5)}{item.reason ? ` · ${item.reason}` : ""}</option>)}
                    <option value="__add_new__">{language === "ar" ? "+ إضافة موعد جديد" : "+ Add new appointment"}</option>
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
              canChangeSelection={!editVisitId}
              onOldVisitSelect={setSelectedOldVisit}
            />

            <NewVisitEditorSection darkMode={darkMode} t={t} saving={saving} saveLabel={editVisitId ? (language === "ar" ? "حفظ تعديلات الزيارة" : "Save visit changes") : undefined} onSave={() => saveVisit(false)} onSaveWithBill={editVisitId ? undefined : () => saveVisit(true)} billLabel={language === "ar" ? "حفظ الزيارة وإنشاء فاتورة" : "Save visit & create bill"}>
              {editVisitId && <label className="block text-sm font-semibold lg:col-span-2">{language === "ar" ? "تاريخ ووقت الزيارة" : "Visit date and time"}
                <input type="datetime-local" required value={visitDate} onChange={(event) => setVisitDate(event.target.value)} className={`mt-2 w-full rounded-xl border p-3 ${darkMode ? "border-slate-700 bg-slate-950" : "border-slate-300 bg-white"}`} />
              </label>}
              <section className={`grid gap-4 rounded-2xl border p-4 sm:grid-cols-2 ${darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
                <label className="text-sm font-semibold">{language === "ar" ? "سبب الزيارة" : "Visit reason"}
                  <select required className="mt-2 w-full rounded-xl border border-slate-300 bg-transparent p-3" value={reason} onChange={(event) => setReason(event.target.value)}>
                    <option value="">{language === "ar" ? "اختر السبب" : "Select reason"}</option>
                    {[["examination", "Examination", "كشف"], ["vaccination", "Vaccination", "تطعيم"], ["surgery", "Surgery", "جراحة"], ["grooming", "Grooming", "تجميل"], ["followup", "Follow-up", "متابعة"]].map(([value, en, ar]) => <option key={value} value={value}>{language === "ar" ? ar : en}</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold">{language === "ar" ? "الطبيب الذي سيجري الزيارة" : "Performing doctor"}
                  <select className="mt-2 w-full rounded-xl border border-slate-300 bg-transparent p-3" value={performingDoctor} onChange={(event) => setPerformingDoctor(event.target.value)}>
                    <option value="__any__">{language === "ar" ? "أي طبيب متاح" : "Any available vet"}</option>
                    {availableDoctors.map((doctor) => <option key={doctor.id} value={doctor.full_name}>{doctor.full_name}{doctor.specialty ? ` · ${doctor.specialty}` : ""}</option>)}
                  </select>
                </label>
                {reason === "grooming" && <label className="text-sm font-semibold sm:col-span-2">{language === "ar" ? "نوع التجميل" : "Grooming type"}
                  <input className="mt-2 w-full rounded-xl border border-slate-300 bg-transparent p-3" value={groomingType} onChange={(event) => setGroomingType(event.target.value)} placeholder={language === "ar" ? "مثال: استحمام، قص شعر، قص أظافر" : "e.g. bath, haircut, nail trim"} />
                </label>}
              </section>
              <section className={`space-y-4 rounded-2xl border p-4 lg:col-span-2 ${darkMode ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-bold">{language === "ar" ? "الأعراض" : "Symptoms"}</h3>
                  <button type="button" onClick={() => setSymptoms((current) => [...current, { id: crypto.randomUUID(), name: "", days: "" }])} className="rounded-lg border border-cyan-500/30 px-3 py-2 text-sm font-semibold text-cyan-700 dark:text-cyan-300">{language === "ar" ? "+ عرض يدوي" : "+ Manual symptom"}</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(language === "ar" ? ["قيء", "إسهال", "كحة", "خمول", "قلة شهية", "حكة", "عطس", "عرج", "إفرازات العين"] : ["Vomiting", "Diarrhea", "Cough", "Lethargy", "Poor appetite", "Itching", "Sneezing", "Lameness", "Eye discharge"]).map((name) => {
                    const selected = symptoms.some((item) => item.name === name);
                    return <button key={name} type="button" onClick={() => setSymptoms((current) => selected ? current.filter((item) => item.name !== name) : [...current, { id: crypto.randomUUID(), name, days: "" }])} className={`rounded-full border px-3 py-2 text-xs font-bold transition ${selected ? "border-cyan-500 bg-cyan-500 text-white" : darkMode ? "border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/60" : "border-slate-300 bg-white text-slate-600 hover:border-cyan-400"}`}>{name}</button>;
                  })}
                </div>
                {symptoms.map((symptom) => <div key={symptom.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_40px]">
                  <input aria-label={language === "ar" ? "اسم العرض" : "Symptom name"} className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700" value={symptom.name} onChange={(event) => setSymptoms((current) => current.map((item) => item.id === symptom.id ? { ...item, name: event.target.value } : item))} placeholder={language === "ar" ? "العرض" : "Manual symptom"} />
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
                canViewVaccination={permissionsLoaded && can("vaccinations", "view")}
                canAddVaccination={permissionsLoaded && can("vaccinations", "create")}
                canEditVaccination={permissionsLoaded && can("vaccinations", "edit")}
                canDeleteVaccination={permissionsLoaded && can("vaccinations", "delete")}
                vaccinationIsSaved={vaccinationIsSaved}
                vaccinations={vaccinations}
                vaccineStockProducts={vaccineStockProducts}
                vaccineProductMappings={vaccineProductMappings}
                clinicStockProducts={clinicStockProducts}
                drawerMedications={drawerMedications}
                setDrawerMedications={setDrawerMedications}
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
              {medicationBillLines.length > 0 && (
                <section className={`space-y-3 rounded-2xl border p-4 lg:col-span-2 ${darkMode ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-slate-50"}`}>
                  <div>
                    <h3 className="font-bold">{language === "ar" ? "بنود الأدوية في الفاتورة" : "Medication bill items"}</h3>
                    <p className="mt-1 text-xs text-slate-500">{language === "ar" ? `السعر الافتراضي ${injectionFee.toFixed(2)} جنيه للحقنة. يمكنك تعديل سعر كل دواء هنا.` : `Default ${injectionFee.toFixed(2)} EGP per injection. Adjust each medication price here.`}</p>
                  </div>
                  <div className="space-y-2">
                    {medicationBillLines.map((line) => (
                      <div key={line.id} className={`grid items-center gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_90px_150px] ${darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{line.name}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">{language === "ar" ? "حقنة / بند دواء" : "Injection / medication charge"}</div>
                        </div>
                        <label className="flex items-center gap-2">
                          <span className="shrink-0 text-xs text-slate-500">{language === "ar" ? "العدد" : "Qty"}</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={medicationChargeQuantities[line.id] ?? 1}
                            onChange={(event) => setMedicationChargeQuantities((current) => ({ ...current, [line.id]: Math.max(1, Number(event.target.value) || 1) }))}
                            className={`w-full rounded-lg border px-2 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-950" : "border-slate-300 bg-white"}`}
                            aria-label={language === "ar" ? `عدد حقن ${line.name}` : `${line.name} injection quantity`}
                          />
                        </label>
                        <label className="flex items-center gap-2">
                          <span className="shrink-0 text-xs text-slate-500">{language === "ar" ? "السعر" : "Price"}</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={medicationChargePrices[line.id] ?? injectionFee}
                            onChange={(event) => setMedicationChargePrices((current) => ({ ...current, [line.id]: Math.max(0, Number(event.target.value) || 0) }))}
                            className={`w-full rounded-lg border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-950" : "border-slate-300 bg-white"}`}
                            aria-label={language === "ar" ? `سعر ${line.name}` : `${line.name} price`}
                          />
                          <span className="text-xs text-slate-500">EGP</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </section>
              )}
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
                  {baseVisitFee > 0 && <div className="flex justify-between"><span>{reason === "followup" ? (language === "ar" ? "المتابعة" : "Follow-up") : (language === "ar" ? "الكشف" : "Consultation")}</span><span>{baseVisitFee.toFixed(2)} EGP</span></div>}
                  <div className="flex justify-between"><span>{language === "ar" ? "الخدمات" : "Services"}</span><span>{visitServiceTotal.toFixed(2)} EGP</span></div>
                  {medicationChargeTotal > 0 && <div className="flex justify-between"><span>{language === "ar" ? "الأدوية والحقن" : "Medications and injections"}</span><span>{medicationChargeTotal.toFixed(2)} EGP</span></div>}
                  {vaccinationChargeTotal > 0 && <div className="flex justify-between"><span>{language === "ar" ? "التطعيمات" : "Vaccinations"}</span><span>{vaccinationChargeTotal.toFixed(2)} EGP</span></div>}
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
                {existingAttachments.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
                  {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-semibold text-cyan-700 underline dark:text-cyan-300">{item.file_name}</a> : <span className="min-w-0 flex-1 truncate">{item.file_name}</span>}
                  <select value={item.category} onChange={(event) => setExistingAttachments((current) => current.map((row) => row.id === item.id ? { ...row, category: event.target.value as ExistingVisitAttachment["category"] } : row))} className="rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700"><option value="analysis">{language === "ar" ? "تحليل" : "Analysis"}</option><option value="xray">{language === "ar" ? "أشعة" : "X-ray"}</option></select>
                  <button type="button" onClick={() => { setExistingAttachments((current) => current.filter((row) => row.id !== item.id)); setRemovedAttachments((current) => [...current, item]); }} className="px-2 py-1 text-rose-500" aria-label={language === "ar" ? "إزالة المرفق" : "Remove attachment"}>×</button>
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
