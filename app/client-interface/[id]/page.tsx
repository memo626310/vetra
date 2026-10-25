"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getClientPortalDb } from "@/lib/client-portal-db";
import { vetraCore } from "@/lib/vetra-core";
import DailyMedicationTodo from "@/components/client-interface/DailyMedicationTodo";
import ClientCareHub from "@/components/client-interface/ClientCareHub";
import PushNotificationsButton from "@/components/PushNotificationsButton";

type Lang = "ar" | "en";
type Client = { id: string; name: string; phone: string | null; email: string | null };
type FinancialSummary = { due_amount: number; credit_amount: number };
type Pet = { id: string; name: string; species: string; breed: string | null; gender: string | null; birth_date: string | null; color: string | null; photo_url?: string | null; is_deceased: boolean | null };
type Visit = { id: string; pet_id: string; visit_date: string; reason: string | null; examination: string | null; diagnosis: string | null; treatment: string | null; weight: number | null; temperature: number | null; heart_rate: number | null; respiratory_rate: number | null; notes: string | null };
type Vaccine = { id: string; pet_id: string; vaccine_name: string | null; vaccine_type: string | null; administered_at: string | null; next_dose_at: string | null; notes: string | null };
type PaletteId = "lagoon" | "sage" | "violet" | "ember" | "apple";
type PaletteColors = { bg:string; surface:string; card:string; mutedSurface:string; panel:string; panelEnd:string; text:string; muted:string; accent:string; accentStrong:string; accentSoft:string; accentEnd:string; border:string; borderAccent:string; ink:string; warm:string };

const PAGE_PALETTES: Record<PaletteId, { en:string; ar:string; swatches:string[]; light:PaletteColors; dark:PaletteColors }> = {
  lagoon: {
    en:"Lagoon", ar:"لاجون", swatches:["#46F0D2","#131321","#FBE2B4","#FFFFFF"],
    light:{bg:"#F3F7F8",surface:"#FFFFFF",card:"#EAF4F3",mutedSurface:"#F5F8F8",panel:"#15383A",panelEnd:"#244448",text:"#131321",muted:"#48545D",accent:"#108579",accentStrong:"#087266",accentSoft:"#D8F7F0",accentEnd:"#FBE2B4",border:"#CBD9DC",borderAccent:"#71CDBB",ink:"#131321",warm:"#FBE2B4"},
    dark:{bg:"#131321",surface:"#20202F",card:"#29293A",mutedSurface:"#252536",panel:"#102C30",panelEnd:"#1C4243",text:"#FFFFFF",muted:"#CDD3D6",accent:"#46F0D2",accentStrong:"#46F0D2",accentSoft:"#244541",accentEnd:"#FBE2B4",border:"#414252",borderAccent:"#398F83",ink:"#131321",warm:"#FBE2B4"}
  },
  sage: {
    en:"Sage", ar:"أخضر هادئ", swatches:["#EAF9E7","#C0E6BA","#4CA771","#013237"],
    light:{bg:"#EAF9E7",surface:"#F9FFF7",card:"#F3FBF1",mutedSurface:"#EFF8EC",panel:"#013237",panelEnd:"#0B5147",text:"#013237",muted:"#31574F",accent:"#37885B",accentStrong:"#236B4C",accentSoft:"#D6EED2",accentEnd:"#C0E6BA",border:"#C0E6BA",borderAccent:"#82BF8D",ink:"#013237",warm:"#C0E6BA"},
    dark:{bg:"#013237",surface:"#06443D",card:"#0B5449",mutedSurface:"#084A42",panel:"#01272B",panelEnd:"#0D5147",text:"#EAF9E7",muted:"#C5E4C7",accent:"#65BD82",accentStrong:"#C0E6BA",accentSoft:"#1D5B4D",accentEnd:"#C0E6BA",border:"#23675D",borderAccent:"#3D8F68",ink:"#013237",warm:"#C0E6BA"}
  },
  violet: {
    en:"Violet Dusk", ar:"غسق بنفسجي", swatches:["#502D55","#935073","#F6DBC0","#F8F4E9"],
    light:{bg:"#F8F4E9",surface:"#FFFCF5",card:"#F9F1F4",mutedSurface:"#F6EFF2",panel:"#502D55",panelEnd:"#71445F",text:"#2B1931",muted:"#625365",accent:"#935073",accentStrong:"#6B3152",accentSoft:"#F6DBC0",accentEnd:"#E9C2D1",border:"#E0D4E1",borderAccent:"#C99AAF",ink:"#2B1931",warm:"#F6DBC0"},
    dark:{bg:"#1B1221",surface:"#2B1B33",card:"#382342",mutedSurface:"#32203A",panel:"#211529",panelEnd:"#502D55",text:"#F8F4E9",muted:"#E4D7E3",accent:"#D18CAA",accentStrong:"#F6DBC0",accentSoft:"#502D55",accentEnd:"#F6DBC0",border:"#5A4161",borderAccent:"#935073",ink:"#2B1931",warm:"#F6DBC0"}
  },
  ember: {
    en:"Ember", ar:"وهج دافئ", swatches:["#161E2F","#384358","#FFA586","#B51A28"],
    light:{bg:"#FFF3ED",surface:"#FFFCF9",card:"#FFF0E9",mutedSurface:"#FFF7F3",panel:"#242F49",panelEnd:"#384358",text:"#161E2F",muted:"#4B5669",accent:"#B51A28",accentStrong:"#861C2A",accentSoft:"#FFE2D7",accentEnd:"#FFA586",border:"#E8D4D0",borderAccent:"#E59A85",ink:"#161E2F",warm:"#FFA586"},
    dark:{bg:"#161E2F",surface:"#242F49",card:"#303B55",mutedSurface:"#2B364F",panel:"#161E2F",panelEnd:"#384358",text:"#F8F4F0",muted:"#CDD4E1",accent:"#FFA586",accentStrong:"#FFC2AB",accentSoft:"#541A2E",accentEnd:"#F6C7AE",border:"#46516A",borderAccent:"#B96757",ink:"#161E2F",warm:"#FFA586"}
  },
  apple: {
    en:"Apple Modern", ar:"أبل مودرن", swatches:["#F5F5F7","#1D1D1F","#AAAAAA","#007AFF"],
    light:{bg:"#F5F5F7",surface:"#FFFFFF",card:"#F5F5F7",mutedSurface:"#ECECEF",panel:"#1D1D1F",panelEnd:"#38383A",text:"#1D1D1F",muted:"#6E6E73",accent:"#007AFF",accentStrong:"#0066D6",accentSoft:"#E7F1FF",accentEnd:"#4D9BFF",border:"#D2D2D7",borderAccent:"#9CCBFF",ink:"#FFFFFF",warm:"#AAAAAA"},
    dark:{bg:"#1D1D1F",surface:"#29292C",card:"#333336",mutedSurface:"#252528",panel:"#151517",panelEnd:"#29292C",text:"#F5F5F7",muted:"#AAAAAA",accent:"#007AFF",accentStrong:"#4D9BFF",accentSoft:"#17375C",accentEnd:"#70B1FF",border:"#48484A",borderAccent:"#397FC5",ink:"#FFFFFF",warm:"#AAAAAA"}
  }
};

