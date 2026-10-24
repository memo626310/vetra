"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";
import { vetraCore } from "@/lib/vetra-core";
import { writeVetraThemeMode } from "@/lib/theme";
import { defaultStaffPermissions, normalizeStaffPermissions, permissionActions, permissionDefinitions, type StaffPermissions, type PermissionAction } from "@/lib/staff-permissions";
import { useStaffPermissions } from "@/lib/use-staff-permissions";

type Language = "ar" | "en";
type StaffType = "doctor" | "assistant" | "front_desk";
type StaffMember = {
  id: string;
  clinic_id: string;
  full_name: string;
  staff_type: StaffType;
  phone: string | null;
  email: string | null;
  specialty: string | null;
  created_at: string;
  auth_user_id: string | null;
  login_email: string | null;
  must_change_password: boolean;
  permissions: StaffPermissions;
};

type IssuedCredentials = { name: string; loginIdentifiers: string[]; temporaryPassword: string };

const copy = {
  ar: {
    title: "فريق العيادة", subtitle: "الأطباء والمساعدون وفريق الاستقبال",
    add: "إضافة موظف", name: "الاسم الكامل", type: "الوظيفة", doctor: "طبيب", assistant: "مساعد", front_desk: "استقبال",
    phone: "رقم الهاتف", email: "البريد الإلكتروني", specialty: "التخصص", specialtyPlaceholder: "مثال: جراحة، جلدية",
    save: "إضافة إلى الفريق", saving: "جارٍ الحفظ...", cancel: "إلغاء", list: "الفريق الحالي", empty: "لا يوجد موظفون مضافون بعد.",
    search: "ابحث بالاسم أو الهاتف أو البريد", all: "الكل", remove: "إزالة", confirmRemove: "إزالة هذا الموظف من قائمة العيادة؟",
    saved: "تمت إضافة الموظف.", removed: "تمت إزالة الموظف.", required: "اكتب اسم الموظف.", loadError: "تعذر تحميل فريق العيادة.",
    setupError: "تعذر حفظ الموظف. تحقق من تشغيل ملف إعداد جدول الموظفين على قاعدة العيادة.", back: "العودة للداشبورد", noAccess: "صلاحيات الدخول للموظفين غير مفعّلة في هذه المرحلة.",
    account: "إنشاء دخول وإرسال واتساب", reset: "إعادة تعيين وإرسال كلمة مؤقتة", accountWorking: "جارٍ تجهيز بيانات الدخول...", credentials: "بيانات الدخول المؤقتة", username: "اسم المستخدم", tempPassword: "كلمة المرور المؤقتة", copy: "نسخ", copied: "تم النسخ", forceChange: "سيُطلب تغييرها عند أول دخول.", accountError: "تعذر تجهيز حساب الموظف.", phoneRequired: "أضف رقم واتساب للموظف أولًا.", permissions: "الصلاحيات", permissionsHint: "حدد ما يستطيع الموظف رؤيته أو تنفيذه.", savePermissions: "حفظ الصلاحيات", permissionsSaved: "تم حفظ الصلاحيات.", editPermissions: "تعديل الصلاحيات",
  },
  en: {
    title: "Clinic staff", subtitle: "Doctors, assistants, and front desk team",
    add: "Add staff member", name: "Full name", type: "Role", doctor: "Doctor", assistant: "Assistant", front_desk: "Front desk",
    phone: "Phone number", email: "Email", specialty: "Specialty", specialtyPlaceholder: "For example: surgery, dermatology",
    save: "Add to team", saving: "Saving...", cancel: "Cancel", list: "Current team", empty: "No staff members added yet.",
    search: "Search name, phone, or email", all: "All", remove: "Remove", confirmRemove: "Remove this person from the clinic staff list?",
    saved: "Staff member added.", removed: "Staff member removed.", required: "Enter the staff member's name.", loadError: "Could not load clinic staff.",
    setupError: "Could not save this staff member. Check that the staff table SQL was applied to this clinic database.", back: "Back to dashboard", noAccess: "Staff account access is not enabled in this phase.",
    account: "Create login & WhatsApp", reset: "Reset password & WhatsApp", accountWorking: "Preparing sign-in details...", credentials: "Temporary sign-in details", username: "Username", tempPassword: "Temporary password", copy: "Copy", copied: "Copied", forceChange: "A password change will be required at first sign-in.", accountError: "Could not prepare staff account.", phoneRequired: "Add a WhatsApp number for this staff member first.", permissions: "Permissions", permissionsHint: "Choose what this staff member can see and do.", savePermissions: "Save permissions", permissionsSaved: "Permissions saved.", editPermissions: "Edit permissions",
  },
};

