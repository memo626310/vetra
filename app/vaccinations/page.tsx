"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";

type Lang = "ar" | "en";
type Status = "not_due" | "current" | "grace" | "overdue" | "due" | "no_repeat";

type Client = {
  id: string;
  name: string;
  client_code: string;
  phone: string | null;
};

type Pet = {
  id: string;
  client_id: string;
  name: string;
  species: string;
  breed: string | null;
  birth_date: string | null;
  is_deceased: boolean | null;
  client: Client | null;
};

type Vaccine = {
  id: string;
  pet_id: string;
  client_id: string | null;
  visit_id: string | null;
  vaccine_name: string | null;
  vaccine_type: string | null;
  administered_at: string | null;
  next_dose_at: string | null;
  dose: string | null;
  route: string | null;
  batch_number: string | null;
  manufacturer: string | null;
  notes: string | null;
};

type ProtocolItem = {
  key: "viral" | "rabies" | "deworm" | "parasite";
  titleAr: string;
  titleEn: string;
  status: Status;
  due: string | null;
  record: Vaccine | null;
  subtitleAr: string;
  subtitleEn: string;
};

type DueItem = {
  pet: Pet;
  vaccine: string;
  vaccineType: string;
  due: string | null;
  status: Status;
  days: number | null;
  source: "protocol" | "record";
};

const T = {
  ar: {
    title: "التطعيمات والرعاية الوقائية",
    subtitle: "متابعة التطعيمات، الجرعات القادمة، والمتأخرات داخل العيادة",
    back: "العودة للرئيسية",
    newVisit: "كشف / تطعيم جديد",
    search: "ابحث باسم الحيوان أو العميل أو Client ID أو نوع التطعيم...",
    all: "الكل",
    overdue: "متأخر",
    dueToday: "مستحق اليوم",
    dueSoon: "خلال 30 يوم",
    upToDate: "منتظم",
    upcoming: "الاستحقاقات القادمة",
    history: "آخر التطعيمات",
    pets: "الحيوانات",
    owner: "العميل",
    vaccine: "التطعيم",
    dueDate: "الاستحقاق",
    status: "الحالة",
    action: "إجراء",
    openPet: "فتح الملف",
    openOwner: "فتح العميل",
    noDue: "مفيش استحقاقات مطلوبة حاليًا",
    noHistory: "مفيش تطعيمات مسجلة",
    loading: "جاري تحميل التطعيمات...",
    loadError: "تعذر تحميل بيانات التطعيمات",
    retry: "إعادة المحاولة",
    onTrack: "منتظم",
    grace: "فترة السماح",
    notDue: "لسه مش مستحق",
    reset: "إعادة البروتوكول",
    noUpcoming: "مفيش مواعيد قادمة",
    noRepeatDate: "بدون تاريخ تكرار",
    noRepeatStatus: "بدون موعد تكرار",
    dueNow: "مستحق الآن",
    ageUnknown: "تاريخ الميلاد غير مسجل — لا يمكن حساب موعد البداية",
    days: "يوم",
    overdueBy: "متأخر",
    inDays: "خلال",
    viral: "الفيروسي",
    rabies: "السعار",
    deworm: "الديدان",
    parasite: "الحشرات",
    viralRule: "45 يوم → بعد 21 يوم → سنوي",
    rabiesRule: "من 3 شهور → سنوي",
    dewormRule: "3 شهور → بعد 14 يوم → كل شهرين",
    parasiteRule: "من أول يوم → حسب الحاجة",
    primary: "البروتوكول",
    recorded: "مسجل",
    clinic: "العيادة",
    database: "قاعدة البيانات",
    ready: "جاهزة",
    language: "English",
    theme: "الوضع",
  },
  en: {
    title: "Vaccinations & Preventive Care",
    subtitle: "Track vaccinations, upcoming doses, and overdue preventive care",
    back: "Dashboard",
    newVisit: "New Visit / Vaccination",
    search: "Search pet, owner, Client ID, or vaccine type...",
    all: "All",
    overdue: "Overdue",
    dueToday: "Due today",
    dueSoon: "Next 30 days",
    upToDate: "On track",
    upcoming: "Upcoming due dates",
    history: "Recent vaccinations",
    pets: "Pet",
    owner: "Owner",
    vaccine: "Vaccine",
    dueDate: "Due date",
    status: "Status",
    action: "Action",
    openPet: "Open pet",
    openOwner: "Open owner",
    noDue: "No vaccination items are currently due",
    noHistory: "No vaccinations recorded",
    loading: "Loading vaccinations...",
    loadError: "Could not load vaccination data",
    retry: "Retry",
    onTrack: "On track",
    grace: "Grace period",
    notDue: "Not due yet",
    reset: "Restart protocol",
    noUpcoming: "No upcoming dates",
    noRepeatDate: "No repeat date",
    noRepeatStatus: "No repeat date",
    dueNow: "Due now",
    ageUnknown: "Birth date is missing — start date cannot be calculated",
    days: "days",
    overdueBy: "overdue",
    inDays: "in",
    viral: "Viral vaccine",
    rabies: "Rabies",
    deworm: "Deworming",
    parasite: "Parasite control",
    viralRule: "45 days → after 21 days → annually",
    rabiesRule: "From 3 months → annually",
    dewormRule: "3 months → after 14 days → every 2 months",
    parasiteRule: "From day one → as needed",
    primary: "Protocol",
    recorded: "Recorded",
    clinic: "Clinic",
    database: "Database",
    ready: "Ready",
    language: "العربية",
    theme: "Theme",
  },
} as const;

