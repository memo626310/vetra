"use client";



import Link from "next/link";

import { useEffect, useMemo, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { getClientPortalDb } from "@/lib/client-portal-db";



type Lang = "ar" | "en";

type Client = { id: string; name: string; phone: string | null; email: string | null };

type Pet = {

  id: string;

  client_id: string;

  name: string;

  species: string;

  breed: string | null;

  gender: string | null;

  birth_date: string | null;

  color: string | null;

  microchip: string | null;

  is_deceased: boolean | null;

};

type Visit = {

  id: string;

  pet_id: string;

  visit_date: string;

  reason: string | null;

  examination: string | null;

  diagnosis: string | null;

  treatment: string | null;

  weight: number | null;

  temperature: number | null;

  heart_rate: number | null;

  respiratory_rate: number | null;

  notes: string | null;

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

  status: Status;

  due: string | null;

  points: number;

  max: number;

  record: Vaccine | null;

};



const T = {

  ar: {

    back: "العودة للرئيسية",

    vaccinations: "التطعيمات والرعاية الوقائية",

    profile: "ملف الحيوان",

    age: "العمر",

    breed: "السلالة",

    gender: "النوع",

    color: "اللون",

    microchip: "Microchip",

    male: "ذكر",

    female: "أنثى",

    unknown: "غير محدد",

    careScore: "نقاط VETRA",

    excellent: "ممتاز 🎉",

    almost: "قربت توصل 10/10!",

    good: "أنت على الطريق الصح",

    start: "خلّينا نكملها سوا",

    scoreNote: "مقياس اكتمال الرعاية داخل VETRA، مش تقييمًا طبيًا.",

    monthly: "زيارة العيادة الشهرية",

    viral: "الفيروسي",

    rabies: "السعار",

    deworm: "الديدان",

    parasite: "الحشرات",

    regular: "منتظم",

    grace: "فترة السماح",

    overdue: "متأخر",

    notDue: "لسه مش مستحق",

    days: "يوم",

    nextDue: "الاستحقاق القادم",

    noDue: "مفيش استحقاق محدد",

    health: "المؤشرات الصحية",

    sixMonths: "آخر 6 شهور",

    noData: "بيانات غير كافية",

    firstReading: "أول قراءة",

    readings: "قراءات",

    weight: "الوزن",

    temp: "الحرارة",

    heart: "نبض القلب",

    resp: "معدل التنفس",

    history: "التاريخ الطبي",

    vaccineHistory: "تاريخ التطعيمات",

    noVisits: "مفيش زيارات مسجلة",

    noVaccines: "مفيش تطعيمات مسجلة",

    noHistory: "التاريخ الطبي هيظهر هنا مع أول زيارة أو تطعيم.",

    visit: "زيارة",

    diagnosis: "التشخيص",

    reason: "سبب الزيارة",

    examination: "الفحص",

    treatment: "العلاج",

    notes: "ملاحظات",

    owner: "المالك",

    loading: "جاري تحميل ملف الحيوان...",

    error: "تعذر تحميل ملف الحيوان",

    login: "العودة لتسجيل الدخول",

    deceased: "متوفى",

  },

  en: {

    back: "Back to home",

    vaccinations: "Vaccines & Preventive Care",

    profile: "Pet profile",

    age: "Age",

    breed: "Breed",

    gender: "Gender",

    color: "Color",

    microchip: "Microchip",

    male: "Male",

    female: "Female",

    unknown: "Not specified",

    careScore: "VETRA Score",

    excellent: "Excellent 🎉",

    almost: "You are almost at 10/10!",

    good: "You are on the right track",

    start: "Let's complete it together",

    scoreNote: "A care-completeness indicator inside VETRA, not a medical score.",

    monthly: "Monthly clinic visit",

    viral: "Viral vaccine",

    rabies: "Rabies",

    deworm: "Deworming",

    parasite: "Parasite control",

    regular: "On track",

    grace: "Grace period",

    overdue: "Overdue",

    notDue: "Not due yet",

    days: "days",

    nextDue: "Next due",

    noDue: "No scheduled due date",

    health: "Health trends",

    sixMonths: "Last 6 months",

    noData: "Not enough data",

    firstReading: "First reading",

    readings: "readings",

    weight: "Weight",

    temp: "Temperature",

    heart: "Heart rate",

    resp: "Respiratory rate",

    history: "Medical history",

    vaccineHistory: "Vaccination history",

    noVisits: "No visits recorded",

    noVaccines: "No vaccinations recorded",

    noHistory: "Medical history will appear here after the first visit or vaccination.",

    visit: "Visit",

    diagnosis: "Diagnosis",

    reason: "Reason",

    examination: "Examination",

    treatment: "Treatment",

    notes: "Notes",

    owner: "Owner",

    loading: "Loading pet profile...",

    error: "We couldn't load this pet profile",

    login: "Back to login",

    deceased: "Deceased",

  },

} as const;



const DAY_MS = 86400000;

const GRACE_DAYS = 7;



function readOwnerSession() {

  const read = (storage: Storage) => ({

    id: storage.getItem("vetra-client-id"),

    code: storage.getItem("vetra-client-code"),

    phone: storage.getItem("vetra-client-phone"),

  });

  const local = read(window.localStorage);

  if (local.id && local.code && local.phone) return local;

  const legacy = read(window.sessionStorage);

  if (legacy.id && legacy.code && legacy.phone) {

    window.localStorage.setItem("vetra-client-id", legacy.id);

    window.localStorage.setItem("vetra-client-code", legacy.code);

    window.localStorage.setItem("vetra-client-phone", legacy.phone);

    return legacy;

  }

  return { id: null, code: null, phone: null };

}



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



function careState(due: string | null): Status {

  if (!due) return "current";

  const d = daysUntil(due);

  if (d > 0) return "current";

  if (d >= -GRACE_DAYS) return "grace";

  return "overdue";

}



function ageInDays(birth: string | null) {

  if (!birth) return null;

  return Math.floor((dateOnly(new Date().toISOString()) - dateOnly(birth)) / DAY_MS);

}



function recordText(v: Vaccine) {

  return `${v.vaccine_name || ""} ${v.vaccine_type || ""} ${v.notes || ""}`.toLowerCase();

}



function isViral(v: Vaccine) {

  const x = recordText(v);

  return ["ثلاثي", "رباعي", "فيروسي", "فيروسى", "viral", "triple", "quad", "fvr", "fvrcp", "f3", "f4"].some(k => x.includes(k));

}



function isRabies(v: Vaccine) {

  return ["سعار", "rabies", "rabis"].some(k => recordText(v).includes(k));

}



function isDeworm(v: Vaccine) {

  return ["ديدان", "deworm", "worm", "internal parasite", "anthelmint"].some(k => recordText(v).includes(k));

}



function isParasite(v: Vaccine) {

  return ["حشرات", "flea", "fleas", "tick", "ticks", "ecto", "external parasite", "براغيث", "قراد"].some(k => recordText(v).includes(k));

}



function latest(records: Vaccine[], matcher: (v: Vaccine) => boolean) {

  return records

    .filter(v => matcher(v) && v.administered_at)

    .sort((a, b) => +new Date(b.administered_at as string) - +new Date(a.administered_at as string))[0] || null;

}



function protocolStatus(records: Vaccine[], pet: Pet): ProtocolItem[] {

  const age = ageInDays(pet.birth_date);

  const result: ProtocolItem[] = [];



  const viral = records.filter(v => isViral(v) && v.administered_at).sort((a, b) => +new Date(a.administered_at as string) - +new Date(b.administered_at as string));

  if (age !== null && age < 45) {

    result.push({ key: "viral", titleAr: "الفيروسي", titleEn: "Viral vaccine", points: 3, max: 3, status: "not_due", due: addDays(pet.birth_date as string, 45 - age), record: null });

  } else if (!viral.length) {

    result.push({ key: "viral", titleAr: "الفيروسي", titleEn: "Viral vaccine", points: 0, max: 3, status: "overdue", due: null, record: null });

  } else if (viral.length === 1) {

    const first = viral[0];

    const due = first.next_dose_at || addDays(first.administered_at as string, 21);

    const status = careState(due);

    result.push({ key: "viral", titleAr: "الفيروسي", titleEn: "Viral vaccine", points: status === "overdue" ? 0 : 3, max: 3, status, due, record: first });

  } else {

    const first = viral[0];

    const second = viral[1];

    const expectedSecond = first.next_dose_at || addDays(first.administered_at as string, 21);

    const late = Math.max(0, Math.floor((dateOnly(second.administered_at as string) - dateOnly(expectedSecond)) / DAY_MS));

    if (late > GRACE_DAYS) {

      result.push({ key: "viral", titleAr: "الفيروسي", titleEn: "Viral vaccine", points: 0, max: 3, status: "overdue", due: addDays(second.administered_at as string, 21), record: second });

    } else {

      const last = viral[viral.length - 1];

      const due = last.next_dose_at || addYears(last.administered_at as string, 1);

      const status = careState(due);

      result.push({ key: "viral", titleAr: "الفيروسي", titleEn: "Viral vaccine", points: status === "overdue" ? 0 : 3, max: 3, status, due, record: last });

    }

  }



  const rabies = latest(records, isRabies);

  if (age !== null && age < 90) {

    result.push({ key: "rabies", titleAr: "السعار", titleEn: "Rabies", points: 2, max: 2, status: "not_due", due: addDays(pet.birth_date as string, 90 - age), record: null });

  } else if (!rabies) {

    result.push({ key: "rabies", titleAr: "السعار", titleEn: "Rabies", points: 0, max: 2, status: "overdue", due: null, record: null });

  } else {

    const due = rabies.next_dose_at || addYears(rabies.administered_at as string, 1);

    const status = careState(due);

    result.push({ key: "rabies", titleAr: "السعار", titleEn: "Rabies", points: status === "overdue" ? 0 : 2, max: 2, status, due, record: rabies });

  }



  const deworm = records.filter(v => isDeworm(v) && v.administered_at).sort((a, b) => +new Date(a.administered_at as string) - +new Date(b.administered_at as string));

  if (age !== null && age < 90) {

    result.push({ key: "deworm", titleAr: "الديدان", titleEn: "Deworming", points: 2, max: 2, status: "not_due", due: addDays(pet.birth_date as string, 90 - age), record: null });

  } else if (!deworm.length) {

    result.push({ key: "deworm", titleAr: "الديدان", titleEn: "Deworming", points: 0, max: 2, status: "overdue", due: null, record: null });

  } else if (deworm.length === 1) {

    const first = deworm[0];

    const due = first.next_dose_at || addDays(first.administered_at as string, 14);

    const status = careState(due);

    result.push({ key: "deworm", titleAr: "الديدان", titleEn: "Deworming", points: status === "overdue" ? 0 : 2, max: 2, status, due, record: first });

  } else {

    const first = deworm[0];

    const second = deworm[1];

    const expectedSecond = first.next_dose_at || addDays(first.administered_at as string, 14);

    const late = Math.max(0, Math.floor((dateOnly(second.administered_at as string) - dateOnly(expectedSecond)) / DAY_MS));

    if (late > GRACE_DAYS) {

      result.push({ key: "deworm", titleAr: "الديدان", titleEn: "Deworming", points: 0, max: 2, status: "overdue", due: addDays(second.administered_at as string, 14), record: second });

    } else {

      const last = deworm[deworm.length - 1];

      const due = last.next_dose_at || addDays(last.administered_at as string, 60);

      const status = careState(due);

      result.push({ key: "deworm", titleAr: "الديدان", titleEn: "Deworming", points: status === "overdue" ? 0 : 2, max: 2, status, due, record: last });

    }

  }



  const parasite = latest(records, isParasite);

  result.push({

    key: "parasite",

    titleAr: "الحشرات",

    titleEn: "Parasite control",

    points: 1,

    max: 1,

    status: parasite?.next_dose_at ? careState(parasite.next_dose_at) : "not_due",

    due: parasite?.next_dose_at || null,

    record: parasite,

  });



  return result;

}



function speciesIcon(species: string) {

  const x = species.toLowerCase();

  if (x.includes("cat") || x.includes("قط")) return "🐱";

  if (x.includes("dog") || x.includes("كلب")) return "🐶";

  return "🐾";

}



function speciesText(species: string, lang: Lang) {

  const x = species.toLowerCase();

  if (x.includes("cat") || x.includes("قط")) return lang === "ar" ? "قطة" : "Cat";

  if (x.includes("dog") || x.includes("كلب")) return lang === "ar" ? "كلب" : "Dog";

  return species;

}



function ageText(birth: string | null, lang: Lang) {

  const d = ageInDays(birth);

  if (d === null) return T[lang].unknown;

  const years = Math.floor(d / 365);

  const months = Math.floor((d % 365) / 30);

  if (years > 0) return lang === "ar" ? `${years} سنة` : `${years} ${years === 1 ? "year" : "years"}`;

  if (months > 0) return lang === "ar" ? `${months} شهر` : `${months} ${months === 1 ? "month" : "months"}`;

  return lang === "ar" ? "أقل من شهر" : "Under one month";

}



function formatDate(value: string, lang: Lang) {

  return new Date(value).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { day: "numeric", month: "short", year: "numeric" });

}



