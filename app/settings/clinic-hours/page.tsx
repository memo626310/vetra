"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";
import { useStaffPermissions } from "@/lib/use-staff-permissions";

type DayHours = { enabled: boolean; start: string; end: string };
type WeekHours = Record<string, DayHours>;

const days = [
  { key: "sunday", ar: "الأحد", en: "Sunday" },
  { key: "monday", ar: "الإثنين", en: "Monday" },
  { key: "tuesday", ar: "الثلاثاء", en: "Tuesday" },
  { key: "wednesday", ar: "الأربعاء", en: "Wednesday" },
  { key: "thursday", ar: "الخميس", en: "Thursday" },
  { key: "friday", ar: "الجمعة", en: "Friday" },
  { key: "saturday", ar: "السبت", en: "Saturday" },
];

function emptyWeek(): WeekHours {
  return Object.fromEntries(days.map(({ key }) => [key, { enabled: false, start: "09:00", end: "17:00" }])) as WeekHours;
}

export default function ClinicHoursPage() {
  const { loaded, hasPermission } = useStaffPermissions();
  const [language, setLanguage] = useState<"ar" | "en">(() => typeof window !== "undefined" && localStorage.getItem("vetra-language") === "en" ? "en" : "ar");
  const [dark] = useState(() => typeof window === "undefined" || localStorage.getItem("vetra-theme") !== "light");
  const [week, setWeek] = useState<WeekHours>(emptyWeek);
  const [clinicId, setClinicId] = useState("");
  const [rowId, setRowId] = useState("");
  const [baseSettings, setBaseSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const ar = language === "ar";
  const allowed = loaded && hasPermission("clinic_settings", "edit");
  const shell = dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-900";
  const card = dark ? "border-white/[0.06] bg-[#13161B]" : "border-slate-200 bg-white";
  const input = dark ? "border-white/10 bg-[#0F1115] text-white" : "border-slate-200 bg-slate-50 text-slate-900";

  useEffect(() => {
    if (!loaded) return;
    if (!allowed) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const context = await getClinicContext();
        const db = await getClinicDb();
        const { data, error: queryError } = await db.from("appointment_settings")
          .select("id, clinic_id, settings").eq("clinic_id", context.clinic_id).maybeSingle();
        if (queryError) throw queryError;
        if (cancelled) return;
        setClinicId(context.clinic_id);
        if (data) {
          setRowId(data.id);
          const settings = (data.settings && typeof data.settings === "object" ? data.settings : {}) as Record<string, unknown>;
          setBaseSettings(settings);
          const weekly = settings.weekly_hours && typeof settings.weekly_hours === "object" ? settings.weekly_hours as Partial<WeekHours> : {};
          const defaults = emptyWeek();
          setWeek(Object.fromEntries(days.map(({ key }) => [key, { ...defaults[key], ...(weekly[key] || {}) }])) as WeekHours);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : (ar ? "تعذر تحميل ساعات العمل." : "Could not load clinic hours."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loaded, allowed, ar]);

  function updateDay(day: string, patch: Partial<DayHours>) {
    setWeek((current) => ({ ...current, [day]: { ...current[day], ...patch } }));
  }

  async function save() {
    if (!clinicId || !allowed) return;
    const invalid = days.some(({ key }) => week[key].enabled && (!week[key].start || !week[key].end || week[key].start >= week[key].end));
    if (invalid) {
      setError(ar ? "تأكد أن وقت الإغلاق بعد وقت الفتح لكل يوم عمل." : "Closing time must be later than opening time for each working day.");
      setMessage("");
      return;
    }
    setSaving(true); setError(""); setMessage("");
    try {
      const db = await getClinicDb();
      const payload = { settings: { ...baseSettings, weekly_hours: week }, updated_at: new Date().toISOString() };
      if (rowId) {
        const { error: saveError } = await db.from("appointment_settings").update(payload).eq("id", rowId).eq("clinic_id", clinicId);
        if (saveError) throw saveError;
      } else {
        const { data, error: saveError } = await db.from("appointment_settings").insert({ clinic_id: clinicId, ...payload }).select("id").single();
        if (saveError) throw saveError;
        setRowId(data.id);
      }
      setBaseSettings((current) => ({ ...current, weekly_hours: week }));
      setMessage(ar ? "تم حفظ ساعات عمل العيادة." : "Clinic hours saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "تعذر حفظ ساعات العمل." : "Could not save clinic hours."));
    } finally { setSaving(false); }
  }

  return <main dir={ar ? "rtl" : "ltr"} className={`min-h-screen ${shell}`}>
    <div className="mx-auto max-w-4xl px-4 py-7 sm:px-8">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div><Link href="/appointments" className="text-sm font-semibold text-slate-500 hover:text-blue-500">← {ar ? "العودة للمواعيد" : "Back to appointments"}</Link>
          <h1 className="mt-3 text-3xl font-black">{ar ? "ساعات عمل العيادة" : "Clinic hours"}</h1>
          <p className="mt-2 text-sm text-slate-500">{ar ? "حدد أيام وساعات استقبال العيادة أسبوعيًا." : "Set the clinic’s weekly opening days and hours."}</p></div>
        <button onClick={() => setLanguage(ar ? "en" : "ar")} className={`rounded-xl border px-4 py-2 font-bold ${card}`}>{ar ? "English" : "العربية"}</button>
      </header>
      {!loaded || loading ? <div className={`rounded-3xl border p-6 ${card}`}>{ar ? "جاري تحميل الإعدادات..." : "Loading settings..."}</div> : !allowed ? <div className={`rounded-3xl border p-6 ${card}`}>{ar ? "ليس لديك صلاحية تعديل إعدادات العيادة." : "You do not have permission to edit clinic settings."}</div> : <>
        <section className={`rounded-3xl border p-4 sm:p-6 ${card}`}>
          <div className="mb-5 text-sm text-slate-500">{ar ? "فعّل أيام العمل وحدد وقت الفتح والإغلاق. الأيام المغلقة لن تكون متاحة للحجز." : "Enable working days and set opening and closing times. Closed days will not be bookable."}</div>
          <div className="space-y-3">{days.map(({ key, ar: arDay, en }) => {
            const value = week[key];
            return <div key={key} className={`grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center ${dark ? "border-white/5 bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
              <label className="flex items-center gap-3 font-bold"><input type="checkbox" checked={value.enabled} onChange={(event) => updateDay(key, { enabled: event.target.checked })} className="h-5 w-5 accent-cyan-500" />{ar ? arDay : en}</label>
              <label className="flex items-center gap-2 text-sm text-slate-500">{ar ? "يفتح" : "Opens"}<input type="time" value={value.start} disabled={!value.enabled} onChange={(event) => updateDay(key, { start: event.target.value })} className={`min-w-0 rounded-xl border px-3 py-2 disabled:opacity-40 ${input}`} /></label>
              <label className="flex items-center gap-2 text-sm text-slate-500">{ar ? "يغلق" : "Closes"}<input type="time" value={value.end} disabled={!value.enabled} onChange={(event) => updateDay(key, { end: event.target.value })} className={`min-w-0 rounded-xl border px-3 py-2 disabled:opacity-40 ${input}`} /></label>
            </div>;
          })}</div>
        </section>
        {(error || message) && <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${error ? "border-rose-500/20 bg-rose-500/10 text-rose-400" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"}`}>{error || message}</div>}
        <div className="mt-5 flex justify-end"><button onClick={() => void save()} disabled={saving} className="rounded-xl bg-cyan-500 px-6 py-3 font-black text-slate-950 disabled:opacity-50">{saving ? (ar ? "جاري الحفظ..." : "Saving...") : (ar ? "حفظ ساعات العمل" : "Save clinic hours")}</button></div>
      </>}
    </div>
  </main>;
}