const DAY_MS = 86400000;
const GRACE_DAYS = 7;

function normalize(value: string | null | undefined) {
  return (value || "").toLowerCase().trim();
}

function recordText(v: Vaccine) {
  return `${v.vaccine_name || ""} ${v.vaccine_type || ""} ${v.notes || ""}`.toLowerCase();
}

function isViral(v: Vaccine) {
  return [
    "ثلاثي",
    "رباعي",
    "فيروسي",
    "فيروسى",
    "viral",
    "triple",
    "quad",
    "fvr",
    "fvrcp",
    "f3",
    "f4",
  ].some((x) => recordText(v).includes(x));
}

function isRabies(v: Vaccine) {
  return ["سعار", "rabies", "rabis"].some((x) =>
    recordText(v).includes(x)
  );
}

function isDeworm(v: Vaccine) {
  return [
    "ديدان",
    "deworm",
    "worm",
    "internal parasite",
    "anthelmint",
  ].some((x) => recordText(v).includes(x));
}

function isParasite(v: Vaccine) {
  return [
    "حشرات",
    "flea",
    "fleas",
    "tick",
    "ticks",
    "ecto",
    "external parasite",
    "براغيث",
    "قراد",
  ].some((x) => recordText(v).includes(x));
}

function dateOnly(value: string) {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function addDays(value: string, days: number) {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}


function daysUntil(value: string) {
  const now = new Date();
  const target = new Date(value);
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const due = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  ).getTime();

  return Math.ceil((due - today) / DAY_MS);
}

function ageDays(birth: string | null) {
  if (!birth) return null;

  return Math.floor(
    (dateOnly(new Date().toISOString()) - dateOnly(birth)) / DAY_MS
  );
}

function careState(due: string | null): Status {
  if (!due) return "no_repeat";

  const d = daysUntil(due);

  if (d > 0) return "current";
  if (d >= -GRACE_DAYS) return "grace";
  return "overdue";
}

function latest(
  records: Vaccine[],
  matcher: (v: Vaccine) => boolean
) {
  return (
    records
      .filter((v) => matcher(v) && v.administered_at)
      .sort(
        (a, b) =>
          +new Date(b.administered_at as string) -
          +new Date(a.administered_at as string)
      )[0] || null
  );
}

/**
 * Same vaccination protocol currently used by the Client Portal.
 * Kept local to this page on purpose so the existing Client Portal
 * is not refactored or touched.
 */
