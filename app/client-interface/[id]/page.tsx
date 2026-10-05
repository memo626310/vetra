"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getClientPortalDb } from "@/lib/client-portal-db";

type Lang = "ar" | "en";
type Client = { id: string; name: string; phone: string | null; email: string | null };
type Pet = { id: string; name: string; species: string; breed: string | null; gender: string | null; birth_date: string | null; color: string | null; is_deceased: boolean | null };
type Visit = { id: string; pet_id: string; visit_date: string; reason: string | null; examination: string | null; diagnosis: string | null; treatment: string | null; weight: number | null; temperature: number | null; heart_rate: number | null; respiratory_rate: number | null; notes: string | null };
type Vaccine = { id: string; pet_id: string; vaccine_name: string | null; vaccine_type: string | null; administered_at: string | null; next_dose_at: string | null; notes: string | null };

const T = {
  ar: { home:"الرئيسية", pets:"حيواناتي", more:"المزيد", welcome:"مساء الخير", allCare:"كل رعاية حيواناتك في مكان واحد", selected:"الحيوان المختار", count:"حيوانات", add:"إضافة حيوان", score:"نقاط VETRA", scorePerfect:"10/10 🎉 ممتاز!", scoreAlmost:"قربت توصل 10/10!", scoreGood:"أنت على الطريق الصح", scoreStart:"خلّينا نكملها سوا", scoreNote:"ده مقياس تفاعلي لاكتمال متابعة الحيوان داخل VETRA، مش تقييمًا طبيًا.", scoreMissing:"متبقي", scoreProfile:"بيانات الحيوان", scoreVaccines:"متابعة التطعيمات", scoreFollowUp:"المتابعة الدورية", scoreMonthly:"زيارة العيادة الشهرية", scoreViral:"الفيروسي", scoreRabies:"السعار", scoreDeworm:"الديدان", scoreParasite:"الحشرات", next:"الاستحقاق القادم", none:"مفيش تطعيمات قادمة", overdue:"متأخر", day:"يوم", daysLeft:"متبقي", reminder:"فعّل تذكير", trends:"المؤشرات الحيوية", sixMonths:"آخر 6 شهور", noData:"بيانات غير كافية", weight:"الوزن", temp:"الحرارة", heart:"نبض القلب", resp:"معدل التنفس", history:"التاريخ الطبي", vaccineHistory:"سجل التطعيمات", completed:"مكتمل", soon:"قريبًا", noVaccines:"مفيش تطعيمات مسجلة", noVisits:"مفيش زيارات مسجلة", timelineNote:"التاريخ الطبي هيظهر هنا مع أول زيارة أو تطعيم.", settings:"الإعدادات", light:"الوضع الفاتح", dark:"الوضع الداكن", language:"English", logout:"تسجيل الخروج", secure:"حساب آمن", phone:"الهاتف", email:"البريد الإلكتروني", addTitle:"إضافة حيوان جديد", addNote:"تقدر تضيف أكتر من حيوان لنفس الحساب. اكتب البيانات الأساسية، وVETRA هتربط الحيوان بحسابك بشكل آمن.", name:"اسم الحيوان", species:"النوع", cat:"قطة", dog:"كلب", other:"أخرى", gender:"النوع", female:"أنثى", male:"ذكر", birth:"تاريخ الميلاد", breed:"السلالة", color:"اللون", save:"حفظ الحيوان", saving:"جاري الحفظ...", cancel:"إلغاء", required:"اكتب اسم الحيوان", created:"تمت إضافة الحيوان بنجاح", close:"إغلاق", error:"تعذر تحميل بياناتك", login:"العودة لتسجيل الدخول", loading:"جاري تحميل VETRA...", age:"العمر", unknown:"غير محدد" },
  en: { home:"Home", pets:"My Pets", more:"More", welcome:"Good evening", allCare:"All your pets' care in one place", selected:"Selected pet", count:"pets", add:"Add Pet", score:"VETRA Score", scorePerfect:"10/10 🎉 Excellent!", scoreAlmost:"You are almost at 10/10!", scoreGood:"You are on the right track", scoreStart:"Let's complete it together", scoreNote:"This is an interactive care-completeness indicator inside VETRA, not a medical score.", scoreMissing:"remaining", scoreProfile:"Pet profile", scoreVaccines:"Vaccination tracking", scoreFollowUp:"Regular follow-up", scoreMonthly:"Monthly clinic visit", scoreViral:"Core viral vaccine", scoreRabies:"Rabies", scoreDeworm:"Deworming", scoreParasite:"Parasite control", next:"Next due", none:"No upcoming vaccines", overdue:"Overdue", day:"day", daysLeft:"left", reminder:"Set reminder", trends:"Health trends", sixMonths:"Last 6 months", noData:"Not enough data", weight:"Weight", temp:"Temperature", heart:"Heart rate", resp:"Respiratory rate", history:"Medical history", vaccineHistory:"Vaccination history", completed:"Completed", soon:"Due soon", noVaccines:"No vaccinations recorded", noVisits:"No visits recorded", timelineNote:"Medical history will appear here after the first visit or vaccination.", settings:"Settings", light:"Light mode", dark:"Dark mode", language:"العربية", logout:"Sign out", secure:"Secure account", phone:"Phone", email:"Email", addTitle:"Add a new pet", addNote:"You can keep multiple pets on the same account. Add the basics here and VETRA will link the pet to your account securely.", name:"Pet name", species:"Species", cat:"Cat", dog:"Dog", other:"Other", gender:"Gender", female:"Female", male:"Male", birth:"Date of birth", breed:"Breed", color:"Color", save:"Save pet", saving:"Saving...", cancel:"Cancel", required:"Enter the pet name", created:"Pet added successfully", close:"Close", error:"We couldn't load your data", login:"Back to login", loading:"Loading VETRA...", age:"Age", unknown:"Not specified" }
} as const;

const icon = (s:string) => s.toLowerCase().includes("cat") || s.includes("قط") ? "🐱" : s.toLowerCase().includes("dog") || s.includes("كلب") ? "🐶" : "🐾";
const species = (s:string, l:Lang) => s.toLowerCase().includes("cat") || s.includes("قط") ? (l === "ar" ? "قطة" : "Cat") : s.toLowerCase().includes("dog") || s.includes("كلب") ? (l === "ar" ? "كلب" : "Dog") : s;
const dateText = (d:string, l:Lang) => new Date(d).toLocaleDateString(l === "ar" ? "ar-EG" : "en-US", {day:"numeric", month:"short", year:"numeric"});
const daysUntil = (d:string) => Math.ceil((new Date(new Date(d).getFullYear(), new Date(d).getMonth(), new Date(d).getDate()).getTime() - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) / 86400000);
const age = (d:string|null,l:Lang) => { if(!d) return T[l].unknown; const b=new Date(d), n=new Date(); let y=n.getFullYear()-b.getFullYear(), m=n.getMonth()-b.getMonth(); if(n.getDate()<b.getDate()) m--; if(m<0){y--;m+=12;} if(y>0) return l==='ar'?`${y} سنة`:`${y} ${y===1?'year':'years'}`; return l==='ar'?`${Math.max(m,0)} شهر`:`${Math.max(m,0)} ${m===1?'month':'months'}`; };

