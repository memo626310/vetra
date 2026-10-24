 "use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { usePwaInstall } from "@/components/PwaInstallProvider";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";
import { vetraCore } from "@/lib/vetra-core";
import { loadClinicProfile, type ClinicProfile } from "@/lib/clinic-profile";
import { writeVetraThemeMode } from "@/lib/theme";
import { useStaffPermissions } from "@/lib/use-staff-permissions";

const DASHBOARD_BACKGROUND_KEY = "vetra-dashboard-background";
const DASHBOARD_BACKGROUND_TRANSPARENCY_KEY = "vetra-dashboard-background-transparency";
const DEFAULT_DASHBOARD_BACKGROUND = "/vetra-dashboard-background.jpg";
const DEFAULT_DASHBOARD_BACKGROUND_TRANSPARENCY = 32;

type Language = "ar" | "en";

type ClinicContext = {
  clinic_id: string;
  clinic_name: string;
  clinic_status: string;
  doctor_id: string;
  doctor_name: string;
  role: string;
  member_status: string;
  database_provider: string | null;
  project_ref: string | null;
  database_region: string | null;
  database_status: string | null;
  subscription_status: string | null;
  plan_code: string | null;
  plan_name: string | null;
  trial_ends_at: string | null;
};

type BillingSettings = {
  id: string;
  clinic_id: string;
  consultation_fee: number | null;
  follow_up_fee: number | null;
  injection_fee: number | null;
  auto_add_consultation_fee: boolean;
};

const BACKUP_TABLES = [
  "clients",
  "pets",
  "visits",
  "visit_medications",
  "medications",
  "vaccinations",
  "appointments",
  "appointment_settings",
  "products",
  "product_categories",
  "inventory_movements",
  "invoices",
  "invoice_items",
  "billing_settings",
  "financial_accounts",
  "cash_register_sessions",
  "financial_transactions",
  "legacy_import_batches",
  "legacy_import_source_rows",
  "legacy_import_id_map",
] as const;

const BACKUP_PAGE_SIZE = 500;
const BACKUP_MAX_ROWS_PER_TABLE = 500_000;
const BACKUP_MAX_TOTAL_ROWS = 1_000_000;