const T = {
  ar: { home:"الرئيسية", pets:"حيواناتي", more:"المزيد", welcome:"مساء الخير", allCare:"كل رعاية حيواناتك في مكان واحد", selected:"الحيوان المختار", count:"حيوانات", add:"إضافة حيوان", score:"نقاط VETRA", scorePerfect:"10/10 ممتاز!", scoreAlmost:"قربت توصل 10/10!", scoreGood:"أنت على الطريق الصح", scoreStart:"خلّينا نكملها سوا", scoreNote:"ده مقياس تفاعلي لاكتمال متابعة الحيوان داخل VETRA، مش تقييمًا طبيًا.", scoreMissing:"متبقي", scoreProfile:"بيانات الحيوان", scoreVaccines:"متابعة التطعيمات", scoreFollowUp:"المتابعة الدورية", scoreMonthly:"زيارة العيادة الشهرية", scoreViral:"الفيروسي", scoreRabies:"السعار", scoreDeworm:"الديدان", scoreParasite:"الحشرات", next:"الاستحقاق القادم", none:"مفيش تطعيمات قادمة", overdue:"متأخر", day:"يوم", daysLeft:"متبقي", reminder:"فعّل تذكير", trends:"المؤشرات الحيوية", sixMonths:"آخر 6 شهور", noData:"بيانات غير كافية", weight:"الوزن", temp:"الحرارة", heart:"نبض القلب", resp:"معدل التنفس", history:"التاريخ الطبي", vaccineHistory:"سجل التطعيمات", completed:"مكتمل", soon:"قريبًا", noVaccines:"مفيش تطعيمات مسجلة", noVisits:"مفيش زيارات مسجلة", timelineNote:"التاريخ الطبي هيظهر هنا مع أول زيارة أو تطعيم.", settings:"الإعدادات", light:"الوضع الفاتح", dark:"الوضع الداكن", language:"English", logout:"تسجيل الخروج", secure:"حساب آمن", phone:"الهاتف", email:"البريد الإلكتروني", dueAmount:"المستحق للعيادة", creditAmount:"رصيدك لدى العيادة", noDue:"لا يوجد مستحق أو رصيد حاليًا", addTitle:"إضافة حيوان جديد", addNote:"تقدر تضيف أكتر من حيوان لنفس الحساب. اكتب البيانات الأساسية، وVETRA هتربط الحيوان بحسابك بشكل آمن.", name:"اسم الحيوان", species:"النوع", cat:"قطة", dog:"كلب", other:"أخرى", gender:"النوع", female:"أنثى", male:"ذكر", birth:"تاريخ الميلاد", breed:"السلالة", color:"اللون", save:"حفظ الحيوان", saving:"جاري الحفظ...", cancel:"إلغاء", required:"اكتب اسم الحيوان", created:"تمت إضافة الحيوان بنجاح", close:"إغلاق", error:"تعذر تحميل بياناتك", login:"العودة لتسجيل الدخول", loading:"جاري تحميل VETRA...", age:"العمر", unknown:"غير محدد" },
  en: { home:"Home", pets:"My Pets", more:"More", welcome:"Good evening", allCare:"All your pets' care in one place", selected:"Selected pet", count:"pets", add:"Add Pet", score:"VETRA Score", scorePerfect:"10/10 Excellent!", scoreAlmost:"You are almost at 10/10!", scoreGood:"You are on the right track", scoreStart:"Let's complete it together", scoreNote:"This is an interactive care-completeness indicator inside VETRA, not a medical score.", scoreMissing:"remaining", scoreProfile:"Pet profile", scoreVaccines:"Vaccination tracking", scoreFollowUp:"Regular follow-up", scoreMonthly:"Monthly clinic visit", scoreViral:"Core viral vaccine", scoreRabies:"Rabies", scoreDeworm:"Deworming", scoreParasite:"Parasite control", next:"Next due", none:"No upcoming vaccines", overdue:"Overdue", day:"day", daysLeft:"left", reminder:"Set reminder", trends:"Health trends", sixMonths:"Last 6 months", noData:"Not enough data", weight:"Weight", temp:"Temperature", heart:"Heart rate", resp:"Respiratory rate", history:"Medical history", vaccineHistory:"Vaccination history", completed:"Completed", soon:"Due soon", noVaccines:"No vaccinations recorded", noVisits:"No visits recorded", timelineNote:"Medical history will appear here after the first visit or vaccination.", settings:"Settings", light:"Light mode", dark:"Dark mode", language:"العربية", logout:"Sign out", secure:"Secure account", phone:"Phone", email:"Email", dueAmount:"Due to clinic", creditAmount:"Credit with clinic", noDue:"No current due amount or credit", addTitle:"Add a new pet", addNote:"You can keep multiple pets on the same account. Add the basics here and VETRA will link the pet to your account securely.", name:"Pet name", species:"Species", cat:"Cat", dog:"Dog", other:"Other", gender:"Gender", female:"Female", male:"Male", birth:"Date of birth", breed:"Breed", color:"Color", save:"Save pet", saving:"Saving...", cancel:"Cancel", required:"Enter the pet name", created:"Pet added successfully", close:"Close", error:"We couldn't load your data", login:"Back to login", loading:"Loading VETRA...", age:"Age", unknown:"Not specified" }
} as const;

function PetAvatar({ pet, className = "", dark = true }: { pet: Pet; className?: string; dark?: boolean }) {
  return (
    <div className={`relative flex shrink-0 items-center justify-center overflow-hidden ${dark ? "bg-white/10 text-cyan-200" : "bg-cyan-50 text-cyan-700"} ${className}`}>
      {pet.photo_url ? (
        <Image src={pet.photo_url} alt={pet.name} fill unoptimized sizes="96px" className="object-cover" />
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="15.8" rx="5.1" ry="3.7" />
          <ellipse cx="5.8" cy="10.8" rx="1.7" ry="2.1" />
          <ellipse cx="10" cy="7.6" rx="1.7" ry="2.1" />
          <ellipse cx="14.4" cy="7.6" rx="1.7" ry="2.1" />
          <ellipse cx="18.4" cy="10.8" rx="1.7" ry="2.1" />
        </svg>
      )}
    </div>
  );
}

type UiIconName = "sun" | "moon" | "palette" | "settings" | "paw" | "bell" | "lock" | "vaccine" | "visit" | "scale" | "thermometer" | "heart" | "lungs" | "camera" | "trash";

function UiIcon({ name, className = "h-5 w-5" }: { name: UiIconName; className?: string }) {
  const shared = { "aria-hidden": true as const, viewBox: "0 0 24 24", className, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "sun": return <svg {...shared}><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>;
    case "moon": return <svg {...shared}><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.6 8.6 0 1 0 20.5 14.2Z"/></svg>;
    case "palette": return <svg {...shared}><path d="M12 3a9 9 0 1 0 0 18h1.1a2.2 2.2 0 0 0 1.7-3.6 1.5 1.5 0 0 1 1.2-2.4H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3Z"/><circle cx="7.5" cy="11" r=".8"/><circle cx="10" cy="7.5" r=".8"/><circle cx="14.5" cy="7.5" r=".8"/><circle cx="17" cy="11" r=".8"/></svg>;
    case "settings": return <svg {...shared}><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8L6.9 12l1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.9Z"/></svg>;
    case "paw": return <svg {...shared}><ellipse cx="12" cy="15.8" rx="5.1" ry="3.7"/><ellipse cx="5.8" cy="10.8" rx="1.7" ry="2.1"/><ellipse cx="10" cy="7.6" rx="1.7" ry="2.1"/><ellipse cx="14.4" cy="7.6" rx="1.7" ry="2.1"/><ellipse cx="18.4" cy="10.8" rx="1.7" ry="2.1"/></svg>;
    case "bell": return <svg {...shared}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>;
    case "lock": return <svg {...shared}><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></svg>;
    case "vaccine": return <svg {...shared}><path d="m14 4 6 6M16 2l6 6M13 7l4 4m-9 2 7-7 4 4-7 7m-3-1 3 3m-7-1 5 5m-3-8-6 6"/></svg>;
    case "visit": return <svg {...shared}><path d="M7 3v4m10-4v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z"/><path d="M9 14h6m-3-3v6"/></svg>;
    case "scale": return <svg {...shared}><path d="M12 4v16M5 20h14M5 7h14M5 7 2.5 13h5L5 7Zm14 0-2.5 6h5L19 7Z"/></svg>;
    case "thermometer": return <svg {...shared}><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z"/><path d="M12 11v6"/></svg>;
    case "heart": return <svg {...shared}><path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8a4.5 4.5 0 0 1 8.8-1.4 4.5 4.5 0 0 1 8.8 1.4Z"/></svg>;
    case "lungs": return <svg {...shared}><path d="M12 4v8m0-3c-2-2-3-4-4-3-1.5 1.5-3 4.5-3 8a4 4 0 0 0 7 2.6V9Zm0 0c2-2 3-4 4-3 1.5 1.5 3 4.5 3 8a4 4 0 0 1-7 2.6V9Z"/></svg>;
    case "camera": return <svg {...shared}><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg>;
    case "trash": return <svg {...shared}><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>;
  }
}
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

  const temporary = read(window.sessionStorage);
  if (temporary.id && temporary.code && temporary.phone) {
    return temporary;
  }

  return { id: null, code: null, phone: null };
}