function protocolStatus(records: Vaccine[], pet: Pet): ProtocolItem[] {
  const age = ageDays(pet.birth_date);
  const result: ProtocolItem[] = [];

  const viralRecords = records
    .filter((v) => isViral(v) && v.administered_at)
    .sort(
      (a, b) =>
        +new Date(a.administered_at as string) -
        +new Date(b.administered_at as string)
    );

  if (age !== null && age < 45) {
    result.push({
      key: "viral",
      titleAr: "الفيروسي",
      titleEn: "Viral vaccine",
      status: "not_due",
      due: addDays(
        pet.birth_date as string,
        45 - age
      ),
      subtitleAr: "لسه قبل سن البداية",
      subtitleEn: "Before the starting age",
      record: null,
    });
  } else if (!viralRecords.length) {
    const status: Status = age === null ? "no_repeat" : "due";

    result.push({
      key: "viral",
      titleAr: "الفيروسي",
      titleEn: "Viral vaccine",
      status,
      due: null,
      subtitleAr:
        age === null
          ? T.ar.ageUnknown
          : "الجرعة الأولى مستحقة الآن",
      subtitleEn:
        age === null
          ? T.en.ageUnknown
          : "First dose is due now",
      record: null,
    });
  } else if (viralRecords.length === 1) {
    const first = viralRecords[0];
    const due = first.next_dose_at || null;
    const status = careState(due);

    result.push({
      key: "viral",
      titleAr: "الفيروسي",
      titleEn: "Viral vaccine",
      status,
      due,
      subtitleAr: due
        ? status === "overdue"
          ? "عدّت فترة السماح — يبدأ البروتوكول من جديد"
          : "في انتظار الجرعة الثانية"
        : "بدون تاريخ تكرار مسجل",
      subtitleEn: due
        ? status === "overdue"
          ? "Grace period passed — protocol restarts"
          : "Waiting for the second dose"
        : "No repeat date recorded",
      record: first,
    });
  } else {
    const first = viralRecords[0];
    const second = viralRecords[1];

    const expectedSecond =
      first.next_dose_at ||
      addDays(first.administered_at as string, 21);

    const secondDaysLate = Math.max(
      0,
      Math.floor(
        (dateOnly(second.administered_at as string) -
          dateOnly(expectedSecond)) /
          DAY_MS
      )
    );

    if (secondDaysLate > GRACE_DAYS) {
      const restartDue = addDays(
        second.administered_at as string,
        21
      );

      result.push({
        key: "viral",
        titleAr: "الفيروسي",
        titleEn: "Viral vaccine",
        status: careState(restartDue),
        due: restartDue,
        subtitleAr:
          "الجرعة الثانية اتأخرت أكثر من 7 أيام — تم إعادة البروتوكول",
        subtitleEn:
          "Second dose was more than 7 days late — protocol restarted",
        record: second,
      });
    } else {
      const last =
        viralRecords[viralRecords.length - 1];

      const due = last.next_dose_at || null;
      const status = careState(due);

      result.push({
        key: "viral",
        titleAr: "الفيروسي",
        titleEn: "Viral vaccine",
        status,
        due,
        subtitleAr: due
          ? status === "overdue"
            ? "التكرار السنوي متأخر"
            : "الجرعات الأساسية مكتملة — متابعة سنوية"
          : "بدون تاريخ تكرار مسجل",
        subtitleEn: due
          ? status === "overdue"
            ? "Annual booster is overdue"
            : "Primary series complete — annual follow-up"
          : "No repeat date recorded",
        record: last,
      });
    }
  }

  const rabies = latest(records, isRabies);

  if (age !== null && age < 90) {
    result.push({
      key: "rabies",
      titleAr: "السعار",
      titleEn: "Rabies",
      status: "not_due",
      due: addDays(
        pet.birth_date as string,
        90 - age
      ),
      subtitleAr: "لسه قبل سن البداية",
      subtitleEn: "Before the starting age",
      record: null,
    });
  } else if (!rabies) {
    const status: Status = age === null ? "no_repeat" : "due";

    result.push({
      key: "rabies",
      titleAr: "السعار",
      titleEn: "Rabies",
      status,
      due: null,
      subtitleAr:
        age === null
          ? T.ar.ageUnknown
          : "الجرعة الأولى مستحقة الآن",
      subtitleEn:
        age === null
          ? T.en.ageUnknown
          : "First dose is due now",
      record: null,
    });
  } else {
    const due = rabies.next_dose_at || null;
    const status = careState(due);

    result.push({
      key: "rabies",
      titleAr: "السعار",
      titleEn: "Rabies",
      status,
      due,
      subtitleAr: due
        ? status === "overdue"
          ? "التكرار السنوي متأخر"
          : "منتظم سنويًا"
        : "بدون تاريخ تكرار مسجل",
      subtitleEn: due
        ? status === "overdue"
          ? "Annual booster is overdue"
          : "Annual follow-up is on track"
        : "No repeat date recorded",
      record: rabies,
    });
  }

  const dewormRecords = records
    .filter((v) => isDeworm(v) && v.administered_at)
    .sort(
      (a, b) =>
        +new Date(a.administered_at as string) -
        +new Date(b.administered_at as string)
    );

  if (age !== null && age < 90) {
    result.push({
      key: "deworm",
      titleAr: "الديدان",
      titleEn: "Deworming",
      status: "not_due",
      due: addDays(
        pet.birth_date as string,
        90 - age
      ),
      subtitleAr: "يبدأ من عمر 3 شهور",
      subtitleEn: "Starts at 3 months",
      record: null,
    });
  } else if (!dewormRecords.length) {
    const status: Status = age === null ? "no_repeat" : "due";

    result.push({
      key: "deworm",
      titleAr: "الديدان",
      titleEn: "Deworming",
      status,
      due: null,
      subtitleAr:
        age === null
          ? T.ar.ageUnknown
          : "الجرعة الأولى مستحقة الآن",
      subtitleEn:
        age === null
          ? T.en.ageUnknown
          : "First dose is due now",
      record: null,
    });
  } else if (dewormRecords.length === 1) {
    const first = dewormRecords[0];
    const due = first.next_dose_at || null;
    const status = careState(due);

    result.push({
      key: "deworm",
      titleAr: "الديدان",
      titleEn: "Deworming",
      status,
      due,
      subtitleAr: due
        ? status === "overdue"
          ? "عدّت فترة السماح — إعادة الجرعة الأولى"
          : "في انتظار جرعة الـ14 يوم"
        : "بدون تاريخ تكرار مسجل",
      subtitleEn: due
        ? status === "overdue"
          ? "Grace passed — restart the first-dose cycle"
          : "Waiting for the 14-day repeat"
        : "No repeat date recorded",
      record: first,
    });
  } else {
    const first = dewormRecords[0];
    const second = dewormRecords[1];

    const expectedSecond =
      first.next_dose_at ||
      addDays(first.administered_at as string, 14);

    const secondDaysLate = Math.max(
      0,
      Math.floor(
        (dateOnly(second.administered_at as string) -
          dateOnly(expectedSecond)) /
          DAY_MS
      )
    );

    if (secondDaysLate > GRACE_DAYS) {
      const restartDue = addDays(
        second.administered_at as string,
        14
      );

      result.push({
        key: "deworm",
        titleAr: "الديدان",
        titleEn: "Deworming",
        status: careState(restartDue),
        due: restartDue,
        subtitleAr:
          "جرعة الـ14 يوم اتأخرت أكثر من 7 أيام — تم إعادة البروتوكول",
        subtitleEn:
          "The 14-day repeat was more than 7 days late — protocol restarted",
        record: second,
      });
    } else {
      const last =
        dewormRecords[dewormRecords.length - 1];

      const due = last.next_dose_at || null;
      const status = careState(due);

      result.push({
        key: "deworm",
        titleAr: "الديدان",
        titleEn: "Deworming",
        status,
        due,
        subtitleAr: due
          ? status === "overdue"
            ? "الجرعة الدورية متأخرة"
            : "منتظم كل شهرين"
          : "بدون تاريخ تكرار مسجل",
        subtitleEn: due
          ? status === "overdue"
            ? "Routine deworming is overdue"
            : "Every-2-month routine is on track"
          : "No repeat date recorded",
        record: last,
      });
    }
  }

  const parasite = latest(records, isParasite);

  result.push({
    key: "parasite",
    titleAr: "الحشرات",
    titleEn: "Parasite control",
    status: "current",
    due: parasite?.next_dose_at || null,
    subtitleAr: "حسب الحاجة",
    subtitleEn: "As needed",
    record: parasite,
  });

  return result;
}

