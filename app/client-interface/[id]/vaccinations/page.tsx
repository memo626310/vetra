"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getClientPortalDb } from "@/lib/client-portal-db";

type Lang = "ar" | "en";
type Client = { id: string; name: string };
type Pet = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  birth_date: string | null;
  is_deceased: boolean | null;
};
type Vaccine = {
  id: string;
  pet_id: string;
  vaccine_name: string | null;
  vaccine_type: string | null;
  administered_at: string | null;
  next_dose_at: string | null;
  notes: string | null;
};
type Status = "not_due" | "current" | "grace" | "overdue";

type ProtocolItem = {
  key: "viral" | "rabies" | "deworm" | "parasite";
  titleAr: string;
  titleEn: string;
  points: number;
  max: number;
  status: Status;
  due: string | null;
  subtitleAr: string;
  subtitleEn: string;
  record: Vaccine | null;
};

const T = {
  ar: {
    title: "التطعيمات والرعاية الوقائية",
    back: "العودة للرئيسية",
    language: "English",
    selectedPet: "الحيوان المختار",
    switchPet: "اختار حيوان تاني",
    nextAction: "الاستحقاق القادم",
    noUpcoming: "مفيش استحقاق قريب",
    days: "يوم",
    dueToday: "مستحق اليوم",
    overdue: "متأخر",
    grace: "فترة السماح",
    graceLeft: "متبقي من السماح",
    notDue: "لسه مش مستحق",
    onTrack: "منتظم",
    reset: "يحتاج إعادة",
    history: "سجل الجرعات",
    viral: "الفيروسي",
    rabies: "السعار",
    deworm: "الديدان",
    parasite: "الحشرات",
    viralRule: "45 يوم → بعد 21 يوم → سنوي مدى الحياة",
    rabiesRule: "من 3 شهور → سنوي",
    dewormRule: "3 شهور → بعد 14 يوم → كل شهرين",
    parasiteRule: "من أول يوم → وقت الحاجة",
    administered: "تم إعطاؤه",
    nextDose: "الجرعة القادمة",
    noRecords: "مفيش جرعات مسجلة",
    firstDose: "الجرعة الأولى",
    secondDose: "الجرعة الثانية",
    annualDose: "الجرعة السنوية",
    restart: "إعادة البروتوكول",
    accordingToProtocol: "طبقًا لبروتوكول VETRA المسجل للحيوان",
    reminder: "فعّل التذكير",
    reminderLater: "التذكيرات هتتربط بالإشعارات في الخطوة التالية.",
    loading: "جاري تحميل التطعيمات...",
    error: "تعذر تحميل التطعيمات",
    login: "العودة لتسجيل الدخول",
    unknown: "غير محدد",
  },
  en: {
    title: "Vaccines & Preventive Care",
    back: "Back to home",
    language: "العربية",
    selectedPet: "Selected pet",
    switchPet: "Choose another pet",
    nextAction: "Next due",
    noUpcoming: "No upcoming due date",
    days: "days",
    dueToday: "Due today",
    overdue: "Overdue",
    grace: "Grace period",
    graceLeft: "grace remaining",
    notDue: "Not due yet",
    onTrack: "On track",
    reset: "Needs restart",
    history: "Dose history",
    viral: "Viral vaccine",
    rabies: "Rabies",
    deworm: "Deworming",
    parasite: "Parasite control",
    viralRule: "45 days → after 21 days → annually for life",
    rabiesRule: "From 3 months → annually",
    dewormRule: "3 months → after 14 days → every 2 months",
    parasiteRule: "From day one → as needed",
    administered: "Administered",
    nextDose: "Next dose",
    noRecords: "No doses recorded",
    firstDose: "First dose",
    secondDose: "Second dose",
    annualDose: "Annual dose",
    restart: "Restart protocol",
    accordingToProtocol: "Based on the VETRA protocol recorded for this pet",
    reminder: "Set reminder",
    reminderLater: "Reminders will connect to notifications in the next step.",
    loading: "Loading vaccines...",
    error: "We couldn't load vaccines",
    login: "Back to login",
    unknown: "Not specified",
  },
} as const;

const DAY_MS = 86400000;
const GRACE_DAYS = 7;