function petPhotoStoragePath(photoUrl: string | null | undefined, petId: string) {
  if (!photoUrl) return null;
  try {
    const pathname = new URL(photoUrl).pathname;
    const marker = "/storage/v1/object/public/pet-photos/";
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    const path = decodeURIComponent(pathname.slice(markerIndex + marker.length));
    return path.startsWith(`${petId}/`) && !path.split("/").includes("..") ? path : null;
  } catch {
    return null;
  }
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

  // No recorded dose = no score point.
  if (!record) {
    return {
      points: 0,
      max: 1,
      status: "due", due: null,
      reset: false,
      record: null,
    };
  }

  if (!record.next_dose_at) {
    return {
      points: 1,
      max: 1,
      status: "current",
      due: null,
      reset: false,
      record,
    };
  }

  const state = protocolState(record.next_dose_at);

  return state === "overdue"
    ? {
        points: 0,
        max: 1,
        status: "overdue",
        due: record.next_dose_at,
        reset: false,
        record,
      }
    : {
        points: 1,
        max: 1,
        status: state,
        due: record.next_dose_at,
        reset: false,
        record,
      };
}


function getProtocolStatus(records: Vaccine[], pet: Pet | null) {
  return {
    viral: getViralStatus(records, pet?.birth_date || null),
    rabies: getRabiesStatus(records, pet?.birth_date || null),
    deworm: getDewormStatus(records, pet?.birth_date || null),
    parasite: getParasiteStatus(records),
  };
}