function statusLabel(status: Status, lang: Lang) {
  if (status === "overdue") {
    return lang === "ar" ? "متأخر" : "Overdue";
  }

  if (status === "due") {
    return lang === "ar" ? "مستحق الآن" : "Due now";
  }

  if (status === "grace") {
    return lang === "ar" ? "فترة السماح" : "Grace period";
  }

  if (status === "not_due") {
    return lang === "ar" ? "لسه مش مستحق" : "Not due yet";
  }

  if (status === "no_repeat") {
    return lang === "ar" ? "بدون موعد تكرار" : "No repeat date";
  }

  return lang === "ar" ? "منتظم" : "On track";
}

function statusClasses(status: Status) {
  switch (status) {
    case "overdue":
      return "bg-rose-500/10 text-rose-300 border-rose-400/20";
    case "due":
      return "bg-amber-500/10 text-amber-300 border-amber-400/20";
    case "grace":
      return "bg-amber-500/10 text-amber-300 border-amber-400/20";
    case "not_due":
      return "bg-slate-500/10 text-slate-300 border-white/10";
    case "no_repeat":
      return "bg-slate-500/10 text-slate-300 border-white/10";
    default:
      return "bg-emerald-500/10 text-emerald-300 border-emerald-400/20";
  }
}

function petIcon(species: string) {
  const value = normalize(species);

  if (value.includes("cat") || value.includes("قط")) return "🐱";
  if (value.includes("dog") || value.includes("كلب")) return "🐶";
  return "🐾";
}

function dateText(
  value: string | null,
  lang: Lang
) {
  if (!value) return "—";

  return new Intl.DateTimeFormat(
    lang === "ar" ? "ar-EG" : "en-US",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  ).format(new Date(value));
}

