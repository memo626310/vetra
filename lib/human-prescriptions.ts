export type HumanPrescription = {
  doseText: string;
  intervalHours: string;
  durationDays: string;
  route: string;
  instructions: string;
};

// Stored in the existing prescription text column, keeping older rows compatible.
const PREFIX = "[Human medication:v1] ";

export function isHumanMedication(value: { category?: unknown; source?: unknown; prescription?: unknown }): boolean {
  return value.category === "human" || value.source === "DrugEye" || value.source === "drug_eye" ||
    (typeof value.prescription === "string" && value.prescription.startsWith(PREFIX));
}

export function humanPrescriptionFromRecord(value: { source?: unknown; prescription?: unknown }): HumanPrescription | null {
  const parsed = parseHumanPrescription(value.prescription);
  if (parsed) return parsed;
  // Older DrugEye rows keep their clinician-entered schedule as readable text.
  return value.source === "drug_eye"
    ? humanPrescriptionFromDraft({ doseText: typeof value.prescription === "string" ? value.prescription : "" })
    : null;
}

export function humanPrescriptionFromDraft(value: Partial<HumanPrescription>): HumanPrescription {
  return { doseText: value.doseText || "", intervalHours: value.intervalHours || "", durationDays: value.durationDays || "", route: value.route || "", instructions: value.instructions || "" };
}

export function serializeHumanPrescription(value: HumanPrescription): string {
  return PREFIX + JSON.stringify(value);
}

export function parseHumanPrescription(value: unknown): HumanPrescription | null {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) return null;
  try {
    const data = JSON.parse(value.slice(PREFIX.length));
    if (!data || typeof data !== "object" ||
      !["doseText", "intervalHours", "durationDays", "route", "instructions"].every((key) => typeof data[key] === "string")) return null;
    return { doseText: data.doseText, intervalHours: data.intervalHours, durationDays: data.durationDays, route: data.route, instructions: data.instructions };
  } catch { return null; }
}

export function validHumanSchedule(value: Pick<HumanPrescription, "intervalHours" | "durationDays">): boolean {
  const hours = Number(value.intervalHours);
  const days = Number(value.durationDays);
  return Number.isFinite(hours) && hours > 0 && Number.isInteger(days) && days > 0;
}

export function humanPrescriptionDetails(value: HumanPrescription, ar: boolean): string {
  return [value.doseText, value.route,
    value.intervalHours ? (ar ? `كل ${value.intervalHours} ساعة` : `Every ${value.intervalHours} hours`) : "",
    value.durationDays ? (ar ? `لمدة ${value.durationDays} يوم` : `For ${value.durationDays} days`) : "",
    value.instructions].filter(Boolean).join(" · ");
}
