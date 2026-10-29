import { getClinicDb } from "@/lib/clinic-db";
import {
  humanPrescriptionFromRecord,
  humanPrescriptionFromDraft,
  parseHumanPrescription,
  serializeHumanPrescription,
  validHumanSchedule,
  type HumanPrescription,
} from "@/lib/human-prescriptions";

export type HumanMedicationLibraryEntry = {
  medicationName: string;
  prescription: HumanPrescription | null;
  updatedAt: string;
};

export function humanMedicationNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Dose is entered for the current patient rather than copied from another visit. */
export function humanMedicationDefaultsForVisit(entry?: HumanMedicationLibraryEntry): HumanPrescription {
  return entry?.prescription && validHumanSchedule(entry.prescription)
    ? { ...entry.prescription, doseText: "" }
    : humanPrescriptionFromDraft({});
}

function storageKey(clinicId: string): string {
  return `vetra-human-medication-defaults:v1:${clinicId}`;
}

/** Reusable medication settings are separate from expiring patient visit drafts. */
export function readSavedHumanMedications(clinicId: string): HumanMedicationLibraryEntry[] {
  if (!clinicId) return [];
  try {
    const rows: unknown = JSON.parse(window.localStorage.getItem(storageKey(clinicId)) || "[]");
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((row) => {
      if (!row || typeof row.medicationName !== "string" || !row.medicationName.trim()
        || typeof row.updatedAt !== "string" || !Number.isFinite(Date.parse(row.updatedAt))) return [];
      const prescription = parseHumanPrescription(row.prescription);
      return prescription && validHumanSchedule(prescription)
        ? [{ medicationName: row.medicationName, prescription, updatedAt: row.updatedAt }]
        : [];
    });
  } catch { return []; }
}

/** Earlier entries win, so explicit defaults take priority over visit history. */
export function mergeHumanMedicationLibrary(...groups: HumanMedicationLibraryEntry[][]): HumanMedicationLibraryEntry[] {
  const entries = new Map<string, HumanMedicationLibraryEntry>();
  for (const entry of groups.flat()) {
    const key = humanMedicationNameKey(entry.medicationName);
    if (key && !entries.has(key)) entries.set(key, entry);
  }
  return [...entries.values()];
}

function cacheEntry(clinicId: string, entry: HumanMedicationLibraryEntry): boolean {
  try {
    const entries = mergeHumanMedicationLibrary([entry], readSavedHumanMedications(clinicId));
    window.localStorage.setItem(storageKey(clinicId), JSON.stringify(entries.map((item) => ({
      ...item, prescription: item.prescription ? serializeHumanPrescription(item.prescription) : null,
    }))));
    return true;
  } catch { return false; }
}

function missingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205"
    || /relation .* does not exist|table .* not found|could not find the table/i.test(error.message || "")));
}

export async function loadHumanMedicationLibrary(clinicId: string, search: string): Promise<HumanMedicationLibraryEntry[]> {
  const cached = readSavedHumanMedications(clinicId);
  const db = await getClinicDb();
  let templatesRequest = db.from("human_medication_templates")
    .select("medication_name,prescription,updated_at").eq("clinic_id", clinicId)
    .order("updated_at", { ascending: false }).limit(100);
  let historyRequest = db.from("visit_prescriptions")
    .select("medication_name,source,prescription,created_at").eq("clinic_id", clinicId)
    .in("source", ["manual", "drug_eye"]).order("created_at", { ascending: false }).limit(100);
  if (search) {
    const pattern = `%${search.replace(/[%_\\]/g, "\\$&")}%`;
    templatesRequest = templatesRequest.ilike("medication_name", pattern);
    historyRequest = historyRequest.ilike("medication_name", pattern);
  }
  const [templates, history] = await Promise.all([templatesRequest, historyRequest]);
  if (templates.error && history.error && !cached.length) {
    throw missingTable(templates.error) ? history.error : templates.error;
  }
  const saved: HumanMedicationLibraryEntry[] = (templates.data || []).flatMap((row) => {
    const prescription = parseHumanPrescription(row.prescription);
    return prescription && validHumanSchedule(prescription)
      ? [{ medicationName: String(row.medication_name), prescription, updatedAt: String(row.updated_at) }]
      : [];
  });
  const previous: HumanMedicationLibraryEntry[] = (history.data || []).flatMap((row) => {
    const prescription = humanPrescriptionFromRecord(row);
    return prescription ? [{ medicationName: String(row.medication_name), prescription, updatedAt: String(row.created_at) }] : [];
  });
  const explicitDefaults = [...cached, ...saved].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return mergeHumanMedicationLibrary(explicitDefaults, previous)
    .filter((entry) => !search || humanMedicationNameKey(entry.medicationName).includes(humanMedicationNameKey(search)));
}

export async function saveHumanMedicationDefaults(clinicId: string, medicationName: string, prescription: HumanPrescription): Promise<{
  entry: HumanMedicationLibraryEntry;
  storage: "clinic" | "device";
}> {
  const cleanName = medicationName.trim().replace(/\s+/g, " ");
  if (!clinicId || !cleanName || !validHumanSchedule(prescription)) throw new Error("Invalid medication defaults.");
  const entry = { medicationName: cleanName, prescription: { ...prescription }, updatedAt: new Date().toISOString() };
  const cached = cacheEntry(clinicId, entry);
  try {
    const db = await getClinicDb();
    const { error } = await db.from("human_medication_templates").upsert({
      clinic_id: clinicId,
      medication_name: cleanName,
      prescription: serializeHumanPrescription(prescription),
      updated_at: entry.updatedAt,
    }, { onConflict: "clinic_id,name_key" });
    if (error) throw error;
    return { entry, storage: "clinic" };
  } catch (error) {
    if (!cached) throw error;
    return { entry, storage: "device" };
  }
}
