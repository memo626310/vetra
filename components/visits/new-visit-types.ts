export type Language = "en" | "ar";

export type Client = {
  id: string;
  name: string;
  phone: string | null;
  email?: string | null;
};

export type Pet = {
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

export type Visit = {
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

export type Medication = {
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

export type MedicationDraft = {
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


export type ExternalMedicationDraft = {
  id: string;
  productName: string;
  activeIngredient: string | null;
  manufacturer: string | null;
  price: string | null;
  doseText: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
  weightKg: number | null;
  source: "DrugEye";
  bsavaDrugName: string | null;
};

export type VaccinationDraft = {
  id: string;
  vaccine_name: string;
  vaccine_type: string;
  dose_stage: string;
  administered_at: string;
  next_dose_at: string;
  next_dose_manual: boolean;
  dose: string;
  route: string;
  batch_number: string;
  manufacturer: string;
  notes: string;
};

export type PetDetails = Pet & {
  client: Client | null;
};

export const translations = {
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


export type VisitTranslations = typeof translations.en;