const roleLabels: Record<StaffType, Record<Language, string>> = {
  doctor: { ar: "طبيب", en: "Doctor" },
  assistant: { ar: "مساعد", en: "Assistant" },
  front_desk: { ar: "استقبال", en: "Front desk" },
};

export default function StaffPage() {
  const router = useRouter();
  const { can, loaded: permissionsLoaded } = useStaffPermissions();
  const [language, setLanguage] = useState<Language>("ar");
  const [dark, setDark] = useState(true);
  const [clinicId, setClinicId] = useState("");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StaffType | "all">("all");
  const [fullName, setFullName] = useState("");
  const [staffType, setStaffType] = useState<StaffType>("doctor");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [permissions, setPermissions] = useState<StaffPermissions>(defaultStaffPermissions("doctor"));
  const [editingPermissionsId, setEditingPermissionsId] = useState("");
  const [permissionsSaving, setPermissionsSaving] = useState(false);
  const [accountBusyId, setAccountBusyId] = useState("");
  const [credentials, setCredentials] = useState<IssuedCredentials | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const t = copy[language];
  const ar = language === "ar";

  const loadStaff = useCallback(async () => {
    try {
      const context = await getClinicContext();
      const db = await getClinicDb();
      const { data, error: queryError } = await db.from("clinic_staff")
        .select("id,clinic_id,full_name,staff_type,phone,email,specialty,created_at,auth_user_id,login_email,must_change_password,permissions")
        .eq("clinic_id", context.clinic_id)
        .order("created_at", { ascending: false });
      if (queryError) throw queryError;
      setClinicId(context.clinic_id);
      setStaff((data || []).map((item) => ({ ...item, permissions: normalizeStaffPermissions(item.permissions, item.staff_type) })) as StaffMember[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : copy.ar.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    window.setTimeout(() => {
      void loadStaff();
      const savedLanguage = localStorage.getItem("vetra-language");
      setLanguage(savedLanguage === "en" ? "en" : "ar");
      setDark(localStorage.getItem("vetra-theme") !== "light");
    }, 0);
  }, [loadStaff]);

 
useEffect(() => {
  if (!permissionsLoaded) return;

  setAuthorized(can("staff", "view"));
}, [permissionsLoaded, can]);

  const visibleStaff = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return staff.filter((person) => {
      const matchesType = filter === "all" || person.staff_type === filter;
      const matchesQuery = !query || [person.full_name, person.phone, person.email, person.specialty]
        .some((value) => value?.toLocaleLowerCase().includes(query));
      return matchesType && matchesQuery;
    });
  }, [filter, search, staff]);

  async function addStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clinicId || saving) return;
    if (!fullName.trim()) {
      setError(t.required);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const db = await getClinicDb();
      const { data, error: insertError } = await db.from("clinic_staff").insert({
        clinic_id: clinicId,
        full_name: fullName.trim(),
        staff_type: staffType,
        phone: phone.trim() || null,
        email: email.trim() || null,
        specialty: staffType === "doctor" ? specialty.trim() || null : null,
      permissions: normalizeStaffPermissions(permissions, staffType),
      }).select("id,clinic_id,full_name,staff_type,phone,email,specialty,created_at,auth_user_id,login_email,must_change_password,permissions").single();
      if (insertError) throw insertError;
      setStaff((current) => [data as StaffMember, ...current]);
      setFullName("");
      setPhone("");
      setEmail("");
      setSpecialty("");
      setStaffType("doctor");
      setPermissions(defaultStaffPermissions("doctor"));
      setShowForm(false);
      setNotice(t.saved);
    } catch (insertFailure) {
      setError(insertFailure instanceof Error ? insertFailure.message : t.setupError);
    } finally {
      setSaving(false);
    }
  }

  function togglePermission(group: StaffPermissions, key: string, action: PermissionAction): StaffPermissions {
    const currentGroup = group[key] || {};
    const newValue = currentGroup[action] !== true;
    return {
      ...group,
      [key]: {
        ...currentGroup,
        [action]: newValue
      }
    };
  }

  async function savePermissions(staffId: string) {
    setPermissionsSaving(true);
    setError("");
    try {
      const { data: sessionData } = await vetraCore.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error(t.accountError);
      const response = await fetch("/api/staff/permissions", { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ staffId, permissions }) });
      const result = await response.json().catch(() => null) as { permissions?: StaffPermissions; error?: string } | null;
      if (!response.ok || !result?.permissions) throw new Error(result?.error || t.accountError);
      setStaff((current) => current.map((person) => person.id === staffId ? { ...person, permissions: result.permissions as StaffPermissions } : person));
      setEditingPermissionsId("");
      setNotice(t.permissionsSaved);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t.accountError);
    } finally {
      setPermissionsSaving(false);
    }
  }

  function permissionEditor() {
    return (
      <fieldset className={`mt-5 rounded-lg border p-4 ${input}`}>
        <legend className="px-2 text-sm font-bold">{t.permissions}</legend>
        <p className="mb-3 text-xs text-slate-500">{t.permissionsHint}</p>
        <div className="space-y-2">
          {permissionDefinitions.map((definition) => (
            <div key={definition.key} className="grid gap-2 border-b border-slate-200/10 pb-2 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto]">
              <span className="text-sm font-semibold">
                {ar ? definition.ar : definition.en}
              </span>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {definition.actions.map((action) => {
                  const label = permissionActions.find((item) => item.key === action);
                  const isChecked = permissions[definition.key]?.[action] === true;
                  return (
                    <label key={action} className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => setPermissions((current) => togglePermission(current, definition.key, action))}
                        className="h-4 w-4 accent-cyan-500 cursor-pointer"
                      />
                      {ar ? label?.ar : label?.en}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
    );
  }

  async function issueStaffLogin(person: StaffMember) {
    const hasEmail = Boolean(person.email?.trim());
    const hasPhone = Boolean(person.phone?.trim());
    if (!hasEmail && !hasPhone) {
      setError(language === "ar" ? "أضف البريد الإلكتروني أو رقم الهاتف للموظف أولًا." : "Add an email address or phone number for this staff member first.");
      return;
    }
    setAccountBusyId(person.id);
    setError("");
    setNotice("");
    setCredentials(null);
    const whatsappTab = hasPhone ? window.open("about:blank", "_blank") : null;
    try {
      const { data: sessionData, error: sessionError } = await vetraCore.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) throw new Error(t.accountError);
      const response = await fetch("/api/staff/accounts", {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionData.session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: person.id, language }),
      });
      const result = await response.json().catch(() => null) as {
        loginIdentifiers?: string[];
        linkedEmail?: string;
        authUserId?: string;
        temporaryPassword?: string;
        whatsapp?: string | null;
        error?: string;
      } | null;
      if (!response.ok || !result?.loginIdentifiers?.length || !result.temporaryPassword) throw new Error(result?.error || t.accountError);
      if (whatsappTab && result.whatsapp) whatsappTab.location.href = result.whatsapp;
      else whatsappTab?.close();
      setCredentials({ name: person.full_name, loginIdentifiers: result.loginIdentifiers, temporaryPassword: result.temporaryPassword });
      setStaff((current) => current.map((item) => item.id === person.id
        ? {
            ...item,
            auth_user_id: result.authUserId || item.auth_user_id,
            login_email: result.linkedEmail || item.login_email,
            must_change_password: true,
          }
        : item));
      setNotice(result.whatsapp
        ? (language === "ar" ? "تم تجهيز بيانات الدخول. راجع رسالة واتساب واضغط إرسال." : "Sign-in details are ready. Review WhatsApp and press Send.")
        : (language === "ar" ? "تم إنشاء الحساب. انسخ بيانات الدخول وأرسلها للموظف بطريقة آمنة." : "The account is ready. Copy the sign-in details and share them securely with the staff member."));
    } catch (issueError) {
      whatsappTab?.close();
      setError(issueError instanceof Error ? issueError.message : t.accountError);
    } finally {
      setAccountBusyId("");
    }
  }

  async function removeStaff(person: StaffMember) {
    if (!window.confirm(t.confirmRemove)) return;
    setError("");
    setNotice("");
    try {
      const { data: sessionData, error: sessionError } = await vetraCore.auth.getSession();
      const hasLogin = Boolean(person.auth_user_id || person.login_email);
      if (hasLogin && (sessionError || !sessionData.session?.access_token)) throw new Error(t.loadError);
      if (hasLogin && sessionData.session?.access_token) {
        const response = await fetch("/api/staff/accounts", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${sessionData.session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ staffId: person.id }),
        });
        if (!response.ok) throw new Error(t.loadError);
      }
      const db = await getClinicDb();
      const { error: deleteError } = await db.from("clinic_staff").delete()
        .eq("id", person.id).eq("clinic_id", clinicId);
      if (deleteError) throw deleteError;
      setStaff((current) => current.filter((item) => item.id !== person.id));
      setNotice(t.removed);
    } catch (deleteFailure) {
      setError(deleteFailure instanceof Error ? deleteFailure.message : t.loadError);
    }
  }

  const surface = dark ? "border-white/10 bg-[#181B21]" : "border-slate-200 bg-white";
  const input = dark ? "border-white/10 bg-[#111419] text-white placeholder:text-slate-500" : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400";
  const roles: (StaffType | "all")[] = ["all", "doctor", "assistant", "front_desk"];

  if (!permissionsLoaded || loading) {
    return (
      <main className={dark ? "flex min-h-screen items-center justify-center bg-[#0F1115] text-white" : "flex min-h-screen items-center justify-center bg-[#F7F8FA] text-slate-800"}>
        <div className="text-center">
          <div className="mb-3 text-4xl">👥</div>
          <p className="text-sm text-slate-500">{ar ? "جاري تحميل فريق العيادة..." : "Loading staff..."}</p>
        </div>
      </main>
    );
  }

  if (authorized === false) {
    return (
      <main dir={ar ? "rtl" : "ltr"} className={`flex min-h-screen items-center justify-center px-6 ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}>
        <div className={`rounded-3xl border p-8 ${dark ? "border-white/[0.07] bg-[#13161B]" : "border-slate-100 bg-white shadow-sm"}`}>
          <h1 className="text-2xl font-black">{ar ? "غير مصرح بالدخول" : "Access restricted"}</h1>
          <p className="mt-3 text-sm text-slate-500">
            {ar ? "لا تملك صلاحية عرض أو إدارة الموظفين." : "You do not have permission to view or manage staff."}
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-5 rounded-full bg-blue-500 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600"
          >
            {ar ? "← العودة للرئيسية" : "← Back to dashboard"}
          </button>
        </div>
      </main>
    );
  }

  return <main dir={ar ? "rtl" : "ltr"} className={`min-h-screen transition-colors ${dark ? "bg-[#0F1115] text-slate-100" : "bg-[#F7F8FA] text-slate-900"}`}>
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <header className={`mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 ${surface}`}>
        <div><p className="text-[11px] font-bold uppercase text-cyan-500">VETRA / TEAM</p><h1 className="mt-1 text-xl font-bold">{t.title}</h1><p className="mt-1 text-sm text-slate-500">{t.subtitle}</p></div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className={`rounded-lg border px-3 py-2 text-sm font-semibold ${input}`}>{t.back}</Link>
          <button type="button" onClick={() => setLanguage(ar ? "en" : "ar")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${input}`}>{ar ? "English" : "العربية"}</button>
          <button type="button" onClick={() => { const next = !dark; setDark(next); writeVetraThemeMode(next); }} aria-label={dark ? "Light mode" : "Dark mode"} className={`h-10 w-10 rounded-lg border ${input}`}><span className={`mx-auto block h-4 w-4 rounded-full border-2 ${dark ? "border-amber-400 bg-amber-400" : "border-slate-500"}`} /></button>
        </div>
      </header>

      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">{notice}</p>}
      {credentials && <section className={`mb-5 rounded-xl border border-cyan-500/30 p-4 ${surface}`}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-bold">{t.credentials} · {credentials.name}</h2><p className="mt-1 text-xs text-slate-500">{t.forceChange}</p></div><button type="button" onClick={() => setCredentials(null)} aria-label={ar ? "إغلاق" : "Close"} className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-500/10">×</button></div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2"><div className={`rounded-lg border p-3 ${input}`}><dt className="text-xs text-slate-500">{t.username}</dt><dd className="mt-1 whitespace-pre-line break-all font-mono text-sm">{credentials.loginIdentifiers.join("\n")}</dd></div><div className={`rounded-lg border p-3 ${input}`}><dt className="text-xs text-slate-500">{t.tempPassword}</dt><dd className="mt-1 break-all font-mono text-sm">{credentials.temporaryPassword}</dd></div></dl>
        <button type="button" onClick={() => void navigator.clipboard.writeText(`${credentials.loginIdentifiers.join("\n")}\n${credentials.temporaryPassword}`)} className="mt-3 rounded-lg border border-cyan-500/30 px-3 py-2 text-xs font-bold text-cyan-600 hover:bg-cyan-500/10">{t.copy}</button>
      </section>}

      <section className={`mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 ${surface}`}>
        <div><div className="text-sm font-semibold">{t.list}</div><p className="mt-1 text-xs text-slate-500">{staff.length} {ar ? "موظف" : staff.length === 1 ? "member" : "members"}</p></div>
        <button type="button" onClick={() => { setShowForm((value) => !value); setError(""); }} className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-400">{showForm ? t.cancel : `+ ${t.add}`}</button>
      </section>

      {showForm && <form onSubmit={(event) => void addStaff(event)} className={`mb-5 rounded-xl border p-4 sm:p-6 ${surface}`}>
        <h2 className="mb-4 text-base font-bold">{t.add}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">{t.name}<input required maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} className={`mt-2 w-full rounded-lg border px-3 py-3 ${input}`} /></label>
          <label className="text-sm font-semibold">{t.type}<select value={staffType} onChange={(event) => { const nextType = event.target.value as StaffType; setStaffType(nextType); setPermissions(defaultStaffPermissions(nextType)); }} className={`mt-2 w-full rounded-lg border px-3 py-3 ${input}`}><option value="doctor">{t.doctor}</option><option value="assistant">{t.assistant}</option><option value="front_desk">{t.front_desk}</option></select></label>
          <label className="text-sm font-semibold">{t.phone}<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className={`mt-2 w-full rounded-lg border px-3 py-3 ${input}`} /></label>
          <label className="text-sm font-semibold">{t.email}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={`mt-2 w-full rounded-lg border px-3 py-3 ${input}`} /></label>
          {staffType === "doctor" && <label className="text-sm font-semibold sm:col-span-2">{t.specialty}<input maxLength={120} value={specialty} onChange={(event) => setSpecialty(event.target.value)} placeholder={t.specialtyPlaceholder} className={`mt-2 w-full rounded-lg border px-3 py-3 ${input}`} /></label>}
        </div>
        {permissionEditor()}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">{ar ? "يمكنك تغيير أي صلاحية لاحقًا من قائمة الفريق." : "You can change any permission later from the team list."}</p><button type="submit" disabled={saving} className="rounded-lg bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{saving ? t.saving : t.save}</button></div>
      </form>}

      <section className={`overflow-hidden rounded-xl border ${surface}`}>
        <div className="flex flex-col gap-3 border-b border-slate-200/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1" role="group" aria-label={t.type}>{roles.map((role) => <button key={role} type="button" onClick={() => setFilter(role)} className={`rounded-lg px-3 py-2 text-xs font-bold ${filter === role ? "bg-cyan-500 text-slate-950" : "text-slate-500 hover:bg-slate-500/10"}`}>{role === "all" ? t.all : roleLabels[role][language]}</button>)}</div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} className={`w-full rounded-lg border px-3 py-2.5 text-sm sm:max-w-xs ${input}`} />
        </div>
        {loading ? <p className="p-10 text-center text-sm text-slate-500">{ar ? "جارٍ تحميل الفريق..." : "Loading team..."}</p> : visibleStaff.length ? <ul className="divide-y divide-slate-200/10">{visibleStaff.map((person) => <li key={person.id} className="flex flex-wrap items-center justify-between gap-4 p-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 font-bold text-cyan-500">{person.full_name.trim().slice(0, 1).toLocaleUpperCase()}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-bold">{person.full_name}</h3><span className="rounded-full bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold text-cyan-600 dark:text-cyan-300">{roleLabels[person.staff_type][language]}</span></div><p className="mt-1 text-xs text-slate-500">{[person.specialty, person.phone, person.email].filter(Boolean).join(" · ") || "—"}</p></div></div>
          <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => { setEditingPermissionsId((current) => current === person.id ? "" : person.id); setPermissions(normalizeStaffPermissions(person.permissions, person.staff_type)); setError(""); }} className="rounded-lg border border-cyan-500/30 px-3 py-2 text-xs font-bold text-cyan-600 hover:bg-cyan-500/10">{t.editPermissions}</button><button type="button" onClick={() => void issueStaffLogin(person)} disabled={accountBusyId === person.id} className="rounded-lg border border-cyan-500/30 px-3 py-2 text-xs font-bold text-cyan-600 hover:bg-cyan-500/10 disabled:opacity-50">{accountBusyId === person.id ? t.accountWorking : person.auth_user_id || person.login_email ? t.reset : t.account}</button><button type="button" onClick={() => void removeStaff(person)} className="rounded-lg px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-500/10">{t.remove}</button></div>
          {editingPermissionsId === person.id && <div className="w-full">{permissionEditor()}<div className="mt-3 flex justify-end"><button type="button" onClick={() => void savePermissions(person.id)} disabled={permissionsSaving} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">{permissionsSaving ? t.saving : t.savePermissions}</button></div></div>}
        </li>)}</ul> : <p className="p-10 text-center text-sm text-slate-500">{t.empty}</p>}
      </section>
    </div>
  </main>;
}
