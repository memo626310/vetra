import { translations, type Language, type VisitTranslations } from "./new-visit-types";

export function speciesLabel(species: string, t: typeof translations.en) {
  const value = species?.toLowerCase();

  if (value === "cat") return t.cat;
  if (value === "dog") return t.dog;

  return t.other;
}

export function genderLabel(gender: string | null, t: typeof translations.en) {
  if (!gender) return "—";

  const value = gender.toLowerCase();

  if (value === "male") return t.male;
  if (value === "female") return t.female;

  return gender;
}

export function formatDate(date: string | null, language: Language) {
  if (!date) return "—";

  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function formatTime(date: string, language: Language) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function calculateAge(
  birthDate: string | null,
  language: Language
): string {
  if (!birthDate) return "—";

  const birth = new Date(birthDate);
  const today = new Date();

  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();

  if (months < 0) {
    years--;
    months += 12;
  }

  if (years > 0) {
    return language === "ar"
      ? `${years} سنة`
      : `${years} ${years === 1 ? "year" : "years"}`;
  }

  return language === "ar"
    ? `${months} شهر`
    : `${months} ${months === 1 ? "month" : "months"}`;
}

export function getDelta(
  latest: number | null,
  previous: number | null
): string | null {
  if (latest === null || previous === null) return null;

  const delta = latest - previous;

  if (delta === 0) return "0";

  return delta > 0 ? `+${delta}` : `${delta}`;
}

export type VaccinationStageOption = { value: string; en: string; ar: string };

export function getVaccinationStageOptions(vaccineType: string): VaccinationStageOption[] {
  switch (vaccineType.toLowerCase()) {
    case "viral":
      return [
        { value: "initial", en: "Initial dose", ar: "جرعة أولى" },
        { value: "booster", en: "Booster dose", ar: "جرعة تنشيطية" },
        { value: "annual", en: "Annual dose", ar: "جرعة سنوية" },
      ];
    case "rabies":
      return [
        { value: "initial", en: "Initial dose", ar: "جرعة أولى" },
        { value: "annual", en: "Annual dose", ar: "جرعة سنوية" },
      ];
    case "deworming":
      return [
        { value: "initial", en: "Initial dose", ar: "جرعة أولى" },
        { value: "booster", en: "14-day repeat", ar: "إعادة بعد 14 يومًا" },
        { value: "maintenance", en: "Every 2 months", ar: "كل شهرين" },
      ];
    default:
      return [{ value: "manual", en: "Manual / as needed", ar: "يدوي / حسب الحاجة" }];
  }
}

export function getDefaultVaccinationStage(vaccineType: string): string {
  return ["viral", "rabies", "deworming"].includes(vaccineType.toLowerCase())
    ? "initial"
    : "manual";
}

export function getVaccinationStageLabel(
  vaccineType: string,
  stage: string,
  language: Language
): string {
  const option = getVaccinationStageOptions(vaccineType).find((item) => item.value === stage);
  return option ? (language === "ar" ? option.ar : option.en) : "";
}

export function formatLocalDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function addMonthsClamped(date: Date, months: number): Date {
  const next = new Date(date);
  const originalDay = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(originalDay, lastDay));
  return next;
}

export function calculateNextVaccinationDose(
  vaccineType: string,
  stage: string,
  administeredAt: string
): string {
  if (!vaccineType || !stage || stage === "manual") return "";
  const date = new Date(administeredAt || Date.now());
  if (Number.isNaN(date.getTime())) return "";

  const type = vaccineType.toLowerCase();
  if (type === "viral") {
    if (stage === "initial") date.setDate(date.getDate() + 21);
    else if (stage === "booster" || stage === "annual") date.setFullYear(date.getFullYear() + 1);
    else return "";
  } else if (type === "rabies") {
    if (stage === "initial" || stage === "annual") date.setFullYear(date.getFullYear() + 1);
    else return "";
  } else if (type === "deworming") {
    if (stage === "initial") date.setDate(date.getDate() + 14);
    else if (stage === "booster" || stage === "maintenance") return formatLocalDateTime(addMonthsClamped(date, 2));
    else return "";
  } else {
    return "";
  }

  return formatLocalDateTime(date);
}