function Chart({ values, unit, empty, dark }: { values:number[]; unit:string; empty:string; dark:boolean }) {
  if(values.length === 0) return <div className={`flex h-24 items-center justify-center rounded-2xl border border-dashed text-[11px] ${dark?"border-white/15 text-slate-300":"border-slate-300 text-slate-600"}`}>{empty}</div>;

  const min=Math.min(...values), max=Math.max(...values), spread=Math.max(max-min,.1), w=240,h=78;
  const coords=values.map((v,i)=>({
    x: values.length === 1 ? w / 2 : i/(values.length-1)*w,
    y: values.length === 1 ? h / 2 : h-8-((v-min)/spread)*(h-16),
  }));

  return (
    <div>
      <div className={`mb-1 flex items-center justify-between gap-2 text-[10px] font-bold ${dark?"text-slate-300":"text-slate-600"}`}>
        <span>{values.length === 1 ? "أول قراءة" : `${values.length} قراءات`}</span>
        <span>{values.at(-1)} {unit}</span>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full">
        <defs>
          <linearGradient id="g" x1="0" x2="1">
            <stop offset="0" stopColor="var(--vetra-accent)"/>
            <stop offset="1" stopColor="var(--vetra-accent-end)"/>
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
            stroke="var(--vetra-accent)"
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

function Countdown({ days, lang, status, dark }:{days:number|null;lang:Lang;status:ProtocolState|null;dark:boolean}) {
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

  return <div className="relative h-28 w-28 shrink-0"><svg viewBox="0 0 100 100" className="h-full w-full -rotate-90"><circle cx="50" cy="50" r="42" fill="none" stroke={dark?"rgba(255,255,255,.12)":"rgba(15,23,42,.12)"} strokeWidth="6"/><circle cx="50" cy="50" r="42" fill="none" stroke="url(#ring)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c*progress} ${c}`}/><defs><linearGradient id="ring"><stop offset="0" stopColor="var(--vetra-accent)"/><stop offset="1" stopColor="var(--vetra-accent-end)"/></linearGradient></defs></svg><div className="absolute inset-0 flex flex-col items-center justify-center"><b className="text-xl">{displayValue}</b><span className={`text-[9px] font-bold ${dark?"text-slate-400":"text-slate-600"}`}>{label}</span></div></div>;
}

export default function ClientInterfaceIdPage(){
  const params=useParams<{id:string}>(); const router=useRouter(); const clientId=params.id;
  const [lang,setLang]=useState<Lang>("ar"); const dark=true; const [paletteId,setPaletteId]=useState<PaletteId>("sage"); const [themePicker,setThemePicker]=useState(false); const [client,setClient]=useState<Client|null>(null); const [pets,setPets]=useState<Pet[]>([]); const [visits,setVisits]=useState<Visit[]>([]); const [vaccines,setVaccines]=useState<Vaccine[]>([]); const [financialSummary,setFinancialSummary]=useState<FinancialSummary>({due_amount:0,credit_amount:0}); const [selected,setSelected]=useState(""); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [settings,setSettings]=useState(false); const [addPet,setAddPet]=useState(false); const [petForm,setPetForm]=useState({name:"",species:"cat",gender:"Female",birth_date:"",breed:"",color:""}); const [savingPet,setSavingPet]=useState(false); const [photoBusy,setPhotoBusy]=useState(false); const [photoError,setPhotoError]=useState(""); const [photoMessage,setPhotoMessage]=useState("");
  const lastActivityPingAt=useRef(0);

  useEffect(()=>{
    const l=localStorage.getItem("vetra-language");
    const savedPalette=localStorage.getItem("vetra-client-palette");
    if(l==="ar"||l==="en")setLang(l);
    if(savedPalette&&Object.prototype.hasOwnProperty.call(PAGE_PALETTES,savedPalette))setPaletteId(savedPalette as PaletteId);
    // This query flag opens the existing Add Pet modal, which is also linked from Match's empty state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if(new URLSearchParams(window.location.search).get("addPet")==="1")setAddPet(true);
  },[]);
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

      const financial=await db.rpc("vetra_get_owner_financial_summary",{p_client_id:clientId});
      const financialRow=Array.isArray(financial.data)?financial.data[0]:financial.data;
      setFinancialSummary(financial.error||!financialRow?{due_amount:0,credit_amount:0}:{due_amount:Number(financialRow.due_amount||0),credit_amount:Number(financialRow.credit_amount||0)});

      if (Date.now() - lastActivityPingAt.current >= 45_000) {
        lastActivityPingAt.current = Date.now();
        void fetch("/api/client-activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientCode: code, phone }),
          keepalive: true,
        }).then(async (response) => {
          if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            console.error("CLIENT ACTIVITY HEARTBEAT FAILED:", result);
          }
        }).catch((heartbeatError) => console.error("CLIENT ACTIVITY HEARTBEAT FAILED:", heartbeatError));
      }

      const p=await db.from("pets").select("id,name,species,breed,gender,birth_date,color,photo_url,is_deceased,created_at").eq("client_id",clientId).order("created_at",{ascending:false});
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
  const colors=PAGE_PALETTES[paletteId].dark;
  const paletteStyle={"--vetra-bg":colors.bg,"--vetra-surface":colors.surface,"--vetra-card":colors.card,"--vetra-muted-surface":colors.mutedSurface,"--vetra-panel":colors.panel,"--vetra-panel-end":colors.panelEnd,"--vetra-text":colors.text,"--vetra-muted":colors.muted,"--vetra-accent":colors.accent,"--vetra-accent-strong":colors.accentStrong,"--vetra-accent-soft":colors.accentSoft,"--vetra-accent-end":colors.accentEnd,"--vetra-border":colors.border,"--vetra-border-accent":colors.borderAccent,"--vetra-accent-ink":colors.ink,"--vetra-warm":colors.warm} as CSSProperties;
  const pv=useMemo(()=>pet?visits.filter(x=>x.pet_id===pet.id).sort((a,b)=>+new Date(b.visit_date)-+new Date(a.visit_date)):[],[pet,visits]);
  const px=useMemo(()=>pet?vaccines.filter(x=>x.pet_id===pet.id).sort((a,b)=>(a.next_dose_at?+new Date(a.next_dose_at):9e15)-(b.next_dose_at?+new Date(b.next_dose_at):9e15)):[],[pet,vaccines]);
  // Vaccine countdown is independent from clinic-visit frequency. It uses only next_dose_at.
  const last=pv[0]||null;
  // Monthly clinic score uses only the most recent visit. Multiple visits never stack points or alter vaccine countdowns.
  const metrics: {n:string;u:string;i:UiIconName;v:number[]}[]=[{n:t.weight,u:"kg",i:"scale",v:pv.filter(x=>x.weight!==null).slice(0,6).reverse().map(x=>Number(x.weight))},{n:t.temp,u:"°م",i:"thermometer",v:pv.filter(x=>x.temperature!==null).slice(0,6).reverse().map(x=>Number(x.temperature))},{n:t.heart,u:"bpm",i:"heart",v:pv.filter(x=>x.heart_rate!==null).slice(0,6).reverse().map(x=>Number(x.heart_rate))},{n:t.resp,u:"/min",i:"lungs",v:pv.filter(x=>x.respiratory_rate!==null).slice(0,6).reverse().map(x=>Number(x.respiratory_rate))}];

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
    {label:t.scoreViral,points:catProtocol.viral.points,max:3,done:catProtocol.viral.points===3&&catProtocol.viral.status!=="not_due",status:catProtocol.viral.status},
    {label:t.scoreRabies,points:catProtocol.rabies.points,max:2,done:catProtocol.rabies.points===2&&catProtocol.rabies.status!=="not_due",status:catProtocol.rabies.status},
    {label:t.scoreDeworm,points:catProtocol.deworm.points,max:2,done:catProtocol.deworm.points===2&&catProtocol.deworm.status!=="not_due",status:catProtocol.deworm.status},
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

  const toggleLang=()=>{const n=lang==="ar"?"en":"ar";setLang(n);localStorage.setItem("vetra-language",n)}; const selectPalette=(id:PaletteId)=>{setPaletteId(id);localStorage.setItem("vetra-client-palette",id);setThemePicker(false)}; const logout=()=>{localStorage.removeItem("vetra-client-id");localStorage.removeItem("vetra-client-code");localStorage.removeItem("vetra-client-phone");sessionStorage.removeItem("vetra-client-id");sessionStorage.removeItem("vetra-client-code");sessionStorage.removeItem("vetra-client-phone");router.replace("/client-interface/login")};

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

  async function uploadPetPhoto(file: File | null) {
    if (!file || !pet) return;
    setPhotoError("");
    setPhotoMessage("");

    const allowedTypes: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    if (!allowedTypes[file.type]) {
      setPhotoError(lang === "ar" ? "اختار صورة بصيغة JPG أو PNG أو WebP." : "Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError(lang === "ar" ? "حجم الصورة لازم يكون 5 ميجابايت أو أقل." : "The image must be 5 MB or smaller.");
      return;
    }

    const petToUpdate = pet;
    const oldPhotoPath = petPhotoStoragePath(petToUpdate.photo_url, petToUpdate.id);
    const newPhotoPath = `${petToUpdate.id}/${Date.now()}.${allowedTypes[file.type]}`;
    let failedAt: "storage" | "database" = "storage";
    setPhotoBusy(true);
    try {
      const ownerSession = getOwnerSession();
      if (!ownerSession.id || ownerSession.id !== clientId || !ownerSession.code || !ownerSession.phone) {
        router.replace("/client-interface/login");
        return;
      }

      const { error: uploadError } = await vetraCore.storage
        .from("pet-photos")
        .upload(newPhotoPath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });
      if (uploadError) throw uploadError;

      failedAt = "database";
      const { data } = vetraCore.storage.from("pet-photos").getPublicUrl(newPhotoPath);
      if (!data?.publicUrl) throw new Error("Could not create a public photo URL.");

      const db = await getClientPortalDb(ownerSession.code, ownerSession.phone);
      const { data: updatedPetId, error: updateError } = await db.rpc("vetra_update_pet_photo_for_owner", {
        p_pet_id: petToUpdate.id,
        p_photo_url: data.publicUrl,
      });
      if (updateError) throw updateError;
      if (updatedPetId !== petToUpdate.id) throw new Error("The pet photo could not be saved to this account.");

      setPets(current => current.map(item => item.id === petToUpdate.id ? { ...item, photo_url: data.publicUrl } : item));
      setPhotoMessage(lang === "ar" ? "تم تحديث صورة الحيوان." : "Pet photo updated.");

      if (oldPhotoPath) {
        const { error: removeError } = await vetraCore.storage.from("pet-photos").remove([oldPhotoPath]);
        if (removeError) {
          setPhotoMessage(lang === "ar" ? "تم تحديث الصورة. تعذر حذف النسخة القديمة من التخزين." : "Photo updated. The previous file could not be removed from storage.");
        }
      }
    } catch (e) {
      await vetraCore.storage.from("pet-photos").remove([newPhotoPath]);
      const failure = e && typeof e === "object" ? e as {
        name?: unknown;
        message?: unknown;
        code?: unknown;
        details?: unknown;
        hint?: unknown;
        status?: unknown;
      } : null;
      const failureMessage = typeof failure?.message === "string"
        ? failure.message
        : typeof e === "string" ? e : "Unknown error";
      console.error("OWNER PET PHOTO UPLOAD ERROR:", {
        stage: failedAt,
        name: failure?.name,
        message: failureMessage,
        code: failure?.code,
        details: failure?.details,
        hint: failure?.hint,
        status: failure?.status,
        error: e,
      });
      const missingPhotoRpc = failure?.code === "PGRST202"
        || failureMessage.includes("vetra_update_pet_photo_for_owner");
      setPhotoError(failedAt === "storage"
        ? (lang === "ar" ? "مخزن صور VETRA رفض الرفع بسبب سياسة الأمان (RLS). يلزم تفعيل رفع آمن لصور الحيوانات." : "VETRA photo storage rejected the upload under its RLS policy. Secure pet photo uploads need to be enabled.")
        : missingPhotoRpc
          ? (lang === "ar" ? "دالة حفظ الصور غير موجودة في قاعدة بيانات العيادة. شغّل ملف SQL على قاعدة بيانات العيادة ثم أعد تحميل الصفحة." : "The pet photo save function is missing from the clinic database. Run the SQL file on that clinic database, then reload the page.")
          : (lang === "ar" ? "تم رفع الملف، لكن قاعدة بيانات العيادة رفضت حفظ رابط الصورة للحيوان. راجع تفاصيل الخطأ في Console." : "The file uploaded, but the clinic database rejected saving the pet photo URL. Check the Console for error details."));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function deletePetPhoto() {
    if (!pet?.photo_url || photoBusy) return;
    const petToUpdate = pet;
    const confirmed = window.confirm(lang === "ar" ? `هل تريد حذف صورة ${petToUpdate.name}؟` : `Delete ${petToUpdate.name}'s photo?`);
    if (!confirmed) return;

    setPhotoBusy(true);
    setPhotoError("");
    setPhotoMessage("");
    try {
      const ownerSession = getOwnerSession();
      if (!ownerSession.id || ownerSession.id !== clientId || !ownerSession.code || !ownerSession.phone) {
        router.replace("/client-interface/login");
        return;
      }

      const db = await getClientPortalDb(ownerSession.code, ownerSession.phone);
      const { data: updatedPetId, error: updateError } = await db.rpc("vetra_update_pet_photo_for_owner", {
        p_pet_id: petToUpdate.id,
        p_photo_url: null,
      });
      if (updateError) throw updateError;
      if (updatedPetId !== petToUpdate.id) throw new Error("The pet photo could not be removed from this account.");

      setPets(current => current.map(item => item.id === petToUpdate.id ? { ...item, photo_url: null } : item));
      const oldPhotoPath = petPhotoStoragePath(petToUpdate.photo_url, petToUpdate.id);
      if (oldPhotoPath) {
        const { error: removeError } = await vetraCore.storage.from("pet-photos").remove([oldPhotoPath]);
        if (removeError) {
          setPhotoMessage(lang === "ar" ? "تمت إزالة الصورة من صفحتك، لكن تعذر حذف النسخة القديمة من التخزين." : "The photo was removed from your page, but its stored file could not be deleted.");
          return;
        }
      }
      setPhotoMessage(lang === "ar" ? "تم حذف الصورة." : "Photo deleted.");
    } catch (e) {
      console.error("OWNER PET PHOTO DELETE ERROR:", e);
      setPhotoError(lang === "ar" ? "تعذر حذف الصورة. قد لا تسمح صلاحيات العيادة بتعديل صور الحيوانات من حساب المالك." : "Could not delete the photo. The clinic may not allow owners to edit pet photos.");
    } finally {
      setPhotoBusy(false);
    }
  }

  if(loading)return <main dir={lang==="ar"?"rtl":"ltr"} className="flex min-h-screen items-center justify-center bg-[#06101a] text-white"><div className="text-center"><Image src="/vetra-logo-full.png" alt="VETRA" width={992} height={830} priority className="mx-auto mb-4 h-16 w-20 object-contain"/><p className="text-sm font-bold text-slate-400">{t.loading}</p></div></main>;
  if(error&&!client)return <main dir={lang==="ar"?"rtl":"ltr"} className="flex min-h-screen items-center justify-center bg-[#06101a] px-6 text-white"><div className="max-w-md rounded-[2rem] border border-white/10 bg-white/[.04] p-8 text-center"><Image src="/vetra-logo-full.png" alt="VETRA" width={992} height={830} className="mx-auto h-16 w-20 object-contain"/><h1 className="mt-4 text-2xl font-black">{t.error}</h1><p className="mt-3 text-sm text-slate-400">{error}</p><button onClick={()=>router.replace("/client-interface/login")} className="mt-6 rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-black text-slate-950">{t.login}</button></div></main>;

  return <main id="home" data-vetra-page-theme="client" data-vetra-palette={paletteId} data-vetra-mode={dark?"dark":"light"} style={paletteStyle} dir={lang==="ar"?"rtl":"ltr"} className={dark?"min-h-screen overflow-x-hidden bg-[#06101a] text-white":"min-h-screen overflow-x-hidden bg-[#f5f9fc] text-slate-900"}>
    <div className="pointer-events-none fixed inset-0 overflow-hidden"><div className={dark?"absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl":"absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-300/25 blur-3xl"}/><div className={dark?"absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl":"absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-violet-300/20 blur-3xl"}/></div>
    <div className="relative z-10 mx-auto max-w-7xl px-4 pb-28 pt-4 sm:px-6 lg:px-8">
      <header className="sticky top-0 z-40 mb-6 flex items-center justify-between py-3 backdrop-blur-xl"><div className={dark?"":"rounded-xl bg-[#10251f] p-1.5 shadow-sm"}><Image src="/vetra-logo-full.png" alt="VETRA" width={992} height={830} priority className="h-14 w-[68px] object-contain sm:h-16 sm:w-[76px]"/></div><div className="flex items-center gap-2"><button onClick={toggleLang} className={dark?"rounded-full border border-white/10 bg-white/[.05] px-3 py-2 text-xs font-bold":"rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold"}>{t.language}</button><div className="relative"><button type="button" onClick={()=>setThemePicker(value=>!value)} aria-expanded={themePicker} aria-label={lang==="ar"?"ألوان الصفحة":"Page themes"} title={lang==="ar"?"ألوان الصفحة":"Page themes"} className={dark?"flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[.05] text-cyan-200":"flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-cyan-800"}><UiIcon name="palette" className="h-[18px] w-[18px]"/></button>{themePicker&&<div dir={lang==="ar"?"rtl":"ltr"} className="absolute end-0 top-12 z-[80] w-64 rounded-2xl border border-white/10 bg-white p-3 shadow-2xl" style={{color:colors.text}}><div className="mb-2 px-1 text-xs font-black text-slate-300">{lang==="ar"?"اختار ألوان الصفحة":"Choose page colors"}</div><div className="space-y-1.5">{(Object.keys(PAGE_PALETTES) as PaletteId[]).map(id=>{const option=PAGE_PALETTES[id];return <button key={id} type="button" onClick={()=>selectPalette(id)} aria-pressed={paletteId===id} className={`flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-start transition ${paletteId===id?"border-cyan-300/60 bg-cyan-300/10":"border-slate-200 hover:bg-slate-50"}`}><span aria-hidden="true" className="h-8 w-12 shrink-0 rounded-lg border border-slate-200" style={{background:`linear-gradient(135deg,${option.swatches.join(",")})`}}/><span className="flex-1 text-xs font-bold">{lang==="ar"?option.ar:option.en}</span>{paletteId===id&&<span aria-hidden="true" className="text-cyan-300">✓</span>}</button>})}</div></div>}</div><PushNotificationsButton audience="owner" language={lang} darkMode={dark}/><button onClick={()=>setSettings(true)} aria-label={t.settings} className={dark?"flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[.05]":"flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"}><UiIcon name="settings"/></button></div></header>

      <section className="mb-5 grid gap-3 sm:grid-cols-2"><div className={dark?"rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4":"rounded-2xl border border-amber-200 bg-amber-50 p-4"}><div className={`text-xs font-bold ${dark?"text-amber-200":"text-amber-800"}`}>{t.dueAmount}</div><div className="mt-2 text-2xl font-black">{financialSummary.due_amount.toFixed(2)} EGP</div></div><div className={dark?"rounded-2xl border border-emerald-300/20 bg-emerald-300/[.06] p-4":"rounded-2xl border border-emerald-200 bg-emerald-50 p-4"}><div className={`text-xs font-bold ${dark?"text-emerald-200":"text-emerald-800"}`}>{t.creditAmount}</div><div className="mt-2 text-2xl font-black">{financialSummary.credit_amount.toFixed(2)} EGP</div></div></section>
      <section className="grid gap-5 lg:grid-cols-[1fr_360px]"><div className={dark?"rounded-[2rem] border border-white/[.07] bg-gradient-to-br from-white/[.08] to-white/[.03] p-5 shadow-2xl sm:p-7":"rounded-[2rem] border border-slate-200 bg-white p-5 shadow-2xl sm:p-7"}><p className={`text-sm font-bold ${dark?"text-cyan-300":"text-cyan-800"}`}>{t.welcome}</p><h1 className="mt-1 text-3xl font-black sm:text-4xl">{client?.name||"VETRA"}</h1><p className={`mt-3 text-sm leading-7 ${dark?"text-slate-300":"text-slate-600"}`}>{t.allCare}</p>
        {pet&&<div className="mt-6 grid gap-4 md:grid-cols-[1.1fr_.9fr]"><div className="rounded-[1.7rem] bg-gradient-to-br from-[#0e2330] to-[#10142a] p-4 text-white sm:p-5"><div className="flex items-center gap-4"><PetAvatar pet={pet} className="h-24 w-24 rounded-[1.5rem]" dark={dark}/><div className="min-w-0"><div className="text-xs font-bold text-cyan-300">{t.selected}</div><div className="mt-1 truncate text-2xl font-black">{pet.name}</div><div className="mt-1 text-xs text-slate-400">{species(pet.species,lang)} • {pet.gender==="Male"?t.male:pet.gender==="Female"?t.female:pet.gender||t.unknown} • {age(pet.birth_date,lang)}</div></div></div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-bold text-cyan-200 transition hover:bg-cyan-300/15 ${photoBusy ? "pointer-events-none opacity-60" : ""}`}>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={photoBusy} onChange={event => { const file = event.currentTarget.files?.[0] || null; event.currentTarget.value = ""; void uploadPetPhoto(file); }}/>
              <UiIcon name="camera" className="h-4 w-4"/>
              {photoBusy ? (lang === "ar" ? "جاري حفظ الصورة..." : "Saving photo...") : pet.photo_url ? (lang === "ar" ? "استبدال الصورة" : "Change photo") : (lang === "ar" ? "إضافة صورة" : "Add photo")}
            </label>
            {pet.photo_url && <button type="button" disabled={photoBusy} onClick={() => void deletePetPhoto()} className="inline-flex items-center gap-2 rounded-xl border border-rose-300/15 bg-rose-300/[.06] px-3 py-2 text-xs font-bold text-rose-200 transition hover:bg-rose-300/10 disabled:opacity-60"><UiIcon name="trash" className="h-4 w-4"/>{lang === "ar" ? "حذف الصورة" : "Delete photo"}</button>}
            <Link href={`/client-interface/${clientId}/pets/${pet.id}/gallery`} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.05] px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/10"><UiIcon name="camera" className="h-4 w-4"/>{lang === "ar" ? "معرض الصور" : "Photo gallery"}</Link>
            <Link href={`/client-interface/${clientId}/analyses?pet=${pet.id}`} className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-200 transition hover:bg-cyan-300/15">🧪 {lang === "ar" ? "نتائج التحاليل" : "Lab results"}</Link>
            <span className="basis-full text-[10px] text-slate-400">{lang === "ar" ? "JPG أو PNG أو WebP — حتى 5 ميجابايت" : "JPG, PNG, or WebP — up to 5 MB"}</span>
          </div>
          {photoError && <p role="alert" className="mt-2 text-xs font-semibold text-rose-300">{photoError}</p>}
          {photoMessage && <p role="status" className="mt-2 text-xs font-semibold text-emerald-300">{photoMessage}</p>}
          <div className={dark?"mt-5 rounded-[1.6rem] border border-cyan-400/10 bg-gradient-to-br from-cyan-400/[.08] via-white/[.025] to-violet-500/[.06] p-4":"mt-5 rounded-[1.6rem] border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-violet-50 p-4"}>
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 shrink-0">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke={dark?"rgba(255,255,255,.08)":"rgba(15,23,42,.08)"} strokeWidth="7" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="url(#score-ring)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${2*Math.PI*42*(careScore/10)} ${2*Math.PI*42}`} />
                <defs><linearGradient id="score-ring"><stop offset="0" stopColor="var(--vetra-accent)"/><stop offset="100%" stopColor="var(--vetra-accent-end)"/></linearGradient></defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center"><div className="text-xl font-black leading-none">{catCareScore === null ? "—" : careScore}<span className={`text-xs ${dark?"text-slate-400":"text-slate-600"}`}>{catCareScore === null ? "" : "/10"}</span></div></div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2"><div className={`text-xs font-bold ${dark?"text-cyan-300":"text-cyan-800"}`}>{t.score}</div><span className={`rounded-full px-2 py-1 text-[9px] font-black ${dark?"bg-white/[.08] text-slate-300":"bg-slate-900/[.06] text-slate-700"}`}>{scoreRemaining>0?`${scoreRemaining} ${t.scoreMissing}`:t.scorePerfect}</span></div>
              <div className="mt-1 text-lg font-black">{scoreTitle}</div>
              <p className={`mt-1 text-[10px] leading-5 ${dark?"text-slate-400":"text-slate-600"}`}>{t.scoreNote}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {scoreItems.map((item)=><div key={item.label} className={dark?"rounded-xl border border-white/[.05] bg-white/[.025] px-3 py-2":"rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"}>
              <div className="flex items-center justify-between gap-2"><span className={`truncate text-[10px] font-bold ${dark?"text-slate-300":"text-slate-700"}`}>{item.label}</span><span className={item.status === "not_due" ? (dark ? "text-slate-400" : "text-slate-600") : item.done ? (dark ? "text-emerald-300" : "text-emerald-700") : (dark ? "text-cyan-300" : "text-cyan-800")}>{item.status === "not_due" ? "\u2014" : item.done ? "\u2713" : "\u2022"}</span></div>
              <div className={`mt-1 text-[9px] font-semibold ${dark?"text-slate-400":"text-slate-600"}`}>{item.status === "not_due" ? (lang==="ar" ? "\u063A\u064A\u0631 \u0645\u0633\u062A\u062D\u0642 \u0644\u0647\u0630\u0627 \u0627\u0644\u0639\u0645\u0631" : "Not due for this age") : item.done ? "\u2713" : item.status === "grace" ? (lang==="ar" ? "\u0641\u062A\u0631\u0629 \u0627\u0644\u0633\u0645\u0627\u062D 7 \u0623\u064A\u0627\u0645" : "7-day grace period") : item.status === "overdue" ? (lang==="ar" ? "\u0645\u062A\u0623\u062E\u0631 \u2014 \u064A\u062D\u062A\u0627\u062C \u0625\u0639\u0627\u062F\u0629" : "Overdue - reset needed") : item.status === "due" ? (lang==="ar" ? "\u0644\u0645 \u062A\u064F\u0633\u062C\u0651\u0644 \u062C\u0631\u0639\u0629 \u0628\u0639\u062F" : "No dose recorded yet") : (lang==="ar" ? "\u0645\u0646\u062A\u0638\u0645" : "On track")}</div>
            </div>)}
          </div>
          {catCareScore !== null && scoreRemaining>0&&<div className={`mt-3 text-center text-[10px] font-bold ${dark?"text-slate-400":"text-slate-600"}`}>{lang==="ar"?`إيه اللي ناقص؟ تعالى كمّل ${scoreRemaining} ${t.scoreMissing}`: `${scoreRemaining} ${t.scoreMissing} to go — can you reach 10/10?`}</div>}
        </div></div>
        <div className={dark?"rounded-[1.7rem] border border-white/[.08] bg-white/[.05] p-5":"rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm"}><div className="flex items-center justify-between gap-4"><div><div className={`text-xs font-bold ${dark?"text-cyan-300":"text-cyan-800"}`}>{t.next}</div><div className="mt-2 text-lg font-black">{next?.name||t.none}</div>{next?.due&&<div className={`mt-1 text-xs ${dark?"text-slate-300":"text-slate-600"}`}>{dateText(next.due,lang)}</div>}</div><Countdown days={due} lang={lang} status={next?.status || null} dark={dark}/></div><button onClick={()=>next?.due&&alert(lang==="ar"?"التذكير هيتوصل بنظام الإشعارات في الخطوة التالية.":"Reminder notifications will be connected in the next step.")} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-3 text-xs font-black text-slate-950"><UiIcon name="bell" className="h-4 w-4"/>{t.reminder}</button></div></div>}
      </div>
      <div id="pets-section" className={dark ? "min-w-0 rounded-[2rem] border border-white/[.08] bg-white/[.04] p-4 sm:p-5" : "min-w-0 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5"}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><h2 className="text-lg font-black">{t.pets}</h2><p className={`mt-1 text-xs ${dark ? "text-slate-300" : "text-slate-600"}`}>{pets.length} {t.count}</p></div>
          <button onClick={() => setAddPet(true)} className="shrink-0 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-xs font-black text-slate-950">+ {t.add}</button>
        </div>
        <div className="mt-4 max-h-[330px] min-w-0 space-y-2 overflow-y-auto pe-1">
          {pets.map((p) => (
            <div key={p.id} className={p.id === pet?.id ? "flex min-w-0 items-stretch gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-400/[.08] p-2" : dark ? "flex min-w-0 items-stretch gap-2 rounded-2xl border border-white/[.08] bg-white/[.04] p-2 transition hover:bg-white/[.07]" : "flex min-w-0 items-stretch gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 transition hover:bg-slate-100"}>
              <button type="button" onClick={() => { setSelected(p.id); setPhotoError(""); setPhotoMessage(""); }} aria-pressed={p.id === pet?.id} className="flex min-w-0 flex-1 items-center gap-3 p-1 text-start">
                <PetAvatar pet={p} className="h-12 w-12 rounded-2xl sm:h-14 sm:w-14" dark={dark}/>
                <div className="min-w-0 flex-1"><div className="truncate font-black">{p.name}</div><div className={`mt-1 break-words text-[11px] ${dark?"text-slate-300":"text-slate-600"}`}>{species(p.species,lang)} • {age(p.birth_date,lang)}</div></div>
                {p.id === pet?.id && <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${dark?"bg-cyan-300/15 text-cyan-200":"bg-cyan-100 text-cyan-900"}`}>{lang === "ar" ? "المختار" : "Selected"}</span>}
              </button>
              <button type="button" onClick={() => router.push(`/client-interface/${clientId}/pets/${p.id}`)} aria-label={`${lang === "ar" ? "فتح ملف" : "Open profile"} ${p.name}`} title={lang === "ar" ? "فتح الملف الكامل" : "Open full profile"} className={`flex w-10 shrink-0 items-center justify-center rounded-xl border text-lg transition ${dark?"border-white/10 text-slate-300 hover:bg-white/[.08]":"border-slate-200 text-slate-600 hover:bg-white"}`}>‹</button>
            </div>
          ))}
          <button type="button" onClick={() => setAddPet(true)} className={`w-full rounded-2xl border border-dashed p-4 text-xs font-black ${dark?"border-cyan-300/30 bg-cyan-300/[.06] text-cyan-200":"border-cyan-700/30 bg-cyan-50 text-cyan-900"}`}>+ {t.add}</button>
        </div>
      </div></section>

      {pet && (
        <ClientCareHub
          key={`${clientId}-${pet.id}`}
          clientId={clientId}
          clientName={client?.name || ""}
          clientPhone={client?.phone || ""}
          clientEmail={client?.email || ""}
          pet={pet}
          petCount={pets.length}
          visits={pv}
          vaccines={px}
          lang={lang}
          dark={dark}
        />
      )}
      {pet&&<><section className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><div className={dark?"rounded-[2rem] border border-white/[.07] bg-white/[.035] p-5 sm:p-6":"rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"}><div className="flex items-end justify-between"><div><p id="health-trends" className={`scroll-mt-24 text-xs font-bold ${dark?"text-cyan-300":"text-cyan-800"}`}>{t.trends}</p><h2 className="mt-1 text-2xl font-black">{pet.name}</h2></div><span className={`rounded-full border px-3 py-1.5 text-[10px] font-bold ${dark?"border-white/10 bg-white/[.05] text-slate-300":"border-slate-200 bg-slate-50 text-slate-700"}`}>{t.sixMonths}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{metrics.map(m=><div key={m.n} className={dark?"rounded-[1.5rem] border border-white/[.05] bg-white/[.025] p-4":"rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4"}><div className="flex items-center gap-2"><UiIcon name={m.i} className={`h-4 w-4 ${dark?"text-cyan-300":"text-cyan-800"}`}/><span className="text-xs font-black">{m.n}</span></div><Chart values={m.v} unit={m.u} empty={t.noData} dark={dark}/></div>)}</div></div>
        <div className={dark?"rounded-[2rem] border border-white/[.07] bg-white/[.035] p-5 sm:p-6":"rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"}><div className="flex items-center justify-between"><div><p className={`text-xs font-bold ${dark?"text-cyan-300":"text-cyan-800"}`}>{t.next}</p><h2 id="vaccination-history" className="mt-1 scroll-mt-24 text-2xl font-black">{t.vaccineHistory}</h2></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-black ${dark?"bg-cyan-300/10 text-cyan-200":"bg-cyan-100 text-cyan-900"}`}>{px.length}</span></div><div className="mt-5 space-y-2">{px.slice(0,5).map(x=>{const d=x.next_dose_at?daysUntil(x.next_dose_at):null;return <div key={x.id} className={dark?"rounded-2xl border border-white/[.05] bg-white/[.025] p-3.5":"rounded-2xl border border-slate-200 bg-slate-50 p-3.5"}><div className="flex items-center gap-3"><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${dark?"bg-cyan-300/10":"bg-cyan-100"}`}><UiIcon name="vaccine" className={`h-5 w-5 ${dark?"text-cyan-300":"text-cyan-800"}`}/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-black">{x.vaccine_name||x.vaccine_type||"Vaccination"}</div><div className={`mt-1 text-[10px] ${dark?"text-slate-300":"text-slate-600"}`}>{x.administered_at?dateText(x.administered_at,lang):"—"}</div></div><span className={d!==null&&d<0?(dark?"rounded-full bg-rose-400/10 px-2 py-1 text-[9px] font-black text-rose-200":"rounded-full bg-rose-100 px-2 py-1 text-[9px] font-black text-rose-800"):(dark?"rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-black text-emerald-200":"rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black text-emerald-800")}>{d!==null&&d<0?t.overdue:d!==null&&d<=30?t.soon:t.completed}</span></div></div>})}{px.length===0&&<div className={`rounded-2xl border border-dashed p-6 text-center text-sm ${dark?"border-white/15 text-slate-300":"border-slate-300 text-slate-600"}`}>{t.noVaccines}</div>}</div></div></section>

        <DailyMedicationTodo
  key={`${clientId}-${pet.id}`}
  clientId={clientId}
  petId={pet.id}
  petName={pet.name}
  lang={lang}
  dark={dark}
/>
<section className={dark?"mt-5 rounded-[2rem] border border-white/[.07] bg-white/[.035] p-5 sm:p-6":"mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"}><div className="flex items-end justify-between"><div><p id="medical-history" className={`scroll-mt-24 text-xs font-bold ${dark?"text-cyan-300":"text-cyan-800"}`}>{t.history}</p><h2 className="mt-1 text-2xl font-black">{pet.name}</h2></div>{last&&<div className="hidden text-start sm:block"><div className={`text-[10px] font-bold ${dark?"text-slate-400":"text-slate-600"}`}>{lang==="ar"?"آخر زيارة":"Last visit"}</div><div className="mt-1 text-xs font-black">{dateText(last.visit_date,lang)}</div></div>}</div><div className="mt-6">{timeline.length===0?<div className={`rounded-2xl border border-dashed p-8 text-center text-sm ${dark?"border-white/15 text-slate-300":"border-slate-300 text-slate-600"}`}><div className="mb-2 text-3xl"><UiIcon name="visit" className={`mx-auto h-7 w-7 ${dark?"text-cyan-300":"text-cyan-800"}`}/></div>{pv.length===0?t.noVisits:t.timelineNote}</div>:<div className="relative space-y-5"><div className={lang==="ar"?"absolute bottom-4 right-5 top-4 w-px bg-gradient-to-b from-cyan-400 via-violet-500 to-transparent":"absolute bottom-4 left-5 top-4 w-px bg-gradient-to-b from-cyan-400 via-violet-500 to-transparent"}/>{timeline.map(e=><div key={e.id} className="relative flex gap-4"><div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#0b1622]">{e.type==="vaccine"?<UiIcon name="vaccine" className="h-5 w-5 text-cyan-400"/>:<UiIcon name="visit" className="h-5 w-5 text-cyan-400"/>}</div><div className={dark?"flex-1 rounded-2xl border border-white/[.05] bg-white/[.025] p-4":"flex-1 rounded-2xl border border-slate-200 bg-slate-50 p-4"}><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-black">{e.title}</div><div className={`text-[10px] font-bold ${dark?"text-slate-400":"text-slate-600"}`}>{dateText(e.date,lang)}</div></div>{e.sub&&<div className={`mt-2 text-xs leading-6 ${dark?"text-slate-300":"text-slate-600"}`}>{e.sub}</div>}</div></div>)}</div>}</div></section></>}




      <section className={dark?"mt-5 rounded-[2rem] border border-white/[.07] bg-white/[.035] p-5":"mt-5 rounded-[2rem] border border-slate-100 bg-white p-5"}><div className="flex items-center justify-between"><div><div className={`text-xs font-bold ${dark ? "text-cyan-300" : "text-cyan-800"}`}>{t.settings}</div><div className="mt-1 text-lg font-black">{client?.name}</div></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-black ${dark ? "bg-emerald-400/10 text-emerald-200" : "bg-emerald-100 text-emerald-800"}`}><UiIcon name="lock" className="me-1 inline h-3.5 w-3.5"/>{t.secure}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className={dark?"rounded-2xl border border-white/[.05] bg-white/[.025] p-4":"rounded-2xl border border-slate-100 bg-slate-50 p-4"}><div className={`text-[10px] font-bold ${dark ? "text-slate-400" : "text-slate-600"}`}>{t.phone}</div><div dir="ltr" className="mt-1 text-sm font-black">{client?.phone||"—"}</div></div><div className={dark?"rounded-2xl border border-white/[.05] bg-white/[.025] p-4":"rounded-2xl border border-slate-100 bg-slate-50 p-4"}><div className={`text-[10px] font-bold ${dark ? "text-slate-400" : "text-slate-600"}`}>{t.email}</div><div className="mt-1 truncate text-sm font-black">{client?.email||"—"}</div></div></div></section>
    </div>

    <nav aria-label={lang==="ar"?"التنقل الرئيسي":"Main navigation"} className="fixed bottom-0 left-0 right-0 z-50 p-2 sm:p-3"><div className={dark?"mx-auto grid max-w-2xl grid-cols-4 items-center gap-1 rounded-3xl border border-white/10 bg-[#0a1520]/95 px-1.5 py-2 shadow-2xl backdrop-blur-xl":"mx-auto grid max-w-2xl grid-cols-4 items-center gap-1 rounded-3xl border border-slate-200 bg-white/95 px-1.5 py-2 shadow-2xl backdrop-blur-xl"}>
      <button onClick={()=>window.scrollTo({top:0,behavior:"smooth"})} className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[8px] font-black leading-tight sm:text-[10px] ${dark ? "text-cyan-200" : "text-cyan-900"}`}><span className="text-lg">⌂</span><span className="truncate">{t.home}</span></button>
      <button onClick={()=>document.getElementById("pets-section")?.scrollIntoView({behavior:"smooth"})} className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[8px] font-black leading-tight sm:text-[10px] ${dark ? "text-slate-300" : "text-slate-700"}`}><span className="text-lg"><UiIcon name="paw" className="h-5 w-5"/></span><span className="truncate">{t.pets}</span></button>
      <button disabled={!pet} onClick={()=>pet&&router.push(`/client-interface/${clientId}/pets/${pet.id}/gallery`)} className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[8px] font-black leading-tight disabled:opacity-40 sm:text-[10px] ${dark ? "text-slate-300" : "text-slate-700"}`}><span className="text-lg">▧</span><span className="truncate">{lang==="ar"?"المعرض":"Gallery"}</span></button>
      <button onClick={()=>setSettings(true)} className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[8px] font-black leading-tight sm:text-[10px] ${dark ? "text-slate-300" : "text-slate-700"}`}><span className="text-lg"><UiIcon name="settings" className="h-5 w-5"/></span><span className="truncate">{t.more}</span></button>
    </div></nav>

    {settings&&<div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center"><div className={dark?"w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0b1622] p-5 text-white shadow-2xl":"w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl"}><div className="flex items-center justify-between"><h2 className="text-xl font-black">{t.settings}</h2><button onClick={()=>setSettings(false)} aria-label={t.close} className={`flex h-9 w-9 items-center justify-center rounded-full ${dark ? "bg-white/5 text-slate-300" : "bg-slate-100 text-slate-700"}`}>✕</button></div><div className="mt-5 space-y-2"><button onClick={toggleLang} className={dark?"flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[.04] p-4":"flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4"}><span className="font-black">Language / اللغة</span><span className={dark?"text-cyan-200":"text-cyan-800"}>{lang==="ar"?"عربي":"English"}</span></button><button onClick={logout} className="flex w-full items-center justify-between rounded-2xl border border-rose-400/10 bg-rose-400/[.05] p-4 text-rose-300"><span className="font-black">{t.logout}</span><span>↪</span></button></div></div></div>}
    {addPet&&<div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center"><div dir={lang==="ar"?"rtl":"ltr"} className={dark?"w-full max-w-md max-h-[92vh] overflow-y-auto rounded-[2rem] border border-white/10 bg-[#0b1622] p-6 text-white shadow-2xl":"w-full max-w-md max-h-[92vh] overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl"}><div className="flex items-center justify-between"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300"><UiIcon name="paw" className="h-6 w-6"/></div><button onClick={()=>setAddPet(false)} aria-label={t.close} className={dark?"flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-slate-300":"flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700"}>✕</button></div><h2 className="mt-4 text-2xl font-black">{t.addTitle}</h2><p className={`mt-2 text-sm leading-7 ${dark ? "text-slate-300" : "text-slate-600"}`}>{t.addNote}</p><div className="mt-5 space-y-3">
        <div><label className={`mb-1.5 block text-xs font-bold ${dark?"text-slate-300":"text-slate-700"}`}>{t.name} *</label><input value={petForm.name} onChange={e=>setPetForm(v=>({...v,name:e.target.value}))} placeholder={t.name} className={dark?"w-full rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 outline-none focus:border-cyan-400":"w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400"}/></div>
        <div><label className={`mb-1.5 block text-xs font-bold ${dark?"text-slate-300":"text-slate-700"}`}>{t.species}</label><div className="grid grid-cols-3 gap-2">{[["cat",t.cat],["dog",t.dog],["other",t.other]].map(([v,label])=><button type="button" key={v} onClick={()=>setPetForm(x=>({...x,species:v}))} className={petForm.species===v?"rounded-2xl border border-cyan-400 bg-cyan-400/10 px-3 py-3 text-sm font-black":"rounded-2xl border border-white/10 bg-white/[.03] px-3 py-3 text-sm font-bold"}>{label}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-3"><div><label className={`mb-1.5 block text-xs font-bold ${dark?"text-slate-300":"text-slate-700"}`}>{t.gender}</label><select value={petForm.gender} onChange={e=>setPetForm(v=>({...v,gender:e.target.value}))} className={dark?"w-full rounded-2xl border border-white/10 bg-[#101c28] px-4 py-3 outline-none":"w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"}><option value="Female">{t.female}</option><option value="Male">{t.male}</option></select></div><div><label className={`mb-1.5 block text-xs font-bold ${dark?"text-slate-300":"text-slate-700"}`}>{t.birth}</label><input type="date" value={petForm.birth_date} onChange={e=>setPetForm(v=>({...v,birth_date:e.target.value}))} className={dark?"w-full rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 outline-none":"w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"}/></div></div>
        <div className="grid grid-cols-2 gap-3"><div><label className={`mb-1.5 block text-xs font-bold ${dark?"text-slate-300":"text-slate-700"}`}>{t.breed}</label><input value={petForm.breed} onChange={e=>setPetForm(v=>({...v,breed:e.target.value}))} className={dark?"w-full rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 outline-none":"w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"}/></div><div><label className={`mb-1.5 block text-xs font-bold ${dark?"text-slate-300":"text-slate-700"}`}>{t.color}</label><input value={petForm.color} onChange={e=>setPetForm(v=>({...v,color:e.target.value}))} className={dark?"w-full rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 outline-none":"w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"}/></div></div>
      </div><div className="mt-5 grid grid-cols-2 gap-2"><button disabled={savingPet} onClick={()=>setAddPet(false)} className={dark?"rounded-2xl border border-white/10 px-4 py-3 font-bold text-slate-400":"rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-500"}>{t.cancel}</button><button disabled={savingPet} onClick={createPet} className="rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-3 font-black text-slate-950 disabled:opacity-60">{savingPet?t.saving:t.save}</button></div></div></div>}
  </main>;
}