const DAY_MS = 86400000;
const GRACE_DAYS = 7;

function ageInDays(birthDate: string | null) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const now = new Date();
  const b = new Date(birth.getFullYear(), birth.getMonth(), birth.getDate()).getTime();
  const n = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.floor((n - b) / DAY_MS);
}

function daysSince(value: string | null) {
  if (!value) return null;
  return -daysUntil(value);
}

function careState(nextDue: string | null): "not_due" | "current" | "grace" | "overdue" {
  if (!nextDue) return "current";
  const d = daysUntil(nextDue);
  if (d > 0) return "current";
  if (d >= -GRACE_DAYS) return "grace";
  return "overdue";
}

function getOwnerSession() {
  const read = (storage: Storage) => ({
    id: storage.getItem("vetra-client-id"),
    code: storage.getItem("vetra-client-code"),
    phone: storage.getItem("vetra-client-phone"),
  });

  const persistent = read(window.localStorage);
  if (persistent.id && persistent.code && persistent.phone) {
    return persistent;
  }

  // One-time migration for owners who logged in before persistent sessions.
  const legacy = read(window.sessionStorage);
  if (legacy.id && legacy.code && legacy.phone) {
    window.localStorage.setItem("vetra-client-id", legacy.id);
    window.localStorage.setItem("vetra-client-code", legacy.code);
    window.localStorage.setItem("vetra-client-phone", legacy.phone);
    return legacy;
  }

  return { id: null, code: null, phone: null };
}

function recordText(v: Vaccine) {
  return `${v.vaccine_name || ""} ${v.vaccine_type || ""} ${v.notes || ""}`.toLowerCase();
}

function isViral(v: Vaccine) {
  const x = recordText(v);
  return ["ثلاثي", "رباعي", "فيروسي", "فيروسى", "viral", "triple", "quad", "fvr", "fvrcp", "f3", "f4"].some(k => x.includes(k));
}

function isRabies(v: Vaccine) {
  const x = recordText(v);
  return ["سعار", "rabies", "rabis"].some(k => x.includes(k));
}

function isDeworm(v: Vaccine) {
  const x = recordText(v);
  return ["ديدان", "deworm", "worm", "internal parasite", "anthelmint"].some(k => x.includes(k));
}

function isParasite(v: Vaccine) {
  const x = recordText(v);
  return ["حشرات", "flea", "fleas", "tick", "ticks", "ecto", "external parasite", "براغيث", "قراد"].some(k => x.includes(k));
}

type ProtocolState = "not_due" | "current" | "grace" | "overdue" | "due";

type ProtocolStatus = {
  points: number;
  max: number;
  status: ProtocolState;
  due: string | null;
  reset: boolean;
  record: Vaccine | null;
};

function latestRecord(records: Vaccine[], matcher: (v: Vaccine) => boolean) {
  return records
    .filter(v => matcher(v) && v.administered_at)
    .sort((a, b) => +new Date(b.administered_at as string) - +new Date(a.administered_at as string))[0] || null;
}