const text = {
  ar: {
    title: "الإعدادات",
    subtitle: "إدارة إعدادات VETRA والعيادة والفواتير",
    back: "العودة للرئيسية",
    clinic: "العيادة",
    clinicName: "اسم العيادة",
    clinicProfile: "ملف العيادة",
    clinicProfileHint: "الهوية التي تظهر للعملاء وعلى الروشتات المطبوعة.",
    displayName: "اسم العرض",
    doctorName: "اسم الطبيب الظاهر",
    doctorNameLimit: "يمكن تعديل اسم الطبيب مرة واحدة كل 6 أشهر.",
    doctorNameAvailable: "يمكن تعديل الاسم مرة أخرى بعد",
    website: "الموقع الإلكتروني",
    logo: "شعار العيادة",
    uploadLogo: "تغيير الشعار",
    removeLogo: "إزالة الشعار",
    logoHint: "PNG أو JPG أو WebP، بحد أقصى 5 ميجابايت.",
    saveProfile: "حفظ ملف العيادة",
    profileSaved: "تم حفظ ملف العيادة.",
    profileSaveError: "تعذر حفظ ملف العيادة. تحقق من إعداد قاعدة بيانات العيادة.",
    doctorNameSetupError: "شغّل تحديث إعدادات ملف العيادة على قاعدة العيادة قبل تعديل اسم الطبيب.",
    profileNameRequired: "أدخل اسم العيادة.",
    websiteInvalid: "أدخل رابط موقع صحيحًا يبدأ بـ https:// أو http://.",
    logoInvalid: "اختر صورة PNG أو JPG أو WebP لا يتجاوز حجمها 5 ميجابايت.",
    doctor: "الطبيب",
    role: "الصلاحية",
    database: "قاعدة البيانات",
    databaseStatus: "حالة قاعدة البيانات",
    subscription: "الاشتراك",
    plan: "الخطة",
    trial: "التجربة تنتهي",
    billing: "الفوترة",
    billingHint: "الإعدادات التي تؤثر على إنشاء الفواتير والزيارات.",
    consultationFee: "سعر الكشف",
    consultationFeeHint: "يُستخدم عند تفعيل إضافة سعر الكشف تلقائيًا.",
    followUpFee: "سعر المتابعة",
    followUpFeeHint: "السعر الافتراضي لزيارات المتابعة، ويمكن تعديله داخل الفاتورة.",
    injectionFee: "سعر الحقنة الموحد",
    injectionFeeHint: "يُضاف تلقائيًا لكل دواء في الزيارة، ويمكن تعديل سعر كل بند قبل إصدار الفاتورة.",
    autoConsultation: "إضافة سعر الكشف تلقائيًا",
    autoConsultationHint: "عند إنهاء زيارة، يتم تجهيز بند الكشف في الفاتورة تلقائيًا.",
    appearance: "المظهر واللغة",
    dashboardBackground: "خلفية الداشبورد",
    dashboardBackgroundHint: "اختر صورة الخلفية وحدد مدى ظهورها في لوحة التحكم.",
    chooseBackground: "اختيار صورة",
    resetBackground: "استعادة الافتراضية",
    backgroundTransparency: "شفافية الخلفية",
    backgroundSaved: "تم حفظ خلفية الداشبورد.",
    backgroundInvalid: "اختر صورة أقل من 2 ميجابايت.",
    appDataTools: "التطبيق والبيانات",
    appDataToolsHint: "تثبيت VETRA وإدارة نسخ بيانات العيادة.",
    installTitle: "تثبيت برنامج VETRA",
    installHint: "افتح VETRA كتطبيق مستقل للوصول الأسرع من الشاشة الرئيسية.",
    installButton: "تثبيت البرنامج",
    installHowTo: "طريقة التثبيت",
    appInstalled: "مثبّت بالفعل على هذا الجهاز",
    installAccepted: "تم طلب تثبيت VETRA.",
    installDismissed: "لم يتم تأكيد التثبيت. يمكنك المحاولة مرة أخرى أو استخدام قائمة المتصفح.",
    installIosHelp: "على iPhone أو iPad: افتح قائمة المشاركة في Safari ثم اختر «إضافة إلى الشاشة الرئيسية».",
    installManualHelp: "افتح قائمة المتصفح (⋮ أو ⋯)، ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» إن كانت متاحة.",
    importTitle: "استيراد قاعدة بيانات من نظام آخر",
    importHint: "افحص قاعدة النظام القديم واحفظ أرشيفها ثم راجع البيانات قبل نقلها إلى VETRA.",
    importButton: "فتح صفحة الاستيراد",
    backupTitle: "تصدير قاعدة البيانات / نسخة احتياطية",
    backupHint: "نزّل ملف JSON ببيانات العيادة المتاحة لحسابك. احتفظ به في مكان آمن؛ الملف يحتوي على بيانات عملاء وحيوانات وفواتير.",
    backupButton: "تصدير نسخة احتياطية",
    backupConfirm: "سيتم تنزيل ملف يحتوي على بيانات العيادة، ومنها بيانات العملاء والحيوانات والفواتير والحركات المالية. احفظ الملف في مكان آمن ولا تشاركه مع غير المخولين. هل تريد المتابعة؟",
    backupProgress: "جاري تجهيز نسخة من الجدول:",
    backupSuccess: "تم تنزيل نسخة بيانات العيادة بنجاح.",
    backupRows: "سجلًا",
    backupError: "تعذر إنشاء النسخة الاحتياطية:",
    backupTenantError: "توقف التصدير بسبب اختلاف معرف العيادة في البيانات؛ لم يتم تنزيل أي ملف.",
    backupLimitError: "تجاوز حجم البيانات الحد الوقائي للتصدير. استخدم نسخة قاعدة بيانات كاملة من مزود قاعدة البيانات.",
    language: "اللغة",
    arabic: "العربية",
    english: "English",
    theme: "المظهر",
    dark: "داكن",
    light: "فاتح",
    security: "الأمان",
    securityHint: "إدارة جلسة حساب الطبيب وكلمة المرور.",
    newPassword: "كلمة مرور جديدة",
    confirmPassword: "تأكيد كلمة المرور",
    passwordPlaceholder: "6 أحرف على الأقل",
    changePassword: "تغيير كلمة المرور",
    signOut: "تسجيل الخروج",
    save: "حفظ إعدادات الفوترة",
    saving: "جاري الحفظ...",
    saved: "تم حفظ الإعدادات بنجاح.",
    passwordChanged: "تم تغيير كلمة المرور بنجاح.",
    passwordMismatch: "كلمتا المرور غير متطابقتين.",
    passwordTooShort: "كلمة المرور يجب أن تكون 6 أحرف على الأقل.",
    loading: "جاري تحميل الإعدادات...",
    loadError: "تعذر تحميل إعدادات العيادة.",
    saveError: "تعذر حفظ إعدادات الفوترة.",
    accessDenied: "ليس لديك صلاحية لتعديل إعدادات الفوترة.",
    ownerAdminOnly: "متاحة للـ Owner و Admin فقط",
    ready: "جاهزة",
    active: "نشطة",
    noData: "غير متاح",
    egp: "جنيه",
    expiry: "ينتهي",
    yes: "نعم",
    no: "لا",
  },
  en: {
    title: "Settings",
    subtitle: "Manage VETRA, clinic and billing settings",
    back: "Back to dashboard",
    clinic: "Clinic",
    clinicName: "Clinic name",
    clinicProfile: "Clinic profile",
    clinicProfileHint: "The identity shown to clients and on printed prescriptions.",
    displayName: "Display name",
    doctorName: "Doctor name",
    doctorNameLimit: "The doctor name can be changed once every six months.",
    doctorNameAvailable: "Available to change again after",
    website: "Website",
    logo: "Clinic logo",
    uploadLogo: "Replace logo",
    removeLogo: "Remove logo",
    logoHint: "PNG, JPG or WebP, up to 5 MB.",
    saveProfile: "Save clinic profile",
    profileSaved: "Clinic profile saved.",
    profileSaveError: "Could not save the clinic profile. Check the clinic database setup.",
    doctorNameSetupError: "Apply the clinic profile settings SQL to the clinic database before changing the doctor name.",
    profileNameRequired: "Enter the clinic name.",
    websiteInvalid: "Enter a valid website URL beginning with https:// or http://.",
    logoInvalid: "Choose a PNG, JPG or WebP image no larger than 5 MB.",
    doctor: "Doctor",
    role: "Role",
    database: "Database",
    databaseStatus: "Database status",
    subscription: "Subscription",
    plan: "Plan",
    trial: "Trial ends",
    billing: "Billing",
    billingHint: "Settings that affect visits and invoice creation.",
    consultationFee: "Consultation fee",
    consultationFeeHint: "Used when automatic consultation fee is enabled.",
    followUpFee: "Follow-up fee",
    followUpFeeHint: "Default price for follow-up visits. It can be adjusted on the invoice.",
    injectionFee: "Default injection fee",
    injectionFeeHint: "Added automatically for each medication in a visit. Each line can be adjusted before billing.",
    autoConsultation: "Automatically add consultation fee",
    autoConsultationHint: "When a visit is completed, the consultation item is prepared automatically in the invoice.",
    appearance: "Appearance & language",
    dashboardBackground: "Dashboard background",
    dashboardBackgroundHint: "Choose the image and control how visible it is on the dashboard.",
    chooseBackground: "Choose image",
    resetBackground: "Restore default",
    backgroundTransparency: "Background transparency",
    backgroundSaved: "Dashboard background saved.",
    backgroundInvalid: "Choose an image smaller than 2 MB.",
    appDataTools: "App & data tools",
    appDataToolsHint: "Install VETRA and manage clinic data backups.",
    installTitle: "Install VETRA",
    installHint: "Use VETRA as a standalone app for faster access from your home screen.",
    installButton: "Install app",
    installHowTo: "How to install",
    appInstalled: "Already installed on this device",
    installAccepted: "VETRA installation was accepted.",
    installDismissed: "Installation was not confirmed. Try again or use the browser menu.",
    installIosHelp: "On iPhone or iPad: open Safari's Share menu, then choose “Add to Home Screen”.",
    installManualHelp: "Open your browser menu (⋮ or ⋯), then choose “Install app” or “Add to Home Screen” when available.",
    importTitle: "Import a database from another system",
    importHint: "Scan the legacy database, archive the source, and review the data before importing it into VETRA.",
    importButton: "Open import page",
    backupTitle: "Export database / backup",
    backupHint: "Download a JSON file of clinic data available to your account. Store it securely; it contains client, pet, invoice, and financial data.",
    backupButton: "Export backup",
    backupConfirm: "This file contains clinic data, including clients, pets, invoices, and financial transactions. Keep it in a secure location and do not share it with unauthorized people. Continue?",
    backupProgress: "Preparing backup for table:",
    backupSuccess: "Clinic data backup downloaded successfully.",
    backupRows: "records",
    backupError: "Could not create the backup:",
    backupTenantError: "Export stopped because a row returned a different clinic ID. No file was downloaded.",
    backupLimitError: "The export exceeded the safety limit. Use a full database backup from your database provider.",
    language: "Language",
    arabic: "العربية",
    english: "English",
    theme: "Theme",
    dark: "Dark",
    light: "Light",
    security: "Security",
    securityHint: "Manage the doctor's session and password.",
    newPassword: "New password",
    confirmPassword: "Confirm password",
    passwordPlaceholder: "At least 6 characters",
    changePassword: "Change password",
    signOut: "Sign out",
    save: "Save billing settings",
    saving: "Saving...",
    saved: "Settings saved successfully.",
    passwordChanged: "Password changed successfully.",
    passwordMismatch: "Passwords do not match.",
    passwordTooShort: "Password must be at least 6 characters.",
    loading: "Loading settings...",
    loadError: "Could not load clinic settings.",
    saveError: "Could not save billing settings.",
    accessDenied: "You do not have permission to edit billing settings.",
    ownerAdminOnly: "Owner and Admin only",
    ready: "Ready",
    active: "Active",
    noData: "Not available",
    egp: "EGP",
    expiry: "Expires",
    yes: "Yes",
    no: "No",
  },
};

