"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getClinicDb, getClinicContext } from "@/lib/clinic-db";

type Language = "en" | "ar";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email?: string | null;
};

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
  notes: string | null;
  is_deceased: boolean;
};

type Visit = {
  id: string;
  client_id: string;
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

type Medication = {
  id: string;
  name: string;
  active_ingredient: string | null;
  species: string[] | null;
  concentration: number | null;
  concentration_unit: string | null;
  dose_type: string | null;
  dose_value: number | null;
  dose_min: number | null;
  dose_max: number | null;
  dose_unit: string | null;
  route: string | null;
  frequency: string | null;
  duration_days: number | null;
  instructions: string | null;
};

type MedicationDraft = {
  id: string;
  medication_id: string;
  weight_kg: number;
  calculated_dose: number;
  calculated_dose_unit: string;
  dose_per_kg: number | null;
  concentration: number | null;
  concentration_unit: string | null;
  calculated_volume: number | null;
  volume_unit: string | null;
  route: string | null;
  frequency: string | null;
  duration_days: number | null;
  instructions: string | null;
};

type VaccinationDraft = {
  id: string;
  vaccine_name: string;
  vaccine_type: string;
  administered_at: string;
  next_dose_at: string;
  dose: string;
  route: string;
  batch_number: string;
  manufacturer: string;
  notes: string;
};

type PetDetails = Pet & {
  client: Client | null;
};

const translations = {
  en: {
    title: "New Visit",
    subtitle: "Start a new medical examination",
    dashboard: "Dashboard",
    language: "العربية",
    dark: "Dark mode",
    light: "Light mode",

    selectClient: "Select Client",
    selectClientHint: "Choose the pet owner first",
    searchClient: "Search clients...",
    noClients: "No clients found",

    selectPet: "Select Pet",
    selectPetHint: "Choose the animal for this visit",
    searchPet: "Search pets...",
    noPets: "No pets found",

    addClient: "Add Client",
    addPet: "Add Pet",

    selectedClient: "Selected Client",
    selectedPet: "Selected Pet",

    startExam: "Start Examination",
    changeSelection: "Change selection",

    patientSummary: "Patient Summary",
    owner: "Owner",
    breed: "Breed",
    gender: "Gender",
    birthDate: "Birth date",
    color: "Color",
    microchip: "Microchip",
    importantNotes: "Important Notes",
    noNotes: "No important notes recorded.",
    previousVisits: "Previous Visits",

    lastVisit: "Last Visit",
    noPreviousVisits: "No previous visits",

    lastDiagnosis: "Last Diagnosis",
    noDiagnosis: "No previous diagnosis",

    lastTreatment: "Last Treatment",
    noTreatment: "No previous treatment",

    visitCount: "Previous Visits",

    trends: "Patient Trends",
    weight: "Weight",
    temperature: "Temperature",
    heartRate: "Heart Rate",
    respiratoryRate: "Respiratory Rate",
    latest: "Latest",
    previous: "Previous",
    noData: "No data",
    kg: "kg",
    celsius: "°C",
    bpm: "bpm",
    rpm: "rpm",

    examination: "Current Examination",
    reason: "Reason for Visit",
    reasonPlaceholder: "Why is the patient here today?",
    quickReasons: "Quick reasons",
    reasons: ["Check-up", "Follow-up", "Vaccination", "Vomiting", "Diarrhea", "Cough", "Lethargy", "Poor appetite", "Skin problem"],
    examNormal: "Normal",
    examAbnormal: "Abnormal",
    examinationDetails: "Examination findings",
    examinationNormalHint: "Marked normal — no abnormal findings recorded.",
    followUp: "Follow-up",
    followUpNone: "No follow-up",
    followUp3Days: "3 days",
    followUp1Week: "1 week",
    followUp2Weeks: "2 weeks",
    followUp1Month: "1 month",
    followUpCustom: "Custom",
    followUpPlaceholder: "Follow-up / revisit details...",
    wheelSwipeHint: "Swipe or scroll",
    examinationNotes: "Examination",
    examinationPlaceholder: "Clinical examination findings...",
    diagnosis: "Diagnosis",
    diagnosisPlaceholder: "Diagnosis...",
    treatment: "Treatment",
    treatmentPlaceholder: "Treatment and medications...",
    visitNotes: "Visit Notes",
    visitNotesPlaceholder: "Additional notes for this visit...",

    saveVisit: "Save Visit",
    saving: "Saving...",
    cancel: "Cancel",

    visitHistory: "Visit History",
    viewExamination: "View Examination",
    noHistory: "No previous examinations.",

    visitDetails: "Visit Details",
    close: "Close",
    date: "Date",
    time: "Time",

    visitSaved: "Visit saved successfully.",
    saveError: "Could not save the visit.",
    loadError: "Could not load patient data.",
    selectPetFirst: "Please select a pet first.",
    deceasedPet: "This pet is marked as deceased and cannot have new visits.",
    deceasedBadge: "Deceased",
    requiredFields: "Please select both a client and a pet.",

    cat: "Cat",
    dog: "Dog",
    other: "Other",
    male: "Male",
    female: "Female",
  },

  ar: {
    title: "زيارة جديدة",
    subtitle: "ابدأ كشفًا طبيًا جديدًا",
    dashboard: "الرئيسية",
    language: "English",
    dark: "الوضع الداكن",
    light: "الوضع الفاتح",

    selectClient: "اختيار العميل",
    selectClientHint: "اختر صاحب الحيوان أولًا",
    searchClient: "البحث عن عميل...",
    noClients: "لا يوجد عملاء",

    selectPet: "اختيار الحيوان",
    selectPetHint: "اختر الحيوان الخاص بهذه الزيارة",
    searchPet: "البحث عن حيوان...",
    noPets: "لا توجد حيوانات",

    addClient: "إضافة عميل",
    addPet: "إضافة حيوان",

    selectedClient: "العميل المختار",
    selectedPet: "الحيوان المختار",

    startExam: "ابدأ الكشف",
    changeSelection: "تغيير الاختيار",

    patientSummary: "ملخص حالة الحيوان",
    owner: "المالك",
    breed: "السلالة",
    gender: "النوع",
    birthDate: "تاريخ الميلاد",
    color: "اللون",
    microchip: "الميكروشيب",
    importantNotes: "ملاحظات مهمة",
    noNotes: "لا توجد ملاحظات مهمة مسجلة.",
    previousVisits: "الزيارات السابقة",

    lastVisit: "آخر زيارة",
    noPreviousVisits: "لا توجد زيارات سابقة",

    lastDiagnosis: "آخر تشخيص",
    noDiagnosis: "لا يوجد تشخيص سابق",

    lastTreatment: "آخر علاج",
    noTreatment: "لا يوجد علاج سابق",

    visitCount: "الزيارات السابقة",

    trends: "متابعة المؤشرات",
    weight: "الوزن",
    temperature: "الحرارة",
    heartRate: "نبض القلب",
    respiratoryRate: "معدل التنفس",
    latest: "الأحدث",
    previous: "السابق",
    noData: "لا توجد بيانات",
    kg: "كجم",
    celsius: "°C",
    bpm: "نبضة/د",
    rpm: "نفس/د",

    examination: "الكشف الحالي",
    reason: "سبب الزيارة",
    reasonPlaceholder: "ما سبب حضور الحيوان اليوم؟",
    quickReasons: "أسباب سريعة",
    reasons: ["كشف", "متابعة", "تطعيم", "قيء", "إسهال", "كحة", "خمول", "قلة شهية", "مشكلة جلدية"],
    examNormal: "طبيعي",
    examAbnormal: "غير طبيعي",
    examinationDetails: "تفاصيل الفحص",
    examinationNormalHint: "تم تحديد الفحص كطبيعي — لا توجد ملاحظات غير طبيعية مسجلة.",
    followUp: "المتابعة",
    followUpNone: "لا توجد متابعة",
    followUp3Days: "3 أيام",
    followUp1Week: "أسبوع",
    followUp2Weeks: "أسبوعين",
    followUp1Month: "شهر",
    followUpCustom: "مخصص",
    followUpPlaceholder: "تفاصيل المتابعة / موعد المراجعة...",
    wheelSwipeHint: "اسحب أو لف العجلة",
    examinationNotes: "الفحص",
    examinationPlaceholder: "نتائج الفحص الإكلينيكي...",
    diagnosis: "التشخيص",
    diagnosisPlaceholder: "التشخيص...",
    treatment: "العلاج",
    treatmentPlaceholder: "العلاج والأدوية...",
    visitNotes: "ملاحظات الزيارة",
    visitNotesPlaceholder: "ملاحظات إضافية عن الزيارة...",

    saveVisit: "حفظ الزيارة",
    saving: "جاري الحفظ...",
    cancel: "إلغاء",

    visitHistory: "سجل الزيارات",
    viewExamination: "عرض الكشف",
    noHistory: "لا توجد كشوفات سابقة.",

    visitDetails: "تفاصيل الكشف",
    close: "إغلاق",
    date: "التاريخ",
    time: "الوقت",

    visitSaved: "تم حفظ الزيارة بنجاح.",
    saveError: "تعذر حفظ الزيارة.",
    loadError: "تعذر تحميل بيانات الحيوان.",
    selectPetFirst: "يرجى اختيار حيوان أولًا.",
    deceasedPet: "هذا الحيوان مسجل كمتوفى ولا يمكن تسجيل زيارة جديدة له.",
    deceasedBadge: "متوفى",
    requiredFields: "يرجى اختيار العميل والحيوان.",

    cat: "قط",
    dog: "كلب",
    other: "أخرى",
    male: "ذكر",
    female: "أنثى",
  },
};

function speciesLabel(species: string, t: typeof translations.en) {
  const value = species?.toLowerCase();

  if (value === "cat") return t.cat;
  if (value === "dog") return t.dog;

  return t.other;
}

function genderLabel(gender: string | null, t: typeof translations.en) {
  if (!gender) return "—";

  const value = gender.toLowerCase();

  if (value === "male") return t.male;
  if (value === "female") return t.female;

  return gender;
}

function formatDate(date: string | null, language: Language) {
  if (!date) return "—";

  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

function formatTime(date: string, language: Language) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function calculateAge(
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

function getDelta(
  latest: number | null,
  previous: number | null
): string | null {
  if (latest === null || previous === null) return null;

  const delta = latest - previous;

  if (delta === 0) return "0";

  return delta > 0 ? `+${delta}` : `${delta}`;
}

function WheelPicker({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  defaultValue,
  hint,
  darkMode,
}: {
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultValue: number;
  hint: string;
  darkMode: boolean;
}) {
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const selectedIndexRef = useRef(0);
  const onChangeRef = useRef(onChange);
  const dragStartY = useRef<number | null>(null);
  const dragDistance = useRef(0);

  const values = useMemo(() => {
    const count = Math.round((max - min) / step);
    return Array.from({ length: count + 1 }, (_, index) =>
      Number((min + index * step).toFixed(4))
    );
  }, [min, max, step]);

  const fallbackIndex = Math.max(0, Math.min(
    values.length - 1,
    Math.round((defaultValue - min) / step)
  ));

  const numericValue = value === "" ? null : Number(value);
  const selectedIndex =
    numericValue !== null && Number.isFinite(numericValue)
      ? Math.max(0, Math.min(values.length - 1, Math.round((numericValue - min) / step)))
      : fallbackIndex;

  selectedIndexRef.current = selectedIndex;
  onChangeRef.current = onChange;

  function commitIndex(nextIndex: number) {
    const clamped = Math.max(0, Math.min(values.length - 1, nextIndex));
    onChange(values[clamped].toFixed(step < 0.1 ? 2 : 1));
  }

  function moveBy(delta: number) {
    commitIndex(selectedIndex + delta);
  }

  useEffect(() => {
    const element = pickerRef.current;
    if (!element) return;

    const handleNativeWheel = (event: WheelEvent) => {
      // The picker owns the wheel. Prevent the document from scrolling.
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();

      const delta = event.deltaY > 0 ? 1 : -1;
      const nextIndex = Math.max(
        0,
        Math.min(values.length - 1, selectedIndexRef.current + delta)
      );

      selectedIndexRef.current = nextIndex;
      onChangeRef.current(
        values[nextIndex].toFixed(step < 0.1 ? 2 : 1)
      );
    };

    // Native non-passive listener is intentional here. React/browser scrolling
    // can otherwise remain active while the pointer is over the picker.
    element.addEventListener("wheel", handleNativeWheel, { passive: false });

    return () => {
      element.removeEventListener("wheel", handleNativeWheel);
    };
  }, [step, values]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    dragStartY.current = event.clientY;
    dragDistance.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStartY.current === null) return;
    const delta = dragStartY.current - event.clientY;
    dragDistance.current += delta;
    dragStartY.current = event.clientY;

    const pixelsPerStep = 24;
    while (dragDistance.current >= pixelsPerStep) {
      moveBy(1);
      dragDistance.current -= pixelsPerStep;
    }
    while (dragDistance.current <= -pixelsPerStep) {
      moveBy(-1);
      dragDistance.current += pixelsPerStep;
    }
  }

  function stopDragging(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStartY.current !== null) {
      dragStartY.current = null;
      dragDistance.current = 0;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const itemIndexes = [-2, -1, 0, 1, 2];

  return (
    <div
      ref={pickerRef}
      className={`relative select-none overflow-hidden rounded-2xl border ${
        darkMode
          ? "border-slate-700 bg-slate-950"
          : "border-slate-200 bg-slate-50"
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      style={{ touchAction: "none", overscrollBehavior: "contain" }}
      role="spinbutton"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={numericValue ?? undefined}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveBy(1);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          moveBy(-1);
        }
      }}
    >
      <div
        className={`pointer-events-none absolute inset-x-2 top-1/2 z-10 h-12 -translate-y-1/2 rounded-xl border-2 ${
          darkMode ? "border-blue-500/60 bg-blue-500/10" : "border-blue-500/50 bg-blue-50/70"
        }`}
      />

      <div className="flex h-32 flex-col items-center justify-center gap-0 overflow-hidden">
        {itemIndexes.map((offset) => {
          const rawIndex = selectedIndex + offset;
          const index = Math.max(0, Math.min(values.length - 1, rawIndex));
          const isSelected = offset === 0;
          const displayValue =
            isSelected && numericValue === null ? "—" : values[index].toFixed(1);

          return (
            <div
              key={`${offset}-${index}`}
              className={`flex h-8 items-center justify-center leading-none transition-all duration-100 ${
                isSelected
                  ? darkMode
                    ? "text-2xl font-black text-white"
                    : "text-2xl font-black text-slate-900"
                  : darkMode
                  ? "text-sm font-medium text-slate-500"
                  : "text-sm font-medium text-slate-400"
              }`}
            >
              {displayValue}{isSelected && numericValue !== null ? ` ${unit}` : ""}
            </div>
          );
        })}
      </div>

      <div
        className={`border-t px-3 py-1.5 text-center text-[10px] font-medium ${
          darkMode
            ? "border-slate-800 text-slate-500"
            : "border-slate-200 text-slate-400"
        }`}
      >
        ↕ {hint}
      </div>
    </div>
  );
}

function MiniGraph({
  values,
  color,
  onPointClick,
  unit,
  darkMode,
}: {
  values: {
    value: number;
    visit: Visit;
  }[];
  color: string;
  onPointClick: (visit: Visit) => void;
  unit: string;
  darkMode: boolean;
}) {
  if (values.length === 0) {
    return (
      <div
        className={`flex h-28 items-center justify-center rounded-xl ${
          darkMode ? "bg-slate-800/60" : "bg-slate-50"
        }`}
      >
        <span
          className={`text-xs ${
            darkMode ? "text-slate-500" : "text-slate-400"
          }`}
        >
          No data
        </span>
      </div>
    );
  }

  const ordered = [...values].reverse();

  const numericValues = ordered.map((item) => item.value);

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);

  const range = max - min || 1;

  const width = 300;
  const height = 105;
  const paddingX = 14;
  const paddingY = 16;

  const points = ordered.map((item, index) => {
    const x =
      ordered.length === 1
        ? width / 2
        : paddingX +
          (index / (ordered.length - 1)) * (width - paddingX * 2);

    const normalized = (item.value - min) / range;

    const y =
      height -
      paddingY -
      normalized * (height - paddingY * 2);

    return {
      x,
      y,
      item,
    };
  });

  const path = points
    .map((point, index) =>
      index === 0
        ? `M ${point.x} ${point.y}`
        : `L ${point.x} ${point.y}`
    )
    .join(" ");

  return (
    <div className="relative h-28 w-full overflow-hidden rounded-xl">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          y1="25"
          x2={width}
          y2="25"
          stroke={darkMode ? "#334155" : "#e2e8f0"}
          strokeWidth="1"
        />

        <line
          x1="0"
          y1="53"
          x2={width}
          y2="53"
          stroke={darkMode ? "#334155" : "#e2e8f0"}
          strokeWidth="1"
        />

        <line
          x1="0"
          y1="81"
          x2={width}
          y2="81"
          stroke={darkMode ? "#334155" : "#e2e8f0"}
          strokeWidth="1"
        />

        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((point) => (
          <g key={point.item.visit.id}>
            <circle
              cx={point.x}
              cy={point.y}
              r="7"
              fill={darkMode ? "#0f172a" : "#ffffff"}
              stroke={color}
              strokeWidth="3"
              className="cursor-pointer transition-all duration-200 hover:scale-125"
              onClick={() => onPointClick(point.item.visit)}
            />

            <title>
              {point.item.value} {unit} —{" "}
              {formatDate(point.item.visit.visit_date, "en")}
            </title>
          </g>
        ))}
      </svg>
    </div>
  );
}

function VitalCard({
  title,
  icon,
  latest,
  previous,
  unit,
  color,
  values,
  onPointClick,
  darkMode,
}: {
  title: string;
  icon: string;
  latest: number | null;
  previous: number | null;
  unit: string;
  color: string;
  values: {
    value: number;
    visit: Visit;
  }[];
  onPointClick: (visit: Visit) => void;
  darkMode: boolean;
}) {
  const delta = getDelta(latest, previous);

  return (
    <div
      className={`group rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
        darkMode
          ? "border-slate-800 bg-slate-900 hover:border-slate-700"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-lg">{icon}</span>

            <h3
              className={`text-sm font-semibold ${
                darkMode ? "text-slate-200" : "text-slate-700"
              }`}
            >
              {title}
            </h3>
          </div>

          <div className="flex items-baseline gap-1">
            <span
              className={`text-xl font-bold ${
                darkMode ? "text-white" : "text-slate-900"
              }`}
            >
              {latest !== null ? latest : "—"}
            </span>

            {latest !== null && (
              <span
                className={`text-xs ${
                  darkMode ? "text-slate-500" : "text-slate-400"
                }`}
              >
                {unit}
              </span>
            )}
          </div>
        </div>

        {delta !== null && (
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
              Number(delta) > 0
                ? darkMode
                  ? "bg-emerald-950 text-emerald-400"
                  : "bg-emerald-50 text-emerald-600"
                : Number(delta) < 0
                ? darkMode
                  ? "bg-rose-950 text-rose-400"
                  : "bg-rose-50 text-rose-600"
                : darkMode
                ? "bg-slate-800 text-slate-400"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {delta}
          </span>
        )}
      </div>

      <MiniGraph
        values={values}
        color={color}
        onPointClick={onPointClick}
        unit={unit}
        darkMode={darkMode}
      />

      <div
        className={`mt-2 flex justify-between text-[10px] ${
          darkMode ? "text-slate-500" : "text-slate-400"
        }`}
      >
        <span>
          {previous !== null ? `Prev: ${previous}` : "No previous"}
        </span>

        <span>{values.length} readings</span>
      </div>
    </div>
  );
}

export default function NewVisitPage() {
  const router = useRouter();

  const [language, setLanguage] = useState<Language>("en");
  const [darkMode, setDarkMode] = useState(false);

  const [petFromUrl, setPetFromUrl] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);

  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedPetId, setSelectedPetId] = useState("");

  const [clientSearch, setClientSearch] = useState("");
  const [petSearch, setPetSearch] = useState("");

  const [petDetails, setPetDetails] = useState<PetDetails | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);

  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingPets, setLoadingPets] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [started, setStarted] = useState(false);

  const [reason, setReason] = useState("");
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
  const [vaccinations, setVaccinations] = useState<VaccinationDraft[]>([]);

  const t = translations[language];

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem(
      "vetra-language"
    ) as Language | null;

    const savedDarkMode =
      window.localStorage.getItem("vetra-dark-mode") === "true";

    if (savedLanguage === "en" || savedLanguage === "ar") {
      setLanguage(savedLanguage);
    }

    setDarkMode(savedDarkMode);

    const params = new URLSearchParams(window.location.search);
    setPetFromUrl(params.get("pet"));
  }, []);

  useEffect(() => {
    window.localStorage.setItem("vetra-language", language);

    document.documentElement.lang = language;
    document.documentElement.dir =
      language === "ar" ? "rtl" : "ltr";
  }, [language]);

  useEffect(() => {
    window.localStorage.setItem(
      "vetra-dark-mode",
      darkMode ? "true" : "false"
    );

    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    loadClients();
    loadMedications();
  }, []);

  useEffect(() => {
    if (!selectedClientId) {
      setPets([]);
      setSelectedPetId("");
      return;
    }

    loadPets(selectedClientId);
  }, [selectedClientId]);

  useEffect(() => {
    if (!petFromUrl) return;

    loadPetFromUrl(petFromUrl);
  }, [petFromUrl]);

  async function loadClients() {
    setLoadingClients(true);

    try {
      const db = await getClinicDb();

      const { data, error } = await db
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("LOAD CLIENTS ERROR:", error);
        setMessage(error.message);
      } else {
        setClients(data || []);
      }
    } catch (error) {
      console.error("LOAD CLIENTS ERROR:", error);
      setMessage(error instanceof Error ? error.message : t.loadError);
    } finally {
      setLoadingClients(false);
    }
  }

  async function loadPets(clientId: string) {
    setLoadingPets(true);

    try {
      const db = await getClinicDb();

      const { data, error } = await db
        .from("pets")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("LOAD PETS ERROR:", error);
        setMessage(error.message);
      } else {
        setPets(data || []);
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
      setStarted(true);
    } catch (error) {
      console.error("LOAD PET FROM URL ERROR:", error);
      setMessage(error instanceof Error ? error.message : t.loadError);
    } finally {
      setLoadingDetails(false);
    }
  }

  async function loadVisits(petId: string) {
    try {
      const db = await getClinicDb();

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

      setVisits(data || []);
    } catch (error) {
      console.error("LOAD VISITS ERROR:", error);
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
      setStarted(true);
    } catch (error) {
      console.error("START EXAMINATION ERROR:", error);
      setMessage(error instanceof Error ? error.message : t.loadError);
    } finally {
      setLoadingDetails(false);
    }
  }

  async function loadMedications() {
    try {
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
      setMedications((data || []) as Medication[]);
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

  function calculateMedicationDraft(med: Medication): MedicationDraft | null {
    const w = Number(weight);
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

  function addMedication() {
    const med = medications.find((item) => item.id === selectedMedicationId);
    if (!med) return;
    const draft = calculateMedicationDraft(med);
    if (!draft) {
      setMessage(language === "ar" ? "أدخل وزن الحيوان أولًا وتأكد أن الدواء له جرعة مسجلة." : "Enter the pet weight and make sure the medication has a configured dose.");
      return;
    }
    setMedicationDrafts((current) => [...current, draft]);
    setSelectedMedicationId("");
  }

  function removeMedication(id: string) {
    setMedicationDrafts((current) => current.filter((item) => item.id !== id));
  }

  function addVaccination() {
    setVaccinations((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        vaccine_name: "",
        vaccine_type: "",
        administered_at: new Date().toISOString().slice(0, 16),
        next_dose_at: "",
        dose: "",
        route: "",
        batch_number: "",
        manufacturer: "",
        notes: "",
      },
    ]);
  }

  function updateVaccination(id: string, patch: Partial<VaccinationDraft>) {
    setVaccinations((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function removeVaccination(id: string) {
    setVaccinations((current) => current.filter((item) => item.id !== id));
  }

  const selectedFollowUpLabel = useMemo(() => {
    const labels: Record<string, string> = language === "ar"
      ? { none: t.followUpNone, "3d": t.followUp3Days, "1w": t.followUp1Week, "2w": t.followUp2Weeks, "1m": t.followUp1Month, custom: t.followUpCustom }
      : { none: t.followUpNone, "3d": t.followUp3Days, "1w": t.followUp1Week, "2w": t.followUp2Weeks, "1m": t.followUp1Month, custom: t.followUpCustom };
    return labels[followUp] || "";
  }, [followUp, language, t]);

  async function saveVisit() {
    setMessage("");

    if (!selectedPetId || !selectedClientId) {
      setMessage(t.requiredFields);
      return;
    }

    if (petDetails?.is_deceased) {
      setMessage(t.deceasedPet);
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
      if (currentPet.is_deceased) {
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
      const finalTreatment = [treatment.trim(), medicationText].filter(Boolean).join("\n\n");
      const finalExamination =
        examStatus === "normal"
          ? "Normal"
          : examStatus === "abnormal"
          ? examination.trim()
            ? `Abnormal: ${examination.trim()}`
            : "Abnormal"
          : examination.trim();
      const followUpText = followUp && followUp !== "none"
        ? `Follow-up: ${selectedFollowUpLabel}${followUp === "custom" && followUpDetails.trim() ? ` — ${followUpDetails.trim()}` : ""}`
        : "";
      const finalVisitNotes = [visitNotes.trim(), followUpText].filter(Boolean).join("\n\n");

      const { data: visit, error: visitError } = await db
        .from("visits")
        .insert({
          client_id: selectedClientId,
          pet_id: selectedPetId,
          reason: reason.trim() || null,
          examination: finalExamination || null,
          diagnosis: diagnosis.trim() || null,
          treatment: finalTreatment || null,
          weight: weight ? Number(weight) : null,
          temperature: temperature ? Number(temperature) : null,
          heart_rate: heartRate ? Number(heartRate) : null,
          respiratory_rate: respiratoryRate ? Number(respiratoryRate) : null,
          notes: finalVisitNotes || null,
        })
        .select("id")
        .single();

      if (visitError || !visit) throw visitError || new Error(t.saveError);

      if (medicationDrafts.length) {
        const medicationRows = medicationDrafts.map((draft) => ({
          clinic_id: clinicContext.clinic_id,
          visit_id: visit.id,
          medication_id: draft.medication_id,
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
        const { error: medError } = await db.from("visit_medications").insert(medicationRows);
        if (medError) throw medError;
      }

      const validVaccinations = vaccinations.filter((v) => v.vaccine_name.trim());
      if (validVaccinations.length) {
        const vaccineRows = validVaccinations.map((v) => ({
          clinic_id: clinicContext.clinic_id,
          visit_id: visit.id,
          pet_id: selectedPetId,
          client_id: selectedClientId,
          vaccine_name: v.vaccine_name.trim(),
          vaccine_type: v.vaccine_type.trim() || null,
          administered_at: v.administered_at ? new Date(v.administered_at).toISOString() : new Date().toISOString(),
          next_dose_at: v.next_dose_at ? new Date(v.next_dose_at).toISOString() : null,
          dose: v.dose.trim() || null,
          route: v.route.trim() || null,
          batch_number: v.batch_number.trim() || null,
          manufacturer: v.manufacturer.trim() || null,
          notes: v.notes.trim() || null,
        }));
        const { error: vaccineError } = await db.from("vaccinations").insert(vaccineRows);
        if (vaccineError) throw vaccineError;
      }

      setMessage(t.visitSaved);

      setReason("");
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
      setVaccinations([]);

      await loadVisits(selectedPetId);

      router.push(
        `/prescriptions/${encodeURIComponent(visit.id)}`
      );
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

  const latestVisit = visits[0] || null;

  const vitalData = useMemo(
    () => ({
      weight: visits
        .filter((visit) => visit.weight !== null)
        .map((visit) => ({
          value: Number(visit.weight),
          visit,
        })),

      temperature: visits
        .filter((visit) => visit.temperature !== null)
        .map((visit) => ({
          value: Number(visit.temperature),
          visit,
        })),

      heartRate: visits
        .filter((visit) => visit.heart_rate !== null)
        .map((visit) => ({
          value: Number(visit.heart_rate),
          visit,
        })),

      respiratoryRate: visits
        .filter((visit) => visit.respiratory_rate !== null)
        .map((visit) => ({
          value: Number(visit.respiratory_rate),
          visit,
        })),
    }),
    [visits]
  );

  const latestWeight = vitalData.weight[0]?.value ?? null;
  const previousWeight = vitalData.weight[1]?.value ?? null;

  const latestTemperature =
    vitalData.temperature[0]?.value ?? null;

  const previousTemperature =
    vitalData.temperature[1]?.value ?? null;

  const latestHeartRate =
    vitalData.heartRate[0]?.value ?? null;

  const previousHeartRate =
    vitalData.heartRate[1]?.value ?? null;

  const latestRespiratoryRate =
    vitalData.respiratoryRate[0]?.value ?? null;

  const previousRespiratoryRate =
    vitalData.respiratoryRate[1]?.value ?? null;

  const pageClasses = darkMode
    ? "min-h-screen bg-slate-950 text-slate-100"
    : "min-h-screen bg-slate-50 text-slate-900";

  return (
    <main
      dir={language === "ar" ? "rtl" : "ltr"}
      className={pageClasses}
    >
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* HEADER */}
        <header
          className={`mb-8 flex flex-col gap-4 rounded-3xl border p-5 shadow-sm transition-colors duration-300 sm:flex-row sm:items-center sm:justify-between ${
            darkMode
              ? "border-slate-800 bg-slate-900"
              : "border-slate-200 bg-white"
          }`}
        >
          <div>
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-xl text-white shadow-lg shadow-blue-600/20">
                🩺
              </div>

              <div>
                <h1
                  className={`text-2xl font-bold tracking-tight ${
                    darkMode ? "text-white" : "text-slate-900"
                  }`}
                >
                  {t.title}
                </h1>

                <p
                  className={`text-sm ${
                    darkMode ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  {t.subtitle}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                darkMode
                  ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              🏠 {t.dashboard}
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
              🌐 {t.language}
            </button>

            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              aria-label={darkMode ? t.light : t.dark}
              className={`flex h-11 w-11 items-center justify-center rounded-xl border text-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                darkMode
                  ? "border-slate-700 bg-slate-800 hover:bg-slate-700"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              {darkMode ? "☀️" : "🌙"}
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

        {/* SELECTION */}
        {!started && (
          <section className="grid gap-6 lg:grid-cols-2">
            {/* CLIENT */}
            <div
              className={`rounded-3xl border p-6 shadow-sm transition-all duration-300 ${
                darkMode
                  ? "border-slate-800 bg-slate-900"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2
                    className={`text-lg font-bold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    👤 {t.selectClient}
                  </h2>

                  <p
                    className={`mt-1 text-sm ${
                      darkMode ? "text-slate-400" : "text-slate-500"
                    }`}
                  >
                    {t.selectClientHint}
                  </p>
                </div>

                <Link
                  href="/clients/new"
                  className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-lg"
                >
                  + {t.addClient}
                </Link>
              </div>

              <input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder={t.searchClient}
                className={`mb-4 w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                  darkMode
                    ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                    : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                }`}
              />

              <div className="max-h-80 space-y-2 overflow-y-auto">
                {loadingClients ? (
                  <div
                    className={`rounded-xl p-4 text-center text-sm ${
                      darkMode
                        ? "bg-slate-800 text-slate-400"
                        : "bg-slate-50 text-slate-500"
                    }`}
                  >
                    Loading...
                  </div>
                ) : filteredClients.length === 0 ? (
                  <div
                    className={`rounded-xl p-4 text-center text-sm ${
                      darkMode
                        ? "bg-slate-800 text-slate-400"
                        : "bg-slate-50 text-slate-500"
                    }`}
                  >
                    {t.noClients}
                  </div>
                ) : (
                  filteredClients.map((client) => {
                    const active =
                      selectedClientId === client.id;

                    return (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => {
                          setSelectedClientId(client.id);
                          setSelectedPetId("");
                          setPetSearch("");
                        }}
                        className={`w-full rounded-2xl border p-4 text-start transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                          active
                            ? "border-blue-500 bg-blue-50 shadow-md dark:border-blue-500 dark:bg-blue-950/40"
                            : darkMode
                            ? "border-slate-800 bg-slate-950 hover:border-slate-700"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div
                              className={`font-semibold ${
                                darkMode
                                  ? "text-white"
                                  : "text-slate-900"
                              }`}
                            >
                              {client.name}
                            </div>

                            {client.phone && (
                              <div
                                className={`mt-1 text-xs ${
                                  darkMode
                                    ? "text-slate-500"
                                    : "text-slate-500"
                                }`}
                              >
                                {client.phone}
                              </div>
                            )}
                          </div>

                          {active && (
                            <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-bold text-white">
                              ✓
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* PET */}
            <div
              className={`rounded-3xl border p-6 shadow-sm transition-all duration-300 ${
                darkMode
                  ? "border-slate-800 bg-slate-900"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2
                    className={`text-lg font-bold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    🐾 {t.selectPet}
                  </h2>

                  <p
                    className={`mt-1 text-sm ${
                      darkMode ? "text-slate-400" : "text-slate-500"
                    }`}
                  >
                    {t.selectPetHint}
                  </p>
                </div>

                <Link
                  href={
                    selectedClientId
                      ? `/clients/${selectedClientId}`
                      : "/clients"
                  }
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    darkMode
                      ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  + {t.addPet}
                </Link>
              </div>

              <input
                value={petSearch}
                onChange={(e) => setPetSearch(e.target.value)}
                disabled={!selectedClientId}
                placeholder={t.searchPet}
                className={`mb-4 w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 ${
                  darkMode
                    ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                    : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                }`}
              />

              <div className="max-h-80 space-y-2 overflow-y-auto">
                {!selectedClientId ? (
                  <div
                    className={`rounded-xl p-5 text-center text-sm ${
                      darkMode
                        ? "bg-slate-800 text-slate-500"
                        : "bg-slate-50 text-slate-400"
                    }`}
                  >
                    {t.selectClientHint}
                  </div>
                ) : loadingPets ? (
                  <div
                    className={`rounded-xl p-4 text-center text-sm ${
                      darkMode
                        ? "bg-slate-800 text-slate-400"
                        : "bg-slate-50 text-slate-500"
                    }`}
                  >
                    Loading...
                  </div>
                ) : filteredPets.length === 0 ? (
                  <div
                    className={`rounded-xl p-4 text-center text-sm ${
                      darkMode
                        ? "bg-slate-800 text-slate-400"
                        : "bg-slate-50 text-slate-500"
                    }`}
                  >
                    {t.noPets}
                  </div>
                ) : (
                  filteredPets.map((pet) => {
                    const active = selectedPetId === pet.id;

                    return (
                      <button
                        key={pet.id}
                        type="button"
                        onClick={() => setSelectedPetId(pet.id)}
                        className={`w-full rounded-2xl border p-4 text-start transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                          active
                            ? "border-emerald-500 bg-emerald-50 shadow-md dark:border-emerald-500 dark:bg-emerald-950/40"
                            : darkMode
                            ? "border-slate-800 bg-slate-950 hover:border-slate-700"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-xl">
                              {pet.species?.toLowerCase() === "cat"
                                ? "🐱"
                                : pet.species?.toLowerCase() ===
                                  "dog"
                                ? "🐶"
                                : "🐾"}
                            </div>

                            <div>
                              <div
                                className={`font-semibold ${
                                  darkMode
                                    ? "text-white"
                                    : "text-slate-900"
                                }`}
                              >
                                {pet.name}
                              </div>

                              <div
                                className={`mt-1 text-xs ${
                                  darkMode
                                    ? "text-slate-500"
                                    : "text-slate-500"
                                }`}
                              >
                                {speciesLabel(pet.species, t)}
                                {pet.breed
                                  ? ` • ${pet.breed}`
                                  : ""}
                              </div>
                            </div>
                          </div>

                          {active && (
                            <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white">
                              ✓
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        )}

        {/* START BUTTON */}
        {!started && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={startExamination}
              disabled={!selectedClientId || !selectedPetId || loadingDetails}
              className="rounded-2xl bg-slate-900 px-8 py-4 text-sm font-bold text-white shadow-lg shadow-slate-900/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40 dark:bg-blue-600 dark:shadow-blue-600/20"
            >
              {loadingDetails
                ? "Loading..."
                : `🩺 ${t.startExam}`}
            </button>
          </div>
        )}

        {/* EXAMINATION */}
        {started && petDetails && (
          <div className="space-y-6">
            {/* PATIENT HEADER */}
            <section
              className={`overflow-hidden rounded-3xl border shadow-sm transition-all duration-300 ${
                darkMode
                  ? "border-slate-800 bg-slate-900"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-3xl text-white shadow-lg shadow-blue-500/20">
                    {petDetails.species?.toLowerCase() === "cat"
                      ? "🐱"
                      : petDetails.species?.toLowerCase() ===
                        "dog"
                      ? "🐶"
                      : "🐾"}
                  </div>

                  <div>
                    <div
                      className={`mb-1 text-2xl font-bold ${
                        darkMode ? "text-white" : "text-slate-900"
                      }`}
                    >
                      {petDetails.name}
                    </div>

                    <div
                      className={`text-sm ${
                        darkMode
                          ? "text-slate-400"
                          : "text-slate-500"
                      }`}
                    >
                      {speciesLabel(petDetails.species, t)}
                      {petDetails.breed
                        ? ` • ${petDetails.breed}`
                        : ""}
                      {petDetails.gender
                        ? ` • ${genderLabel(
                            petDetails.gender,
                            t
                          )}`
                        : ""}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetSelection}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    darkMode
                      ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  ← {t.changeSelection}
                </button>
              </div>
            </section>

            {/* PATIENT SUMMARY */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2
                    className={`text-xl font-bold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {t.patientSummary}
                  </h2>

                  <p
                    className={`mt-1 text-sm ${
                      darkMode
                        ? "text-slate-500"
                        : "text-slate-500"
                    }`}
                  >
                    {t.previousVisits}: {visits.length}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div
                  className={`rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                    darkMode
                      ? "border-slate-800 bg-slate-900"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="mb-3 text-xl">👤</div>

                  <div
                    className={`text-xs ${
                      darkMode
                        ? "text-slate-500"
                        : "text-slate-400"
                    }`}
                  >
                    {t.owner}
                  </div>

                  <div
                    className={`mt-1 font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {petDetails.client?.name || "—"}
                  </div>

                  {petDetails.client?.phone && (
                    <div
                      className={`mt-1 text-xs ${
                        darkMode
                          ? "text-slate-500"
                          : "text-slate-500"
                      }`}
                    >
                      {petDetails.client.phone}
                    </div>
                  )}
                </div>

                <div
                  className={`rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                    darkMode
                      ? "border-slate-800 bg-slate-900"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="mb-3 text-xl">🐾</div>

                  <div
                    className={`text-xs ${
                      darkMode
                        ? "text-slate-500"
                        : "text-slate-400"
                    }`}
                  >
                    {t.breed}
                  </div>

                  <div
                    className={`mt-1 font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {petDetails.breed || "—"}
                  </div>
                </div>

                <div
                  className={`rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                    darkMode
                      ? "border-slate-800 bg-slate-900"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="mb-3 text-xl">🎂</div>

                  <div
                    className={`text-xs ${
                      darkMode
                        ? "text-slate-500"
                        : "text-slate-400"
                    }`}
                  >
                    {t.birthDate}
                  </div>

                  <div
                    className={`mt-1 font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {petDetails.birth_date
                      ? calculateAge(
                          petDetails.birth_date,
                          language
                        )
                      : "—"}
                  </div>

                  {petDetails.birth_date && (
                    <div
                      className={`mt-1 text-xs ${
                        darkMode
                          ? "text-slate-500"
                          : "text-slate-500"
                      }`}
                    >
                      {formatDate(
                        petDetails.birth_date,
                        language
                      )}
                    </div>
                  )}
                </div>

                <div
                  className={`rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                    darkMode
                      ? "border-slate-800 bg-slate-900"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="mb-3 text-xl">🆔</div>

                  <div
                    className={`text-xs ${
                      darkMode
                        ? "text-slate-500"
                        : "text-slate-400"
                    }`}
                  >
                    {t.microchip}
                  </div>

                  <div
                    className={`mt-1 break-all font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {petDetails.microchip || "—"}
                  </div>
                </div>
              </div>
            </section>

            {/* IMPORTANT NOTES */}
            <section
              className={`rounded-2xl border p-5 transition-all duration-300 ${
                darkMode
                  ? "border-amber-900/50 bg-amber-950/20"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="text-xl">⚠️</div>

                <div>
                  <h3
                    className={`font-bold ${
                      darkMode
                        ? "text-amber-300"
                        : "text-amber-900"
                    }`}
                  >
                    {t.importantNotes}
                  </h3>

                  <p
                    className={`mt-1 whitespace-pre-wrap text-sm ${
                      darkMode
                        ? "text-amber-200/70"
                        : "text-amber-800/80"
                    }`}
                  >
                    {petDetails.notes || t.noNotes}
                  </p>
                </div>
              </div>
            </section>

            {/* LAST VISIT SUMMARY */}
            <section className="grid gap-4 lg:grid-cols-3">
              <div
                className={`rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                  darkMode
                    ? "border-slate-800 bg-slate-900"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="mb-3 flex items-center gap-2">
                  <span>📅</span>

                  <h3
                    className={`font-bold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {t.lastVisit}
                  </h3>
                </div>

                <div
                  className={`text-sm ${
                    darkMode
                      ? "text-slate-400"
                      : "text-slate-600"
                  }`}
                >
                  {latestVisit
                    ? formatDate(
                        latestVisit.visit_date,
                        language
                      )
                    : t.noPreviousVisits}
                </div>
              </div>

              <div
                className={`rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                  darkMode
                    ? "border-slate-800 bg-slate-900"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="mb-3 flex items-center gap-2">
                  <span>🩺</span>

                  <h3
                    className={`font-bold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {t.lastDiagnosis}
                  </h3>
                </div>

                <div
                  className={`line-clamp-3 text-sm ${
                    darkMode
                      ? "text-slate-400"
                      : "text-slate-600"
                  }`}
                >
                  {latestVisit?.diagnosis ||
                    t.noDiagnosis}
                </div>
              </div>

              <div
                className={`rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                  darkMode
                    ? "border-slate-800 bg-slate-900"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="mb-3 flex items-center gap-2">
                  <span>💊</span>

                  <h3
                    className={`font-bold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {t.lastTreatment}
                  </h3>
                </div>

                <div
                  className={`line-clamp-3 text-sm ${
                    darkMode
                      ? "text-slate-400"
                      : "text-slate-600"
                  }`}
                >
                  {latestVisit?.treatment ||
                    t.noTreatment}
                </div>
              </div>
            </section>

            {/* VITAL GRAPHS */}
            <section>
              <div className="mb-4">
                <h2
                  className={`text-xl font-bold ${
                    darkMode ? "text-white" : "text-slate-900"
                  }`}
                >
                  📈 {t.trends}
                </h2>

                <p
                  className={`mt-1 text-sm ${
                    darkMode
                      ? "text-slate-500"
                      : "text-slate-500"
                  }`}
                >
                  Click any point to open that examination.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <VitalCard
                  title={t.weight}
                  icon="⚖️"
                  latest={latestWeight}
                  previous={previousWeight}
                  unit={t.kg}
                  color="#3b82f6"
                  values={vitalData.weight}
                  onPointClick={setSelectedOldVisit}
                  darkMode={darkMode}
                />

                <VitalCard
                  title={t.temperature}
                  icon="🌡️"
                  latest={latestTemperature}
                  previous={previousTemperature}
                  unit={t.celsius}
                  color="#f97316"
                  values={vitalData.temperature}
                  onPointClick={setSelectedOldVisit}
                  darkMode={darkMode}
                />

                <VitalCard
                  title={t.heartRate}
                  icon="❤️"
                  latest={latestHeartRate}
                  previous={previousHeartRate}
                  unit={t.bpm}
                  color="#ef4444"
                  values={vitalData.heartRate}
                  onPointClick={setSelectedOldVisit}
                  darkMode={darkMode}
                />

                <VitalCard
                  title={t.respiratoryRate}
                  icon="🫁"
                  latest={latestRespiratoryRate}
                  previous={previousRespiratoryRate}
                  unit={t.rpm}
                  color="#8b5cf6"
                  values={vitalData.respiratoryRate}
                  onPointClick={setSelectedOldVisit}
                  darkMode={darkMode}
                />
              </div>
            </section>

            {/* CURRENT EXAM */}
            <section
              className={`rounded-3xl border p-6 shadow-sm transition-colors duration-300 ${
                darkMode
                  ? "border-slate-800 bg-slate-900"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="mb-6">
                <h2
                  className={`text-xl font-bold ${
                    darkMode ? "text-white" : "text-slate-900"
                  }`}
                >
                  🩺 {t.examination}
                </h2>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="lg:col-span-2">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label
                      className={`block text-sm font-semibold ${
                        darkMode ? "text-slate-300" : "text-slate-700"
                      }`}
                    >
                      {t.reason}
                    </label>
                    <span className={`text-[11px] font-medium ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                      {t.quickReasons}
                    </span>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-2">
                    {t.reasons.map((label, index) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setReason(label)}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold transition-all ${
                          reason === label
                            ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                            : darkMode
                            ? "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t.reasonPlaceholder}
                    className={`w-full rounded-xl border px-4 py-3 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                      darkMode
                        ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                        : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                    }`}
                  />
                </div>

                <div className="lg:col-span-2">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label
                      className={`block text-sm font-semibold ${
                        darkMode ? "text-slate-300" : "text-slate-700"
                      }`}
                    >
                      {t.examinationNotes}
                    </label>
                    <span className={`text-[11px] ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                      {examStatus === "normal" ? t.examinationNormalHint : t.examinationDetails}
                    </span>
                  </div>

                  <div className="mb-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setExamStatus("normal");
                        setExamination("");
                      }}
                      className={`rounded-2xl border px-4 py-3 text-sm font-bold transition-all ${
                        examStatus === "normal"
                          ? "border-emerald-500 bg-emerald-600 text-white shadow-md"
                          : darkMode
                          ? "border-slate-700 bg-slate-950 text-slate-300 hover:border-emerald-500/50"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-emerald-300"
                      }`}
                    >
                      ✓ {t.examNormal}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExamStatus("abnormal")}
                      className={`rounded-2xl border px-4 py-3 text-sm font-bold transition-all ${
                        examStatus === "abnormal"
                          ? "border-rose-500 bg-rose-600 text-white shadow-md"
                          : darkMode
                          ? "border-slate-700 bg-slate-950 text-slate-300 hover:border-rose-500/50"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-rose-300"
                      }`}
                    >
                      ! {t.examAbnormal}
                    </button>
                  </div>

                  {examStatus !== "normal" && (
                    <textarea
                      rows={5}
                      value={examination}
                      onChange={(e) => {
                        setExamination(e.target.value);
                        if (e.target.value.trim()) setExamStatus("abnormal");
                      }}
                      placeholder={t.examinationPlaceholder}
                      className={`w-full resize-none rounded-xl border px-4 py-3 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                        darkMode
                          ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                          : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                      }`}
                    />
                  )}

                  {examStatus === "normal" && (
                    <div
                      className={`rounded-2xl border px-4 py-4 text-sm ${
                        darkMode
                          ? "border-emerald-900/70 bg-emerald-950/30 text-emerald-300"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      ✓ {t.examinationNormalHint}
                    </div>
                  )}
                </div>

                <div>
                  <label
                    className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    {t.weight}
                  </label>
                  <WheelPicker
                    value={weight}
                    onChange={setWeight}
                    min={0.1}
                    max={100}
                    step={0.1}
                    unit={t.kg}
                    defaultValue={5}
                    hint={t.wheelSwipeHint}
                    darkMode={darkMode}
                  />
                </div>

                <div>
                  <label
                    className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    {t.temperature}
                  </label>
                  <WheelPicker
                    value={temperature}
                    onChange={setTemperature}
                    min={34}
                    max={42}
                    step={0.1}
                    unit={t.celsius}
                    defaultValue={38.5}
                    hint={t.wheelSwipeHint}
                    darkMode={darkMode}
                  />
                </div>

                <div>
                  <label
                    className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    {t.heartRate}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={heartRate}
                    onChange={(e) => setHeartRate(e.target.value)}
                    placeholder="120"
                    className={`w-full rounded-xl border px-4 py-3 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                      darkMode
                        ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                        : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                    }`}
                  />
                </div>

                <div>
                  <label
                    className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    {t.respiratoryRate}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={respiratoryRate}
                    onChange={(e) => setRespiratoryRate(e.target.value)}
                    placeholder="30"
                    className={`w-full rounded-xl border px-4 py-3 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                      darkMode
                        ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                        : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                    }`}
                  />
                </div>

                <div>
                  <label
                    className={`mb-2 block text-sm font-semibold ${
                      darkMode
                        ? "text-slate-300"
                        : "text-slate-700"
                    }`}
                  >
                    {t.diagnosis}
                  </label>

                  <textarea
                    rows={4}
                    value={diagnosis}
                    onChange={(e) =>
                      setDiagnosis(e.target.value)
                    }
                    placeholder={t.diagnosisPlaceholder}
                    className={`w-full resize-none rounded-xl border px-4 py-3 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                      darkMode
                        ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                        : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                    }`}
                  />
                </div>

                <div className="lg:col-span-2">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <label className={`block text-sm font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{t.treatment}</label>
                    <span className="rounded-full bg-blue-500/10 px-3 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-300">Medication Library + dose calculator</span>
                  </div>

                  <div className={`rounded-2xl border p-4 ${darkMode ? "border-slate-700 bg-slate-950/60" : "border-slate-200 bg-slate-50"}`}>
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <div>
                        <input value={medicationSearch} onChange={(e) => setMedicationSearch(e.target.value)} placeholder={language === "ar" ? "ابحث عن دواء..." : "Search medication..."} className={`mb-2 w-full rounded-xl border px-3 py-2 text-sm outline-none ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`} />
                        <select value={selectedMedicationId} onChange={(e) => setSelectedMedicationId(e.target.value)} className={`w-full rounded-xl border px-3 py-3 text-sm outline-none ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`}>
                          <option value="">{language === "ar" ? "اختار دواء من المكتبة" : "Select medication from library"}</option>
                          {filteredMedications.map((med) => (
                            <option key={med.id} value={med.id}>{med.name}{med.active_ingredient ? ` — ${med.active_ingredient}` : ""}</option>
                          ))}
                        </select>
                      </div>
                      <button type="button" onClick={addMedication} className="self-end rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700">+ {language === "ar" ? "إضافة دواء" : "Add medication"}</button>
                    </div>

                    {medicationDrafts.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {medicationDrafts.map((draft) => {
                          const med = medications.find((item) => item.id === draft.medication_id);
                          const outside = (med?.dose_min != null && draft.dose_per_kg != null && draft.dose_per_kg < Number(med.dose_min)) || (med?.dose_max != null && draft.dose_per_kg != null && draft.dose_per_kg > Number(med.dose_max));
                          return (
                            <div key={draft.id} className={`rounded-xl border p-3 ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-bold">{med?.name || "Medication"}</div>
                                  <div className="mt-1 text-xs text-slate-500">Dose: {draft.calculated_dose} {draft.calculated_dose_unit}{draft.calculated_volume != null ? ` • ${draft.calculated_volume} ${draft.volume_unit}` : ""} {draft.route ? ` • ${draft.route}` : ""} {draft.frequency ? ` • ${draft.frequency}` : ""} {draft.duration_days ? ` • ${draft.duration_days} days` : ""}</div>
                                  {outside && <div className="mt-1 text-xs font-bold text-amber-600">⚠ Dose is outside the configured protocol range.</div>}
                                </div>
                                <button type="button" onClick={() => removeMedication(draft.id)} className="rounded-lg px-2 py-1 text-rose-500 hover:bg-rose-50">✕</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <textarea rows={4} value={treatment} onChange={(e) => setTreatment(e.target.value)} placeholder={t.treatmentPlaceholder} className={`mt-4 w-full resize-none rounded-xl border px-4 py-3 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${darkMode ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"}`} />
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label className={`block text-sm font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{language === "ar" ? "التطعيمات" : "Vaccinations"}</label>
                    <button type="button" onClick={addVaccination} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">+ {language === "ar" ? "إضافة تطعيم" : "Add vaccine"}</button>
                  </div>
                  {vaccinations.length === 0 ? (
                    <div className={`rounded-2xl border border-dashed p-4 text-xs text-slate-500 ${darkMode ? "border-slate-700" : "border-slate-200"}`}>{language === "ar" ? "لا يوجد تطعيم مضاف لهذه الزيارة." : "No vaccination added to this visit."}</div>
                  ) : (
                    <div className="space-y-3">
                      {vaccinations.map((v) => (
                        <div key={v.id} className={`rounded-2xl border p-4 ${darkMode ? "border-slate-700 bg-slate-950/60" : "border-slate-200 bg-slate-50"}`}>
                          <div className="grid gap-3 md:grid-cols-2">
                            <input value={v.vaccine_name} onChange={(e) => updateVaccination(v.id,{vaccine_name:e.target.value})} placeholder={language === "ar" ? "اسم التطعيم" : "Vaccine name"} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <input value={v.vaccine_type} onChange={(e) => updateVaccination(v.id,{vaccine_type:e.target.value})} placeholder={language === "ar" ? "النوع" : "Type"} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <input type="datetime-local" value={v.administered_at} onChange={(e) => updateVaccination(v.id,{administered_at:e.target.value})} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <input type="datetime-local" value={v.next_dose_at} onChange={(e) => updateVaccination(v.id,{next_dose_at:e.target.value})} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <input value={v.dose} onChange={(e) => updateVaccination(v.id,{dose:e.target.value})} placeholder={language === "ar" ? "الجرعة" : "Dose"} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <input value={v.route} onChange={(e) => updateVaccination(v.id,{route:e.target.value})} placeholder={language === "ar" ? "طريقة الإعطاء" : "Route"} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <input value={v.batch_number} onChange={(e) => updateVaccination(v.id,{batch_number:e.target.value})} placeholder={language === "ar" ? "رقم التشغيلة" : "Batch number"} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <input value={v.manufacturer} onChange={(e) => updateVaccination(v.id,{manufacturer:e.target.value})} placeholder={language === "ar" ? "الشركة المصنعة" : "Manufacturer"} className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                            <textarea value={v.notes} onChange={(e) => updateVaccination(v.id,{notes:e.target.value})} placeholder={language === "ar" ? "ملاحظات التطعيم" : "Vaccination notes"} className={`md:col-span-2 rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} />
                          </div>
                          <button type="button" onClick={() => removeVaccination(v.id)} className="mt-3 text-xs font-bold text-rose-500">{language === "ar" ? "حذف التطعيم" : "Remove vaccine"}</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>


                <div className="lg:col-span-2">
                  <label
                    className={`mb-2 block text-sm font-semibold ${
                      darkMode
                        ? "text-slate-300"
                        : "text-slate-700"
                    }`}
                  >
                    {t.visitNotes}
                  </label>

                  <textarea
                    rows={3}
                    value={visitNotes}
                    onChange={(e) =>
                      setVisitNotes(e.target.value)
                    }
                    placeholder={t.visitNotesPlaceholder}
                    className={`w-full resize-none rounded-xl border px-4 py-3 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                      darkMode
                        ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                        : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                    }`}
                  />
                </div>

                <div className="lg:col-span-2">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label
                      className={`block text-sm font-semibold ${
                        darkMode ? "text-slate-300" : "text-slate-700"
                      }`}
                    >
                      {t.followUp}
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[
                      ["none", t.followUpNone],
                      ["3d", t.followUp3Days],
                      ["1w", t.followUp1Week],
                      ["2w", t.followUp2Weeks],
                      ["1m", t.followUp1Month],
                      ["custom", t.followUpCustom],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFollowUp(key)}
                        className={`rounded-full border px-4 py-2 text-xs font-bold transition-all ${
                          followUp === key
                            ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                            : darkMode
                            ? "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {followUp === "custom" && (
                    <input
                      value={followUpDetails}
                      onChange={(e) => setFollowUpDetails(e.target.value)}
                      placeholder={t.followUpPlaceholder}
                      className={`mt-3 w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                        darkMode
                          ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                          : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                      }`}
                    />
                  )}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={saveVisit}
                  disabled={saving}
                  className="rounded-2xl bg-blue-600 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all duration-300 hover:-translate-y-1 hover:bg-blue-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? t.saving : `✓ ${t.saveVisit}`}
                </button>
              </div>
            </section>

            {/* VISIT HISTORY */}
            <section>
              <div className="mb-4">
                <h2
                  className={`text-xl font-bold ${
                    darkMode ? "text-white" : "text-slate-900"
                  }`}
                >
                  📋 {t.visitHistory}
                </h2>
              </div>

              {visits.length === 0 ? (
                <div
                  className={`rounded-2xl border p-8 text-center ${
                    darkMode
                      ? "border-slate-800 bg-slate-900 text-slate-500"
                      : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {t.noHistory}
                </div>
              ) : (
                <div className="space-y-3">
                  {visits.map((visit, index) => (
                    <div
                      key={visit.id}
                      className={`group rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
                        darkMode
                          ? "border-slate-800 bg-slate-900 hover:border-slate-700"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-4">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold ${
                              index === 0
                                ? "bg-blue-600 text-white"
                                : darkMode
                                ? "bg-slate-800 text-slate-400"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {index === 0 ? "★" : index + 1}
                          </div>

                          <div>
                            <div
                              className={`font-semibold ${
                                darkMode
                                  ? "text-white"
                                  : "text-slate-900"
                              }`}
                            >
                              {formatDate(
                                visit.visit_date,
                                language
                              )}
                            </div>

                            <div
                              className={`mt-1 text-xs ${
                                darkMode
                                  ? "text-slate-500"
                                  : "text-slate-500"
                              }`}
                            >
                              {formatTime(
                                visit.visit_date,
                                language
                              )}
                            </div>

                            {visit.reason && (
                              <div
                                className={`mt-3 text-sm ${
                                  darkMode
                                    ? "text-slate-300"
                                    : "text-slate-600"
                                }`}
                              >
                                {visit.reason}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {visit.weight !== null && (
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                darkMode
                                  ? "bg-blue-950 text-blue-300"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              ⚖️ {visit.weight} {t.kg}
                            </span>
                          )}

                          {visit.temperature !== null && (
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                darkMode
                                  ? "bg-orange-950 text-orange-300"
                                  : "bg-orange-50 text-orange-700"
                              }`}
                            >
                              🌡️ {visit.temperature}
                              {t.celsius}
                            </span>
                          )}

                          {visit.heart_rate !== null && (
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                darkMode
                                  ? "bg-rose-950 text-rose-300"
                                  : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              ❤️ {visit.heart_rate} {t.bpm}
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setSelectedOldVisit(visit)
                            }
                            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-md"
                          >
                            {t.viewExamination}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* OLD VISIT MODAL */}
        {selectedOldVisit && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
            onClick={() => setSelectedOldVisit(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className={`max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border p-6 shadow-2xl ${
                darkMode
                  ? "border-slate-800 bg-slate-900"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2
                    className={`text-xl font-bold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    🩺 {t.visitDetails}
                  </h2>

                  <p
                    className={`mt-1 text-sm ${
                      darkMode
                        ? "text-slate-500"
                        : "text-slate-500"
                    }`}
                  >
                    {formatDate(
                      selectedOldVisit.visit_date,
                      language
                    )}{" "}
                    •{" "}
                    {formatTime(
                      selectedOldVisit.visit_date,
                      language
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedOldVisit(null)}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 hover:scale-105 ${
                    darkMode
                      ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  ✕
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div
                  className={`rounded-2xl p-4 ${
                    darkMode
                      ? "bg-slate-800/70"
                      : "bg-slate-50"
                  }`}
                >
                  <div className="mb-1 text-xs text-slate-500">
                    {t.reason}
                  </div>

                  <div
                    className={`whitespace-pre-wrap text-sm font-medium ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {selectedOldVisit.reason || "—"}
                  </div>
                </div>

                <div
                  className={`rounded-2xl p-4 ${
                    darkMode
                      ? "bg-slate-800/70"
                      : "bg-slate-50"
                  }`}
                >
                  <div className="mb-1 text-xs text-slate-500">
                    {t.weight}
                  </div>

                  <div
                    className={`text-sm font-medium ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {selectedOldVisit.weight !== null
                      ? `${selectedOldVisit.weight} ${t.kg}`
                      : "—"}
                  </div>
                </div>

                <div
                  className={`rounded-2xl p-4 ${
                    darkMode
                      ? "bg-slate-800/70"
                      : "bg-slate-50"
                  }`}
                >
                  <div className="mb-1 text-xs text-slate-500">
                    {t.temperature}
                  </div>

                  <div
                    className={`text-sm font-medium ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {selectedOldVisit.temperature !== null
                      ? `${selectedOldVisit.temperature}${t.celsius}`
                      : "—"}
                  </div>
                </div>

                <div
                  className={`rounded-2xl p-4 ${
                    darkMode
                      ? "bg-slate-800/70"
                      : "bg-slate-50"
                  }`}
                >
                  <div className="mb-1 text-xs text-slate-500">
                    {t.heartRate}
                  </div>

                  <div
                    className={`text-sm font-medium ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {selectedOldVisit.heart_rate !== null
                      ? `${selectedOldVisit.heart_rate} ${t.bpm}`
                      : "—"}
                  </div>
                </div>

                <div
                  className={`rounded-2xl p-4 ${
                    darkMode
                      ? "bg-slate-800/70"
                      : "bg-slate-50"
                  }`}
                >
                  <div className="mb-1 text-xs text-slate-500">
                    {t.respiratoryRate}
                  </div>

                  <div
                    className={`text-sm font-medium ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {selectedOldVisit.respiratory_rate !==
                    null
                      ? `${selectedOldVisit.respiratory_rate} ${t.rpm}`
                      : "—"}
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <div
                    className={`mb-2 text-sm font-bold ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {t.examinationNotes}
                  </div>

                  <div
                    className={`whitespace-pre-wrap rounded-2xl p-4 text-sm leading-7 ${
                      darkMode
                        ? "bg-slate-800/70 text-slate-300"
                        : "bg-slate-50 text-slate-700"
                    }`}
                  >
                    {selectedOldVisit.examination || "—"}
                  </div>
                </div>

                <div>
                  <div
                    className={`mb-2 text-sm font-bold ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {t.diagnosis}
                  </div>

                  <div
                    className={`whitespace-pre-wrap rounded-2xl p-4 text-sm leading-7 ${
                      darkMode
                        ? "bg-slate-800/70 text-slate-300"
                        : "bg-slate-50 text-slate-700"
                    }`}
                  >
                    {selectedOldVisit.diagnosis || "—"}
                  </div>
                </div>

                <div>
                  <div
                    className={`mb-2 text-sm font-bold ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {t.treatment}
                  </div>

                  <div
                    className={`whitespace-pre-wrap rounded-2xl p-4 text-sm leading-7 ${
                      darkMode
                        ? "bg-slate-800/70 text-slate-300"
                        : "bg-slate-50 text-slate-700"
                    }`}
                  >
                    {selectedOldVisit.treatment || "—"}
                  </div>
                </div>

                <div>
                  <div
                    className={`mb-2 text-sm font-bold ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {t.visitNotes}
                  </div>

                  <div
                    className={`whitespace-pre-wrap rounded-2xl p-4 text-sm leading-7 ${
                      darkMode
                        ? "bg-slate-800/70 text-slate-300"
                        : "bg-slate-50 text-slate-700"
                    }`}
                  >
                    {selectedOldVisit.notes || "—"}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedOldVisit(null)}
                  className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    darkMode
                      ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {t.close}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}