function addDays(date: string, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function addDaysToDateOnly(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(year, month - 1, day + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isCatSpecies(speciesValue: string | null | undefined) {
  const x = (speciesValue || "").toLowerCase();
  return x.includes("cat") || x.includes("قط");
}

function todayDateOnly() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateOnlyFromIso(value: string) {
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ageDaysAtDate(birthDate: string | null, value: string) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const at = new Date(value);
  const b = new Date(birth.getFullYear(), birth.getMonth(), birth.getDate()).getTime();
  const a = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  return Math.floor((a - b) / DAY_MS);
}

function protocolState(due: string | null): ProtocolState {
  if (!due) return "current";
  const d = daysUntil(due);
  if (d > 0) return "current";
  if (d === 0) return "due";
  if (d >= -GRACE_DAYS) return "grace";
  return "overdue";
}

function getViralStatus(records: Vaccine[], birthDate: string | null): ProtocolStatus {
  const ageDays = ageInDays(birthDate);
  const birth = birthDate || todayDateOnly();

  if (ageDays !== null && ageDays < 45) {
    return {
      points: 3,
      max: 3,
      status: "not_due",
      due: addDaysToDateOnly(birth, 45),
      reset: false,
      record: null,
    };
  }

  const events = records
    .filter(v => isViral(v) && v.administered_at)
    .filter(v => {
      const eventAge = ageDaysAtDate(birthDate, v.administered_at as string);
      return eventAge === null || eventAge >= 45;
    })
    .sort((a, b) => +new Date(a.administered_at as string) - +new Date(b.administered_at as string));

  if (!events.length) {
    return { points: 0, max: 3, status: "overdue", due: todayDateOnly(), reset: true, record: null };
  }

  let cycleStartIndex = 0;
  let primaryCompleteIndex: number | null = null;

  while (cycleStartIndex < events.length) {
    const first = events[cycleStartIndex];
    const firstDate = first.administered_at as string;
    const second = events[cycleStartIndex + 1];

    if (!second) {
      const due = addDays(firstDate, 21);
      const state = protocolState(due);
      if (state === "overdue") {
        return {
          points: 0,
          max: 3,
          status: "overdue",
          due: todayDateOnly(),
          reset: true,
          record: first,
        };
      }
      return { points: 3, max: 3, status: state, due, reset: false, record: first };
    }

    const secondDate = second.administered_at as string;
    const secondDeadline = addDays(firstDate, 28);
    if (dateOnlyFromIso(secondDate) <= dateOnlyFromIso(secondDeadline)) {
      primaryCompleteIndex = cycleStartIndex + 1;
      break;
    }

    // The second dose missed the 21-day target + 7-day grace.
    // The later dose becomes the new first dose of a fresh viral series.
    cycleStartIndex += 1;
  }

  if (primaryCompleteIndex === null) {
    return { points: 0, max: 3, status: "overdue", due: todayDateOnly(), reset: true, record: events.at(-1) || null };
  }

  let lastIndex = primaryCompleteIndex;

  while (events[lastIndex + 1]) {
    const previous = events[lastIndex].administered_at as string;
    const annualDeadline = addDays(previous, 372);
    const next = events[lastIndex + 1].administered_at as string;

    if (dateOnlyFromIso(next) <= dateOnlyFromIso(annualDeadline)) {
      lastIndex += 1;
      continue;
    }

    // Annual dose missed beyond the grace window. The later dose is a new first dose.
    const restart = events[lastIndex + 1];
    const due = addDays(restart.administered_at as string, 21);
    const state = protocolState(due);
    if (state === "overdue") {
      return { points: 0, max: 3, status: "overdue", due: todayDateOnly(), reset: true, record: restart };
    }
    return { points: 3, max: 3, status: state, due, reset: false, record: restart };
  }

  const last = events[lastIndex];
  const due = addDays(last.administered_at as string, 365);
  const state = protocolState(due);

  return state === "overdue"
    ? { points: 0, max: 3, status: "overdue", due: todayDateOnly(), reset: true, record: last }
    : { points: 3, max: 3, status: state, due, reset: false, record: last };
}

function getDewormStatus(records: Vaccine[], petBirth: string | null): ProtocolStatus {
  const ageDays = ageInDays(petBirth);
  const birth = petBirth || todayDateOnly();

  if (ageDays !== null && ageDays < 90) {
    return {
      points: 2,
      max: 2,
      status: "not_due",
      due: addDaysToDateOnly(birth, 90),
      reset: false,
      record: null,
    };
  }

  const events = records
    .filter(v => isDeworm(v) && v.administered_at)
    .filter(v => {
      const eventAge = ageDaysAtDate(petBirth, v.administered_at as string);
      return eventAge === null || eventAge >= 90;
    })
    .sort((a, b) => +new Date(a.administered_at as string) - +new Date(b.administered_at as string));

  if (!events.length) {
    return { points: 0, max: 2, status: "overdue", due: todayDateOnly(), reset: true, record: null };
  }

  let firstIndex = 0;
  const first = events[firstIndex];
  const second = events[firstIndex + 1];

  if (!second) {
    const due = addDays(first.administered_at as string, 14);
    const state = protocolState(due);
    return state === "overdue"
      ? { points: 0, max: 2, status: "overdue", due: todayDateOnly(), reset: true, record: first }
      : { points: 2, max: 2, status: state, due, reset: false, record: first };
  }

  const firstDeadline = addDays(first.administered_at as string, 21);
  if (dateOnlyFromIso(second.administered_at as string) > dateOnlyFromIso(firstDeadline)) {
    const restart = second;
    const due = addDays(restart.administered_at as string, 14);
    const state = protocolState(due);
    return state === "overdue"
      ? { points: 0, max: 2, status: "overdue", due: todayDateOnly(), reset: true, record: restart }
      : { points: 2, max: 2, status: state, due, reset: false, record: restart };
  }

  let lastIndex = 1;
  while (events[lastIndex + 1]) {
    const previous = events[lastIndex].administered_at as string;
    const maintenanceDeadline = addDays(previous, 67);
    const next = events[lastIndex + 1].administered_at as string;

    if (dateOnlyFromIso(next) <= dateOnlyFromIso(maintenanceDeadline)) {
      lastIndex += 1;
      continue;
    }

    const restart = events[lastIndex + 1];
    const due = addDays(restart.administered_at as string, 14);
    const state = protocolState(due);
    return state === "overdue"
      ? { points: 0, max: 2, status: "overdue", due: todayDateOnly(), reset: true, record: restart }
      : { points: 2, max: 2, status: state, due, reset: false, record: restart };
  }

  const last = events[lastIndex];
  const due = addDays(last.administered_at as string, 60);
  const state = protocolState(due);

  return state === "overdue"
    ? { points: 0, max: 2, status: "overdue", due: todayDateOnly(), reset: true, record: last }
    : { points: 2, max: 2, status: state, due, reset: false, record: last };
}

function getRabiesStatus(records: Vaccine[], petBirth: string | null): ProtocolStatus {
  const ageDays = ageInDays(petBirth);
  const birth = petBirth || todayDateOnly();
  const rabies = latestRecord(records, isRabies);

  if (ageDays !== null && ageDays < 90) {
    return {
      points: 2,
      max: 2,
      status: "not_due",
      due: addDaysToDateOnly(birth, 90),
      reset: false,
      record: rabies,
    };
  }

  if (!rabies) {
    if (ageDays !== null && ageDays <= 180) {
      return { points: 0, max: 2, status: "due", due: todayDateOnly(), reset: false, record: null };
    }
    return { points: 0, max: 2, status: "overdue", due: todayDateOnly(), reset: false, record: null };
  }

  const due = addDays(rabies.administered_at as string, 365);
  const state = protocolState(due);

  return state === "overdue"
    ? { points: 0, max: 2, status: "overdue", due, reset: false, record: rabies }
    : { points: 2, max: 2, status: state, due, reset: false, record: rabies };
}

function getParasiteStatus(records: Vaccine[]): ProtocolStatus {
  const record = latestRecord(records, isParasite);
  if (!record) {
    return { points: 1, max: 1, status: "current", due: null, reset: false, record: null };
  }

  if (!record.next_dose_at) {
    return { points: 1, max: 1, status: "current", due: null, reset: false, record };
  }

  const state = protocolState(record.next_dose_at);
  return state === "overdue"
    ? { points: 0, max: 1, status: "overdue", due: record.next_dose_at, reset: false, record }
    : { points: 1, max: 1, status: state, due: record.next_dose_at, reset: false, record };
}

function getProtocolStatus(records: Vaccine[], pet: Pet | null) {
  return {
    viral: getViralStatus(records, pet?.birth_date || null),
    rabies: getRabiesStatus(records, pet?.birth_date || null),
    deworm: getDewormStatus(records, pet?.birth_date || null),
    parasite: getParasiteStatus(records),
  };
}

function Chart({ values, unit, empty }: { values:number[]; unit:string; empty:string }) {
  if(values.length === 0) return <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-white/10 text-[11px] text-slate-500">{empty}</div>;

  const min=Math.min(...values), max=Math.max(...values), spread=Math.max(max-min,.1), w=240,h=78;
  const coords=values.map((v,i)=>({
    x: values.length === 1 ? w / 2 : i/(values.length-1)*w,
    y: values.length === 1 ? h / 2 : h-8-((v-min)/spread)*(h-16),
  }));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-bold text-slate-500">
        <span>{values.length === 1 ? "أول قراءة" : `${values.length} قراءات`}</span>
        <span>{values.at(-1)} {unit}</span>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full">
        <defs>
          <linearGradient id="g" x1="0" x2="1">
            <stop offset="0" stopColor="#22d3ee"/>
            <stop offset="1" stopColor="#8b5cf6"/>
          </linearGradient>
        </defs>

        {values.length > 1 && (
          <polyline
            points={coords.map((p)=>`${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="url(#g)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {coords.map((p,i)=>(
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={values.length === 1 ? "5" : "3"}
            fill="#08131f"
            stroke="#67e8f9"
            strokeWidth="2"
          />
        ))}

        {values.length === 1 && (
          <line
            x1="20"
            x2={w-20}
            y1={h/2}
            y2={h/2}
            stroke="rgba(255,255,255,.08)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        )}
      </svg>
    </div>
  );
}

function Countdown({ days, lang, status }:{days:number|null;lang:Lang;status:ProtocolState|null}) {
  const c=2*Math.PI*42;
  const isGrace=status === "grace";
  const isOverdue=status === "overdue";
  const graceRemaining=days !== null && days < 0 ? Math.max(0, GRACE_DAYS + days) : null;
  const displayValue = days === null
    ? "—"
    : isGrace
      ? String(graceRemaining)
      : isOverdue
        ? "0"
        : String(Math.max(days, 0));
  const label = isGrace
    ? (lang === "ar" ? "سماح" : "grace")
    : isOverdue
      ? (lang === "ar" ? "ابدأ الآن" : "start now")
      : status === "due"
        ? (lang === "ar" ? "مستحق" : "due")
        : T[lang].day;
  const progress = days === null
    ? 0.05
    : isGrace
      ? Math.min(1, Math.max(0.08, (GRACE_DAYS - (graceRemaining ?? 0)) / GRACE_DAYS))
      : isOverdue || status === "due"
        ? 1
        : Math.min(1,Math.max(.08,1-days/30));

  return <div className="relative h-28 w-28 shrink-0"><svg viewBox="0 0 100 100" className="h-full w-full -rotate-90"><circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="6"/><circle cx="50" cy="50" r="42" fill="none" stroke="url(#ring)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c*progress} ${c}`}/><defs><linearGradient id="ring"><stop offset="0" stopColor="#22d3ee"/><stop offset="1" stopColor="#8b5cf6"/></linearGradient></defs></svg><div className="absolute inset-0 flex flex-col items-center justify-center"><b className="text-xl">{displayValue}</b><span className="text-[9px] font-bold text-slate-500">{label}</span></div></div>;
}

export default function ClientInterfaceIdPage(){
  const params=useParams<{id:string}>(); const router=useRouter(); const clientId=params.id;
  const [lang,setLang]=useState<Lang>("ar"); const [dark,setDark]=useState(true); const [client,setClient]=useState<Client|null>(null); const [pets,setPets]=useState<Pet[]>([]); const [visits,setVisits]=useState<Visit[]>([]); const [vaccines,setVaccines]=useState<Vaccine[]>([]); const [selected,setSelected]=useState(""); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [settings,setSettings]=useState(false); const [addPet,setAddPet]=useState(false); const [petForm,setPetForm]=useState({name:"",species:"cat",gender:"Female",birth_date:"",breed:"",color:""}); const [savingPet,setSavingPet]=useState(false);

  useEffect(()=>{const l=localStorage.getItem("vetra-language"); const th=localStorage.getItem("vetra-theme"); if(l==="ar"||l==="en")setLang(l); setDark(th==="dark");},[]);
  const loadDashboard = async (showLoader = false) => {
    if (!clientId) return;
    if (showLoader) setLoading(true);
    setError("");

    const ownerSession=getOwnerSession();
    const id=ownerSession.id, code=ownerSession.code, phone=ownerSession.phone;
    if(!id||id!==clientId||!code||!phone){router.replace("/client-interface/login");return;}

    try{
      const db=await getClientPortalDb(code,phone);
      const c=await db.from("clients").select("id,name,phone,email").eq("id",clientId).maybeSingle();
      if(c.error||!c.data)throw new Error(c.error?.message||"Client not found");

      const p=await db.from("pets").select("id,name,species,breed,gender,birth_date,color,is_deceased,created_at").eq("client_id",clientId).order("created_at",{ascending:false});
      if(p.error)throw new Error(p.error.message);

      const ids=(p.data||[]).map(x=>x.id);
      let v:Visit[]=[];
      let vx:Vaccine[]=[];

      if(ids.length){
        const vr=await db.from("visits").select("id,pet_id,visit_date,reason,examination,diagnosis,treatment,weight,temperature,heart_rate,respiratory_rate,notes").in("pet_id",ids).order("visit_date",{ascending:false});
        if(vr.error)throw new Error(vr.error.message);
        v=(vr.data||[]) as Visit[];

        const xr=await db.from("vaccinations").select("id,pet_id,vaccine_name,vaccine_type,administered_at,next_dose_at,notes").in("pet_id",ids).order("next_dose_at",{ascending:true});
        if(xr.error)throw new Error(xr.error.message);
        vx=(xr.data||[]) as Vaccine[];
      }

      setClient(c.data as Client);
      setPets((p.data||[]) as Pet[]);
      setVisits(v);
      setVaccines(vx);
      setSelected(current => {
        if (current && (p.data || []).some(x => x.id === current)) return current;
        return (p.data?.[0]?.id as string)||"";
      });
    }catch(e){
      console.error("PET OWNER DASHBOARD ERROR:",e);
      setError(e instanceof Error?e.message:"Failed to load");
    }finally{
      if (showLoader) setLoading(false);
    }
  };

  useEffect(()=>{
    if(!clientId) return;
    void loadDashboard(true);

    const refresh = () => {
      if (document.visibilityState === "visible") void loadDashboard(false);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === "vetra-data-version") refresh();
    };

    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", refresh);

    // Keep the owner dashboard in sync with new visits made in another tab
    // or from the doctor interface. This runs only while the page is visible
    // and never shows the global loading state.
    const syncTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadDashboard(false);
    }, 10000);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(syncTimer);
    };
  },[clientId,router]);

  const t=T[lang], pet=pets.find(x=>x.id===selected)||pets[0]||null;
  const pv=useMemo(()=>pet?visits.filter(x=>x.pet_id===pet.id).sort((a,b)=>+new Date(b.visit_date)-+new Date(a.visit_date)):[],[pet,visits]);
  const px=useMemo(()=>pet?vaccines.filter(x=>x.pet_id===pet.id).sort((a,b)=>(a.next_dose_at?+new Date(a.next_dose_at):9e15)-(b.next_dose_at?+new Date(b.next_dose_at):9e15)):[],[pet,vaccines]);
  // Vaccine countdown is independent from clinic-visit frequency. It uses only next_dose_at.
  const last=pv[0]||null;
  // Monthly clinic score uses only the most recent visit. Multiple visits never stack points or alter vaccine countdowns.
  const metrics=[{n:t.weight,u:"kg",i:"⚖️",v:pv.filter(x=>x.weight!==null).slice(0,6).reverse().map(x=>Number(x.weight))},{n:t.temp,u:"°م",i:"🌡️",v:pv.filter(x=>x.temperature!==null).slice(0,6).reverse().map(x=>Number(x.temperature))},{n:t.heart,u:"bpm",i:"❤️",v:pv.filter(x=>x.heart_rate!==null).slice(0,6).reverse().map(x=>Number(x.heart_rate))},{n:t.resp,u:"/min",i:"🫁",v:pv.filter(x=>x.respiratory_rate!==null).slice(0,6).reverse().map(x=>Number(x.respiratory_rate))}];

  // VETRA Care Score: for cats, this follows the VETRA cat-care protocol exactly.
  // It is a care-adherence indicator, not a medical health score.
  const catProtocol = isCatSpecies(pet?.species) ? getProtocolStatus(px, pet) : null;
  const visitAgeDays = last ? Math.max(0, Math.floor((Date.now() - +new Date(last.visit_date)) / DAY_MS)) : Infinity;
  const visitPoints = visitAgeDays <= 30 ? 2 : 0;
  const monthlyStatus = visitAgeDays <= 30 ? "current" as const : "overdue" as const;
  const catCareScore = catProtocol
    ? catProtocol.viral.points + catProtocol.rabies.points + catProtocol.deworm.points + catProtocol.parasite.points + visitPoints
    : null;
  const careScore = catCareScore ?? 0;
  const scoreRemaining = catCareScore === null ? 0 : 10 - careScore;
  const scoreTitle = catCareScore === null
    ? (lang === "ar" ? "بروتوكول هذا النوع هيتم تفعيله قريبًا" : "This species protocol is coming soon")
    : careScore === 10
      ? t.scorePerfect
      : careScore >= 8
        ? t.scoreAlmost
        : careScore >= 5
          ? t.scoreGood
          : t.scoreStart;
  const scoreItems = catProtocol ? [
    {label:t.scoreMonthly,points:visitPoints,max:2,done:visitPoints===2,status:monthlyStatus},
    {label:t.scoreViral,points:catProtocol.viral.points,max:3,done:catProtocol.viral.points===3,status:catProtocol.viral.status},
    {label:t.scoreRabies,points:catProtocol.rabies.points,max:2,done:catProtocol.rabies.points===2,status:catProtocol.rabies.status},
    {label:t.scoreDeworm,points:catProtocol.deworm.points,max:2,done:catProtocol.deworm.points===2,status:catProtocol.deworm.status},
    {label:t.scoreParasite,points:catProtocol.parasite.points,max:1,done:catProtocol.parasite.points===1,status:catProtocol.parasite.status},
  ] : [];

  type VaccinationCandidate = {
    name: string;
    due: string;
    sort: number;
    status: ProtocolState;
  };

  const vaccinationCandidates: VaccinationCandidate[] = catProtocol
    ? [
        { name: catProtocol.viral.reset ? (lang === "ar" ? "إعادة الفيروسي" : "Restart viral vaccine") : t.scoreViral, due: catProtocol.viral.due || todayDateOnly(), sort: 0, status: catProtocol.viral.status },
        { name: catProtocol.rabies.status === "overdue" ? (lang === "ar" ? "السعار — متأخر" : "Rabies — overdue") : t.scoreRabies, due: catProtocol.rabies.due || todayDateOnly(), sort: 0, status: catProtocol.rabies.status },
        { name: catProtocol.deworm.reset ? (lang === "ar" ? "إعادة الديدان" : "Restart deworming") : t.scoreDeworm, due: catProtocol.deworm.due || todayDateOnly(), sort: 0, status: catProtocol.deworm.status },
        ...(catProtocol.parasite.due
          ? [{ name: t.scoreParasite, due: catProtocol.parasite.due, sort: 0, status: catProtocol.parasite.status }]
          : []),
      ].sort((a,b) => {
        const rank = (status: ProtocolState) => status === "overdue" ? 0 : status === "due" ? 1 : status === "grace" ? 2 : status === "current" ? 3 : 4;
        const r = rank(a.status) - rank(b.status);
        return r !== 0 ? r : daysUntil(a.due) - daysUntil(b.due);
      })
    : [];

  const next = vaccinationCandidates[0] || null;
  const due = next ? daysUntil(next.due) : null;
  const timeline=[...pv.map(x=>({id:`v${x.id}`,date:x.visit_date,type:"visit",title:x.reason|| (lang==="ar"?"زيارة":"Visit"),sub:x.diagnosis||x.examination||x.notes||""})),...px.filter(x=>x.administered_at).map(x=>({id:`x${x.id}`,date:x.administered_at!,type:"vaccine",title:x.vaccine_name||x.vaccine_type||(lang==="ar"?"تطعيم":"Vaccination"),sub:x.next_dose_at?`${t.next}: ${dateText(x.next_dose_at,lang)}`:t.completed}))].sort((a,b)=>+new Date(b.date)-+new Date(a.date)).slice(0,8);

  const toggleTheme=()=>{const n=!dark;setDark(n);localStorage.setItem("vetra-theme",n?"dark":"light")}; const toggleLang=()=>{const n=lang==="ar"?"en":"ar";setLang(n);localStorage.setItem("vetra-language",n)}; const logout=()=>{localStorage.removeItem("vetra-client-id");localStorage.removeItem("vetra-client-code");localStorage.removeItem("vetra-client-phone");sessionStorage.removeItem("vetra-client-id");sessionStorage.removeItem("vetra-client-code");sessionStorage.removeItem("vetra-client-phone");router.replace("/client-interface/login")};

  async function createPet(){
    setError("");
    if(!petForm.name.trim()){setError(t.required);return;}
    setSavingPet(true);
    try{
      const ownerSession=getOwnerSession();
      const code=ownerSession.code;
      const phone=ownerSession.phone;
      if(!code||!phone) throw new Error("Session expired.");
      const db=await getClientPortalDb(code,phone);
      const result=await db.rpc("vetra_add_pet_for_owner",{
        p_name:petForm.name.trim(),
        p_species:petForm.species,
        p_gender:petForm.gender||null,
        p_birth_date:petForm.birth_date||null,
        p_breed:petForm.breed.trim()||null,
        p_color:petForm.color.trim()||null,
      });
      if(result.error) throw new Error(result.error.message);
      const createdPet=Array.isArray(result.data)?result.data[0]:result.data;
      if(!createdPet?.id) throw new Error("Pet was not created.");
      setPets(prev=>[createdPet as Pet,...prev]);
      setSelected(createdPet.id);
      setPetForm({name:"",species:"cat",gender:"Female",birth_date:"",breed:"",color:""});
      setAddPet(false);
      window.scrollTo({top:0,behavior:"smooth"});
    }catch(e){
      setError(e instanceof Error?e.message:"Failed to add pet.");
    }finally{
      setSavingPet(false);
    }
  }

  if(loading)return <main dir={lang==="ar"?"rtl":"ltr"} className="flex min-h-screen items-center justify-center bg-[#06101a] text-white"><div className="text-center"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-400/10 text-3xl">🐾</div><p className="text-sm font-bold text-slate-400">{t.loading}</p></div></main>;
  if(error&&!client)return <main dir={lang==="ar"?"rtl":"ltr"} className="flex min-h-screen items-center justify-center bg-[#06101a] px-6 text-white"><div className="max-w-md rounded-[2rem] border border-white/10 bg-white/[.04] p-8 text-center"><div className="text-5xl">🐾</div><h1 className="mt-4 text-2xl font-black">{t.error}</h1><p className="mt-3 text-sm text-slate-400">{error}</p><button onClick={()=>router.replace("/client-interface/login")} className="mt-6 rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-black text-slate-950">{t.login}</button></div></main>;

  return <main id="home" dir={lang==="ar"?"rtl":"ltr"} className={dark?"min-h-screen overflow-x-hidden bg-[#06101a] text-white":"min-h-screen overflow-x-hidden bg-[#f5f9fc] text-slate-900"}>
    <div className="pointer-events-none fixed inset-0 overflow-hidden"><div className={dark?"absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl":"absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-300/25 blur-3xl"}/><div className={dark?"absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl":"absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-violet-300/20 blur-3xl"}/></div>
    <div className="relative z-10 mx-auto max-w-7xl px-4 pb-28 pt-4 sm:px-6 lg:px-8">
      <header className="sticky top-0 z-40 mb-6 flex items-center justify-between py-3 backdrop-blur-xl"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 text-xl shadow-lg">🐾</div><div><div className="font-black tracking-[.18em]">VETRA</div><div className="text-[10px] font-bold tracking-[.18em] text-slate-500">PET CARE</div></div></div><div className="flex items-center gap-2"><button onClick={toggleLang} className={dark?"rounded-full border border-white/10 bg-white/[.05] px-3 py-2 text-xs font-bold":"rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold"}>{t.language}</button><button onClick={toggleTheme} className={dark?"flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[.05]":"flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"}>{dark?"☀️":"🌙"}</button><button onClick={()=>setSettings(true)} className={dark?"flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[.05]":"flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"}>⚙️</button></div></header>

      <section className="grid gap-5 lg:grid-cols-[1fr_360px]"><div className={dark?"rounded-[2rem] border border-white/[.07] bg-gradient-to-br from-white/[.08] to-white/[.03] p-5 shadow-2xl sm:p-7":"rounded-[2rem] border border-slate-100 bg-white p-5 shadow-2xl sm:p-7"}><p className="text-sm font-bold text-cyan-400">{t.welcome}</p><h1 className="mt-1 text-3xl font-black sm:text-4xl">{client?.name||"VETRA"} 👋</h1><p className="mt-3 text-sm leading-7 text-slate-400">{t.allCare}</p>
        {pet&&<div className="mt-6 grid gap-4 md:grid-cols-[1.1fr_.9fr]"><div className="rounded-[1.7rem] bg-gradient-to-br from-[#0e2330] to-[#10142a] p-4 sm:p-5"><div className="flex items-center gap-4"><div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[1.5rem] bg-white/10 text-6xl">{icon(pet.species)}</div><div className="min-w-0"><div className="text-xs font-bold text-cyan-300">{t.selected}</div><div className="mt-1 truncate text-2xl font-black">{pet.name}</div><div className="mt-1 text-xs text-slate-400">{species(pet.species,lang)} • {pet.gender==="Male"?t.male:pet.gender==="Female"?t.female:pet.gender||t.unknown} • {age(pet.birth_date,lang)}</div></div></div><div className={dark?"mt-5 rounded-[1.6rem] border border-cyan-400/10 bg-gradient-to-br from-cyan-400/[.08] via-white/[.025] to-violet-500/[.06] p-4":"mt-5 rounded-[1.6rem] border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-violet-50 p-4"}>
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 shrink-0">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke={dark?"rgba(255,255,255,.08)":"rgba(15,23,42,.08)"} strokeWidth="7" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="url(#score-ring)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${2*Math.PI*42*(careScore/10)} ${2*Math.PI*42}`} />
                <defs><linearGradient id="score-ring"><stop offset="0" stopColor="#22d3ee"/><stop offset="100%" stopColor="#8b5cf6"/></linearGradient></defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center"><div className="text-xl font-black leading-none">{catCareScore === null ? "—" : careScore}<span className="text-xs text-slate-500">{catCareScore === null ? "" : "/10"}</span></div></div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2"><div className="text-xs font-bold text-cyan-300">{t.score}</div><span className="rounded-full bg-white/[.06] px-2 py-1 text-[9px] font-black text-slate-400">{scoreRemaining>0?`${scoreRemaining} ${t.scoreMissing}`:t.scorePerfect}</span></div>
              <div className="mt-1 text-lg font-black">{scoreTitle}</div>
              <p className="mt-1 text-[10px] leading-5 text-slate-500">{t.scoreNote}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {scoreItems.map((item)=><div key={item.label} className={dark?"rounded-xl border border-white/[.05] bg-white/[.025] px-3 py-2":"rounded-xl border border-slate-100 bg-white/80 px-3 py-2"}>
              <div className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-bold text-slate-400">{item.label}</span><span className={item.done?"text-emerald-400":"text-cyan-300"}>{item.done ? "✓" : "•"}</span></div>
              <div className="mt-1 text-[9px] font-semibold text-slate-500">{item.done ? "✓" : item.status === "grace" ? (lang==="ar" ? "فترة السماح 7 أيام" : "7-day grace period") : item.status === "overdue" ? (lang==="ar" ? "متأخر — يحتاج إعادة" : "Overdue — reset needed") : item.status === "not_due" ? (lang==="ar" ? "لسه مش مستحق" : "Not due yet") : (lang==="ar" ? "منتظم" : "On track")}</div>
            </div>)}
          </div>
          {catCareScore !== null && scoreRemaining>0&&<div className="mt-3 text-center text-[10px] font-bold text-slate-500">{lang==="ar"?`إيه اللي ناقص؟ تعالى كمّل ${scoreRemaining} ${t.scoreMissing} 👀`: `${scoreRemaining} ${t.scoreMissing} to go — can you reach 10/10? 👀`}</div>}
        </div></div>
        <div className="rounded-[1.7rem] border border-white/[.06] bg-white/[.035] p-5"><div className="flex items-center justify-between gap-4"><div><div className="text-xs font-bold text-cyan-300">{t.next}</div><div className="mt-2 text-lg font-black">{next?.name||t.none}</div>{next?.due&&<div className="mt-1 text-xs text-slate-500">{dateText(next.due,lang)}</div>}</div><Countdown days={due} lang={lang} status={next?.status || null}/></div><button onClick={()=>next?.due&&alert(lang==="ar"?"التذكير هيتوصل بنظام الإشعارات في الخطوة التالية.":"Reminder notifications will be connected in the next step.")} className="mt-5 w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-3 text-xs font-black text-slate-950">🔔 {t.reminder}</button></div></div>}
      </div>
      <div id="pets-section" className={dark?"rounded-[2rem] border border-white/[.07] bg-white/[.035] p-5":"rounded-[2rem] border border-slate-100 bg-white p-5"}><div className="flex items-center justify-between"><div><h2 className="text-lg font-black">{t.pets}</h2><p className="mt-1 text-xs text-slate-500">{pets.length} {t.count}</p></div><button onClick={()=>setAddPet(true)} className="rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-xs font-black text-slate-950">+ {t.add}</button></div><div className="mt-4 max-h-[330px] space-y-2 overflow-y-auto pe-1">{pets.map(p=><button key={p.id} onClick={()=>router.push(`/client-interface/${clientId}/pets/${p.id}`)} className={p.id===pet?.id?"flex w-full items-center gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/[.08] p-3 text-start":"flex w-full items-center gap-3 rounded-2xl border border-white/[.05] bg-white/[.025] p-3 text-start transition hover:bg-white/[.05]"}><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-3xl">{icon(p.species)}</div><div className="min-w-0 flex-1"><div className="truncate font-black">{p.name}</div><div className="mt-1 text-[11px] text-slate-500">{species(p.species,lang)} • {age(p.birth_date,lang)}</div></div><span className="text-slate-500">‹</span></button>)}<button onClick={()=>setAddPet(true)} className="w-full rounded-2xl border border-dashed border-cyan-400/20 bg-cyan-400/[.03] p-4 text-xs font-black text-cyan-300">+ {t.add}</button></div></div></section>

      {pet&&<><section className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><div className={dark?"rounded-[2rem] border border-white/[.07] bg-white/[.035] p-5 sm:p-6":"rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-6"}><div className="flex items-end justify-between"><div><p className="text-xs font-bold text-cyan-300">{t.trends}</p><h2 className="mt-1 text-2xl font-black">{pet.name}</h2></div><span className="rounded-full border border-white/[.06] bg-white/[.03] px-3 py-1.5 text-[10px] font-bold text-slate-400">{t.sixMonths}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{metrics.map(m=><div key={m.n} className={dark?"rounded-[1.5rem] border border-white/[.05] bg-white/[.025] p-4":"rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4"}><div className="flex items-center gap-2"><span>{m.i}</span><span className="text-xs font-black">{m.n}</span></div><Chart values={m.v} unit={m.u} empty={t.noData}/></div>)}</div></div>
        <div className={dark?"rounded-[2rem] border border-white/[.07] bg-white/[.035] p-5 sm:p-6":"rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-6"}><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-cyan-300">{t.next}</p><h2 className="mt-1 text-2xl font-black">{t.vaccineHistory}</h2></div><span className="rounded-full bg-cyan-400/10 px-3 py-1.5 text-[10px] font-black text-cyan-300">{px.length}</span></div><div className="mt-5 space-y-2">{px.slice(0,5).map(x=>{const d=x.next_dose_at?daysUntil(x.next_dose_at):null;return <div key={x.id} className={dark?"rounded-2xl border border-white/[.05] bg-white/[.025] p-3.5":"rounded-2xl border border-slate-100 bg-slate-50 p-3.5"}><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10">💉</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-black">{x.vaccine_name||x.vaccine_type||"Vaccination"}</div><div className="mt-1 text-[10px] text-slate-500">{x.administered_at?dateText(x.administered_at,lang):"—"}</div></div><span className={d!==null&&d<0?"rounded-full bg-rose-400/10 px-2 py-1 text-[9px] font-black text-rose-300":"rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-black text-emerald-300"}>{d!==null&&d<0?t.overdue:d!==null&&d<=30?t.soon:t.completed}</span></div></div>})}{px.length===0&&<div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">{t.noVaccines}</div>}</div></div></section>

        <section className={dark?"mt-5 rounded-[2rem] border border-white/[.07] bg-white/[.035] p-5 sm:p-6":"mt-5 rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-6"}><div className="flex items-end justify-between"><div><p className="text-xs font-bold text-cyan-300">{t.history}</p><h2 className="mt-1 text-2xl font-black">{pet.name}</h2></div>{last&&<div className="hidden text-start sm:block"><div className="text-[10px] font-bold text-slate-500">{lang==="ar"?"آخر زيارة":"Last visit"}</div><div className="mt-1 text-xs font-black">{dateText(last.visit_date,lang)}</div></div>}</div><div className="mt-6">{timeline.length===0?<div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500"><div className="mb-2 text-3xl">🩺</div>{pv.length===0?t.noVisits:t.timelineNote}</div>:<div className="relative space-y-5"><div className={lang==="ar"?"absolute bottom-4 right-5 top-4 w-px bg-gradient-to-b from-cyan-400 via-violet-500 to-transparent":"absolute bottom-4 left-5 top-4 w-px bg-gradient-to-b from-cyan-400 via-violet-500 to-transparent"}/>{timeline.map(e=><div key={e.id} className="relative flex gap-4"><div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#0b1622]">{e.type==="vaccine"?"💉":"🩺"}</div><div className={dark?"flex-1 rounded-2xl border border-white/[.05] bg-white/[.025] p-4":"flex-1 rounded-2xl border border-slate-100 bg-slate-50 p-4"}><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-black">{e.title}</div><div className="text-[10px] font-bold text-slate-500">{dateText(e.date,lang)}</div></div>{e.sub&&<div className="mt-2 text-xs leading-6 text-slate-500">{e.sub}</div>}</div></div>)}</div>}</div></section></>}

      <section className={dark?"mt-5 rounded-[2rem] border border-white/[.07] bg-white/[.035] p-5":"mt-5 rounded-[2rem] border border-slate-100 bg-white p-5"}><div className="flex items-center justify-between"><div><div className="text-xs font-bold text-cyan-300">{t.settings}</div><div className="mt-1 text-lg font-black">{client?.name}</div></div><span className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black text-emerald-300">🔐 {t.secure}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className={dark?"rounded-2xl border border-white/[.05] bg-white/[.025] p-4":"rounded-2xl border border-slate-100 bg-slate-50 p-4"}><div className="text-[10px] font-bold text-slate-500">{t.phone}</div><div dir="ltr" className="mt-1 text-sm font-black">{client?.phone||"—"}</div></div><div className={dark?"rounded-2xl border border-white/[.05] bg-white/[.025] p-4":"rounded-2xl border border-slate-100 bg-slate-50 p-4"}><div className="text-[10px] font-bold text-slate-500">{t.email}</div><div className="mt-1 truncate text-sm font-black">{client?.email||"—"}</div></div></div></section>
    </div>

    <nav className="fixed bottom-0 left-0 right-0 z-50 p-3"><div className={dark?"mx-auto flex max-w-md items-center justify-around rounded-3xl border border-white/10 bg-[#0a1520]/95 px-3 py-2 shadow-2xl backdrop-blur-xl":"mx-auto flex max-w-md items-center justify-around rounded-3xl border border-slate-200 bg-white/95 px-3 py-2 shadow-2xl backdrop-blur-xl"}><button onClick={()=>window.scrollTo({top:0,behavior:"smooth"})} className="flex min-w-20 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[10px] font-black text-cyan-300"><span className="text-lg">⌂</span>{t.home}</button><button onClick={()=>document.getElementById("pets-section")?.scrollIntoView({behavior:"smooth"})} className="flex min-w-20 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[10px] font-black text-slate-500"><span className="text-lg">🐾</span>{t.pets}</button><button onClick={()=>setSettings(true)} className="flex min-w-20 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[10px] font-black text-slate-500"><span className="text-lg">☰</span>{t.more}</button></div></nav>

    {settings&&<div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center"><div className={dark?"w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0b1622] p-5 text-white shadow-2xl":"w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl"}><div className="flex items-center justify-between"><h2 className="text-xl font-black">{t.settings}</h2><button onClick={()=>setSettings(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">✕</button></div><div className="mt-5 space-y-2"><button onClick={toggleTheme} className="flex w-full items-center justify-between rounded-2xl border border-white/5 bg-white/[.03] p-4"><span className="font-black">{dark?t.dark:t.light}</span><span>{dark?"☀️":"🌙"}</span></button><button onClick={toggleLang} className="flex w-full items-center justify-between rounded-2xl border border-white/5 bg-white/[.03] p-4"><span className="font-black">Language / اللغة</span><span className="text-cyan-300">{lang==="ar"?"عربي":"English"}</span></button><button onClick={logout} className="flex w-full items-center justify-between rounded-2xl border border-rose-400/10 bg-rose-400/[.05] p-4 text-rose-300"><span className="font-black">{t.logout}</span><span>↪</span></button></div></div></div>}
    {addPet&&<div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center"><div dir={lang==="ar"?"rtl":"ltr"} className={dark?"w-full max-w-md max-h-[92vh] overflow-y-auto rounded-[2rem] border border-white/10 bg-[#0b1622] p-6 text-white shadow-2xl":"w-full max-w-md max-h-[92vh] overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl"}><div className="flex items-center justify-between"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-2xl">🐾</div><button onClick={()=>setAddPet(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">✕</button></div><h2 className="mt-4 text-2xl font-black">{t.addTitle}</h2><p className="mt-2 text-sm leading-7 text-slate-500">{t.addNote}</p><div className="mt-5 space-y-3">
        <div><label className="mb-1.5 block text-xs font-bold text-slate-500">{t.name} *</label><input value={petForm.name} onChange={e=>setPetForm(v=>({...v,name:e.target.value}))} placeholder={t.name} className={dark?"w-full rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 outline-none focus:border-cyan-400":"w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400"}/></div>
        <div><label className="mb-1.5 block text-xs font-bold text-slate-500">{t.species}</label><div className="grid grid-cols-3 gap-2">{[["cat",t.cat,"🐱"],["dog",t.dog,"🐶"],["other",t.other,"🐾"]].map(([v,label,em])=><button type="button" key={v} onClick={()=>setPetForm(x=>({...x,species:v}))} className={petForm.species===v?"rounded-2xl border border-cyan-400 bg-cyan-400/10 px-3 py-3 text-sm font-black":"rounded-2xl border border-white/10 bg-white/[.03] px-3 py-3 text-sm font-bold"}>{em}<span className="ms-1">{label}</span></button>)}</div></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="mb-1.5 block text-xs font-bold text-slate-500">{t.gender}</label><select value={petForm.gender} onChange={e=>setPetForm(v=>({...v,gender:e.target.value}))} className={dark?"w-full rounded-2xl border border-white/10 bg-[#101c28] px-4 py-3 outline-none":"w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"}><option value="Female">{t.female}</option><option value="Male">{t.male}</option></select></div><div><label className="mb-1.5 block text-xs font-bold text-slate-500">{t.birth}</label><input type="date" value={petForm.birth_date} onChange={e=>setPetForm(v=>({...v,birth_date:e.target.value}))} className={dark?"w-full rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 outline-none":"w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"}/></div></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="mb-1.5 block text-xs font-bold text-slate-500">{t.breed}</label><input value={petForm.breed} onChange={e=>setPetForm(v=>({...v,breed:e.target.value}))} className={dark?"w-full rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 outline-none":"w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"}/></div><div><label className="mb-1.5 block text-xs font-bold text-slate-500">{t.color}</label><input value={petForm.color} onChange={e=>setPetForm(v=>({...v,color:e.target.value}))} className={dark?"w-full rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 outline-none":"w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"}/></div></div>
      </div><div className="mt-5 grid grid-cols-2 gap-2"><button disabled={savingPet} onClick={()=>setAddPet(false)} className={dark?"rounded-2xl border border-white/10 px-4 py-3 font-bold text-slate-400":"rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-500"}>{t.cancel}</button><button disabled={savingPet} onClick={createPet} className="rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-3 font-black text-slate-950 disabled:opacity-60">{savingPet?t.saving:t.save}</button></div></div></div>}
  </main>;
}
