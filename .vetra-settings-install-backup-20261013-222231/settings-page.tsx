 "use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";
import { vetraCore } from "@/lib/vetra-core";

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
  auto_add_consultation_fee: boolean;
};

const text = {
  ar: {
    title: "الإعدادات",
    subtitle: "إدارة إعدادات VETRA والعيادة والفواتير",
    back: "العودة للرئيسية",
    clinic: "العيادة",
    clinicName: "اسم العيادة",
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
    autoConsultation: "إضافة سعر الكشف تلقائيًا",
    autoConsultationHint: "عند إنهاء زيارة، يتم تجهيز بند الكشف في الفاتورة تلقائيًا.",
    appearance: "المظهر واللغة",
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
    autoConsultation: "Automatically add consultation fee",
    autoConsultationHint: "When a visit is completed, the consultation item is prepared automatically in the invoice.",
    appearance: "Appearance & language",
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

export default function SettingsPage() {
  const router = useRouter();

  const [language, setLanguage] = useState<Language>("ar");
  const [darkMode, setDarkMode] = useState(true);
  const [ready, setReady] = useState(false);

  const [context, setContext] = useState<ClinicContext | null>(null);
  const [billing, setBilling] = useState<BillingSettings | null>(null);

  const [consultationFee, setConsultationFee] = useState("");
  const [autoAddConsultationFee, setAutoAddConsultationFee] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingBilling, setSavingBilling] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setDarkMode(localStorage.getItem("vetra-theme") !== "light");
    setLanguage(localStorage.getItem("vetra-language") === "en" ? "en" : "ar");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;

    localStorage.setItem("vetra-theme", darkMode ? "dark" : "light");
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

        const { data, error: billingError } = await db
          .from("billing_settings")
          .select("id, clinic_id, consultation_fee, auto_add_consultation_fee")
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
          setAutoAddConsultationFee(Boolean(settings.auto_add_consultation_fee));
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
  const isAdmin = context ? ["owner", "admin"].includes(context.role) : false;

  async function saveBilling() {
    if (!context) return;

    if (!isAdmin) {
      setError(t.accessDenied);
      setMessage("");
      return;
    }

    const feeValue = consultationFee.trim() === "" ? null : Number(consultationFee);

    if (feeValue !== null && (!Number.isFinite(feeValue) || feeValue < 0)) {
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
            auto_add_consultation_fee: autoAddConsultationFee,
            updated_at: new Date().toISOString(),
          })
          .eq("id", billing.id)
          .eq("clinic_id", context.clinic_id)
          .select("id, clinic_id, consultation_fee, auto_add_consultation_fee")
          .single();

        if (updateError) throw updateError;
        setBilling(data as BillingSettings);
      } else {
        const { data, error: insertError } = await db
          .from("billing_settings")
          .insert({
            clinic_id: context.clinic_id,
            consultation_fee: feeValue,
            auto_add_consultation_fee: autoAddConsultationFee,
          })
          .select("id, clinic_id, consultation_fee, auto_add_consultation_fee")
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

  if (!ready || loading) {
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
              <InfoCard label={t.clinicName} value={context?.clinic_name || "—"} darkMode={darkMode} />
              <InfoCard label={t.doctor} value={context?.doctor_name || "—"} darkMode={darkMode} />
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