function formatDate(value: string | null, language: Language) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function addSixMonths(value: string) {
  const date = new Date(value);
  const day = date.getDate();
  date.setMonth(date.getMonth() + 6);
  if (date.getDate() !== day) date.setDate(0);
  return date;
}

export default function SettingsPage() {
  const router = useRouter();
  const { hasPermission, loaded: permissionsLoaded } = useStaffPermissions();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  const [language, setLanguage] = useState<Language>("ar");
  const [darkMode, setDarkMode] = useState(true);
  const [ready, setReady] = useState(false);

  const [context, setContext] = useState<ClinicContext | null>(null);
  const [clinicProfile, setClinicProfile] = useState<ClinicProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [doctorNameLocked, setDoctorNameLocked] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoPath, setLogoPath] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [billing, setBilling] = useState<BillingSettings | null>(null);

  const [consultationFee, setConsultationFee] = useState("");
  const [followUpFee, setFollowUpFee] = useState("");
  const [injectionFee, setInjectionFee] = useState("");
  const [autoAddConsultationFee, setAutoAddConsultationFee] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingBilling, setSavingBilling] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [exportingBackup, setExportingBackup] = useState(false);
  const [backupProgress, setBackupProgress] = useState("");
  const [installHelp, setInstallHelp] = useState(false);
  const [installStatus, setInstallStatus] = useState("");
  const [dashboardBackground, setDashboardBackground] = useState(DEFAULT_DASHBOARD_BACKGROUND);
  const [dashboardBackgroundTransparency, setDashboardBackgroundTransparency] = useState(DEFAULT_DASHBOARD_BACKGROUND_TRANSPARENCY);
  const [backgroundStatus, setBackgroundStatus] = useState("");
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDarkMode(localStorage.getItem("vetra-theme") !== "light");
      setLanguage(localStorage.getItem("vetra-language") === "en" ? "en" : "ar");
      const savedBackground = localStorage.getItem(DASHBOARD_BACKGROUND_KEY);
      const savedTransparency = Number(localStorage.getItem(DASHBOARD_BACKGROUND_TRANSPARENCY_KEY));
      if (savedBackground?.startsWith("data:image/") || savedBackground?.startsWith("/")) setDashboardBackground(savedBackground);
      if (Number.isFinite(savedTransparency)) setDashboardBackgroundTransparency(Math.min(100, Math.max(0, savedTransparency)));
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (permissionsLoaded) {
      setAuthorized(hasPermission("clinic_settings", "edit"));
    }
  }, [permissionsLoaded, hasPermission]);

  useEffect(() => {
    if (!ready) return;

    writeVetraThemeMode(darkMode);
    localStorage.setItem("vetra-language", language);
  }, [darkMode, language, ready]);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const clinicContext = await getClinicContext();

        if (!clinicContext?.clinic_id || clinicContext.clinic_status !== "active" || clinicContext.member_status !== "active") {
          router.replace("/clinic-setup");
          return;
        }

        if (cancelled) return;
        setContext(clinicContext);

        const db = await getClinicDb();

        const profile = await loadClinicProfile(db, clinicContext.clinic_id);
        if (!cancelled) {
          const availableAt = profile?.doctor_name_changed_at
            ? addSixMonths(profile.doctor_name_changed_at)
            : null;
          setClinicProfile(profile);
          setDisplayName(profile?.display_name || clinicContext.clinic_name || "");
          setDoctorName(profile?.doctor_name || clinicContext.doctor_name || "");
          setDoctorNameLocked(Boolean(availableAt && availableAt.getTime() > Date.now()));
          setWebsiteUrl(profile?.website_url || "");
          setLogoUrl(profile?.logo_url || "");
          setLogoPath(profile?.logo_path || "");
        }

        const { data, error: billingError } = await db
          .from("billing_settings")
          .select("id, clinic_id, consultation_fee, follow_up_fee, injection_fee, auto_add_consultation_fee")
          .eq("clinic_id", clinicContext.clinic_id)
          .maybeSingle();

        if (billingError) {
          console.error("SETTINGS BILLING LOAD ERROR:", billingError);
          if (!cancelled) setError(billingError.message || text[language].loadError);
          return;
        }

        if (data && !cancelled) {
          const settings = data as BillingSettings;
          setBilling(settings);
          setConsultationFee(
            settings.consultation_fee === null || settings.consultation_fee === undefined
              ? ""
              : String(settings.consultation_fee)
          );
          setFollowUpFee(settings.follow_up_fee == null ? "" : String(settings.follow_up_fee));
          setAutoAddConsultationFee(Boolean(settings.auto_add_consultation_fee));
          setInjectionFee(settings.injection_fee == null ? "" : String(settings.injection_fee));
        }
      } catch (loadErr) {
        console.error("SETTINGS LOAD ERROR:", loadErr);
        if (!cancelled) {
          setError(loadErr instanceof Error ? loadErr.message : text[language].loadError);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [ready, router, language]);

  const t = text[language];

  function handleDashboardBackgroundChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      setBackgroundStatus(t.backgroundInvalid);
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      localStorage.setItem(DASHBOARD_BACKGROUND_KEY, reader.result);
      setDashboardBackground(reader.result);
      setBackgroundStatus(t.backgroundSaved);
    };
    reader.readAsDataURL(file);
  }

  function resetDashboardBackground() {
    localStorage.removeItem(DASHBOARD_BACKGROUND_KEY);
    setDashboardBackground(DEFAULT_DASHBOARD_BACKGROUND);
    setBackgroundStatus(t.backgroundSaved);
    if (backgroundInputRef.current) backgroundInputRef.current.value = "";
  }

  function changeDashboardBackgroundTransparency(value: string) {
    const nextValue = Math.min(100, Math.max(0, Number(value)));
    setDashboardBackgroundTransparency(nextValue);
    localStorage.setItem(DASHBOARD_BACKGROUND_TRANSPARENCY_KEY, String(nextValue));
  }
  const { canInstall, isInstalled, isIOS, installApp } = usePwaInstall();
  const isAdmin = context ? ["owner", "admin"].includes(context.role) : false;
  const doctorNameAvailableAt = clinicProfile?.doctor_name_changed_at
    ? addSixMonths(clinicProfile.doctor_name_changed_at)
    : null;

  function selectClinicLogo(file: File | undefined) {
    if (!file) return;
    if (!(["image/png", "image/jpeg", "image/webp"].includes(file.type)) || file.size > 5 * 1024 * 1024) {
      setError(t.logoInvalid);
      return;
    }
    setError("");
    setLogoFile(file);
    setLogoUrl(URL.createObjectURL(file));
  }

  async function saveClinicProfile() {
    if (!context || savingProfile) return;
    const cleanName = displayName.trim();
    const cleanDoctorName = doctorName.trim();
    const currentDoctorName = clinicProfile?.doctor_name || context.doctor_name || "";
    const doctorNameChanged = cleanDoctorName !== currentDoctorName;
    if (!cleanName) {
      setError(t.profileNameRequired);
      setMessage("");
      return;
    }
    if (doctorNameChanged && doctorNameLocked) {
      setError(`${t.doctorNameAvailable} ${formatDate(doctorNameAvailableAt?.toISOString() || null, language)}.`);
      setMessage("");
      return;
    }
    const cleanWebsite = websiteUrl.trim();
    if (cleanWebsite) {
      try {
        const parsed = new URL(cleanWebsite);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid protocol");
      } catch {
        setError(t.websiteInvalid);
        setMessage("");
        return;
      }
    }
    if (!isAdmin) {
      setError(t.accessDenied);
      setMessage("");
      return;
    }

    setSavingProfile(true);
    setError("");
    setMessage("");
    let uploadedPath = "";
    try {
      const db = await getClinicDb();
      let nextLogoUrl = logoUrl || null;
      let nextLogoPath = logoUrl || logoFile ? (logoPath || null) : null;
      if (logoFile) {
        const { data: sessionData, error: sessionError } = await vetraCore.auth.getSession();
        if (sessionError || !sessionData.session?.access_token) throw new Error(t.profileSaveError);
        const form = new FormData();
        form.set("file", logoFile);
        const uploadResponse = await fetch("/api/clinic/logo", {
          method: "POST",
          headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
          body: form,
        });
        const uploaded = await uploadResponse.json().catch(() => null) as { path?: string; url?: string; error?: string } | null;
        if (!uploadResponse.ok || !uploaded?.path || !uploaded.url) throw new Error(uploaded?.error || t.profileSaveError);
        uploadedPath = uploaded.path;
        nextLogoUrl = uploaded.url;
        nextLogoPath = uploaded.path;
      }

      const profileValues: Record<string, string | null> = {
        clinic_id: context.clinic_id,
        display_name: cleanName,
        website_url: cleanWebsite || null,
        logo_url: nextLogoUrl,
        logo_path: nextLogoPath,
        updated_at: new Date().toISOString(),
      };
      if (doctorNameChanged) profileValues.doctor_name = cleanDoctorName || null;
      const { data: savedProfile, error: saveError } = await db.from("clinic_profile_settings")
        .upsert(profileValues, { onConflict: "clinic_id" })
        .select("clinic_id,display_name,website_url,logo_url,logo_path,updated_at")
        .single();
      if (saveError) {
        if (doctorNameChanged && /doctor_name|column/i.test(saveError.message)) throw new Error(t.doctorNameSetupError);
        throw saveError;
      }

      if (clinicProfile?.logo_path && clinicProfile.logo_path !== nextLogoPath) {
        const { data: sessionData } = await vetraCore.auth.getSession();
        if (sessionData.session?.access_token) {
          await fetch("/api/clinic/logo", {
            method: "DELETE",
            headers: { Authorization: `Bearer ${sessionData.session.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ path: clinicProfile.logo_path }),
          });
        }
      }
      const updated = {
        ...(savedProfile as ClinicProfile),
        doctor_name: doctorNameChanged ? cleanDoctorName || null : clinicProfile?.doctor_name || null,
        doctor_name_changed_at: doctorNameChanged ? new Date().toISOString() : clinicProfile?.doctor_name_changed_at || null,
      };
      setClinicProfile(updated);
      setDoctorName(updated.doctor_name || context.doctor_name || "");
      if (doctorNameChanged) setDoctorNameLocked(true);
      setLogoUrl(nextLogoUrl || "");
      setLogoPath(nextLogoPath || "");
      setLogoFile(null);
      setMessage(t.profileSaved);
    } catch (saveErr) {
      if (uploadedPath) {
        const { data: sessionData } = await vetraCore.auth.getSession();
        if (sessionData.session?.access_token) {
          await fetch("/api/clinic/logo", {
            method: "DELETE",
            headers: { Authorization: `Bearer ${sessionData.session.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ path: uploadedPath }),
          });
        }
      }
      console.error("CLINIC PROFILE SAVE ERROR:", saveErr);
      setError(saveErr instanceof Error ? saveErr.message : t.profileSaveError);
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveBilling() {
    if (!context) return;

    if (!isAdmin) {
      setError(t.accessDenied);
      setMessage("");
      return;
    }

    const feeValue = consultationFee.trim() === "" ? null : Number(consultationFee);
    const followUpFeeValue = followUpFee.trim() === "" ? 0 : Number(followUpFee);
    const injectionFeeValue = injectionFee.trim() === "" ? 0 : Number(injectionFee);

    if (feeValue !== null && (!Number.isFinite(feeValue) || feeValue < 0)) {
      setError(t.saveError);
      setMessage("");
      return;
    }
    if (!Number.isFinite(injectionFeeValue) || injectionFeeValue < 0) {
      setError(t.saveError);
      setMessage("");
      return;
    }
    if (!Number.isFinite(followUpFeeValue) || followUpFeeValue < 0) {
      setError(t.saveError);
      setMessage("");
      return;
    }

    setSavingBilling(true);
    setError("");
    setMessage("");

    try {
      const db = await getClinicDb();

      if (billing?.id) {
        const { data, error: updateError } = await db
          .from("billing_settings")
          .update({
            consultation_fee: feeValue,
            follow_up_fee: followUpFeeValue,
            injection_fee: injectionFeeValue,
            auto_add_consultation_fee: autoAddConsultationFee,
            updated_at: new Date().toISOString(),
          })
          .eq("id", billing.id)
          .eq("clinic_id", context.clinic_id)
          .select("id, clinic_id, consultation_fee, follow_up_fee, injection_fee, auto_add_consultation_fee")
          .single();

        if (updateError) throw updateError;
        setBilling(data as BillingSettings);
      } else {
        const { data, error: insertError } = await db
          .from("billing_settings")
          .insert({
            clinic_id: context.clinic_id,
            consultation_fee: feeValue,
            follow_up_fee: followUpFeeValue,
            injection_fee: injectionFeeValue,
            auto_add_consultation_fee: autoAddConsultationFee,
          })
          .select("id, clinic_id, consultation_fee, follow_up_fee, injection_fee, auto_add_consultation_fee")
          .single();

        if (insertError) throw insertError;
        setBilling(data as BillingSettings);
      }

      setMessage(t.saved);
    } catch (saveErr) {
      console.error("SETTINGS BILLING SAVE ERROR:", saveErr);
      setError(saveErr instanceof Error ? saveErr.message : t.saveError);
    } finally {
      setSavingBilling(false);
    }
  }

  async function handleInstallApplication() {
    setInstallStatus("");
    if (isInstalled) return;
    if (!canInstall) {
      setInstallHelp((current) => !current);
      return;
    }

    try {
      const result = await installApp();
      if (result === "accepted") {
        setInstallStatus(t.installAccepted);
        setInstallHelp(false);
      } else if (result === "dismissed") {
        setInstallStatus(t.installDismissed);
      } else {
        setInstallHelp(true);
      }
    } catch (installError) {
      console.error("VETRA APP INSTALL ERROR:", installError);
      setInstallHelp(true);
    }
  }

  async function exportCurrentDatabase() {
    if (!context || exportingBackup) return;
    if (!window.confirm(t.backupConfirm)) return;

    setExportingBackup(true);
    setBackupProgress("");
    setError("");
    setMessage("");

    try {
      const db = await getClinicDb();
      const tables: Record<string, Record<string, unknown>[]> = {};
      let totalRows = 0;

      for (const tableName of BACKUP_TABLES) {
        const rowsForTable: Record<string, unknown>[] = [];
        let offset = 0;

        while (true) {
          setBackupProgress(`${t.backupProgress} ${tableName} · ${(offset + 1).toLocaleString(language === "ar" ? "ar-EG" : "en-US")}`);
          const { data, error: queryError } = await db
            .from(tableName)
            .select("*")
            .order("id", { ascending: true })
            .range(offset, offset + BACKUP_PAGE_SIZE - 1);

          if (queryError) {
            throw new Error(`${tableName}: ${queryError.message}`);
          }

          const pageRows = (data || []) as Record<string, unknown>[];
          for (const row of pageRows) {
            if (typeof row.clinic_id === "string" && row.clinic_id && row.clinic_id !== context.clinic_id) {
              throw new Error(t.backupTenantError);
            }
          }

          rowsForTable.push(...pageRows);
          offset += pageRows.length;
          totalRows += pageRows.length;

          if (rowsForTable.length > BACKUP_MAX_ROWS_PER_TABLE || totalRows > BACKUP_MAX_TOTAL_ROWS) {
            throw new Error(t.backupLimitError);
          }
          if (pageRows.length < BACKUP_PAGE_SIZE) break;
        }

        tables[tableName] = rowsForTable;
      }

      const rowCounts = Object.fromEntries(
        Object.entries(tables).map(([tableName, rows]) => [tableName, rows.length])
      );
      const payload = {
        format: "VETRA_CLINIC_DATA_BACKUP",
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        clinic: {
          id: context.clinic_id,
          name: context.clinic_name,
        },
        rowCounts,
        totalRows,
        tables,
        limitations: "Application data export only. This JSON does not include PostgreSQL schema, functions, triggers, RLS policies, authentication users, or external files; it is not a full SQL dump or one-click restore file.",
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeClinicName = (context.clinic_name || "VETRA")
        .replace(/[^a-zA-Z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 50) || "VETRA";
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      anchor.href = objectUrl;
      anchor.download = `VETRA-backup-${safeClinicName}-${timestamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      setMessage(`${t.backupSuccess} ${totalRows.toLocaleString(language === "ar" ? "ar-EG" : "en-US")} ${t.backupRows}`);
    } catch (backupError) {
      console.error("VETRA BACKUP EXPORT ERROR:", backupError);
      setError(`${t.backupError} ${backupError instanceof Error ? backupError.message : String(backupError)}`);
    } finally {
      setExportingBackup(false);
      setBackupProgress("");
    }
  }

  async function changePassword() {
    setMessage("");
    setError("");

    if (newPassword.length < 6) {
      setError(t.passwordTooShort);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t.passwordMismatch);
      return;
    }

    setChangingPassword(true);

    try {
      const { error: passwordError } = await vetraCore.auth.updateUser({
        password: newPassword,
      });

      if (passwordError) throw passwordError;

      setNewPassword("");
      setConfirmPassword("");
      setMessage(t.passwordChanged);
    } catch (passwordErr) {
      console.error("SETTINGS PASSWORD ERROR:", passwordErr);
      setError(passwordErr instanceof Error ? passwordErr.message : "Password update failed.");
    } finally {
      setChangingPassword(false);
    }
  }

  async function signOut() {
    await vetraCore.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (!permissionsLoaded || authorized === null || !ready || loading) {
    return (
      <main
        dir={language === "ar" ? "rtl" : "ltr"}
        className={`flex min-h-screen items-center justify-center ${
          darkMode ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-900"
        }`}
      >
        <div className="text-center">
          <div className="mb-3 text-4xl">⚙️</div>
          <p className="text-sm text-slate-500">{t.loading}</p>
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main
        dir={language === "ar" ? "rtl" : "ltr"}
        className={`flex min-h-screen items-center justify-center ${
          darkMode ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-900"
        }`}
      >
        <div className="text-center">
          <div className="mb-4 text-6xl">🔒</div>
          <h2 className="mb-2 text-2xl font-bold">{language === "ar" ? "غير مصرح" : "Unauthorized"}</h2>
          <p className="mb-6 text-slate-500">
            {language === "ar" ? "ليس لديك صلاحية لتعديل إعدادات العيادة" : "You do not have permission to edit clinic settings"}
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-2xl bg-blue-500 px-6 py-3 font-bold text-white transition hover:bg-blue-600"
          >
            {language === "ar" ? "العودة للوحة التحكم" : "Back to Dashboard"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      dir={language === "ar" ? "rtl" : "ltr"}
      className={`min-h-screen transition-colors ${
        darkMode ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-900"
      }`}
    >
      <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 lg:px-10">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <button
              onClick={() => router.push("/dashboard")}
              className="mb-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-black/5 hover:text-slate-900 dark:hover:bg-white/5 dark:hover:text-white"
            >
              ← {t.back}
            </button>

            <p className="text-sm font-semibold text-blue-500">VETRA</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">{t.title}</h1>
            <p className="mt-2 text-sm text-slate-500">{t.subtitle}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
              className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                darkMode
                  ? "border-white/10 bg-[#171A20] hover:bg-[#1D2129]"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              🌐 {language === "ar" ? "English" : "عربي"}
            </button>

            <button
              onClick={() => setDarkMode((v) => !v)}
              className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                darkMode
                  ? "border-white/10 bg-[#171A20] hover:bg-[#1D2129]"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>
          </div>
        </header>

        {(message || error) && (
          <div
            className={`mb-6 rounded-2xl border px-4 py-3 text-sm font-semibold ${
              error
                ? "border-red-500/20 bg-red-500/10 text-red-500"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
            }`}
          >
            {error || message}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section
            className={`rounded-3xl border p-6 ${
              darkMode
                ? "border-white/[0.06] bg-[#13161B]"
                : "border-slate-100 bg-white"
            }`}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">{t.clinic}</h2>
                <p className="mt-1 text-sm text-slate-500">{t.subtitle}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  context?.clinic_status === "active"
                    ? darkMode
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-emerald-50 text-emerald-700"
                    : "bg-orange-500/10 text-orange-500"
                }`}
              >
                ● {context?.clinic_status === "active" ? t.active : context?.clinic_status || t.noData}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <InfoCard label={t.clinicName} value={clinicProfile?.display_name || context?.clinic_name || "—"} darkMode={darkMode} />
              <InfoCard label={t.doctor} value={clinicProfile?.doctor_name || context?.doctor_name || "—"} darkMode={darkMode} />
              <InfoCard label={t.role} value={context?.role || "—"} darkMode={darkMode} />
              <InfoCard
                label={t.databaseStatus}
                value={context?.database_status === "ready" ? t.ready : context?.database_status || "—"}
                darkMode={darkMode}
              />
              <InfoCard label={t.database} value={context?.database_provider || "—"} darkMode={darkMode} />
              <InfoCard label={t.plan} value={context?.plan_name || context?.plan_code || "—"} darkMode={darkMode} />
              <InfoCard
                label={t.subscription}
                value={context?.subscription_status || "—"}
                darkMode={darkMode}
              />
              <InfoCard
                label={t.trial}
                value={formatDate(context?.trial_ends_at || null, language)}
                darkMode={darkMode}
              />
            </div>
          </section>

          <section className={`rounded-3xl border p-6 ${darkMode ? "border-white/[0.06] bg-[#13161B]" : "border-slate-200 bg-white"}`}>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">{t.clinicProfile}</h2>
                <p className="mt-1 text-sm text-slate-500">{t.clinicProfileHint}</p>
              </div>
              <span className="rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-500">{t.ownerAdminOnly}</span>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block text-sm font-bold">
                {t.doctorName}
                <input value={doctorName} onChange={(event) => setDoctorName(event.target.value)} maxLength={120} disabled={!isAdmin || savingProfile || doctorNameLocked} className={`mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-cyan-500 disabled:opacity-60 ${darkMode ? "border-white/10 bg-[#0F1115] text-white" : "border-slate-200 bg-slate-50 text-slate-900"}`} />
                <span className="mt-2 block text-xs font-normal text-slate-500">
                  {doctorNameLocked && doctorNameAvailableAt
                    ? `${t.doctorNameAvailable} ${formatDate(doctorNameAvailableAt.toISOString(), language)}`
                    : t.doctorNameLimit}
                </span>
              </label>
              <label className="block text-sm font-bold">
                {t.displayName}
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} disabled={!isAdmin || savingProfile} className={`mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-cyan-500 disabled:opacity-60 ${darkMode ? "border-white/10 bg-[#0F1115] text-white" : "border-slate-200 bg-slate-50 text-slate-900"}`} />
              </label>
              <label className="block text-sm font-bold">
                {t.website}
                <input type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://example.com" disabled={!isAdmin || savingProfile} className={`mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-cyan-500 disabled:opacity-60 ${darkMode ? "border-white/10 bg-[#0F1115] text-white placeholder:text-slate-500" : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"}`} />
              </label>
              <div className="md:col-span-2">
                <div className="mb-2 text-sm font-bold">{t.logo}</div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border ${darkMode ? "border-white/10 bg-white" : "border-slate-200 bg-slate-50"}`}>
                    {logoUrl ? <img src={logoUrl} alt={t.logo} className="h-full w-full object-contain" /> : <span className="text-xs text-slate-400">VETRA</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={!isAdmin || savingProfile} onChange={(event) => { selectClinicLogo(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                    <button type="button" onClick={() => logoInputRef.current?.click()} disabled={!isAdmin || savingProfile} className={`rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-50 ${darkMode ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-50"}`}>{t.uploadLogo}</button>
                    {logoUrl && <button type="button" onClick={() => { setLogoUrl(""); setLogoFile(null); }} disabled={!isAdmin || savingProfile} className="rounded-xl px-3 py-2.5 text-sm font-bold text-rose-500 hover:bg-rose-500/10 disabled:opacity-50">{t.removeLogo}</button>}
                    <p className="w-full text-xs text-slate-500">{t.logoHint}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => void saveClinicProfile()} disabled={!isAdmin || savingProfile} className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50">{savingProfile ? t.saving : t.saveProfile}</button>
            </div>
            {clinicProfile?.updated_at && <p className="mt-3 text-end text-xs text-slate-500">{new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(clinicProfile.updated_at))}</p>}
          </section>

          <section
            className={`rounded-3xl border p-6 ${
              darkMode
                ? "border-white/[0.06] bg-[#13161B]"
                : "border-slate-100 bg-white"
            }`}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">{t.billing}</h2>
                <p className="mt-1 text-sm text-slate-500">{t.billingHint}</p>
              </div>
              <span className="rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-500">
                {t.ownerAdminOnly}
              </span>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-bold">{t.consultationFee}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={consultationFee}
                    onChange={(e) => setConsultationFee(e.target.value)}
                    disabled={!isAdmin || savingBilling}
                    className={`w-full rounded-2xl border px-4 py-3.5 outline-none transition focus:border-blue-500 ${
                      darkMode
                        ? "border-white/[0.07] bg-[#0F1115] text-white disabled:opacity-50"
                        : "border-slate-200 bg-slate-50 text-slate-900 disabled:opacity-50"
                    }`}
                  />
                  <span className="shrink-0 text-sm font-bold text-slate-500">{t.egp}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{t.consultationFeeHint}</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">{t.followUpFee}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={followUpFee}
                    onChange={(e) => setFollowUpFee(e.target.value)}
                    disabled={!isAdmin || savingBilling}
                    className={`w-full rounded-2xl border px-4 py-3.5 outline-none transition focus:border-blue-500 ${
                      darkMode
                        ? "border-white/[0.07] bg-[#0F1115] text-white disabled:opacity-50"
                        : "border-slate-200 bg-slate-50 text-slate-900 disabled:opacity-50"
                    }`}
                  />
                  <span className="shrink-0 text-sm font-bold text-slate-500">{t.egp}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{t.followUpFeeHint}</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">{t.injectionFee}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={injectionFee}
                    onChange={(e) => setInjectionFee(e.target.value)}
                    disabled={!isAdmin || savingBilling}
                    className={`w-full rounded-2xl border px-4 py-3.5 outline-none transition focus:border-blue-500 ${darkMode ? "border-white/[0.07] bg-[#0F1115] text-white disabled:opacity-50" : "border-slate-200 bg-slate-50 text-slate-900 disabled:opacity-50"}`}
                  />
                  <span className="shrink-0 text-sm font-bold text-slate-500">{t.egp}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{t.injectionFeeHint}</p>
              </div>

              <div
                className={`rounded-2xl border p-4 ${
                  darkMode ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"
                }`}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={autoAddConsultationFee}
                    onChange={(e) => setAutoAddConsultationFee(e.target.checked)}
                    disabled={!isAdmin || savingBilling}
                    className="mt-1 h-4 w-4 accent-blue-600"
                  />
                  <span>
                    <span className="block text-sm font-bold">{t.autoConsultation}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      {t.autoConsultationHint}
                    </span>
                  </span>
                </label>
              </div>

              <button
                onClick={saveBilling}
                disabled={!isAdmin || savingBilling}
                className="w-full rounded-2xl bg-blue-600 px-5 py-3.5 font-bold text-white transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingBilling ? t.saving : t.save}
              </button>
            </div>
          </section>

          <section
            className={`rounded-3xl border p-6 ${
              darkMode
                ? "border-white/[0.06] bg-[#13161B]"
                : "border-slate-100 bg-white"
            }`}
          >
            <h2 className="text-xl font-black">{t.appearance}</h2>
            <p className="mt-1 text-sm text-slate-500">{t.appearance}</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <PreferenceRow
                label={t.language}
                value={language === "ar" ? t.arabic : t.english}
                darkMode={darkMode}
                action={
                  <button
                    onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
                    className="rounded-xl bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-500"
                  >
                    {language === "ar" ? "English" : "عربي"}
                  </button>
                }
              />

              <PreferenceRow
                label={t.theme}
                value={darkMode ? t.dark : t.light}
                darkMode={darkMode}
                action={
                  <button
                    onClick={() => setDarkMode((v) => !v)}
                    className="rounded-xl bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-500"
                  >
                    {darkMode ? "☀️" : "🌙"}
                  </button>
                }
              />
            </div>

            <div className={`mt-5 rounded-2xl border p-4 ${darkMode ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-bold">🖼️ {t.dashboardBackground}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{t.dashboardBackgroundHint}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input ref={backgroundInputRef} type="file" accept="image/*" onChange={handleDashboardBackgroundChange} className="hidden" />
                  <button type="button" onClick={() => backgroundInputRef.current?.click()} className="rounded-xl bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-500 transition hover:bg-blue-500/15">{t.chooseBackground}</button>
                  <button type="button" onClick={resetDashboardBackground} className="rounded-xl border border-slate-300/40 px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">{t.resetBackground}</button>
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
                <div className="h-24 rounded-xl border border-white/10 bg-cover bg-center shadow-inner" style={{ backgroundImage: `url("${dashboardBackground}")` }} aria-label={t.dashboardBackground} />
                <label className="block">
                  <span className="text-sm font-bold">{t.backgroundTransparency}</span>
                  <input type="range" min="0" max="100" step="1" value={dashboardBackgroundTransparency} onChange={(event) => changeDashboardBackgroundTransparency(event.target.value)} className="mt-3 w-full accent-teal-500" />
                  <span className="mt-1 flex justify-between text-xs text-slate-500"><span>0%</span><strong className="text-teal-500">{dashboardBackgroundTransparency}%</strong><span>100%</span></span>
                </label>
              </div>
              {backgroundStatus && <p role="status" className="mt-3 text-xs font-semibold text-teal-500">{backgroundStatus}</p>}
            </div>
          </section>

          {/* VETRA_SETTINGS_INSTALL_IMPORT_BACKUP_V1 */}
          <section
            className={`rounded-3xl border p-6 ${
              darkMode
                ? "border-white/[0.06] bg-[#13161B]"
                : "border-slate-100 bg-white"
            }`}
          >
            <h2 className="text-xl font-black">{t.appDataTools}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">{t.appDataToolsHint}</p>

            <div className="mt-5 space-y-4">
              <div className={`rounded-2xl border p-4 ${darkMode ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-bold">📲 {t.installTitle}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{t.installHint}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleInstallApplication()}
                    disabled={isInstalled}
                    className="shrink-0 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isInstalled ? `✓ ${t.appInstalled}` : canInstall ? `⬇ ${t.installButton}` : `⬇ ${isIOS ? t.installHowTo : t.installButton}`}
                  </button>
                </div>
                {installHelp && (
                  <p className={`mt-3 rounded-xl p-3 text-xs leading-6 ${darkMode ? "bg-white/[0.04] text-slate-300" : "bg-white text-slate-600"}`}>
                    {isIOS ? t.installIosHelp : t.installManualHelp}
                  </p>
                )}
                {installStatus && <p role="status" className="mt-3 text-xs font-semibold text-teal-500">{installStatus}</p>}
              </div>

              <div className={`rounded-2xl border p-4 ${darkMode ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-bold">🗃️ {t.importTitle}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{t.importHint}</p>
                  </div>
                  <button type="button" onClick={() => router.push("/settings/import")} className="shrink-0 rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 text-sm font-bold text-violet-500 transition hover:bg-violet-500/15">
                    {t.importButton}
                  </button>
                </div>
              </div>

              <div className={`rounded-2xl border p-4 ${darkMode ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-bold">💾 {t.backupTitle}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{t.backupHint}</p>
                  </div>
                  <button type="button" onClick={() => void exportCurrentDatabase()} disabled={exportingBackup || loading || !context} className="shrink-0 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {exportingBackup ? t.backupProgress : `⬇ ${t.backupButton}`}
                  </button>
                </div>
                {backupProgress && <p role="status" className="mt-3 break-words rounded-xl bg-blue-500/10 p-3 text-xs font-semibold text-blue-500">{backupProgress}</p>}
              </div>
            </div>
          </section>

          <section
            className={`rounded-3xl border p-6 ${
              darkMode
                ? "border-white/[0.06] bg-[#13161B]"
                : "border-slate-100 bg-white"
            }`}
          >
            <div className="mb-6">
              <h2 className="text-xl font-black">{t.security}</h2>
              <p className="mt-1 text-sm text-slate-500">{t.securityHint}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold">{t.newPassword}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t.passwordPlaceholder}
                  autoComplete="new-password"
                  className={`w-full rounded-2xl border px-4 py-3.5 outline-none focus:border-blue-500 ${
                    darkMode
                      ? "border-white/[0.07] bg-[#0F1115] text-white placeholder:text-slate-600"
                      : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                  }`}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">{t.confirmPassword}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t.passwordPlaceholder}
                  autoComplete="new-password"
                  className={`w-full rounded-2xl border px-4 py-3.5 outline-none focus:border-blue-500 ${
                    darkMode
                      ? "border-white/[0.07] bg-[#0F1115] text-white placeholder:text-slate-600"
                      : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                  }`}
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={changePassword}
                  disabled={changingPassword}
                  className="flex-1 rounded-2xl bg-slate-900 px-5 py-3.5 font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  {changingPassword ? t.saving : t.changePassword}
                </button>

                <button
                  onClick={signOut}
                  className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-3.5 font-bold text-red-500 transition hover:bg-red-500/15"
                >
                  {t.signOut}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function InfoCard({
  label,
  value,
  darkMode,
}: {
  label: string;
  value: string;
  darkMode: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        darkMode ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50"
      }`}
    >
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 truncate text-sm font-bold">{value}</p>
    </div>
  );
}

function PreferenceRow({
  label,
  value,
  darkMode,
  action,
}: {
  label: string;
  value: string;
  darkMode: boolean;
  action: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${
        darkMode ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50"
      }`}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="mt-1 truncate text-sm font-bold">{value}</p>
      </div>
      {action}
    </div>
  );
}