function MiniChart({ values, unit, lang }: { values: number[]; unit: string; lang: Lang }) {

  if (!values.length) return <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-white/10 text-[11px] text-slate-500">{T[lang].noData}</div>;

  const min = Math.min(...values);

  const max = Math.max(...values);

  const spread = Math.max(max - min, 0.1);

  const w = 240;

  const h = 78;

  const coords = values.map((v, i) => ({

    x: values.length === 1 ? w / 2 : (i / (values.length - 1)) * w,

    y: values.length === 1 ? h / 2 : h - 8 - ((v - min) / spread) * (h - 16),

  }));

  return (

    <div>

      <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-slate-500">

        <span>{values.length === 1 ? T[lang].firstReading : `${values.length} ${T[lang].readings}`}</span>

        <span>{values[values.length - 1]} {unit}</span>

      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full">

        <defs>

          <linearGradient id="pet-profile-chart" x1="0" x2="1">

            <stop offset="0%" stopColor="#22d3ee" />

            <stop offset="100%" stopColor="#8b5cf6" />

          </linearGradient>

        </defs>

        {coords.length > 1 && <polyline points={coords.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="url(#pet-profile-chart)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}

        {coords.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={coords.length === 1 ? 5 : 3} fill="#08131f" stroke="#67e8f9" strokeWidth="2" />)}

      </svg>

    </div>

  );

}



export default function ClientPetProfilePage() {

  const params = useParams<{ id?: string | string[]; petsid?: string | string[] }>();

  const router = useRouter();

  const clientId = Array.isArray(params?.id) ? params.id[0] : (params?.id || "");

  const petId = Array.isArray(params?.petsid) ? params.petsid[0] : (params?.petsid || "");

  const [lang, setLang] = useState<Lang>("ar");

  const [dark, setDark] = useState(true);

  const [client, setClient] = useState<Client | null>(null);

  const [pet, setPet] = useState<Pet | null>(null);

  const [visits, setVisits] = useState<Visit[]>([]);

  const [vaccines, setVaccines] = useState<Vaccine[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");



  useEffect(() => {

    const savedLanguage = window.localStorage.getItem("vetra-language");

    const savedTheme = window.localStorage.getItem("vetra-theme");

    if (savedLanguage === "ar" || savedLanguage === "en") setLang(savedLanguage);

    setDark(savedTheme === "dark");

  }, []);



  const withTimeout = async <T,>(
    thenable: PromiseLike<T>,
    ms = 15000
  ): Promise<T> => {
    return await Promise.race([
      Promise.resolve(thenable),
      new Promise<T>((_, reject) =>
        window.setTimeout(
          () => reject(new Error("Request timed out. Please try again.")),
          ms
        )
      ),
    ]);
  };

  const load = async (showLoader = true) => {

    const session = readOwnerSession();

    if (!session.id || session.id !== clientId || !session.code || !session.phone) {

      router.replace("/client-interface/login");

      return;

    }

    if (showLoader) setLoading(true);

    setError("");

    try {

      const db = await withTimeout(getClientPortalDb(session.code, session.phone));

      const clientResult = await withTimeout(db.from("clients").select("id,name,phone,email").eq("id", clientId).maybeSingle());

      if (clientResult.error || !clientResult.data) throw new Error(clientResult.error?.message || "Client not found");



      const petResult = await withTimeout(db.from("pets").select("id,client_id,name,species,breed,gender,birth_date,color,microchip,is_deceased").eq("id", petId).eq("client_id", clientId).maybeSingle());

      if (petResult.error || !petResult.data) throw new Error(petResult.error?.message || "Pet not found");



      const visitResult = await withTimeout(db.from("visits").select("id,pet_id,visit_date,reason,examination,diagnosis,treatment,weight,temperature,heart_rate,respiratory_rate,notes").eq("pet_id", petId).order("visit_date", { ascending: false }));

      if (visitResult.error) throw new Error(visitResult.error.message);



      const vaccineResult = await withTimeout(db.from("vaccinations").select("id,pet_id,vaccine_name,vaccine_type,administered_at,next_dose_at,notes").eq("pet_id", petId).order("administered_at", { ascending: false }));

      if (vaccineResult.error) throw new Error(vaccineResult.error.message);



      setClient(clientResult.data as Client);

      setPet(petResult.data as Pet);

      setVisits((visitResult.data || []) as Visit[]);

      setVaccines((vaccineResult.data || []) as Vaccine[]);

    } catch (e) {

      console.error("CLIENT PET PROFILE ERROR:", e);

      setError(e instanceof Error ? e.message : "Failed to load pet profile");

    } finally {

      if (showLoader) setLoading(false);

    }

  };



  useEffect(() => {

    if (!clientId || !petId) return;

    void load(true);

    const refresh = () => { if (document.visibilityState === "visible") void load(false); };

    window.addEventListener("focus", refresh);

    window.addEventListener("pageshow", refresh);

    document.addEventListener("visibilitychange", refresh);

    return () => {

      window.removeEventListener("focus", refresh);

      window.removeEventListener("pageshow", refresh);

      document.removeEventListener("visibilitychange", refresh);

    };

  }, [clientId, petId, router]);



  const t = T[lang];

  const protocol = useMemo(() => pet && pet.species.toLowerCase().includes("cat") || pet?.species.includes("قط") ? protocolStatus(vaccines, pet) : [], [pet, vaccines]);

  const lastVisit = visits[0] || null;

  const visitAgeDays = lastVisit ? Math.max(0, Math.floor((Date.now() - new Date(lastVisit.visit_date).getTime()) / DAY_MS)) : Infinity;

  const visitPoints = visitAgeDays <= 30 ? 2 : 0;

  const careScore = protocol.length ? Math.min(10, protocol.reduce((sum, item) => sum + item.points, 0) + visitPoints) : null;

  const nextAction = protocol.filter(x => x.due).sort((a, b) => daysUntil(a.due as string) - daysUntil(b.due as string))[0] || null;

  const nextDays = nextAction?.due ? daysUntil(nextAction.due) : null;



  const metricSets = useMemo(() => [

    { label: t.weight, unit: "kg", icon: "⚖️", values: visits.filter(v => v.weight !== null).slice(0, 6).reverse().map(v => Number(v.weight)) },

    { label: t.temp, unit: "°م", icon: "🌡️", values: visits.filter(v => v.temperature !== null).slice(0, 6).reverse().map(v => Number(v.temperature)) },

    { label: t.heart, unit: "bpm", icon: "❤️", values: visits.filter(v => v.heart_rate !== null).slice(0, 6).reverse().map(v => Number(v.heart_rate)) },

    { label: t.resp, unit: "/min", icon: "🫁", values: visits.filter(v => v.respiratory_rate !== null).slice(0, 6).reverse().map(v => Number(v.respiratory_rate)) },

  ], [visits, t]);



  const timeline = useMemo(() => {

    const visitEvents = visits.map(v => ({ id: `visit-${v.id}`, date: v.visit_date, kind: "visit" as const, title: v.reason || t.visit, sub: v.diagnosis || v.examination || v.notes || "" }));

    const vaccineEvents = vaccines.filter(v => v.administered_at).map(v => ({ id: `vaccine-${v.id}`, date: v.administered_at as string, kind: "vaccine" as const, title: v.vaccine_name || v.vaccine_type || t.vaccineHistory, sub: v.next_dose_at ? `${t.nextDue}: ${formatDate(v.next_dose_at, lang)}` : "" }));

    return [...visitEvents, ...vaccineEvents].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 12);

  }, [visits, vaccines, t, lang]);



  if (loading) return <main dir={lang === "ar" ? "rtl" : "ltr"} className="flex min-h-screen items-center justify-center bg-[#06101a] text-white"><div className="text-center"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-400/10 text-3xl">🐾</div><p className="text-sm font-bold text-slate-400">{t.loading}</p></div></main>;

  if (error || !pet || !client) return <main dir={lang === "ar" ? "rtl" : "ltr"} className="flex min-h-screen items-center justify-center bg-[#06101a] px-6 text-white"><div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[.04] p-8 text-center"><div className="text-5xl">🐾</div><h1 className="mt-4 text-2xl font-black">{t.error}</h1><p className="mt-3 text-sm text-slate-400">{error}</p><button onClick={() => router.replace("/client-interface/login")} className="mt-6 rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-black text-slate-950">{t.login}</button></div></main>;



  const statusLabel = (status: Status) => status === "current" ? t.regular : status === "grace" ? t.grace : status === "overdue" ? t.overdue : t.notDue;

  const scoreTitle = careScore === 10 ? t.excellent : (careScore || 0) >= 8 ? t.almost : (careScore || 0) >= 5 ? t.good : t.start;



  return (

    <main dir={lang === "ar" ? "rtl" : "ltr"} className={dark ? "min-h-screen overflow-x-hidden bg-[#06101a] text-white" : "min-h-screen overflow-x-hidden bg-[#f5f9fc] text-slate-900"}>

      <div className="pointer-events-none fixed inset-0 overflow-hidden"><div className={dark ? "absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" : "absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-300/25 blur-3xl"}/><div className={dark ? "absolute -left-20 top-1/3 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" : "absolute -left-20 top-1/3 h-96 w-96 rounded-full bg-violet-300/20 blur-3xl"}/></div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-12 pt-4 sm:px-6 lg:px-8">

        <header className="mb-6 flex items-center justify-between py-3">

          <Link href={`/client-interface/${clientId}`} className="rounded-2xl border border-white/10 bg-white/[.04] px-4 py-2 text-xs font-black text-slate-300">← {t.back}</Link>

          <Link href={`/client-interface/${clientId}/vaccinations?pet=${pet.id}`} className="rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-xs font-black text-slate-950">💉 {t.vaccinations}</Link>

        </header>



        <section className={dark ? "rounded-[2rem] border border-white/[.07] bg-gradient-to-br from-white/[.08] to-white/[.03] p-5 shadow-2xl sm:p-7" : "rounded-[2rem] border border-slate-100 bg-white p-5 shadow-2xl sm:p-7"}>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

            <div className="flex items-center gap-4">

              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[1.6rem] bg-white/10 text-6xl">{speciesIcon(pet.species)}</div>

              <div className="min-w-0">

                <p className="text-xs font-bold text-cyan-300">{t.profile}</p>

                <h1 className="mt-1 truncate text-3xl font-black sm:text-4xl">{pet.name}</h1>

                <p className="mt-2 text-sm text-slate-400">{speciesText(pet.species, lang)}{pet.breed ? ` • ${pet.breed}` : ""}</p>

                <p className="mt-1 text-xs text-slate-500">{t.owner}: {client.name}</p>

              </div>

            </div>

            {pet.is_deceased && <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-slate-400">{t.deceased}</span>}

          </div>



          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

            {[{label:t.age,value:ageText(pet.birth_date,lang)}, {label:t.gender,value:pet.gender === "Male" ? t.male : pet.gender === "Female" ? t.female : t.unknown}, {label:t.color,value:pet.color || t.unknown}, {label:t.microchip,value:pet.microchip || t.unknown}].map(item => <div key={item.label} className={dark ? "rounded-2xl border border-white/[.05] bg-white/[.025] p-4" : "rounded-2xl border border-slate-100 bg-slate-50 p-4"}><div className="text-[10px] font-bold text-slate-500">{item.label}</div><div className="mt-1 truncate text-sm font-black">{item.value}</div></div>)}

          </div>

        </section>



        <section className="mt-5 grid gap-5 lg:grid-cols-[1.05fr\_.95fr]">

          <div className={dark ? "rounded-[2rem] border border-white/[.07] bg-white/[.035] p-5 sm:p-6" : "rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-6"}>

            <div className="flex items-center gap-4">

              <div className="relative h-24 w-24 shrink-0"><svg viewBox="0 0 100 100" className="h-full w-full -rotate-90"><circle cx="50" cy="50" r="42" fill="none" stroke={dark ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.08)"} strokeWidth="7"/><circle cx="50" cy="50" r="42" fill="none" stroke="url(#profile-score-ring)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${2*Math.PI*42*((careScore ?? 0)/10)} ${2*Math.PI*42}`}/><defs><linearGradient id="profile-score-ring"><stop offset="0" stopColor="#22d3ee"/><stop offset="100%" stopColor="#8b5cf6"/></linearGradient></defs></svg><div className="absolute inset-0 flex items-center justify-center text-xl font-black">{careScore === null ? "—" : `${careScore}/10`}</div></div>

              <div><p className="text-xs font-bold text-cyan-300">{t.careScore}</p><h2 className="mt-1 text-2xl font-black">{scoreTitle}</h2><p className="mt-2 max-w-xl text-xs leading-6 text-slate-500">{t.scoreNote}</p></div>

            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">

              <div className={dark ? "rounded-2xl border border-white/[.05] bg-white/[.025] p-3" : "rounded-2xl border border-slate-100 bg-slate-50 p-3"}><div className="flex justify-between text-xs font-bold"><span>{t.monthly}</span><span className={visitPoints ? "text-emerald-400" : "text-rose-300"}>{visitPoints ? "✓" : "•"}</span></div><div className="mt-1 text-[10px] text-slate-500">{visitPoints ? t.regular : t.overdue}</div></div>

              {protocol.map(item => <div key={item.key} className={dark ? "rounded-2xl border border-white/[.05] bg-white/[.025] p-3" : "rounded-2xl border border-slate-100 bg-slate-50 p-3"}><div className="flex justify-between text-xs font-bold"><span>{lang === "ar" ? item.titleAr : item.titleEn}</span><span className={item.points > 0 ? "text-emerald-400" : "text-rose-300"}>{item.points > 0 ? "✓" : "•"}</span></div><div className="mt-1 text-[10px] text-slate-500">{statusLabel(item.status)}</div></div>)}

            </div>

          </div>



          <div className={dark ? "rounded-[2rem] border border-white/[.07] bg-white/[.035] p-5 sm:p-6" : "rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-6"}>

            <p className="text-xs font-bold text-cyan-300">{t.nextDue}</p>

            <h2 className="mt-1 text-2xl font-black">{nextAction ? (lang === "ar" ? nextAction.titleAr : nextAction.titleEn) : t.noDue}</h2>

            {nextAction?.due && <p className="mt-2 text-sm text-slate-500">{formatDate(nextAction.due, lang)}</p>}

            <div className="mt-5 flex items-center gap-4"><div className="flex h-24 w-24 items-center justify-center rounded-full border-8 border-cyan-400/10 text-center"><div><div className="text-2xl font-black">{nextDays === null ? "—" : Math.max(nextDays, 0)}</div><div className="text-[10px] font-bold text-slate-500">{t.days}</div></div></div><div className="text-xs leading-6 text-slate-500">{nextAction ? statusLabel(nextAction.status) : t.noDue}</div></div>

            <Link href={`/client-interface/${clientId}/vaccinations?pet=${pet.id}`} className="mt-5 block w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-3 text-center text-xs font-black text-slate-950">💉 {t.vaccinations}</Link>

          </div>

        </section>



        <section className={dark ? "mt-5 rounded-[2rem] border border-white/[.07] bg-white/[.035] p-5 sm:p-6" : "mt-5 rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-6"}>

          <div className="flex items-end justify-between"><div><p className="text-xs font-bold text-cyan-300">{t.health}</p><h2 className="mt-1 text-2xl font-black">{pet.name}</h2></div><span className="rounded-full border border-white/[.06] bg-white/[.03] px-3 py-1.5 text-[10px] font-bold text-slate-500">{t.sixMonths}</span></div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">{metricSets.map(m => <div key={m.label} className={dark ? "rounded-[1.5rem] border border-white/[.05] bg-white/[.025] p-4" : "rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4"}><div className="flex items-center gap-2 text-xs font-black"><span>{m.icon}</span><span>{m.label}</span></div><MiniChart values={m.values} unit={m.unit} lang={lang}/></div>)}</div>

        </section>



        <section className={dark ? "mt-5 rounded-[2rem] border border-white/[.07] bg-white/[.035] p-5 sm:p-6" : "mt-5 rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-6"}>

          <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-cyan-300">{t.history}</p><h2 className="mt-1 text-2xl font-black">{pet.name}</h2></div><span className="rounded-full bg-cyan-400/10 px-3 py-1.5 text-[10px] font-black text-cyan-300">{timeline.length}</span></div>

          <div className="mt-6">{timeline.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500"><div className="mb-2 text-3xl">🩺</div>{t.noHistory}</div> : <div className="relative space-y-5"><div className="absolute bottom-4 right-5 top-4 w-px bg-gradient-to-b from-cyan-400 via-violet-500 to-transparent"/>{timeline.map(event => <div key={event.id} className="relative flex gap-4"><div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#0b1622]">{event.kind === "vaccine" ? "💉" : "🩺"}</div><div className={dark ? "flex-1 rounded-2xl border border-white/[.05] bg-white/[.025] p-4" : "flex-1 rounded-2xl border border-slate-100 bg-slate-50 p-4"}><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-black">{event.title}</div><div className="text-[10px] font-bold text-slate-500">{formatDate(event.date, lang)}</div></div>{event.sub && <div className="mt-2 text-xs leading-6 text-slate-500">{event.sub}</div>}</div></div>)}</div>}</div>

        </section>



        <section className={dark ? "mt-5 rounded-[2rem] border border-white/[.07] bg-white/[.035] p-5" : "mt-5 rounded-[2rem] border border-slate-100 bg-white p-5"}>

          <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-cyan-300">{t.vaccineHistory}</p><h2 className="mt-1 text-xl font-black">{pet.name}</h2></div><span className="rounded-full bg-white/[.05] px-3 py-1.5 text-[10px] font-black text-slate-500">{vaccines.length}</span></div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">{vaccines.slice(0, 6).map(v => <div key={v.id} className={dark ? "rounded-2xl border border-white/[.05] bg-white/[.025] p-3.5" : "rounded-2xl border border-slate-100 bg-slate-50 p-3.5"}><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10">💉</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-black">{v.vaccine_name || v.vaccine_type || t.vaccineHistory}</div><div className="mt-1 text-[10px] text-slate-500">{v.administered_at ? formatDate(v.administered_at, lang) : "—"}</div></div></div></div>)}{!vaccines.length && <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">{t.noVaccines}</div>}</div>

        </section>

      </div>

    </main>

  );

}
