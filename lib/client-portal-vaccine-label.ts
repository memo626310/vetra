type ClientVaccineRecord = {
  id?: string;
  vaccine_name?: string | null;
  vaccine_type?: string | null;
  notes?: string | null;
};

type ClientVaccineLanguage = "ar" | "en";

function recordText(vaccine: ClientVaccineRecord) {
  return `${vaccine.vaccine_name || ""} ${vaccine.vaccine_type || ""} ${vaccine.notes || ""}`.toLocaleLowerCase();
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

export function clientVaccineLabel(
  vaccine: ClientVaccineRecord,
  language: ClientVaccineLanguage,
  fallback?: string,
) {
  const text = recordText(vaccine);

  if (hasAny(text, ["سعار", "rabies", "rabis"])) return language === "ar" ? "السعار" : "Rabies";
  if (hasAny(text, ["ثلاثي", "رباعي", "فيروسي", "فيروسى", "viral", "triple", "quad", "fvr", "fvrcp", "f3", "f4"])) return language === "ar" ? "الفيروسي" : "Viral vaccine";
  if (hasAny(text, ["ديدان", "deworm", "worm", "internal parasite", "anthelmint"])) return language === "ar" ? "الديدان" : "Deworming";
  if (hasAny(text, ["حشرات", "flea", "fleas", "tick", "ticks", "ecto", "external parasite", "براغيث", "قراد"])) return language === "ar" ? "الحشرات" : "Parasite control";

  return vaccine.vaccine_type?.trim() || fallback || (language === "ar" ? "تطعيم" : "Vaccination");
}

export function clientVaccineKey(vaccine: ClientVaccineRecord) {
  const text = recordText(vaccine);
  if (hasAny(text, ["سعار", "rabies", "rabis"])) return "rabies";
  if (hasAny(text, ["ثلاثي", "رباعي", "فيروسي", "فيروسى", "viral", "triple", "quad", "fvr", "fvrcp", "f3", "f4"])) return "viral";
  if (hasAny(text, ["ديدان", "deworm", "worm", "internal parasite", "anthelmint"])) return "deworming";
  if (hasAny(text, ["حشرات", "flea", "fleas", "tick", "ticks", "ecto", "external parasite", "براغيث", "قراد"])) return "parasite-control";
  return vaccine.vaccine_type?.trim().toLocaleLowerCase() || vaccine.id || "vaccination";
}