const normalize = (v: string | null | undefined) => (v || "").toLowerCase();
const recordText = (v: Vaccine) => `${v.vaccine_name || ""} ${v.vaccine_type || ""} ${v.notes || ""}`.toLowerCase();
const isViral = (v: Vaccine) => ["ثلاثي", "رباعي", "فيروسي", "فيروسى", "viral", "triple", "quad", "fvr", "fvrcp", "f3", "f4"].some((x) => recordText(v).includes(x));
const isRabies = (v: Vaccine) => ["سعار", "rabies", "rabis"].some((x) => recordText(v).includes(x));
const isDeworm = (v: Vaccine) => ["ديدان", "deworm", "worm", "internal parasite", "anthelmint"].some((x) => recordText(v).includes(x));
const isParasite = (v: Vaccine) => ["حشرات", "flea", "fleas", "tick", "ticks", "ecto", "external parasite", "براغيث", "قراد"].some((x) => recordText(v).includes(x));

function dateOnly(value: string) {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function daysUntil(value: string) {
  const now = new Date();
  const target = new Date(value);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.ceil((due - today) / DAY_MS);
}

function addDays(value: string, days: number) {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function addYears(value: string, years: number) {
  const d = new Date(value);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString();
}

function ageDays(birth: string | null) {
  if (!birth) return null;
  return Math.floor((dateOnly(new Date().toISOString()) - dateOnly(birth)) / DAY_MS);
}

function careState(due: string | null): Status {
  if (!due) return "current";
  const d = daysUntil(due);
  if (d > 0) return "current";
  if (d >= -GRACE_DAYS) return "grace";
  return "overdue";
}

function latest(records: Vaccine[], matcher: (v: Vaccine) => boolean) {
  return records
    .filter((v) => matcher(v) && v.administered_at)
    .sort((a, b) => +new Date(b.administered_at as string) - +new Date(a.administered_at as string))[0] || null;
}

function protocolStatus(records: Vaccine[], pet: Pet): ProtocolItem[] {
  const age = ageDays(pet.birth_date);
  const result: ProtocolItem[] = [];

  const viralRecords = records
    .filter((v) => isViral(v) && v.administered_at)
    .sort((a, b) => +new Date(a.administered_at as string) - +new Date(b.administered_at as string));

  if (age !== null && age < 45) {
    const due = addDays(pet.birth_date as string, 45 - age);
    result.push({ key: "viral", titleAr: "الفيروسي", titleEn: "Viral vaccine", points: 3, max: 3, status: "not_due", due, subtitleAr: "لسه قبل سن البداية", subtitleEn: "Before the starting age", record: null });
  } else if (viralRecords.length === 0) {
    result.push({ key: "viral", titleAr: "الفيروسي", titleEn: "Viral vaccine", points: 0, max: 3, status: "overdue", due: null, subtitleAr: "الجرعة الأولى مطلوبة", subtitleEn: "First dose is due", record: null });
  } else if (viralRecords.length === 1) {
    const first = viralRecords[0];
    const due = first.next_dose_at || addDays(first.administered_at as string, 21);
    const status = careState(due);
    result.push({ key: "viral", titleAr: "الفيروسي", titleEn: "Viral vaccine", points: status === "overdue" ? 0 : 3, max: 3, status, due, subtitleAr: status === "overdue" ? "عدّت فترة السماح — يبدأ البروتوكول من جديد" : "في انتظار الجرعة الثانية", subtitleEn: status === "overdue" ? "Grace period passed — protocol restarts" : "Waiting for the second dose", record: first });
  } else {
    const second = viralRecords[1];
    const first = viralRecords[0];
    const expectedSecond = first.next_dose_at || addDays(first.administered_at as string, 21);
    const secondDaysLate = Math.max(0, Math.floor((dateOnly(second.administered_at as string) - dateOnly(expectedSecond)) / DAY_MS));
    if (secondDaysLate > GRACE_DAYS) {
      const restartDue = addDays(second.administered_at as string, 21);
      result.push({ key: "viral", titleAr: "الفيروسي", titleEn: "Viral vaccine", points: 0, max: 3, status: "overdue", due: restartDue, subtitleAr: "الجرعة الثانية اتأخرت أكثر من 7 أيام — إعادة البروتوكول", subtitleEn: "Second dose passed the 7-day grace — restart the protocol", record: second });
    } else {
      const last = viralRecords[viralRecords.length - 1];
      const due = last.next_dose_at || addYears(last.administered_at as string, 1);
      const status = careState(due);
      result.push({ key: "viral", titleAr: "الفيروسي", titleEn: "Viral vaccine", points: status === "overdue" ? 0 : 3, max: 3, status, due, subtitleAr: status === "overdue" ? "التكرار السنوي متأخر" : "الجرعات الأساسية مكتملة — متابعة سنوية", subtitleEn: status === "overdue" ? "Annual booster is overdue" : "Primary series complete — annual follow-up", record: last });
    }
  }

  const rabies = latest(records, isRabies);
  if (age !== null && age < 90) {
    result.push({ key: "rabies", titleAr: "السعار", titleEn: "Rabies", points: 2, max: 2, status: "not_due", due: addDays(pet.birth_date as string, 90 - age), subtitleAr: "لسه قبل سن البداية", subtitleEn: "Before the starting age", record: null });
  } else if (!rabies) {
    result.push({ key: "rabies", titleAr: "السعار", titleEn: "Rabies", points: 0, max: 2, status: "overdue", due: null, subtitleAr: "الجرعة الأولى مطلوبة", subtitleEn: "First dose is due", record: null });
  } else {
    const due = rabies.next_dose_at || addYears(rabies.administered_at as string, 1);
    const status = careState(due);
    result.push({ key: "rabies", titleAr: "السعار", titleEn: "Rabies", points: status === "overdue" ? 0 : 2, max: 2, status, due, subtitleAr: status === "overdue" ? "التكرار السنوي متأخر" : "منتظم سنويًا", subtitleEn: status === "overdue" ? "Annual booster is overdue" : "Annual follow-up is on track", record: rabies });
  }

  const dewormRecords = records
    .filter((v) => isDeworm(v) && v.administered_at)
    .sort((a, b) => +new Date(a.administered_at as string) - +new Date(b.administered_at as string));

  if (age !== null && age < 90) {
    result.push({ key: "deworm", titleAr: "الديدان", titleEn: "Deworming", points: 2, max: 2, status: "not_due", due: addDays(pet.birth_date as string, 90 - age), subtitleAr: "يبدأ من عمر 3 شهور", subtitleEn: "Starts at 3 months", record: null });
  } else if (!dewormRecords.length) {
    result.push({ key: "deworm", titleAr: "الديدان", titleEn: "Deworming", points: 0, max: 2, status: "overdue", due: null, subtitleAr: "الجرعة الأولى مطلوبة", subtitleEn: "First dose is due", record: null });
  } else if (dewormRecords.length === 1) {
    const first = dewormRecords[0];
    const due = first.next_dose_at || addDays(first.administered_at as string, 14);
    const status = careState(due);
    result.push({ key: "deworm", titleAr: "الديدان", titleEn: "Deworming", points: status === "overdue" ? 0 : 2, max: 2, status, due, subtitleAr: status === "overdue" ? "عدّت فترة السماح — إعادة الجرعة الأولى" : "في انتظار جرعة الـ14 يوم", subtitleEn: status === "overdue" ? "Grace passed — restart the first-dose cycle" : "Waiting for the 14-day repeat", record: first });
  } else {
    const first = dewormRecords[0];
    const second = dewormRecords[1];
    const expectedSecond = first.next_dose_at || addDays(first.administered_at as string, 14);
    const secondDaysLate = Math.max(0, Math.floor((dateOnly(second.administered_at as string) - dateOnly(expectedSecond)) / DAY_MS));
    if (secondDaysLate > GRACE_DAYS) {
      const restartDue = addDays(second.administered_at as string, 14);
      result.push({ key: "deworm", titleAr: "الديدان", titleEn: "Deworming", points: 0, max: 2, status: "overdue", due: restartDue, subtitleAr: "جرعة الـ14 يوم اتأخرت أكثر من 7 أيام — إعادة البروتوكول", subtitleEn: "The 14-day repeat passed the 7-day grace — restart the protocol", record: second });
    } else {
      const last = dewormRecords[dewormRecords.length - 1];
      const due = last.next_dose_at || addDays(last.administered_at as string, 60);
      const status = careState(due);
      result.push({ key: "deworm", titleAr: "الديدان", titleEn: "Deworming", points: status === "overdue" ? 0 : 2, max: 2, status, due, subtitleAr: status === "overdue" ? "الجرعة الدورية متأخرة" : "منتظم كل شهرين", subtitleEn: status === "overdue" ? "Routine deworming is overdue" : "Every-2-month routine is on track", record: last });
    }
  }

  const parasite = latest(records, isParasite);
  result.push({ key: "parasite", titleAr: "الحشرات", titleEn: "Parasite control", points: 1, max: 1, status: "not_due", due: null, subtitleAr: "حسب الحاجة", subtitleEn: "As needed", record: parasite });

  return result;
}

function statusLabel(item: ProtocolItem, lang: Lang) {
  const t = T[lang];
  if (item.status === "overdue") return item.subtitleAr.includes("إعادة") || item.subtitleEn.includes("restart") ? t.reset : t.overdue;
  if (item.status === "grace") return t.grace;
  if (item.status === "not_due") return t.notDue;
  return t.onTrack;
}

function icon(species: string) {
  const s = normalize(species);
  if (s.includes("cat") || s.includes("قط")) return "🐱";
  if (s.includes("dog") || s.includes("كلب")) return "🐶";
  return "🐾";
}

export default function VaccinationsPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const clientId = params.id;
  const queryPet = searchParams.get("pet");

  const [lang, setLang] = useState<Lang>("ar");
  const [dark, setDark] = useState(true);
  const [client, setClient] = useState<Client | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [vaccines, setVaccines] = useState<Vaccine[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const l = localStorage.getItem("vetra-language");
    const th = localStorage.getItem("vetra-theme");
    if (l === "ar" || l === "en") setLang(l);
    setDark(th === "dark");
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      const id = localStorage.getItem("vetra-client-id") || sessionStorage.getItem("vetra-client-id");
      const code = localStorage.getItem("vetra-client-code") || sessionStorage.getItem("vetra-client-code");
      const phone = localStorage.getItem("vetra-client-phone") || sessionStorage.getItem("vetra-client-phone");
      if (!id || id !== clientId || !code || !phone) {
        router.replace("/client-interface/login");
        return;
      }

      try {
        const db = await getClientPortalDb(code, phone);
        const c = await db.from("clients").select("id,name").eq("id", clientId).maybeSingle();
        if (c.error || !c.data) throw new Error(c.error?.message || "Client not found");

        const p = await db.from("pets").select("id,name,species,breed,birth_date,is_deceased").eq("client_id", clientId).order("created_at", { ascending: false });
        if (p.error) throw new Error(p.error.message);

        const petRows = (p.data || []) as Pet[];
        const ids = petRows.map((x) => x.id);
        let vx: Vaccine[] = [];
        if (ids.length) {
          const v = await db.from("vaccinations").select("id,pet_id,vaccine_name,vaccine_type,administered_at,next_dose_at,notes").in("pet_id", ids).order("administered_at", { ascending: false });
          if (v.error) throw new Error(v.error.message);
          vx = (v.data || []) as Vaccine[];
        }

        setClient(c.data as Client);
        setPets(petRows);
        setVaccines(vx);
        setSelected(queryPet && petRows.some((x) => x.id === queryPet) ? queryPet : petRows[0]?.id || "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load vaccines");
      } finally {
        setLoading(false);
      }
    }
    if (clientId) void load();
  }, [clientId, queryPet, router]);

  const t = T[lang];
  const pet = pets.find((x) => x.id === selected) || pets[0] || null;
  const petVaccines = useMemo(() => pet ? vaccines.filter((x) => x.pet_id === pet.id) : [], [pet, vaccines]);
  const protocol = useMemo(() => pet ? protocolStatus(petVaccines, pet) : [], [pet, petVaccines]);

  const next = [...protocol]
    .filter((x) => x.due)
    .sort((a, b) => daysUntil(a.due as string) - daysUntil(b.due as string))[0] || null;

  const history = [...petVaccines].sort((a, b) => +new Date(b.administered_at || 0) - +new Date(a.administered_at || 0));

  function toggleLang() {
    const nextLang = lang === "ar" ? "en" : "ar";
    setLang(nextLang);
    localStorage.setItem("vetra-language", nextLang);
  }

  function toggleTheme() {
    const nextTheme = !dark;
    setDark(nextTheme);
    localStorage.setItem("vetra-theme", nextTheme ? "dark" : "light");
  }

  if (loading) return <main dir={lang === "ar" ? "rtl" : "ltr"} className="flex min-h-screen items-center justify-center bg-[#06101a] text-white"><div className="text-center"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-400/10 text-3xl">💉</div><p className="text-sm font-bold text-slate-400">{t.loading}</p></div></main>;
  if (error && !client) return <main dir={lang === "ar" ? "rtl" : "ltr"} className="flex min-h-screen items-center justify-center bg-[#06101a] px-6 text-white"><div className="max-w-md rounded-[2rem] border border-white/10 bg-white/[.04] p-8 text-center"><div className="text-5xl">💉</div><h1 className="mt-4 text-2xl font-black">{t.error}</h1><p className="mt-3 text-sm text-slate-400">{error}</p><button onClick={() => router.replace("/client-interface/login")} className="mt-6 rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-black text-slate-950">{t.login}</button></div></main>;

  return (
    <main dir={lang === "ar" ? "rtl" : "ltr"} className={dark ? "min-h-screen overflow-x-hidden bg-[#06101a] text-white" : "min-h-screen overflow-x-hidden bg-[#f5f9fc] text-slate-900"}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden"><div className={dark ? "absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" : "absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-300/25 blur-3xl"}/><div className={dark ? "absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" : "absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-violet-300/20 blur-3xl"}/></div>
      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-4 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-40 mb-6 flex items-center justify-between py-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Link href={`/client-interface/${clientId}`} className={dark ? "flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[.05]" : "flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white"}>←</Link>
            <div><div className="font-black tracking-[.18em]">VETRA</div><div className="text-[10px] font-bold tracking-[.18em] text-slate-500">PET CARE</div></div>
          </div>
          <div className="flex items-center gap-2"><button onClick={toggleLang} className={dark ? "rounded-full border border-white/10 bg-white/[.05] px-3 py-2 text-xs font-bold" : "rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold"}>{t.language || (lang === "ar" ? "English" : "العربية")}</button><button onClick={toggleTheme} className={dark ? "flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[.05]" : "flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"}>{dark ? "☀️" : "🌙"}</button></div>
        </header>

        <section className={dark ? "rounded-[2rem] border border-white/[.07] bg-gradient-to-br from-white/[.08] to-white/[.03] p-5 shadow-2xl sm:p-7" : "rounded-[2rem] border border-slate-100 bg-white p-5 shadow-2xl sm:p-7"}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-sm font-bold text-cyan-400">{t.nextAction}</p><h1 className="mt-1 text-3xl font-black sm:text-4xl">{t.title}</h1><p className="mt-2 text-sm leading-7 text-slate-500">{t.accordingToProtocol}</p></div>
            {pet && <div className="rounded-2xl border border-cyan-400/10 bg-cyan-400/[.06] px-4 py-3"><div className="text-xs font-bold text-slate-500">{t.selectedPet}</div><div className="mt-1 text-lg font-black">{icon(pet.species)} {pet.name}</div></div>}
          </div>

          {pets.length > 1 && <div className="mt-5 flex gap-2 overflow-x-auto pb-1">{pets.map((p) => <button key={p.id} onClick={() => setSelected(p.id)} className={p.id === pet?.id ? "shrink-0 rounded-2xl border border-cyan-400/20 bg-cyan-400/[.08] px-4 py-3 text-sm font-black" : dark ? "shrink-0 rounded-2xl border border-white/[.06] bg-white/[.03] px-4 py-3 text-sm font-bold text-slate-400" : "shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500"}>{icon(p.species)} {p.name}</button>)}</div>}

          {next ? <div className={dark ? "mt-6 rounded-[1.8rem] border border-cyan-400/10 bg-gradient-to-br from-cyan-400/[.08] via-white/[.02] to-violet-500/[.06] p-5" : "mt-6 rounded-[1.8rem] border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-violet-50 p-5"}>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-bold text-cyan-300">{next[lang === "ar" ? "titleAr" : "titleEn"]}</div><div className="mt-2 text-2xl font-black">{statusLabel(next, lang)}</div><p className="mt-2 text-sm leading-7 text-slate-500">{lang === "ar" ? next.subtitleAr : next.subtitleEn}</p>{next.due && <div className="mt-2 text-xs font-bold text-slate-500">{new Date(next.due).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { day: "numeric", month: "long", year: "numeric" })}</div>}</div>
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-[8px] border-cyan-400/10 bg-white/[.02]"><div className="text-center"><div className="text-2xl font-black">{next.due ? Math.max(daysUntil(next.due), 0) : "—"}</div><div className="text-[10px] font-bold text-slate-500">{next.due && daysUntil(next.due) < 0 ? t.overdue : next.due && daysUntil(next.due) === 0 ? t.dueToday : t.days}</div></div></div>
            </div>
            {next.due && <button onClick={() => window.alert(t.reminderLater)} className="mt-5 w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-3 text-xs font-black text-slate-950">🔔 {t.reminder}</button>}
          </div> : <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">{t.noUpcoming}</div>}
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-2">
          {protocol.map((item) => {
            const records = petVaccines.filter((v) => {
              if (item.key === "viral") return isViral(v);
              if (item.key === "rabies") return isRabies(v);
              if (item.key === "deworm") return isDeworm(v);
              return isParasite(v);
            });
            const dueDays = item.due ? daysUntil(item.due) : null;
            const title = lang === "ar" ? item.titleAr : item.titleEn;
            const rule = item.key === "viral" ? t.viralRule : item.key === "rabies" ? t.rabiesRule : item.key === "deworm" ? t.dewormRule : t.parasiteRule;
            const statusTone = item.status === "overdue" ? "border-rose-400/20 bg-rose-400/[.05]" : item.status === "grace" ? "border-amber-400/20 bg-amber-400/[.05]" : item.status === "not_due" ? "border-white/[.05] bg-white/[.025]" : "border-emerald-400/10 bg-emerald-400/[.04]";
            return <div key={item.key} className={dark ? `rounded-[1.7rem] border p-5 ${statusTone}` : `rounded-[1.7rem] border border-slate-100 bg-white p-5`}>
              <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><span className="text-xl">{item.key === "viral" ? "💉" : item.key === "rabies" ? "🦠" : item.key === "deworm" ? "🪱" : "🪰"}</span><h2 className="text-xl font-black">{title}</h2></div><p className="mt-2 text-xs leading-6 text-slate-500">{rule}</p></div><span className="rounded-full bg-white/[.05] px-3 py-1.5 text-[10px] font-black">{statusLabel(item, lang)}</span></div>
              <div className="mt-5 grid grid-cols-[1fr_auto] items-end gap-4"><div><div className="text-xs font-bold text-slate-500">{item.record?.administered_at ? t.administered : t.nextDose}</div><div className="mt-1 text-sm font-black">{item.record?.administered_at ? new Date(item.record.administered_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { day: "numeric", month: "short", year: "numeric" }) : item.due ? new Date(item.due).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div><p className="mt-2 text-xs leading-6 text-slate-500">{lang === "ar" ? item.subtitleAr : item.subtitleEn}</p></div><div className="rounded-2xl bg-white/[.04] px-4 py-3 text-center"><div className="text-2xl font-black">{dueDays === null ? "—" : dueDays < 0 ? Math.abs(dueDays) : dueDays}</div><div className="text-[9px] font-bold text-slate-500">{dueDays === null ? "" : dueDays < 0 ? t.overdue : dueDays === 0 ? t.dueToday : t.days}</div></div></div>
              <div className="mt-5 border-t border-white/[.06] pt-4"><div className="mb-3 text-xs font-black">{t.history} · {records.length}</div>{records.length === 0 ? <div className="text-xs text-slate-500">{t.noRecords}</div> : <div className="space-y-2">{records.slice().reverse().map((r, idx) => <div key={r.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[.025] px-3 py-2.5"><div className="min-w-0"><div className="truncate text-xs font-bold">{r.vaccine_name || r.vaccine_type || title}</div><div className="mt-1 text-[10px] text-slate-500">{r.administered_at ? new Date(r.administered_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div></div><span className="shrink-0 text-[10px] font-black text-emerald-300">✓</span></div>)}</div>}</div>
            </div>;
          })}
        </section>

        <section className={dark ? "mt-5 rounded-[2rem] border border-white/[.07] bg-white/[.035] p-5" : "mt-5 rounded-[2rem] border border-slate-100 bg-white p-5"}>
          <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-bold text-cyan-300">{t.history}</div><h2 className="mt-1 text-2xl font-black">{pet?.name || "VETRA"}</h2></div><Link href={`/client-interface/${clientId}`} className="rounded-2xl border border-white/10 px-4 py-2 text-xs font-black">{t.back}</Link></div>
          {history.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">{t.noRecords}</div> : <div className="mt-5 space-y-3">{history.map((r) => <div key={r.id} className="rounded-2xl border border-white/[.05] bg-white/[.025] p-4"><div className="flex items-center justify-between gap-3"><div className="font-black">{r.vaccine_name || r.vaccine_type || t.title}</div><div className="text-[10px] font-bold text-slate-500">{r.administered_at ? new Date(r.administered_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div></div>{r.next_dose_at && <div className="mt-2 text-xs text-slate-500">{t.nextDose}: {new Date(r.next_dose_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { day: "numeric", month: "short", year: "numeric" })}</div>}{r.notes && <div className="mt-2 text-xs leading-6 text-slate-500">{r.notes}</div>}</div>)}</div>}
        </section>
      </div>
    </main>
  );
}