export default function ClinicVaccinationsPage() {
  const router = useRouter();

  const [lang, setLang] = useState<Lang>("ar");
  const [dark, setDark] = useState(true);

  const [pets, setPets] = useState<Pet[]>([]);
  const [vaccines, setVaccines] = useState<Vaccine[]>([]);

  const [clinicName, setClinicName] = useState("VETRA");
  const [databaseStatus, setDatabaseStatus] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<
    "all" | "overdue" | "today" | "soon" | "current"
  >("all");

  useEffect(() => {
    const savedLang =
      localStorage.getItem("vetra-language");
    const savedTheme =
      localStorage.getItem("vetra-theme");

    if (savedLang === "ar" || savedLang === "en") {
      setLang(savedLang);
    }

    setDark(savedTheme !== "light");
  }, []);

  useEffect(() => {
    localStorage.setItem("vetra-language", lang);
    localStorage.setItem(
      "vetra-theme",
      dark ? "dark" : "light"
    );

    document.documentElement.dir =
      lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang =
      lang === "ar" ? "ar" : "en";
    document.documentElement.classList.toggle(
      "dark",
      dark
    );
  }, [lang, dark]);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const { data: userData } =
        await vetraCore.auth.getUser();

      if (!userData.user) {
        router.replace("/login");
        return;
      }

      const context =
        await getClinicContext();

      setClinicName(
        context.clinic_name || "VETRA"
      );
      setDatabaseStatus(
        context.database_status || ""
      );

      const db = await getClinicDb();

      const [petsResult, vaccinesResult] = await Promise.all([
        db
          .from("pets")
          .select(`
            id,
            client_id,
            name,
            species,
            breed,
            birth_date,
            is_deceased
          `)
          .eq("clinic_id", context.clinic_id)
          .eq("is_deceased", false)
          .order("name", { ascending: true }),

        db
          .from("vaccinations")
          .select(`
            id,
            pet_id,
            client_id,
            visit_id,
            vaccine_name,
            vaccine_type,
            administered_at,
            next_dose_at,
            dose,
            route,
            batch_number,
            manufacturer,
            notes
          `)
          .eq("clinic_id", context.clinic_id)
          .order("administered_at", { ascending: false }),
      ]);

      if (petsResult.error) throw petsResult.error;
      if (vaccinesResult.error) throw vaccinesResult.error;

      const rawPets = (petsResult.data || []) as Array<Omit<Pet, "client">>;
      const clientIds = Array.from(
        new Set(rawPets.map((pet) => pet.client_id).filter(Boolean))
      ) as string[];

      const clientsResult = clientIds.length
        ? await db
            .from("clients")
            .select("id, name, client_code, phone")
            .in("id", clientIds)
        : { data: [], error: null };

      if (clientsResult.error) throw clientsResult.error;

      const clientsMap = new Map<string, Client>(
        ((clientsResult.data || []) as Client[]).map((client) => [
          client.id,
          client,
        ])
      );

      const petsWithClients = rawPets.map((pet) => ({
        ...pet,
        client: clientsMap.get(pet.client_id) || null,
      })) as Pet[];

      setPets(petsWithClients);
      setVaccines((vaccinesResult.data || []) as Vaccine[]);
    } catch (e) {
      console.error(
        "CLINIC VACCINATIONS LOAD ERROR:",
        e
      );

      setError(
        e instanceof Error
          ? e.message
          : T[lang].loadError
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vaccinesByPet = useMemo(() => {
    const map = new Map<string, Vaccine[]>();

    for (const vaccine of vaccines) {
      const current =
        map.get(vaccine.pet_id) || [];
      current.push(vaccine);
      map.set(vaccine.pet_id, current);
    }

    return map;
  }, [vaccines]);

  const dueItems = useMemo<DueItem[]>(() => {
    const items: DueItem[] = [];

    for (const pet of pets) {
      const records =
        vaccinesByPet.get(pet.id) || [];

      if (
        normalize(pet.species).includes("cat") ||
        normalize(pet.species).includes("قط")
      ) {
        const protocol =
          protocolStatus(records, pet);

        for (const item of protocol) {
          const due = item.due;

          // A recorded vaccination without a repeat date is not overdue
          // and should not appear in the due/overdue queue.
          // A missing first dose, however, is explicitly marked "due" and
          // remains in the queue even though it has no calendar date.
          if (item.status === "no_repeat" || (!due && item.record)) {
            continue;
          }

          const days = due
            ? daysUntil(due)
            : null;

          items.push({
            pet,
            vaccine:
              lang === "ar"
                ? item.titleAr
                : item.titleEn,
            vaccineType:
              item.key,
            due,
            status: item.status,
            days,
            source: "protocol",
          });
        }
      } else {
        const candidateRecords =
          records
            .filter(
              (record) => record.next_dose_at
            )
            .sort(
              (a, b) =>
                +new Date(
                  a.next_dose_at as string
                ) -
                +new Date(
                  b.next_dose_at as string
                )
            );

        const next =
          candidateRecords[0];

        if (next?.next_dose_at) {
          const days =
            daysUntil(next.next_dose_at);

          items.push({
            pet,
            vaccine:
              next.vaccine_name ||
              next.vaccine_type ||
              (lang === "ar"
                ? "تطعيم"
                : "Vaccination"),
            vaccineType: "record",
            due: next.next_dose_at,
            status:
              days < -GRACE_DAYS
                ? "overdue"
                : days <= 0
                ? "grace"
                : "current",
            days,
            source: "record",
          });
        }
      }
    }

    return items.sort((a, b) => {
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return (
        +new Date(a.due) -
        +new Date(b.due)
      );
    });
  }, [pets, vaccinesByPet, lang]);

  const filteredPets = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    return pets.filter((pet) => {
      const client =
        pet.client;

      const matchesSearch =
        !query ||
        pet.name
          .toLowerCase()
          .includes(query) ||
        pet.species
          .toLowerCase()
          .includes(query) ||
        (pet.breed || "")
          .toLowerCase()
          .includes(query) ||
        (client?.name || "")
          .toLowerCase()
          .includes(query) ||
        (client?.client_code || "")
          .toLowerCase()
          .includes(query) ||
        (client?.phone || "")
          .toLowerCase()
          .includes(query);

      if (!matchesSearch) return false;

      const item =
        dueItems.find(
          (x) => x.pet.id === pet.id
        );

      if (filter === "all") return true;
      if (!item) return false;

      if (filter === "overdue") {
        return item.status === "overdue";
      }

      if (filter === "today") {
        return (
          item.status === "due" ||
          (item.days !== null &&
            item.days <= 0 &&
            item.days >= -GRACE_DAYS)
        );
      }

      if (filter === "soon") {
        return (
          item.days !== null &&
          item.days > 0 &&
          item.days <= 30
        );
      }

      return item.status === "current";
    });
  }, [pets, dueItems, search, filter]);

  const overdueCount = useMemo(
    () =>
      dueItems.filter(
        (x) => x.status === "overdue"
      ).length,
    [dueItems]
  );

  const todayCount = useMemo(
    () =>
      dueItems.filter(
        (x) =>
          x.status === "due" ||
          (x.days !== null &&
            x.days <= 0 &&
            x.days >= -GRACE_DAYS)
      ).length,
    [dueItems]
  );

  const soonCount = useMemo(
    () =>
      dueItems.filter(
        (x) =>
          x.days !== null &&
          x.days > 0 &&
          x.days <= 30
      ).length,
    [dueItems]
  );

  const currentCount = useMemo(
    () =>
      dueItems.filter(
        (x) => x.status === "current"
      ).length,
    [dueItems]
  );

  const recentVaccines = useMemo(
    () =>
      [...vaccines]
        .filter((x) => x.administered_at)
        .sort(
          (a, b) =>
            +new Date(
              b.administered_at as string
            ) -
            +new Date(
              a.administered_at as string
            )
        )
        .slice(0, 10),
    [vaccines]
  );

  function statusCardClass(
    active: boolean
  ) {
    return active
      ? "border-cyan-400/30 bg-cyan-400/10"
      : dark
      ? "border-white/[0.06] bg-[#13161B]"
      : "border-slate-100 bg-white";
  }

  if (loading) {
    return (
      <main
        dir={lang === "ar" ? "rtl" : "ltr"}
        className={
          dark
            ? "flex min-h-screen items-center justify-center bg-[#0F1115] text-white"
            : "flex min-h-screen items-center justify-center bg-[#F7F8FA] text-slate-900"
        }
      >
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10 text-3xl">
            💉
          </div>
          <p className="text-sm font-bold text-slate-500">
            {T[lang].loading}
          </p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main
        dir={lang === "ar" ? "rtl" : "ltr"}
        className={
          dark
            ? "min-h-screen bg-[#0F1115] px-5 py-8 text-white"
            : "min-h-screen bg-[#F7F8FA] px-5 py-8 text-slate-900"
        }
      >
        <div className="mx-auto max-w-3xl">
          <Link
            href="/dashboard"
            className="mb-6 inline-flex text-sm font-bold text-slate-500 hover:text-white"
          >
            ← {T[lang].back}
          </Link>

          <section
            className={
              dark
                ? "rounded-[2rem] border border-white/[0.06] bg-[#13161B] p-10 text-center"
                : "rounded-[2rem] border border-slate-100 bg-white p-10 text-center"
            }
          >
            <div className="text-5xl">⚠️</div>
            <h1 className="mt-4 text-2xl font-black">
              {T[lang].loadError}
            </h1>
            <p className="mt-3 text-sm text-slate-500">
              {error}
            </p>

            <button
              type="button"
              onClick={() => void loadData()}
              className="mt-6 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-black text-white"
            >
              {T[lang].retry}
            </button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main
      dir={lang === "ar" ? "rtl" : "ltr"}
      className={
        dark
          ? "min-h-screen bg-[#0F1115] text-white"
          : "min-h-screen bg-[#F7F8FA] text-slate-900"
      }
    >
      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 lg:px-10">
        <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link
              href="/dashboard"
              className="mb-3 inline-flex text-sm font-bold text-slate-500 transition hover:text-blue-500"
            >
              ← {T[lang].back}
            </Link>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                💉 {T[lang].title}
              </h1>

              <span
                className={
                  dark
                    ? "rounded-full border border-emerald-400/10 bg-emerald-400/10 px-3 py-1.5 text-xs font-black text-emerald-300"
                    : "rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700"
                }
              >
                🏥 {clinicName}
              </span>
            </div>

            <p className="mt-2 text-sm leading-7 text-slate-500">
              {T[lang].subtitle}
            </p>

            {databaseStatus && (
              <p className="mt-1 text-xs font-bold text-slate-500">
                🗄️ {T[lang].database}:{" "}
                <span className="text-emerald-400">
                  {databaseStatus === "ready"
                    ? T[lang].ready
                    : databaseStatus}
                </span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setLang(
                  lang === "ar" ? "en" : "ar"
                )
              }
              className={
                dark
                  ? "rounded-2xl border border-white/[0.06] bg-[#181B21] px-4 py-3 text-sm font-bold"
                  : "rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm font-bold"
              }
            >
              🌐 {T[lang].language}
            </button>

            <button
              type="button"
              onClick={() => setDark((v) => !v)}
              className={
                dark
                  ? "flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.06] bg-[#181B21] text-xl"
                  : "flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-100 bg-white text-xl"
              }
            >
              {dark ? "☀️" : "🌙"}
            </button>

            <Link
              href="/visits/new"
              className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-900/20 transition hover:-translate-y-0.5 hover:bg-emerald-500"
            >
              + {T[lang].newVisit}
            </Link>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              key: "overdue" as const,
              icon: "🔴",
              title: T[lang].overdue,
              value: overdueCount,
              tone: "rose",
            },
            {
              key: "today" as const,
              icon: "🟠",
              title: T[lang].dueToday,
              value: todayCount,
              tone: "amber",
            },
            {
              key: "soon" as const,
              icon: "🟡",
              title: T[lang].dueSoon,
              value: soonCount,
              tone: "yellow",
            },
            {
              key: "current" as const,
              icon: "🟢",
              title: T[lang].upToDate,
              value: currentCount,
              tone: "emerald",
            },
          ].map((card) => (
            <button
              type="button"
              key={card.key}
              onClick={() =>
                setFilter(
                  card.key === "today"
                    ? "today"
                    : card.key
                )
              }
              className={`rounded-[1.7rem] border p-5 text-start transition hover:-translate-y-0.5 ${statusCardClass(
                filter ===
                  (card.key === "today"
                    ? "today"
                    : card.key)
              )}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">
                  {card.icon}
                </span>
                <span className="text-3xl font-black">
                  {card.value}
                </span>
              </div>
              <div className="mt-4 text-sm font-bold text-slate-500">
                {card.title}
              </div>
            </button>
          ))}
        </section>

        <section
          className={
            dark
              ? "mt-5 rounded-[2rem] border border-white/[0.06] bg-[#13161B] p-5"
              : "mt-5 rounded-[2rem] border border-slate-100 bg-white p-5"
          }
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder={T[lang].search}
              className={
                dark
                  ? "w-full rounded-2xl border border-white/[0.06] bg-[#0F1115] px-5 py-4 text-sm outline-none focus:border-cyan-400/40 lg:max-w-3xl"
                  : "w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm outline-none focus:border-blue-500 lg:max-w-3xl"
              }
            />

            <div className="flex flex-wrap gap-2">
              {[
                ["all", T[lang].all],
                ["overdue", T[lang].overdue],
                ["today", T[lang].dueToday],
                ["soon", T[lang].dueSoon],
                ["current", T[lang].upToDate],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setFilter(
                      key as
                        | "all"
                        | "overdue"
                        | "today"
                        | "soon"
                        | "current"
                    )
                  }
                  className={
                    filter === key
                      ? "rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white"
                      : dark
                      ? "rounded-xl border border-white/[0.06] bg-[#181B21] px-4 py-2.5 text-xs font-bold text-slate-400"
                      : "rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-500"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section
          className={
            dark
              ? "mt-5 overflow-hidden rounded-[2rem] border border-white/[0.06] bg-[#13161B]"
              : "mt-5 overflow-hidden rounded-[2rem] border border-slate-100 bg-white"
          }
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] p-5">
            <div>
              <div className="text-xs font-bold text-cyan-300">
                {T[lang].upcoming}
              </div>
              <h2 className="mt-1 text-2xl font-black">
                {dueItems.length}
              </h2>
            </div>

            <Link
              href="/pets"
              className="rounded-2xl border border-white/[0.06] px-4 py-2.5 text-xs font-black text-slate-400 hover:text-white"
            >
              {T[lang].pets} →
            </Link>
          </div>

          {dueItems.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {T[lang].noDue}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead
                  className={
                    dark
                      ? "bg-white/[0.02] text-slate-500"
                      : "bg-slate-50 text-slate-500"
                  }
                >
                  <tr>
                    <th className="px-5 py-4 text-start font-bold">
                      {T[lang].pets}
                    </th>
                    <th className="px-5 py-4 text-start font-bold">
                      {T[lang].owner}
                    </th>
                    <th className="px-5 py-4 text-start font-bold">
                      {T[lang].vaccine}
                    </th>
                    <th className="px-5 py-4 text-start font-bold">
                      {T[lang].dueDate}
                    </th>
                    <th className="px-5 py-4 text-start font-bold">
                      {T[lang].status}
                    </th>
                    <th className="px-5 py-4 text-start font-bold">
                      {T[lang].action}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {dueItems
                    .filter((item) =>
                      filteredPets.some(
                        (pet) =>
                          pet.id ===
                          item.pet.id
                      )
                    )
                    .slice(0, 100)
                    .map((item) => (
                      <tr
                        key={`${item.pet.id}-${item.vaccineType}`}
                        className="border-t border-white/[0.05]"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">
                              {petIcon(
                                item.pet.species
                              )}
                            </span>

                            <div>
                              <div className="font-black">
                                {item.pet.name}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {item.pet.species}
                                {item.pet.breed
                                  ? ` • ${item.pet.breed}`
                                  : ""}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="font-bold">
                            {item.pet.client?.name ||
                              "—"}
                          </div>
                          <div
                            dir="ltr"
                            className="mt-1 text-xs text-slate-500"
                          >
                            {item.pet.client
                              ?.client_code || ""}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="font-black">
                            {item.vaccine}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item.source ===
                            "protocol"
                              ? T[lang].primary
                              : T[lang].recorded}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="font-bold">
                            {dateText(
                              item.due,
                              lang
                            )}
                          </div>
                          {item.days !== null && (
                            <div
                              className={`mt-1 text-xs ${
                                item.days <
                                -GRACE_DAYS
                                  ? "text-rose-300"
                                  : item.days <= 0
                                  ? "text-amber-300"
                                  : "text-slate-500"
                              }`}
                            >
                              {item.days < 0
                                ? `${Math.abs(
                                    item.days
                                  )} ${
                                    T[lang]
                                      .overdueBy
                                  }`
                                : item.days === 0
                                ? T[lang].dueToday
                                : `${T[lang].inDays} ${
                                    item.days
                                  } ${
                                    T[lang].days
                                  }`}
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-black ${statusClasses(
                              item.status
                            )}`}
                          >
                            {statusLabel(
                              item.status,
                              lang
                            )}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/pets/${item.pet.id}`}
                              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-500"
                            >
                              {T[lang].openPet}
                            </Link>

                            <Link
                              href={`/visits/new?pet=${encodeURIComponent(
                                item.pet.id
                              )}`}
                              className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-300"
                            >
                              +
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          className={
            dark
              ? "mt-5 overflow-hidden rounded-[2rem] border border-white/[0.06] bg-[#13161B]"
              : "mt-5 overflow-hidden rounded-[2rem] border border-slate-100 bg-white"
          }
        >
          <div className="border-b border-white/[0.06] p-5">
            <div className="text-xs font-bold text-cyan-300">
              {T[lang].history}
            </div>
            <h2 className="mt-1 text-2xl font-black">
              {T[lang].history}
            </h2>
          </div>

          {recentVaccines.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {T[lang].noHistory}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-sm">
                <thead
                  className={
                    dark
                      ? "bg-white/[0.02] text-slate-500"
                      : "bg-slate-50 text-slate-500"
                  }
                >
                  <tr>
                    <th className="px-5 py-4 text-start font-bold">
                      {T[lang].pets}
                    </th>
                    <th className="px-5 py-4 text-start font-bold">
                      {T[lang].owner}
                    </th>
                    <th className="px-5 py-4 text-start font-bold">
                      {T[lang].vaccine}
                    </th>
                    <th className="px-5 py-4 text-start font-bold">
                      Administered
                    </th>
                    <th className="px-5 py-4 text-start font-bold">
                      {T[lang].dueDate}
                    </th>
                    <th className="px-5 py-4 text-start font-bold">
                      {T[lang].action}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {recentVaccines.map(
                    (vaccine) => {
                      const pet =
                        pets.find(
                          (p) =>
                            p.id ===
                            vaccine.pet_id
                        );

                      if (!pet) return null;

                      return (
                        <tr
                          key={vaccine.id}
                          className="border-t border-white/[0.05]"
                        >
                          <td className="px-5 py-4">
                            <div className="font-black">
                              {petIcon(
                                pet.species
                              )}{" "}
                              {pet.name}
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            <div className="font-bold">
                              {pet.client
                                ?.name || "—"}
                            </div>
                            <div
                              dir="ltr"
                              className="mt-1 text-xs text-slate-500"
                            >
                              {pet.client
                                ?.client_code ||
                                ""}
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            <div className="font-black">
                              {vaccine.vaccine_name ||
                                vaccine.vaccine_type ||
                                "—"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {vaccine.manufacturer ||
                                "—"}
                              {vaccine.batch_number
                                ? ` • ${vaccine.batch_number}`
                                : ""}
                            </div>
                          </td>

                          <td className="px-5 py-4 font-bold">
                            {dateText(
                              vaccine.administered_at,
                              lang
                            )}
                          </td>

                          <td className="px-5 py-4">
                            {vaccine.next_dose_at ? (
                              dateText(
                                vaccine.next_dose_at,
                                lang
                              )
                            ) : (
                              <span className="text-slate-500">
                                {T[lang].noRepeatDate}
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex gap-2">
                              <Link
                                href={`/pets/${pet.id}`}
                                className="rounded-xl border border-white/[0.06] px-3 py-2 text-xs font-bold text-slate-300"
                              >
                                {T[lang].openPet}
                              </Link>

                              {pet.client_id && (
                                <Link
                                  href={`/clients/${pet.client_id}`}
                                  className="rounded-xl border border-blue-400/10 bg-blue-400/5 px-3 py-2 text-xs font-bold text-blue-300"
                                >
                                  {T[lang].openOwner}
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
